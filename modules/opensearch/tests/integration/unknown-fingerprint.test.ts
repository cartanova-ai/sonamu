import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type DefinedSearch, defineSearch } from "../../src/definition/define-search";
import { type DrainReport, type SearchIndexer } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import { qualified, sql } from "../helpers/sql";
import {
  type Note,
  outcomeSum,
  useWorkerFixture,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * A worker that does not know a target's (logical key, fingerprint) only reports it in unsupportedTargets and its
 * capability heartbeat; it never claims, pauses or spends budget on it, and a worker with the right definition takes
 * the deliveries. Re-marked hot documents in one target must not starve another target.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);

function targetOf(setup: WorkerSetup, key: string) {
  const target = setup.targets.get(key);
  if (target === undefined) throw new Error(`대상 ${key}가 없습니다.`);
  return target;
}

function definitionOf(setup: WorkerSetup, key: string): DefinedSearch {
  const definition = setup.definitions.get(key);
  if (definition === undefined) throw new Error(`정의 ${key}가 없습니다.`);
  return definition;
}

/** projectionVersion 2 of the same key: a different fingerprint that matches no existing target. */
function otherVersion(definition: DefinedSearch): DefinedSearch {
  return defineSearch<Note>({
    key: definition.key,
    projectionVersion: "2",
    // SAFETY: reuses the fixture definition's schema unchanged; its document type is Note.
    schema: definition.schema as DefinedSearch<Note>["schema"],
    settings: definition.settings,
    mappings: definition.mappings,
    requiredPlugins: definition.requiredPlugins,
    // SAFETY: passes the same definition's materialize unchanged.
    materialize: definition.materialize as DefinedSearch<Note>["materialize"],
    captureScanBoundary: definition.captureScanBoundary,
    scanSourceIds: definition.scanSourceIds,
  });
}

async function writeDocuments(setup: WorkerSetup, key: string, ids: readonly string[]) {
  await kit.write(setup, key, ids, async (trx) => {
    for (const id of ids) await kit.upsert(trx, key, id, `${key} ${id}`);
  });
}

const heartbeatSchema = z.object({ worker_id: z.string(), capabilities: z.array(z.string()) });

async function capabilities(): Promise<string[][]> {
  const { rows } = await h.knex.raw(
    sql`SELECT worker_id::text, capabilities FROM ${qualified(h.searchSchema, "worker_heartbeats")} ORDER BY worker_id`,
  );
  return z
    .array(heartbeatSchema)
    .parse(rows)
    .map((row) => row.capabilities.toSorted());
}

describe("모르는 fingerprint (워커)", () => {
  it("옛 워커는 새 fingerprint 대상을 claim하지도 정지시키지도 않는다", async () => {
    // A drainOnce caller's capability row exists only during the call, so read it during the projection.
    const seenCapabilities: string[][][] = [];
    const setup = await kit.setUp({
      keys: ["alpha", "beta"],
      hooks: {
        alpha: {
          beforeRead: async () => {
            seenCapabilities.push(await capabilities());
          },
        },
      },
    });
    const [alpha, beta] = [targetOf(setup, "alpha"), targetOf(setup, "beta")];
    const alphaDefinition = definitionOf(setup, "alpha");
    const betaDefinition = definitionOf(setup, "beta");
    const oldBeta = otherVersion(betaDefinition);
    expect(oldBeta.fingerprint).not.toBe(betaDefinition.fingerprint);
    for (const key of ["alpha", "beta"]) await writeDocuments(setup, key, ["a", "b"]);

    // The old worker knows alpha but only another version of beta.
    const old = kit.indexer({
      ...setup,
      definitions: new Map([
        ["alpha", alphaDefinition],
        ["beta", oldBeta],
      ]),
    });
    const report = await old.indexer.drainOnce();
    expect(report).toMatchObject({ claimed: 2, indexed: 2, unsupportedTargets: [beta.targetId] });
    expect(outcomeSum(report)).toBe(report.claimed);
    // beta's deliveries are untouched: no lease, runtime row, budget or pause.
    expect((await kit.intents()).map((row) => [row.target_id, row.document_id])).toEqual([
      [beta.targetId, "a"],
      [beta.targetId, "b"],
    ]);
    expect(await kit.runtimes()).toEqual([]);
    const { rows } = await h.knex.raw<{ rows: { state: string; pause_reason: unknown }[] }>(
      sql`SELECT state, pause_reason FROM ${qualified(h.searchSchema, "targets")} WHERE target_id = ?`,
      [beta.targetId],
    );
    expect(rows).toEqual([{ state: "active", pause_reason: null }]);
    // The capability heartbeat lists only the (key, fingerprint) pairs this worker knows.
    expect(seenCapabilities).toEqual([
      [[`alpha@${alphaDefinition.fingerprint}`, `beta@${oldBeta.fingerprint}`].toSorted()],
    ]);
    expect(await capabilities()).toEqual([]);
    expect(await old.indexer.drainOnce()).toMatchObject({
      claimed: 0,
      unsupportedTargets: [beta.targetId],
    });

    const current = kit.indexer({ ...setup, definitions: new Map([["beta", betaDefinition]]) });
    expect(await current.indexer.drainOnce()).toMatchObject({
      claimed: 2,
      indexed: 2,
      unsupportedTargets: [alpha.targetId],
    });
    expect(await kit.intents()).toEqual([]);
    expect(await kit.indexed(beta, "a")).toMatchObject({ version: 1 });
  });
});

const LIMIT = 5;

/** The lower target id is busy: ties in enqueue time claim in target id order, and groups run in that order. */
function ordered(setup: WorkerSetup): { busy: string; quiet: string } {
  return targetOf(setup, "alpha").targetId < targetOf(setup, "beta").targetId
    ? { busy: "alpha", quiet: "beta" }
    : { busy: "beta", quiet: "alpha" };
}

/** Drains until the quiet target's q is indexed; drains is Infinity if maxDrains is not enough. */
async function drainsUntilIndexed(
  indexer: SearchIndexer,
  setup: WorkerSetup,
  quiet: string,
  maxDrains: number,
): Promise<{ drains: number; reports: DrainReport[] }> {
  const reports: DrainReport[] = [];
  for (let drain = 1; drain <= maxDrains; drain += 1) {
    reports.push(await indexer.drainOnce());
    if ((await kit.indexed(targetOf(setup, quiet), "q")) !== null)
      return { drains: drain, reports };
  }
  return { drains: Number.POSITIVE_INFINITY, reports };
}

describe("대상 사이의 claim 공정성", () => {
  it("처리 중에 계속 다시 표시되는 문서가 claim 한도만큼 있어도 다른 대상의 문서가 굶지 않는다", async () => {
    let churn: (() => Promise<void>) | undefined;
    const hooks = {
      beforeRead: async () => {
        await churn?.();
      },
    };
    const setup = await kit.setUp({
      keys: ["alpha", "beta"],
      hooks: { alpha: hooks, beta: hooks },
    });
    const { busy, quiet } = ordered(setup);
    const hot = Array.from({ length: LIMIT }, (_, index) => `h${index}`);
    await writeDocuments(setup, busy, hot);
    await writeDocuments(setup, quiet, ["q"]);
    let revision = 1;
    // Hot documents are re-marked during the busy target's snapshot, so their intents survive the acknowledgement and
    // are claimable again at once, as for constantly updated rows in a busy source.
    let busyReads = 0;
    churn = async () => {
      busyReads += 1;
      if (busyReads > 20) return;
      revision += 1;
      await writeDocuments(setup, busy, hot);
    };
    const { indexer } = kit.indexer(setup, { limits: { maxDocumentsPerClaim: LIMIT } });
    const { drains, reports } = await drainsUntilIndexed(indexer, setup, quiet, 6);
    // q was marked after the hot documents and misses the first drain, but is claimed before hot documents come round
    // again.
    expect(drains).toBeLessThanOrEqual(2);
    for (const report of reports) expect(outcomeSum(report)).toBe(report.claimed);
    expect(revision).toBeGreaterThan(1);
  });
});
