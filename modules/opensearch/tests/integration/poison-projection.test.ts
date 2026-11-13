import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createSearchAdmin } from "../../src/admin";
import { createSearchClient } from "../../src/client/search-client";
import { type DefinedSearch, type DocumentId } from "../../src/definition/define-search";
import {
  createPostgresSynchronization,
  type IndexerEvent,
  type WorkerLimits,
} from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import {
  type Note,
  outcomeSum,
  type RuntimeRow,
  useWorkerFixture,
  waitFor,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * Failures caused by one document (a throwing projection, a result that breaks the contract, a strict mapping
 * violation, an oversized envelope) quarantine only that document without budget; the rest of the claim, tombstones
 * and later documents keep flowing. A database failure is released without bisection.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";

/** Long enough that the cooldown is still running when observed (1-2 s on first entry). */
const COOLDOWN_LIMITS = { retryBaseDelayMs: 2_000, retryMaxDelayMs: 4_000 } as const;

/** Only the class name of this error may be stored, never its message. */
class ProjectionBug extends Error {
  override readonly name = "ProjectionBug";
}

interface Faults {
  /** materialize throws for any call containing these ids. */
  readonly throwing: Set<string>;
  /** Adds an unrequested key to the result map, breaking the result contract. */
  readonly strayKey: Set<string>;
  /** Gives these ids a value with a disallowed key, breaking the value contract. */
  readonly malformedValue: Set<string>;
  /** Terminates the snapshot connection on the server, simulating a database failure. */
  readonly terminate: Set<string>;
  /** Number of materialize calls, one per snapshot. */
  calls: number;
}

function faults(): Faults {
  return {
    throwing: new Set(),
    strayKey: new Set(),
    malformedValue: new Set(),
    terminate: new Set(),
    calls: 0,
  };
}

/** Same key, fingerprint and hashVersion as the fixture definition, so it claims the same target. */
function faultyDefinition(base: DefinedSearch, injected: Faults): DefinedSearch {
  return {
    ...base,
    async materialize(context, ids: readonly DocumentId[]) {
      injected.calls += 1;
      if (ids.some((id) => injected.terminate.has(id))) {
        const { rows } = z
          .object({ rows: z.array(z.object({ pid: z.number() })) })
          .parse(await context.trx.raw("SELECT pg_backend_pid() AS pid"));
        await h.knex.raw("SELECT pg_terminate_backend(?)", [rows[0]?.pid ?? 0]);
      }
      if (ids.some((id) => injected.throwing.has(id))) throw new ProjectionBug("의도한 실패");
      const result = new Map<DocumentId, unknown>(await base.materialize(context, ids));
      for (const id of ids) {
        if (injected.malformedValue.has(id)) {
          result.set(id, { state: "present", document: { body: "모양" }, extra: true });
        }
      }
      if (ids.some((id) => injected.strayKey.has(id))) {
        result.set("not-requested", { state: "deleted" });
      }
      // SAFETY: the map deliberately breaks the contract; the worker re-validates it with projectionResultSchema.
      return result as Awaited<ReturnType<DefinedSearch["materialize"]>>;
    },
  };
}

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

function faultyIndexer(
  setup: WorkerSetup,
  injected: Faults,
  limits: Partial<WorkerLimits> = {},
  events?: IndexerEvent[],
) {
  const base = setup.definitions.get(KEY);
  if (base === undefined) throw new Error("정의가 없습니다.");
  return kit.indexer(
    { ...setup, definitions: new Map([[KEY, faultyDefinition(base, injected)]]) },
    { limits, events },
  ).indexer;
}

function runtimeOf(rows: readonly RuntimeRow[], id: string): RuntimeRow {
  const row = rows.find((candidate) => candidate.document_id === id);
  if (row === undefined) throw new Error(`런타임 행 ${id}가 없습니다.`);
  return row;
}

async function writeNotes(
  setup: WorkerSetup,
  notes: Readonly<Record<string, { body: string; extra?: Note; slow?: boolean } | null>>,
): Promise<void> {
  await kit.write(setup, KEY, Object.keys(notes), async (trx) => {
    for (const [id, note] of Object.entries(notes)) {
      if (note === null) await kit.remove(trx, KEY, id);
      else await kit.upsert(trx, KEY, id, note.body, note.extra, note.slow ?? false);
    }
  });
}

describe("poison projection 배치", () => {
  it("예외를 던지는 ID만 격리되고 같은 claim의 다른 문서와 tombstone은 색인된다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    const injected = faults();
    injected.throwing.add("throws");
    injected.strayKey.add("stray");
    injected.malformedValue.add("malformed");
    const maxBulkBytes = 2_048;
    await writeNotes(setup, {
      a: { body: "하나" },
      b: { body: "둘" },
      c: { body: "셋" },
      throws: { body: "던짐" },
      stray: { body: "남는 키" },
      malformed: { body: "모양" },
      // A field missing from the strict mapping: the engine rejects the item with 400.
      strict: { body: "엄격", extra: { body: "엄격", unexpected: "x" } },
      // A single serialized envelope larger than maxBulkBytes; it is never split.
      huge: { body: "큰".repeat(1_000) },
    });
    // A document without a source row is indexed as a tombstone.
    await kit.write(setup, KEY, ["gone"], async () => {});

    const events: IndexerEvent[] = [];
    const indexer = faultyIndexer(setup, injected, { maxBulkBytes }, events);
    const report = await indexer.drainOnce();
    expect(report).toMatchObject({
      claimed: 9,
      indexed: 4,
      quarantined: 5,
      retried: 0,
      released: 0,
      leaseLost: 0,
      skippedLocked: 0,
    });
    expect(outcomeSum(report)).toBe(report.claimed);
    // Bisection stays within maxIsolationCallsPerBatch, first call included.
    expect(injected.calls).toBeLessThanOrEqual(20);

    for (const id of ["a", "b", "c"]) {
      expect(await kit.indexed(target, id)).toMatchObject({ version: 1, deleted: false });
    }
    expect(await kit.indexed(target, "gone")).toEqual({
      version: 1,
      revision: 1,
      deleted: true,
      doc: undefined,
    });

    // All of these are poison: quarantined at once at that revision without budget.
    const rows = await kit.runtimes();
    expect(rows.map((row) => row.document_id)).toEqual([
      "huge",
      "malformed",
      "stray",
      "strict",
      "throws",
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({
        quarantined_revision: 1,
        attempts: 0,
        retry_age_ms: 0,
        lease_token: null,
      });
    }
    expect(runtimeOf(rows, "throws").last_error).toEqual({
      class: "projection_error",
      code: "projection_threw",
      errorName: "ProjectionBug",
    });
    expect(runtimeOf(rows, "stray").last_error).toEqual({
      class: "projection_error",
      code: "invalid_result",
    });
    expect(runtimeOf(rows, "malformed").last_error).toEqual({
      class: "projection_error",
      code: "invalid_projection",
    });
    expect(runtimeOf(rows, "strict").last_error).toEqual({
      class: "rejected",
      status: 400,
      type: "strict_dynamic_mapping_exception",
    });
    expect(runtimeOf(rows, "huge").last_error).toMatchObject({
      class: "oversized",
      maxBytes: maxBulkBytes,
    });
    // Stored errors carry neither the thrown message nor document bodies.
    expect(JSON.stringify(rows.map((row) => row.last_error))).not.toMatch(/의도한 실패|큰큰|엄격/);
    for (const id of ["huge", "malformed", "stray", "strict", "throws"]) {
      expect(await kit.indexed(target, id)).toBeNull();
    }
    expect(
      events
        .flatMap((event) =>
          event.type === "quarantined" ? [[event.documentId, event.errorClass]] : [],
        )
        .toSorted(),
    ).toEqual([
      ["huge", "oversized"],
      ["malformed", "projection_error"],
      ["stray", "projection_error"],
      ["strict", "rejected"],
      ["throws", "projection_error"],
    ]);

    // inspect reports the quarantine count on the initial build's new target.
    const adminClient = createSearchClient({
      createClient: () => h.opensearch,
      ownsClient: false,
      requestTimeoutMs: 10_000,
    });
    try {
      const admin = createSearchAdmin({
        client: adminClient,
        synchronization: createPostgresSynchronization({
          getPrimaryDatabase: () => h.knex,
          schema: h.searchSchema,
          namespace: h.namespace,
        }),
        definitions: [...setup.definitions.values()],
        lifetimes: {
          maxSearchLifetimeMs: 60_000,
          maxCursorLifetimeMs: 60_000,
          maxPitKeepAliveMs: 60_000,
          retirementSafetyMarginMs: 60_000,
        },
        timeouts: {
          lockTimeoutMs: 5_000,
          statementTimeoutMs: 20_000,
          idleInTransactionTimeoutMs: 30_000,
          adminLeaseMs: 30_000,
        },
        cutover: { maxPendingDocuments: 1_000, sampleSize: 0 },
        workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 30_000 },
      });
      const inspection = await admin.inspect(KEY);
      expect(inspection.openBuild?.newTarget).toMatchObject({ pending: 0, quarantined: 5 });
      expect(inspection.openBuild?.blockers).toContain("quarantined-documents");
    } finally {
      await adminClient.close();
    }

    // Later documents are not blocked, and quarantined ones are not claimed again.
    await writeNotes(setup, { later: { body: "나중" } });
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 1, indexed: 1, quarantined: 0 });
    expect(await kit.indexed(target, "later")).toMatchObject({ version: 1 });

    // Re-marking after the fix delivers a new revision.
    injected.throwing.clear();
    await writeNotes(setup, {
      throws: { body: "고침" },
      strict: { body: "고침" },
    });
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 2, indexed: 2, quarantined: 0 });
    for (const id of ["throws", "strict"]) {
      expect(await kit.indexed(target, id)).toMatchObject({ version: 2, doc: { body: "고침" } });
    }
    expect((await kit.runtimes()).map((row) => row.document_id)).toEqual([
      "huge",
      "malformed",
      "stray",
    ]);
  });

  it("DB 장애에서는 이분 격리를 시도하지 않는다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    const injected = faults();
    injected.terminate.add("d1");
    const indexer = faultyIndexer(setup, injected, COOLDOWN_LIMITS);
    const ids = ["d1", "d2", "d3", "d4"];
    await writeNotes(setup, Object.fromEntries(ids.map((id) => [id, { body: id }])));

    const report = await indexer.drainOnce();
    // One snapshot only; nothing is quarantined or counted, everything is released.
    expect(injected.calls).toBe(1);
    expect(report).toMatchObject({
      claimed: 4,
      released: 4,
      retried: 0,
      quarantined: 0,
      indexed: 0,
    });
    for (const row of await kit.runtimes()) {
      expect(row).toMatchObject({
        attempts: 0,
        retry_age_ms: 0,
        quarantined_revision: null,
        lease_token: null,
        available_revision: 1,
        last_error: { class: "materialize_released", code: "database_unavailable" },
      });
    }
    // The database cooldown keeps the next drain from claiming.
    const cooling = await indexer.drainOnce();
    expect(cooling).toMatchObject({ claimed: 0 });
    expect(cooling.cooldownRemainingMs).toBeGreaterThan(0);

    injected.terminate.clear();
    await waitFor("장애 뒤 색인", async () => {
      await indexer.drainOnce();
      return (await kit.intents()).length === 0;
    });
    for (const id of ids) expect(await kit.indexed(target, id)).toMatchObject({ version: 1 });
    expect(await kit.runtimes()).toEqual([]);
  });

  it("격리 예산을 넘기면 나머지는 예산 없이 반납되고 다음 drain이 격리를 마친다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    const injected = faults();
    injected.throwing.add("d2");
    injected.throwing.add("d7");
    // The minimum budget for a claim of 8 is 1 + 2 * ceil(log2 8) = 7.
    const indexer = faultyIndexer(setup, injected, {
      maxDocumentsPerClaim: 8,
      maxIsolationCallsPerBatch: 7,
    });
    const ids = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"];
    await writeNotes(setup, Object.fromEntries(ids.map((id) => [id, { body: id }])));

    // First drain: [8], [4][4], [2][2][2][2] use up the budget; two good pairs are indexed and the bad pairs released.
    const first = await indexer.drainOnce();
    expect(injected.calls).toBe(7);
    expect(first).toMatchObject({
      claimed: 8,
      indexed: 4,
      released: 4,
      quarantined: 0,
      retried: 0,
    });
    for (const id of ["d1", "d2", "d7", "d8"]) {
      expect(runtimeOf(await kit.runtimes(), id)).toMatchObject({
        attempts: 0,
        quarantined_revision: null,
        last_error: { class: "materialize_released", code: "isolation_budget_exhausted" },
      });
    }

    // Second drain: only the remaining four are claimed; the bad two are quarantined, still without budget.
    injected.calls = 0;
    const second = await indexer.drainOnce();
    expect(injected.calls).toBe(7);
    expect(second).toMatchObject({
      claimed: 4,
      indexed: 2,
      quarantined: 2,
      released: 0,
      retried: 0,
    });
    expect(
      (await kit.runtimes()).map((row) => [
        row.document_id,
        row.quarantined_revision,
        row.attempts,
      ]),
    ).toEqual([
      ["d2", 1, 0],
      ["d7", 1, 0],
    ]);
    for (const id of ["d1", "d3", "d4", "d5", "d6", "d8"]) {
      expect(await kit.indexed(target, id)).toMatchObject({ version: 1 });
    }
  });
});
