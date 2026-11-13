import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  applySearchGrants,
  createSearchAdmin,
  type SearchAdmin,
} from "../../src/admin";
import { createSearchClient, type SearchClient } from "../../src/client/search-client";
import {
  SearchAdminPreconditionFailed,
  type SearchError,
  SearchTargetUnavailable,
  SearchUnavailable,
} from "../../src/errors";
import {
  createIndexer,
  createPostgresCatalogReader,
  createPostgresSynchronization,
  type SearchIndexer,
} from "../../src/postgres";
import {
  createSearchQueries,
  type SearchCandidates,
  type SearchQueries,
} from "../../src/query/search-queries";
import { createTestDefinition, TEST_READ_LIFETIMES } from "../../src/testing";
import { type TestRole, useIntegrationHarness } from "../helpers/harness";
import { qualified, sql } from "../helpers/sql";
import { resetSearchSchema } from "../helpers/test-targets";
import { TEST_LIMITS } from "../helpers/worker-fixture";

/**
 * Checks that need no indexing leave backfill intents pending and use a handle with a large maxPendingDocuments; the
 * others drain them with a real worker. V2 prefixes bodies with "v2 ", so a result body tells which index was read.
 */

const h = useIntegrationHarness({ sampleDomain: false });
const KEY = "messages";
const TIMEOUTS = {
  lockTimeoutMs: 10_000,
  statementTimeoutMs: 20_000,
  idleInTransactionTimeoutMs: 60_000,
  adminLeaseMs: 120_000,
};

type Doc = { body: string; seq: number };
const source = new Map<string, Doc>();
const documentSchema = z.object({ body: z.string(), seq: z.number().int() });
const PROPERTIES = { body: { type: "text" }, seq: { type: "integer" } } as const;
const V1 = createTestDefinition({
  key: KEY,
  schema: documentSchema,
  properties: PROPERTIES,
  documents: () => source,
});
const V2 = createTestDefinition({
  key: KEY,
  projectionVersion: "2",
  schema: documentSchema,
  properties: PROPERTIES,
  documents: () =>
    new Map(
      [...source].map(([id, doc]): [string, Doc] => [id, { ...doc, body: `v2 ${doc.body}` }]),
    ),
});

let adminRole: TestRole;
let workerRole: TestRole;
let queryRole: TestRole;
let adminKnex: Knex;
let workerKnex: Knex;
let queryKnex: Knex;
let searchClient: SearchClient;

function roleUrl(role: TestRole, application: string): string {
  const url = new URL(role.url);
  url.searchParams.set("application_name", `h:${h.id}:${application}`);
  return url.toString();
}

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  workerRole = await h.createRole("worker");
  queryRole = await h.createRole("query");
  adminKnex = knexFactory({
    client: "pg",
    connection: roleUrl(adminRole, "admin"),
    pool: { min: 0, max: 4 },
  });
  workerKnex = knexFactory({
    client: "pg",
    connection: roleUrl(workerRole, "worker"),
    pool: { min: 0, max: 6 },
  });
  queryKnex = knexFactory({
    client: "pg",
    connection: roleUrl(queryRole, "query"),
    pool: { min: 0, max: 2 },
  });
  searchClient = createSearchClient({
    createClient: () => h.opensearch,
    ownsClient: false,
    requestTimeoutMs: 30_000,
  });
});

afterAll(async () => {
  await searchClient?.close();
  await adminKnex?.destroy();
  await workerKnex?.destroy();
  await queryKnex?.destroy();
});

beforeEach(async () => {
  source.clear();
  for (let i = 1; i <= 5; i += 1) source.set(`doc-${i}`, { body: `본문 ${i}`, seq: i });
  await resetSearchSchema(h);
  await applySearchGrants(h.knex, {
    schema: h.searchSchema,
    roles: { admin: [adminRole.name], worker: [workerRole.name], query: [queryRole.name] },
  });
});

function adminWith(cutover: { maxPendingDocuments: number; sampleSize: number }): SearchAdmin {
  return createSearchAdmin({
    client: searchClient,
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [V1, V2],
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    timeouts: TIMEOUTS,
    cutover,
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 30_000 },
  });
}
/** Pending intents do not block cutover on this handle. */
const lenient = () => adminWith({ maxPendingDocuments: 1_000_000, sampleSize: 0 });

function audit(): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason: "cutover" };
}

const s = (name: string) => qualified(h.searchSchema, name);

async function backfill(admin: SearchAdmin, buildId: string): Promise<void> {
  for (let step = 0; step < 50; step += 1) {
    if ((await admin.runBackfillPage(buildId, { limit: 2 })).done) return;
  }
  throw new Error("backfill이 끝나지 않았습니다.");
}

type Head = { target_id: string | null; generation: string; rebuild_required: boolean };
async function readHead(): Promise<Head> {
  const { rows } = await h.knex.raw<{ rows: Head[] }>(
    sql`SELECT target_id::text AS target_id, generation, rebuild_required FROM ${s("read_heads")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, KEY],
  );
  return rows[0];
}

type Build = {
  phase: string;
  expected_read_target_id: string | null;
  expected_read_generation: string;
  cutover_at: Date | null;
  rolled_back_at: Date | null;
};
async function readBuild(buildId: string): Promise<Build> {
  const { rows } = await h.knex.raw<{ rows: Build[] }>(
    sql`SELECT phase, expected_read_target_id::text AS expected_read_target_id, expected_read_generation, cutover_at, rolled_back_at
FROM ${s("builds")} WHERE build_id = ?`,
    [buildId],
  );
  return rows[0];
}

type TargetTimes = {
  selected: boolean;
  deselected: boolean;
  confirmed: boolean;
  confirmed_after_deselected: boolean | null;
};
async function targetTimes(targetId: string): Promise<TargetTimes> {
  const { rows } = await h.knex.raw<{ rows: TargetTimes[] }>(
    sql`SELECT selected_at IS NOT NULL AS selected, deselected_at IS NOT NULL AS deselected,
       deselect_confirmed_at IS NOT NULL AS confirmed, deselect_confirmed_at >= deselected_at AS confirmed_after_deselected
FROM ${s("targets")} WHERE target_id = ?`,
    [targetId],
  );
  return rows[0];
}

async function rejection<T>(promise: Promise<T>): Promise<SearchError> {
  return promise.then(
    () => {
      throw new Error("거부되어야 했습니다.");
    },
    (error: SearchError) => error,
  );
}

/** details.reason is the first blocker code and details.blockers the comma-joined list. */
async function expectBlocked<T>(promise: Promise<T>, blockers: readonly string[]): Promise<void> {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(SearchAdminPreconditionFailed);
  if (!(error instanceof SearchAdminPreconditionFailed)) return;
  expect(error.retryable).toBe(false);
  expect(error.details?.reason).toBe(blockers[0]);
  expect(error.details?.blockers).toBe(blockers.join(","));
}

/** Serves the first target and runs a V2 rebuild until its scan is complete. */
async function rebuildReady(admin: SearchAdmin) {
  const first = await admin.beginRebuild({ logicalKey: KEY, fingerprint: V1.fingerprint }, audit());
  await backfill(admin, first.buildId);
  await admin.cutover(first.buildId, audit());
  const second = await admin.beginRebuild(
    { logicalKey: KEY, fingerprint: V2.fingerprint },
    audit(),
  );
  await backfill(admin, second.buildId);
  return {
    oldTarget: first.target.targetId,
    buildId: second.buildId,
    newTarget: second.target.targetId,
    second,
  };
}

function indexer(): SearchIndexer {
  return createIndexer({
    client: searchClient,
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => workerKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [V1, V2],
    limits: TEST_LIMITS,
    workerId: randomUUID(),
  });
}

async function drain(worker: SearchIndexer): Promise<number> {
  let indexed = 0;
  for (let round = 0; round < 20; round += 1) {
    const report = await worker.drainOnce();
    expect(report).toMatchObject({ retried: 0, quarantined: 0, leaseLost: 0, abandoned: 0 });
    indexed += report.indexed;
    if (report.claimed === 0) return indexed;
  }
  throw new Error("drain이 끝나지 않았습니다.");
}

const SIGNING_KEY = { id: "k1", secret: new Uint8Array(32).fill(7) };
const BY_SEQ = [{ "doc.seq": "asc" as const }];

function queries(): SearchQueries<Doc> {
  return createSearchQueries<Doc>({
    client: searchClient,
    catalog: createPostgresCatalogReader({
      getPrimaryDatabase: () => queryKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    logicalKey: KEY,
    supportedFingerprints: [V1.fingerprint, V2.fingerprint],
    limits: { ...TEST_READ_LIFETIMES, maxPageSize: 100, timeoutMs: 10_000 },
    cursor: { signingKeys: [SIGNING_KEY] },
    policy: { sourceIncludes: ["body", "seq"] },
  });
}

function bodies(page: SearchCandidates<Doc>): string[] {
  return page.hits.map((hit) => hit.source?.body ?? "");
}

/** Like rebuildReady, with both targets fully indexed and refreshed. */
async function indexedRebuild(admin: SearchAdmin) {
  const ready = await rebuildReady(admin);
  expect(await drain(indexer())).toBe(10);
  await h.opensearch.indices.refresh({ index: "_all" });
  return ready;
}

/** Waits until the backend with this application_name is waiting on a lock held by blocker. */
async function waitingPid(application: string, blocker: number): Promise<number> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { rows } = await h.knex.raw<{ rows: { pid: number; blocking: number[] }[] }>(
      "SELECT pid, pg_blocking_pids(pid) AS blocking FROM pg_stat_activity WHERE application_name = ? AND wait_event_type = 'Lock'",
      [`h:${h.id}:${application}`],
    );
    const found = rows.find((row) => row.blocking.includes(blocker));
    if (found !== undefined) return found.pid;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(
    `${application} 백엔드가 PID ${blocker} 때문에 기다리는 것이 관찰되지 않았습니다.`,
  );
}

const indexedSchema = z.looseObject({
  _version: z.number(),
  _source: z.looseObject({
    sonamu_meta: z.looseObject({ deleted: z.boolean(), projection_hash: z.string() }),
  }),
});

/** Overwrites a document with external_gte versioning; returns the original _version and _source. */
async function overwrite(
  physicalIndex: string,
  id: string,
  change: (meta: { deleted: boolean; projection_hash: string }) => void,
  versionDelta = 0,
) {
  const current = indexedSchema.parse((await h.opensearch.get({ index: physicalIndex, id })).body);
  const original = structuredClone(current._source);
  const changed = structuredClone(current._source);
  change(changed.sonamu_meta);
  await h.opensearch.index({
    index: physicalIndex,
    id,
    version: current._version + versionDelta,
    version_type: "external_gte",
    body: changed,
    refresh: true,
  });
  return { version: current._version, original };
}

describe("원자적 cutover", () => {
  it("읽기 포인터와 빌드 상태가 한 트랜잭션으로 바뀐다", async () => {
    const admin = lenient();
    const ready = await rebuildReady(admin);
    const head = await readHead();
    const build = await readBuild(ready.buildId);
    expect(head).toEqual({ target_id: ready.oldTarget, generation: "1", rebuild_required: false });
    expect(build).toMatchObject({
      phase: "catching_up",
      expected_read_target_id: ready.oldTarget,
      expected_read_generation: "1",
    });

    // Failing the audit insert, the last statement before commit, must roll back every cutover write.
    await h.knex.raw(
      sql`CREATE FUNCTION ${s("test_fail")}() RETURNS trigger LANGUAGE plpgsql AS $fail$
BEGIN
  RAISE EXCEPTION 'test: audit failure';
END
$fail$`,
    );
    await h.knex.raw(
      sql`CREATE TRIGGER fail_cutover BEFORE INSERT ON ${s("admin_operations")}
FOR EACH ROW WHEN (NEW.kind = 'cutover' AND NEW.outcome = 'succeeded') EXECUTE FUNCTION ${s("test_fail")}()`,
    );
    expect(await rejection(admin.cutover(ready.buildId, audit()))).toBeInstanceOf(
      SearchUnavailable,
    );
    expect(await readHead()).toEqual(head);
    expect(await readBuild(ready.buildId)).toEqual(build);
    expect(await targetTimes(ready.oldTarget)).toMatchObject({ deselected: false });
    expect(await targetTimes(ready.newTarget)).toMatchObject({ selected: false });

    await h.knex.raw(sql`DROP TRIGGER fail_cutover ON ${s("admin_operations")}`);
    await expect(admin.cutover(ready.buildId, audit())).resolves.toEqual({
      logicalKey: KEY,
      readTargetId: ready.newTarget,
      previousTargetId: ready.oldTarget,
      readGeneration: 2,
    });
    expect(await readHead()).toEqual({
      target_id: ready.newTarget,
      generation: "2",
      rebuild_required: false,
    });
    const after = await readBuild(ready.buildId);
    expect(after).toMatchObject({
      phase: "serving",
      expected_read_target_id: ready.newTarget,
      expected_read_generation: "2",
    });
    expect(after.cutover_at).not.toBeNull();
    // The outgoing target gets its post-commit deselection confirmation time.
    expect(await targetTimes(ready.oldTarget)).toEqual({
      selected: true,
      deselected: true,
      confirmed: true,
      confirmed_after_deselected: true,
    });
    expect(await targetTimes(ready.newTarget)).toMatchObject({ selected: true, deselected: false });
  });

  it("rollback 상대가 없는 첫 빌드는 cutover와 함께 닫혀 다음 재구축을 막지 않는다", async () => {
    const admin = lenient();
    const first = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    expect(first.kind).toBe("initial");
    await backfill(admin, first.buildId);
    await expect(admin.cutover(first.buildId, audit())).resolves.toMatchObject({
      previousTargetId: null,
      readGeneration: 1,
    });
    expect((await readBuild(first.buildId)).phase).toBe("retired");
    expect((await admin.inspect(KEY)).openBuild).toBeNull();
    await expectBlocked(admin.rollback(first.buildId, audit()), ["no-rollback-target"]);
    const second = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V2.fingerprint },
      audit(),
    );
    expect(second.kind).toBe("rebuild");
  });
});

describe("차단이 남아 있으면 cutover는 아무것도 바꾸지 않는다", () => {
  it("대기, 격리, 미완료 backfill, 다른 epoch, 예상과 다른 헤드를 안정된 코드로 거부하고 inspectBuild도 같은 코드를 보고한다", async () => {
    const admin = lenient();
    const first = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    await backfill(admin, first.buildId);
    await admin.cutover(first.buildId, audit());
    const second = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V2.fingerprint },
      audit(),
    );
    const buildId = second.buildId;
    const unchanged = async () => {
      expect(await readHead()).toEqual({
        target_id: first.target.targetId,
        generation: "1",
        rebuild_required: false,
      });
    };

    // The first page only records the scan boundary.
    await admin.runBackfillPage(buildId, { limit: 2 });
    const scanning = await admin.inspectBuild(buildId);
    expect(scanning).toMatchObject({
      phase: "backfilling",
      eligibleForCutover: false,
      blockers: ["phase-not-catching-up", "scan-incomplete"],
      scan: { completed: false, pages: 0, documents: 0, boundary: "doc-5" },
    });
    await expectBlocked(admin.cutover(buildId, audit()), [
      "phase-not-catching-up",
      "scan-incomplete",
    ]);
    await unchanged();

    await backfill(admin, buildId);
    const done = await admin.inspectBuild(buildId);
    expect(done).toMatchObject({
      phase: "catching_up",
      kind: "rebuild",
      eligibleForCutover: true,
      blockers: [],
      scan: { completed: true, pages: 3, documents: 5 },
      newTarget: { pending: 5, quarantined: 0 },
    });
    expect(done.oldTarget).toBeDefined();

    // No worker runs, so all five stay pending.
    const strict = adminWith({ maxPendingDocuments: 0, sampleSize: 0 });
    expect((await strict.inspectBuild(buildId)).blockers).toEqual(["pending-above-limit"]);
    await expectBlocked(strict.cutover(buildId, audit()), ["pending-above-limit"]);
    await unchanged();

    await h.knex.raw(
      sql`INSERT INTO ${s("delivery_runtime")} (target_id, document_id, intent_id, quarantined_revision)
SELECT target_id, document_id, intent_id, desired_revision FROM ${s("deliveries")}
WHERE target_id = ? AND document_id = 'doc-3'`,
      [second.target.targetId],
    );
    expect((await admin.inspectBuild(buildId)).blockers).toEqual(["quarantined-documents"]);
    await expectBlocked(admin.cutover(buildId, audit()), ["quarantined-documents"]);
    await unchanged();
    await h.knex.raw(sql`DELETE FROM ${s("delivery_runtime")}`);

    await h.knex.raw(
      sql`UPDATE ${s("read_heads")} SET generation = generation + 1 WHERE namespace = ? AND definition = ?`,
      [h.namespace, KEY],
    );
    expect((await admin.inspectBuild(buildId)).blockers).toEqual(["read-head-moved"]);
    await expectBlocked(admin.cutover(buildId, audit()), ["read-head-moved"]);
    expect((await readHead()).generation).toBe("2");
    await h.knex.raw(
      sql`UPDATE ${s("read_heads")} SET generation = generation - 1 WHERE namespace = ? AND definition = ?`,
      [h.namespace, KEY],
    );

    await h.knex.raw(
      sql`UPDATE ${s("indexes")} SET capture_epoch = capture_epoch + 1 WHERE namespace = ? AND definition = ?`,
      [h.namespace, KEY],
    );
    expect((await admin.inspectBuild(buildId)).blockers).toEqual(["capture-epoch-mismatch"]);
    await expectBlocked(admin.cutover(buildId, audit()), ["capture-epoch-mismatch"]);
    await unchanged();
    expect((await readBuild(buildId)).phase).toBe("catching_up");
  });

  it("새 대상의 쓰기 alias가 없으면 원격 확인에서 거부되고 다시 만들지 않는다", async () => {
    const admin = lenient();
    const ready = await rebuildReady(admin);
    await h.opensearch.indices.deleteAlias({
      index: ready.second.target.physicalIndex,
      name: ready.second.target.writeAlias,
    });
    const error = await rejection(admin.cutover(ready.buildId, audit()));
    expect(error).toBeInstanceOf(SearchTargetUnavailable);
    if (error instanceof SearchTargetUnavailable) {
      expect(error.details?.reason).toBe("registered-target-missing-remote");
    }
    expect((await readHead()).target_id).toBe(ready.oldTarget);
    const alias = await h.opensearch.indices.existsAlias({ name: ready.second.target.writeAlias });
    expect(alias.body).toBe(false);
  });

  it("표본 검증은 대기 중인 문서를 통과시키고, intent도 색인도 없는 원본 문서를 찾으면 거부한다", async () => {
    const admin = lenient();
    const ready = await rebuildReady(admin);
    const sampled = adminWith({ maxPendingDocuments: 1_000_000, sampleSize: 50 });
    // A lost intent, as if backfill had missed the document: neither indexed nor pending.
    await h.knex.raw(
      sql`DELETE FROM ${s("deliveries")} WHERE target_id = ? AND document_id = 'doc-2'`,
      [ready.newTarget],
    );
    const error = await rejection(sampled.cutover(ready.buildId, audit()));
    expect(error).toBeInstanceOf(SearchAdminPreconditionFailed);
    if (error instanceof SearchAdminPreconditionFailed) {
      expect(error.details).toMatchObject({
        reason: "verification-failed",
        checked: 5,
        violations: 1,
      });
    }
    expect((await readHead()).target_id).toBe(ready.oldTarget);

    // Once the source row is gone too, it counts as a never-indexed deletion and passes.
    source.delete("doc-2");
    await expect(sampled.cutover(ready.buildId, audit())).resolves.toMatchObject({
      readTargetId: ready.newTarget,
    });
  });

  it("표본 검증은 색인된 문서의 _version, deleted, projection_hash를 원장 스냅샷과 비교한다", async () => {
    const admin = lenient();
    const ready = await indexedRebuild(admin);
    const sampled = adminWith({ maxPendingDocuments: 0, sampleSize: 50 });
    const index = ready.second.target.physicalIndex;

    // At an equal version, a different projection_hash or deleted flag is a violation.
    const hash = await overwrite(index, "doc-3", (meta) => {
      meta.projection_hash = "0".repeat(64);
    });
    const tomb = await overwrite(index, "doc-4", (meta) => {
      meta.deleted = true;
    });
    const error = await rejection(sampled.cutover(ready.buildId, audit()));
    expect(error).toBeInstanceOf(SearchAdminPreconditionFailed);
    expect(error.details).toMatchObject({
      reason: "verification-failed",
      checked: 5,
      violations: 2,
    });
    expect((await readHead()).target_id).toBe(ready.oldTarget);

    // Restore both; a higher version with foreign content counts as indexed after the snapshot and passes.
    for (const [id, saved] of [
      ["doc-3", hash],
      ["doc-4", tomb],
    ] as const) {
      await h.opensearch.index({
        index,
        id,
        version: saved.version,
        version_type: "external_gte",
        body: saved.original,
        refresh: true,
      });
    }
    await overwrite(
      index,
      "doc-5",
      (meta) => {
        meta.projection_hash = "f".repeat(64);
      },
      1,
    );
    await expect(sampled.cutover(ready.buildId, audit())).resolves.toMatchObject({
      readTargetId: ready.newTarget,
    });
  });
});

describe("진행 중인 검색과 cutover", () => {
  it("커밋 전에 시작한 검색은 옛 대상에서 끝나고, 커밋 뒤에 시작한 검색은 새 대상의 문서를 읽는다", async () => {
    const admin = lenient();
    const ready = await indexedRebuild(admin);
    const body = { sort: BY_SEQ, size: 10, _source: ["body"] };
    const search = queries();
    const before = await search.search({ body });
    expect(before.target).toEqual({
      targetId: ready.oldTarget,
      fingerprint: V1.fingerprint,
      readGeneration: 1,
    });
    expect(bodies(before)).toEqual(["본문 1", "본문 2", "본문 3", "본문 4", "본문 5"]);

    // Test trigger that holds the cutover at its last statement, before commit.
    await h.knex.raw(
      sql`CREATE FUNCTION ${s("test_gate")}() RETURNS trigger LANGUAGE plpgsql AS $gate$
BEGIN
  PERFORM pg_advisory_xact_lock(7120419);
  RETURN NEW;
END
$gate$`,
    );
    await h.knex.raw(
      sql`CREATE TRIGGER cutover_gate BEFORE INSERT ON ${s("admin_operations")}
FOR EACH ROW WHEN (NEW.kind = 'cutover' AND NEW.outcome = 'succeeded') EXECUTE FUNCTION ${s("test_gate")}()`,
    );
    const { sessions } = await h.openSessions(["gate"]);
    await sessions.gate.run("SELECT pg_advisory_lock(7120419)");
    const pending = admin.cutover(ready.buildId, audit());
    pending.catch(() => {});
    await waitingPid("admin", sessions.gate.pid);
    // The pointer has moved but is uncommitted; a search started now must neither wait nor see it.
    const during = await search.search({ body });
    expect(during.target.targetId).toBe(ready.oldTarget);
    expect(bodies(during)).toEqual(bodies(before));

    await sessions.gate.run("SELECT pg_advisory_unlock(7120419)");
    await expect(pending).resolves.toMatchObject({
      readTargetId: ready.newTarget,
      readGeneration: 2,
    });
    const after = await search.search({ body });
    expect(after.target).toEqual({
      targetId: ready.newTarget,
      fingerprint: V2.fingerprint,
      readGeneration: 2,
    });
    expect(bodies(after)).toEqual([
      "v2 본문 1",
      "v2 본문 2",
      "v2 본문 3",
      "v2 본문 4",
      "v2 본문 5",
    ]);
  });
});

describe("기대 헤드는 양방향으로 갱신된다", () => {
  it("cutover → rollback → 다시 cutover가 기대 헤드 CAS를 통과한다", async () => {
    const admin = lenient();
    const ready = await rebuildReady(admin);

    await expect(admin.cutover(ready.buildId, audit())).resolves.toMatchObject({
      readTargetId: ready.newTarget,
      readGeneration: 2,
    });
    await expect(admin.rollback(ready.buildId, audit())).resolves.toEqual({
      logicalKey: KEY,
      readTargetId: ready.oldTarget,
      previousTargetId: ready.newTarget,
      readGeneration: 3,
    });
    const rolledBack = await readBuild(ready.buildId);
    expect(rolledBack).toMatchObject({
      phase: "catching_up",
      expected_read_target_id: ready.oldTarget,
      expected_read_generation: "3",
    });
    expect(rolledBack.rolled_back_at).not.toBeNull();
    // After rollback the outgoing new target is confirmed deselected; the returning old target is only selected.
    expect(await targetTimes(ready.newTarget)).toMatchObject({ deselected: true, confirmed: true });
    expect(await targetTimes(ready.oldTarget)).toMatchObject({
      selected: true,
      deselected: false,
      confirmed: false,
    });

    await expect(admin.cutover(ready.buildId, audit())).resolves.toMatchObject({
      readTargetId: ready.newTarget,
      previousTargetId: ready.oldTarget,
      readGeneration: 4,
    });
    expect(await readBuild(ready.buildId)).toMatchObject({
      phase: "serving",
      expected_read_target_id: ready.newTarget,
      expected_read_generation: "4",
    });
    expect(await readHead()).toEqual({
      target_id: ready.newTarget,
      generation: "4",
      rebuild_required: false,
    });
  });

  it("rollback과 다시 cutover 모두 예상과 다른 헤드를 거부한다", async () => {
    const admin = lenient();
    const ready = await rebuildReady(admin);
    await admin.cutover(ready.buildId, audit());
    const bump = (delta: number) =>
      h.knex.raw(
        sql`UPDATE ${s("read_heads")} SET generation = generation + ? WHERE namespace = ? AND definition = ?`,
        [delta, h.namespace, KEY],
      );

    await bump(1);
    await expectBlocked(admin.rollback(ready.buildId, audit()), ["read-head-moved"]);
    expect((await readBuild(ready.buildId)).phase).toBe("serving");
    await bump(-1);
    await admin.rollback(ready.buildId, audit());

    await bump(1);
    await expectBlocked(admin.cutover(ready.buildId, audit()), ["read-head-moved"]);
    expect((await readHead()).target_id).toBe(ready.oldTarget);
    await bump(-1);
    await expect(admin.cutover(ready.buildId, audit())).resolves.toMatchObject({
      readTargetId: ready.newTarget,
    });
    await expectBlocked(admin.cutover(ready.buildId, audit()), ["phase-not-catching-up"]);
  });
});
