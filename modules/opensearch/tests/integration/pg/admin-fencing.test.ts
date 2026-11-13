import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  applySearchGrants,
  createSearchAdmin,
  type SearchAdmin,
} from "../../../src/admin";
import { createSearchClient, type SearchClient } from "../../../src/client/search-client";
import { SearchAdminLeaseLost, type SearchError } from "../../../src/errors";
import { createPostgresSynchronization } from "../../../src/postgres";
import { createTestDefinition, TEST_READ_LIFETIMES } from "../../../src/testing";
import { type TestRole, useIntegrationHarness } from "../../helpers/harness";
import { gate, requestRecorder } from "../../helpers/request-recorder";
import { qualified, sql } from "../../helpers/sql";
import { resetSearchSchema, waitForLockWait } from "../../helpers/test-targets";

/**
 * Fenced admin transactions, run as the admin role against a real engine. Races use row locks held by other sessions
 * and proceed only after pg_stat_activity and pg_blocking_pids show the admin backend waiting. The lease is replaced
 * with the suspend operation's preempting update. Two orders are pinned:
 *  - the replacement commits first: a fenced transaction waiting at the barrier then fails its lease check and writes
 *    nothing, for every operation that writes under the fence;
 *  - a fenced transaction is already past its lease check: the replacement waits for it, so only the holder of the
 *    current token ever commits.
 */

const h = useIntegrationHarness({ sampleDomain: false });
const KEY = "messages";
const TIMEOUTS = {
  lockTimeoutMs: 15_000,
  statementTimeoutMs: 20_000,
  idleInTransactionTimeoutMs: 60_000,
  adminLeaseMs: 120_000,
};

const source = new Map<string, { body: string }>();
const documentSchema = z.object({ body: z.string() });
const V1 = createTestDefinition({
  key: KEY,
  schema: documentSchema,
  properties: { body: { type: "text" } },
  documents: () => source,
});
const V2 = createTestDefinition({
  key: KEY,
  projectionVersion: "2",
  schema: documentSchema,
  properties: { body: { type: "text" } },
  documents: () => source,
});

let adminRole: TestRole;
let adminKnex: Knex;
let searchClient: SearchClient;
let admin: SearchAdmin;

function roleUrl(role: TestRole, application: string): string {
  const url = new URL(role.url);
  url.searchParams.set("application_name", `h:${h.id}:${application}`);
  return url.toString();
}

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  adminKnex = knexFactory({
    client: "pg",
    connection: roleUrl(adminRole, "admin"),
    pool: { min: 0, max: 4 },
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
});

beforeEach(async () => {
  source.clear();
  for (let i = 1; i <= 6; i += 1) source.set(`doc-${i}`, { body: `본문 ${i}` });
  await resetSearchSchema(h);
  await applySearchGrants(h.knex, { schema: h.searchSchema, roles: { admin: [adminRole.name] } });
  admin = createSearchAdmin({
    client: searchClient,
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [V1, V2],
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    timeouts: TIMEOUTS,
    // No worker runs here, so pending intents must not block the cutover.
    cutover: { maxPendingDocuments: 1_000_000, sampleSize: 0 },
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 30_000 },
  });
});

function audit(): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason: "fence test" };
}

const s = (name: string) => qualified(h.searchSchema, name);
// The exclusive barrier lock; admin code waits on it for its shared barrier.
const exclusiveBarrier = () =>
  sql`SELECT generation FROM ${s("indexes")} WHERE namespace = $1 AND definition = $2 FOR UPDATE`;
// The suspend operation's lease preemption: replaces the token unconditionally.
const preemptLease = () => sql`UPDATE ${s("admin_controls")} c
SET operation_id = $3, operation_kind = $4, actor = $5, lease_token = $6::uuid,
    lease_expires_at = clock_timestamp() + ($7::bigint * interval '1 millisecond'),
    acquired_at = clock_timestamp(), heartbeat_at = clock_timestamp()
WHERE c.namespace = $1 AND c.definition = $2
RETURNING c.lease_token`;

function replaceLease(token: string): [string, string, string, string, string, string, number] {
  return [h.namespace, KEY, "op-replacer", "suspend", "tester", token, 120_000];
}

/** Finds the admin-pool backend that waits on blocker. */
async function waitingAdminPid(blocker: number): Promise<number> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { rows } = await h.knex.raw<{ rows: { pid: number; blocking: number[] }[] }>(
      "SELECT pid, pg_blocking_pids(pid) AS blocking FROM pg_stat_activity WHERE application_name = ? AND wait_event_type = 'Lock'",
      [`h:${h.id}:admin`],
    );
    const found = rows.find((row) => row.blocking.includes(blocker));
    if (found !== undefined) return found.pid;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`관리 백엔드가 PID ${blocker} 때문에 기다리는 것이 관찰되지 않았습니다.`);
}

async function leaseToken(): Promise<string | null> {
  const { rows } = await h.knex.raw<{ rows: { lease_token: string | null }[] }>(
    sql`SELECT lease_token::text AS lease_token FROM ${s("admin_controls")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, KEY],
  );
  return rows[0]?.lease_token ?? null;
}

type BuildState = {
  phase: string;
  scan_boundary: string | null;
  scan_cursor: string | null;
  scan_pages: string;
  expected_read_generation: string;
};
async function buildState(buildId: string): Promise<BuildState> {
  const { rows } = await h.knex.raw<{ rows: BuildState[] }>(
    sql`SELECT phase, scan_boundary, scan_cursor, scan_pages, expected_read_generation FROM ${s("builds")} WHERE build_id = ?`,
    [buildId],
  );
  return rows[0];
}

async function readHead(): Promise<{ target_id: string | null; generation: string }> {
  const { rows } = await h.knex.raw<{ rows: { target_id: string | null; generation: string }[] }>(
    sql`SELECT target_id::text AS target_id, generation FROM ${s("read_heads")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, KEY],
  );
  return rows[0];
}

async function count(table: string): Promise<number> {
  const { rows } = await h.knex.raw<{ rows: { n: string }[] }>(
    sql`SELECT count(*) AS n FROM ${s(table)}`,
  );
  return Number(rows[0].n);
}

async function backfill(buildId: string): Promise<void> {
  for (let step = 0; step < 50; step += 1) {
    if ((await admin.runBackfillPage(buildId, { limit: 4 })).done) return;
  }
  throw new Error("backfill이 끝나지 않았습니다.");
}

/** Cuts over the first build and scans a second-version rebuild to catching_up. */
async function rebuildReady(): Promise<{
  firstTarget: string;
  buildId: string;
  newTarget: string;
}> {
  const first = await admin.beginRebuild({ logicalKey: KEY, fingerprint: V1.fingerprint }, audit());
  await backfill(first.buildId);
  await admin.cutover(first.buildId, audit());
  const second = await admin.beginRebuild(
    { logicalKey: KEY, fingerprint: V2.fingerprint },
    audit(),
  );
  await backfill(second.buildId);
  return {
    firstTarget: first.target.targetId,
    buildId: second.buildId,
    newTarget: second.target.targetId,
  };
}

/** The replacement commits first; the fenced transaction waiting at the barrier must then fail its lease check. */
async function replacedWhileWaitingAtBarrier<T>(run: () => Promise<T>): Promise<string> {
  const { sessions } = await h.openSessions(["holder", "replacer"]);
  await sessions.holder.run("BEGIN");
  await sessions.holder.run(exclusiveBarrier(), [h.namespace, KEY]);
  const pending = run();
  pending.catch(() => {});
  const waiting = await waitingAdminPid(sessions.holder.pid);
  const replacement = randomUUID();
  const replaced = await sessions.replacer.run(preemptLease(), replaceLease(replacement));
  expect(replaced.rowCount).toBe(1);
  await waitForLockWait(h.knex, waiting, sessions.holder.pid);
  await sessions.holder.run("ROLLBACK");
  const error = await pending.then(
    () => undefined,
    (thrown: SearchError) => thrown,
  );
  expect(error).toBeInstanceOf(SearchAdminLeaseLost);
  if (!(error instanceof SearchAdminLeaseLost)) throw new Error("unreachable");
  expect(error.retryable).toBe(true);
  expect(error.details?.reason).toBe("lease-replaced-or-expired");
  expect(await leaseToken()).toBe(replacement);
  return replacement;
}

describe("교체된 토큰의 fenced 트랜잭션은 아무것도 쓰지 않는다", () => {
  it("임대가 교체된 뒤에는 첫 backfill 호출이 스캔 경계를 쓰지 못한다", async () => {
    const build = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    await replacedWhileWaitingAtBarrier(() => admin.runBackfillPage(build.buildId, { limit: 4 }));
    expect(await buildState(build.buildId)).toMatchObject({
      phase: "created",
      scan_boundary: null,
      scan_cursor: null,
    });
  });

  it("임대가 교체된 뒤에는 backfill 페이지가 원장, intent, 커서를 쓰지 못한다", async () => {
    const build = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    // The first call records only the scan boundary.
    expect((await admin.runBackfillPage(build.buildId, { limit: 4 })).phase).toBe("backfilling");
    await replacedWhileWaitingAtBarrier(() => admin.runBackfillPage(build.buildId, { limit: 4 }));
    expect(await count("documents")).toBe(0);
    expect(await count("deliveries")).toBe(0);
    expect(await buildState(build.buildId)).toMatchObject({
      phase: "backfilling",
      scan_cursor: null,
      scan_pages: "0",
    });
  });

  it("임대가 교체된 뒤에는 cutover가 읽기 포인터와 빌드를 바꾸지 못한다", async () => {
    const build = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    await backfill(build.buildId);
    const before = await readHead();
    await replacedWhileWaitingAtBarrier(() => admin.cutover(build.buildId, audit()));
    expect(await readHead()).toEqual(before);
    expect(before).toEqual({ target_id: null, generation: "0" });
    expect((await buildState(build.buildId)).phase).toBe("catching_up");
  });

  it("임대가 교체된 뒤에는 rollback이 읽기 포인터와 빌드를 바꾸지 못한다", async () => {
    const ready = await rebuildReady();
    await admin.cutover(ready.buildId, audit());
    const before = await readHead();
    expect(before.target_id).toBe(ready.newTarget);
    await replacedWhileWaitingAtBarrier(() => admin.rollback(ready.buildId, audit()));
    expect(await readHead()).toEqual(before);
    expect((await buildState(ready.buildId)).phase).toBe("serving");
  });
});

describe("진행 중인 fenced 트랜잭션과 임대 교체", () => {
  it("진행 중인 fenced 트랜잭션이 끝나야 임대가 교체된다", async () => {
    // Lock the build row, start the boundary write, try to replace the lease, then release the build row.
    const build = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    const { sessions } = await h.openSessions(["holder", "replacer"]);
    await sessions.holder.run("BEGIN");
    await sessions.holder.run(sql`SELECT 1 FROM ${s("builds")} WHERE build_id = $1 FOR UPDATE`, [
      build.buildId,
    ]);
    const pending = admin.runBackfillPage(build.buildId, { limit: 4 });
    pending.catch(() => {});
    // The admin code is past the barrier and the lease check and waits on the build row.
    const fenced = await waitingAdminPid(sessions.holder.pid);
    const replacement = randomUUID();
    const replacing = await sessions.replacer.block(preemptLease(), replaceLease(replacement));
    const { rows } = await h.knex.raw<{ rows: { blocking: number[] }[] }>(
      "SELECT pg_blocking_pids(?) AS blocking",
      [sessions.replacer.pid],
    );
    expect(rows[0].blocking).toContain(fenced);
    await replacing.expectStillBlocked();
    await sessions.holder.run("COMMIT");
    // The boundary was committed under the current token; the replacement happened only afterwards.
    await expect(pending).resolves.toMatchObject({ phase: "backfilling", done: false });
    expect((await replacing.expectSuccess()).rowCount).toBe(1);
    expect(await buildState(build.buildId)).toMatchObject({
      phase: "backfilling",
      scan_boundary: "doc-6",
    });
    expect(await leaseToken()).toBe(replacement);
  });

  it("진행 중인 cutover 트랜잭션이 끝나야 임대가 교체된다", async () => {
    const build = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    await backfill(build.buildId);
    const { sessions } = await h.openSessions(["holder", "replacer"]);
    await sessions.holder.run("BEGIN");
    await sessions.holder.run(
      sql`SELECT 1 FROM ${s("read_heads")} WHERE namespace = $1 AND definition = $2 FOR UPDATE`,
      [h.namespace, KEY],
    );
    const pending = admin.cutover(build.buildId, audit());
    pending.catch(() => {});
    // The admin code is past the lease check and waits on the read head.
    const fenced = await waitingAdminPid(sessions.holder.pid);
    const replacing = await sessions.replacer.block(preemptLease(), replaceLease(randomUUID()));
    const { rows } = await h.knex.raw<{ rows: { blocking: number[] }[] }>(
      "SELECT pg_blocking_pids(?) AS blocking",
      [sessions.replacer.pid],
    );
    expect(rows[0].blocking).toContain(fenced);
    await sessions.holder.run("COMMIT");
    const result = await pending;
    expect(result).toMatchObject({ readTargetId: build.target.targetId, readGeneration: 1 });
    expect((await replacing.expectSuccess()).rowCount).toBe(1);
    expect(await readHead()).toEqual({ target_id: build.target.targetId, generation: "1" });
  });
});

describe("교체된 토큰으로는 은퇴의 fenced 기록이 아무것도 바꾸지 못한다", () => {
  /** Admin handle for retirement: records requests, runs hooks, and keeps the in-flight bound short. */
  function retireAdmin(hooks: Parameters<typeof requestRecorder>[1]) {
    const recorder = requestRecorder(h.opensearch, hooks);
    const client = createSearchClient({
      createClient: () => recorder.client,
      ownsClient: false,
      requestTimeoutMs: 30_000,
    });
    const handle = createSearchAdmin({
      client,
      synchronization: createPostgresSynchronization({
        getPrimaryDatabase: () => adminKnex,
        schema: h.searchSchema,
        namespace: h.namespace,
      }),
      definitions: [V1, V2],
      lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
      timeouts: TIMEOUTS,
      cutover: { maxPendingDocuments: 1_000_000, sampleSize: 0 },
      workerBounds: { leaseDurationMs: 200, requestTimeoutMs: 200 },
    });
    return { admin: handle, requests: recorder.requests, close: () => client.close() };
  }

  /**
   * Serves the first target, switches to the second version and leaves intents on the first target. The read grace
   * period is cut to 600ms before serving.
   */
  async function retirable(): Promise<{
    targetId: string;
    physicalIndex: string;
    writeAlias: string;
  }> {
    const first = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    await h.knex.raw(
      sql`UPDATE ${s("read_heads")} SET max_search_lifetime_ms = 200, max_cursor_lifetime_ms = 300,
  retirement_safety_margin_ms = 100 WHERE namespace = ? AND definition = ?`,
      [h.namespace, KEY],
    );
    await backfill(first.buildId);
    await admin.cutover(first.buildId, audit());
    const second = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V2.fingerprint },
      audit(),
    );
    await backfill(second.buildId);
    await admin.cutover(second.buildId, audit());
    await h.knex.raw(
      sql`INSERT INTO ${s("deliveries")} (target_id, document_id, desired_revision) VALUES (?, 'a', 1), (?, 'b', 1)`,
      [first.target.targetId, first.target.targetId],
    );
    const deadline = Date.now() + 15_000;
    for (;;) {
      const { rows } = await h.knex.raw<{ rows: { elapsed: boolean }[] }>(
        sql`SELECT clock_timestamp() >= deselect_confirmed_at + interval '600 milliseconds' AS elapsed
FROM ${s("targets")} WHERE target_id = ?`,
        [first.target.targetId],
      );
      if (rows[0]?.elapsed) break;
      if (Date.now() > deadline) throw new Error("읽기 유예가 지나지 않았습니다.");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return first.target;
  }

  type RetireRow = {
    state: string;
    alias_removed: boolean;
    index_deleted: boolean;
    intents: number;
  };
  async function retireRow(targetId: string): Promise<RetireRow> {
    const { rows } = await h.knex.raw<{ rows: RetireRow[] }>(
      sql`SELECT state, alias_removed_at IS NOT NULL AS alias_removed, index_deleted_at IS NOT NULL AS index_deleted,
       (SELECT count(*)::int FROM ${s("deliveries")} d WHERE d.target_id = t.target_id) AS intents
FROM ${s("targets")} t WHERE target_id = ?`,
      [targetId],
    );
    return rows[0];
  }

  async function indexPresent(name: string): Promise<boolean> {
    return z.boolean().parse((await h.opensearch.indices.exists({ index: name })).body);
  }

  /** Replaces the lease while retirement's next fenced transaction waits at the barrier after a remote command. */
  async function replaceDuringFence(
    pending: Promise<unknown>,
    holder: Awaited<ReturnType<typeof h.openSessions<"holder" | "replacer">>>["sessions"],
    beforeWait: () => void,
  ): Promise<string> {
    await holder.holder.run(exclusiveBarrier(), [h.namespace, KEY]);
    beforeWait();
    const waiting = await waitingAdminPid(holder.holder.pid);
    const replacement = randomUUID();
    expect((await holder.replacer.run(preemptLease(), replaceLease(replacement))).rowCount).toBe(1);
    await waitForLockWait(h.knex, waiting, holder.holder.pid);
    await holder.holder.run("ROLLBACK");
    const error = await pending.then(
      () => undefined,
      (thrown: SearchError) => thrown,
    );
    expect(error).toBeInstanceOf(SearchAdminLeaseLost);
    expect(error?.details?.reason).toBe("lease-replaced-or-expired");
    expect(await leaseToken()).toBe(replacement);
    return replacement;
  }

  it("alias를 뗀 뒤 임대가 교체되면 기록하지 않고 인덱스 삭제도 보내지 않는다", async () => {
    const target = await retirable();
    const removing = gate();
    const handle = retireAdmin({
      before: async (request) => {
        if (request.method === "DELETE" && request.path.includes("/_alias/")) await removing.wait();
      },
    });
    try {
      const intents = (await retireRow(target.targetId)).intents;
      expect(intents).toBeGreaterThan(0);
      const pending = handle.admin.retireTarget(target.targetId, audit());
      pending.catch(() => {});
      await removing.reached;
      expect((await retireRow(target.targetId)).state).toBe("retiring");
      const { sessions } = await h.openSessions(["holder", "replacer"]);
      await sessions.holder.run("BEGIN");
      await replaceDuringFence(pending, sessions, () => removing.open());
      expect(await retireRow(target.targetId)).toEqual({
        state: "retiring",
        alias_removed: false,
        index_deleted: false,
        intents,
      });
      // No remote command after the replacement: the last request is the alias removal.
      expect(handle.requests.at(-1)).toEqual({
        method: "DELETE",
        path: `/${target.physicalIndex}/_alias/${target.writeAlias}`,
      });
      expect(await indexPresent(target.physicalIndex)).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it("인덱스를 지운 뒤 임대가 교체되면 기록하지 않고 잔여 intent도 지우지 않는다", async () => {
    const target = await retirable();
    const deleting = gate();
    const handle = retireAdmin({
      before: async (request) => {
        if (request.method === "DELETE" && request.path === `/${target.physicalIndex}`) {
          await deleting.wait();
        }
      },
    });
    try {
      const intents = (await retireRow(target.targetId)).intents;
      expect(intents).toBeGreaterThan(0);
      const pending = handle.admin.retireTarget(target.targetId, audit());
      pending.catch(() => {});
      await deleting.reached;
      const { sessions } = await h.openSessions(["holder", "replacer"]);
      await sessions.holder.run("BEGIN");
      await replaceDuringFence(pending, sessions, () => deleting.open());
      expect(await retireRow(target.targetId)).toEqual({
        state: "retiring",
        alias_removed: true,
        index_deleted: false,
        intents,
      });
      expect(handle.requests.at(-1)).toEqual({
        method: "DELETE",
        path: `/${target.physicalIndex}`,
      });
    } finally {
      await handle.close();
    }
  });

  it("잔여 정리 중 임대가 교체되면 intent를 지우지 않고 retired로 넘어가지 않는다", async () => {
    const target = await retirable();
    const handle = retireAdmin({});
    try {
      const { sessions } = await h.openSessions(["holder", "replacer"]);
      // First call: one locked intent stops it at the final residue check after all remote steps.
      await sessions.holder.run("BEGIN");
      await sessions.holder.run(
        sql`SELECT 1 FROM ${s("deliveries")} WHERE target_id = $1 AND document_id = 'a' FOR UPDATE`,
        [target.targetId],
      );
      const first = await handle.admin.retireTarget(target.targetId, audit()).then(
        () => undefined,
        (thrown: SearchError) => thrown,
      );
      expect(first?.details?.reason).toBe("retirement-residue");
      expect(await retireRow(target.targetId)).toEqual({
        state: "retiring",
        alias_removed: true,
        index_deleted: true,
        intents: 1,
      });
      // The second call waits at the barrier of the residue cleanup while the lease is replaced.
      const sent = handle.requests.length;
      const pending = handle.admin.retireTarget(target.targetId, audit());
      pending.catch(() => {});
      await replaceDuringFence(pending, sessions, () => {});
      expect(await retireRow(target.targetId)).toEqual({
        state: "retiring",
        alias_removed: true,
        index_deleted: true,
        intents: 1,
      });
      expect(handle.requests.slice(sent)).toEqual([]);
    } finally {
      await handle.close();
    }
  });
});

describe("교체된 토큰으로는 격리 해제와 remark가 아무것도 바꾸지 못한다", () => {
  type QuarantineRow = {
    quarantined_revision: number | null;
    attempts: number;
    failure_revision: number;
    last_error: unknown;
  };
  async function quarantineRow(targetId: string): Promise<QuarantineRow> {
    const { rows } = await h.knex.raw<{ rows: QuarantineRow[] }>(
      sql`SELECT quarantined_revision::int, attempts, failure_revision::int, last_error FROM ${s("delivery_runtime")} WHERE target_id = ? AND document_id = 'q'`,
      [targetId],
    );
    return rows[0];
  }

  it("격리 해제: 장벽을 기다리는 동안 임대가 교체되면 격리를 풀지 않는다", async () => {
    const build = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    const targetId = build.target.targetId;
    // One quarantined document, shaped like the worker leaves it.
    const intent = await h.knex.raw<{ rows: { intent_id: string }[] }>(
      sql`INSERT INTO ${s("deliveries")} (target_id, document_id, desired_revision) VALUES (?, 'q', 1) RETURNING intent_id::text`,
      [targetId],
    );
    await h.knex.raw(
      sql`INSERT INTO ${s("delivery_runtime")} (target_id, document_id, intent_id, claimed_revision, failure_revision, attempts, quarantined_revision, last_error)
VALUES (?, 'q', ?, 1, 1, 3, 1, '{"class":"poison"}'::jsonb)`,
      [targetId, intent.rows[0].intent_id],
    );
    const before = await quarantineRow(targetId);
    expect(before).toMatchObject({ quarantined_revision: 1, attempts: 3 });
    await replacedWhileWaitingAtBarrier(() =>
      admin.retryQuarantined({ targetId, limit: 10 }, audit()),
    );
    expect(await quarantineRow(targetId)).toEqual(before);
  });

  it("remark: 장벽을 기다리는 동안 임대가 교체되면 원장과 intent를 쓰지 않는다", async () => {
    await admin.beginRebuild({ logicalKey: KEY, fingerprint: V1.fingerprint }, audit());
    await replacedWhileWaitingAtBarrier(() =>
      admin.remark({ logicalKey: KEY, ids: ["doc-1", "doc-2"] }, audit()),
    );
    expect(await count("documents")).toBe(0);
    expect(await count("deliveries")).toBe(0);
  });
});
