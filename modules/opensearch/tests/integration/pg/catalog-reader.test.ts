import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { Client as PgClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { applySearchGrants } from "../../../src/admin";
import {
  SearchCatalogUnavailable,
  SearchConfigurationError,
  SearchCursorExpired,
  SearchError,
  SearchRebuildRequired,
} from "../../../src/errors";
import { createSearchClient, createSearchQueries } from "../../../src/index";
import { createPostgresCatalogReader } from "../../../src/postgres";
import { type SearchCatalogReader } from "../../../src/query/catalog";
import { createFakeOpenSearch, TEST_READ_LIFETIMES } from "../../../src/testing";
import { type TestRole, useIntegrationHarness } from "../../helpers/harness";
import { identifier, qualified, sql } from "../../helpers/sql";
import {
  clientRunner,
  closeOpenBuildsForTest,
  createTarget,
  type PreparedTarget,
  resetSearchSchema,
  type StatementRunner,
} from "../../helpers/test-targets";
import { messages, seedIndex, SIGNING_KEY, sortedBody } from "../../unit/query-fixtures";

/**
 * The catalog reader runs only as the query role. Moving the read head, suspending and resuming are test doubles that
 * write the same rows as the admin code, through an admin-role fixture connection. The end-to-end check plugs the real
 * reader into createSearchQueries with a fake engine.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const KEY = "messages";
const FINGERPRINT = "a".repeat(64);
const READ = { timeoutMs: 5_000 };

let adminRole: TestRole;
let queryRole: TestRole;
let fixtureClient: PgClient;
let fixture: StatementRunner;
let queryKnex: Knex;
const knexes: Knex[] = [];

function roleUrl(role: TestRole, name: string): string {
  const url = new URL(role.url);
  url.searchParams.set("application_name", `h:${h.id}:${name}`);
  return url.toString();
}

function queryPool(name: string, max: number): Knex {
  const db = knexFactory({
    client: "pg",
    connection: roleUrl(queryRole, name),
    pool: { min: 0, max },
  });
  knexes.push(db);
  return db;
}

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  queryRole = await h.createRole("query");
  queryKnex = queryPool("query", 4);
  fixtureClient = new PgClient({ connectionString: roleUrl(adminRole, "fixture") });
  fixtureClient.on("error", () => {});
  await fixtureClient.connect();
  fixture = clientRunner(fixtureClient);
});

afterAll(async () => {
  await fixtureClient?.end().catch(() => {});
  await Promise.allSettled(knexes.map((db) => db.destroy()));
});

const spec = () => ({ schema: h.searchSchema, namespace: h.namespace, logicalKey: KEY });
const table = (name: string) => qualified(h.searchSchema, name);

async function grantRoles(): Promise<void> {
  await applySearchGrants(h.knex, {
    schema: h.searchSchema,
    roles: { admin: [adminRole.name], query: [queryRole.name] },
  });
}

async function setUp(): Promise<PreparedTarget> {
  await resetSearchSchema(h);
  await grantRoles();
  const target = await createTarget(fixture, spec());
  await closeOpenBuildsForTest(fixture, spec());
  return target;
}

function readerFor(db: Knex = queryKnex): SearchCatalogReader {
  return createPostgresCatalogReader({
    getPrimaryDatabase: () => db,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
}

/** Test double: moves the read head like a cutover. */
async function moveHead(targetId: string): Promise<void> {
  await fixture(
    sql`UPDATE ${table("read_heads")} SET target_id = $3, generation = generation + 1, rebuild_required = false, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2`,
    [h.namespace, KEY, targetId],
  );
}

/** Test double: suspends capture like the admin code. */
async function suspendCapture(): Promise<void> {
  await fixture("BEGIN");
  await fixture(
    sql`UPDATE ${table("indexes")} SET capture_mode = 'suspended', capture_epoch = capture_epoch + 1, generation = generation + 1, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2 AND capture_mode = 'active'`,
    [h.namespace, KEY],
  );
  await fixture(
    sql`UPDATE ${table("read_heads")} SET rebuild_required = true, generation = generation + 1, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2`,
    [h.namespace, KEY],
  );
  await fixture(
    sql`UPDATE ${table("targets")} SET write_enabled = false WHERE namespace = $1 AND definition = $2 AND write_enabled`,
    [h.namespace, KEY],
  );
  await fixture("COMMIT");
}

/** Test double: resumes capture and registers a target in the new epoch. */
async function resumeWithNewTarget(): Promise<PreparedTarget> {
  await fixture(
    sql`UPDATE ${table("indexes")} SET capture_mode = 'active', generation = generation + 1, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2 AND capture_mode = 'suspended'`,
    [h.namespace, KEY],
  );
  const target = await createTarget(fixture, spec(), { kind: "rebuild", oldTargetId: null });
  await closeOpenBuildsForTest(fixture, spec());
  return target;
}

async function errorOf<T>(promise: Promise<T>): Promise<SearchError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SearchError) return error;
    throw error;
  }
  throw new Error("SearchError로 거부되어야 했지만 성공했습니다.");
}

/** Waits until no backend of this application waits on a lock, proving the server-side statement was canceled. */
async function expectNoWaitingQuery(name: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const { rows } = await h.knex.raw<{ rows: { pid: number }[] }>(
      "SELECT pid FROM pg_stat_activity WHERE application_name = ? AND state = 'active' AND wait_event_type = 'Lock'",
      [`h:${h.id}:${name}`],
    );
    if (rows.length === 0) return;
    if (Date.now() > deadline) {
      throw new Error(`취소되지 않은 카탈로그 문장이 남았습니다: ${JSON.stringify(rows)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForLockWait(name: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const { rows } = await h.knex.raw<{ rows: { pid: number }[] }>(
      "SELECT pid FROM pg_stat_activity WHERE application_name = ? AND state = 'active' AND wait_event_type = 'Lock'",
      [`h:${h.id}:${name}`],
    );
    if (rows.length > 0) return;
    if (Date.now() > deadline) throw new Error("카탈로그 문장의 잠금 대기가 관찰되지 않았습니다.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("카탈로그 reader", () => {
  it("읽기 헤드 조회와 대상 조회 결과에 대상 식별자, 세대, fingerprint, 현재 epoch, rebuildRequired, 수명 최대치가 들어 있다", async () => {
    const target = await setUp();
    const getPrimaryDatabase = vi.fn(() => queryKnex);
    const reader = createPostgresCatalogReader({
      getPrimaryDatabase,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    const lifetimes = {
      maxSearchLifetimeMs: 30_000,
      maxCursorLifetimeMs: 600_000,
      maxPitKeepAliveMs: 300_000,
    };

    // Before the first cutover the head exists without a target.
    const before = await reader.resolveReadHeads([KEY, "unknown-key"], READ);
    expect([...before.heads.keys()]).toEqual([KEY]);
    expect(before.heads.get(KEY)).toEqual({
      logicalKey: KEY,
      readGeneration: 0,
      rebuildRequired: false,
      target: null,
      lifetimes,
    });

    await moveHead(target.targetId);
    const after = await reader.resolveReadHeads([KEY], READ);
    const expectedTarget = {
      targetId: target.targetId,
      logicalKey: KEY,
      physicalIndex: target.physicalIndex,
      fingerprint: FINGERPRINT,
      hashVersion: "sonamu-c14n-v1",
      state: "active",
      captureEpoch: 1,
      currentCaptureEpoch: 1,
    };
    expect(after.heads.get(KEY)).toEqual({
      logicalKey: KEY,
      readGeneration: 1,
      rebuildRequired: false,
      target: expectedTarget,
      lifetimes,
    });
    // The cursor issue time is the statement start, never after the database time.
    expect(after.cursorIssueMs).toBeLessThanOrEqual(after.databaseNowMs);

    expect(await reader.resolveTarget(target.targetId, READ)).toEqual({
      target: expectedTarget,
      rebuildRequired: false,
      lifetimes,
      databaseNowMs: expect.any(Number),
    });
    expect(await reader.resolveTarget(randomUUID(), READ)).toEqual({
      target: null,
      rebuildRequired: false,
      lifetimes: null,
      databaseNowMs: expect.any(Number),
    });
    const none = await reader.resolveReadHeads(["unknown-key"], READ);
    expect(none.heads.size).toBe(0);
    expect(none.cursorIssueMs).toBeLessThanOrEqual(none.databaseNowMs);
    // Every lookup resolves the primary again; nothing is cached.
    expect(getPrimaryDatabase).toHaveBeenCalledTimes(5);
  });

  it("연속 조회 결과에 현재 epoch과 rebuildRequired가 들어 있고, 중단 이전 대상의 커서는 재개 빌드가 cutover된 뒤에도 거부된다", async () => {
    const first = await setUp();
    await moveHead(first.targetId);
    const reader = readerFor();

    const fake = createFakeOpenSearch();
    await seedIndex(fake, first.physicalIndex, messages(25));
    const client = createSearchClient({
      createClient: () => fake.client,
      ownsClient: false,
      requestTimeoutMs: 5_000,
    });
    const queries = createSearchQueries({
      client,
      catalog: reader,
      logicalKey: KEY,
      supportedFingerprints: [FINGERPRINT],
      limits: { ...TEST_READ_LIFETIMES, maxPageSize: 50, timeoutMs: 5_000 },
      cursor: { signingKeys: [SIGNING_KEY] },
    });
    const page = await queries.search({ body: sortedBody(10), paginate: {} });
    expect(page.target).toEqual({
      targetId: first.targetId,
      fingerprint: FINGERPRINT,
      readGeneration: 1,
    });
    expect(page.hits).toHaveLength(10);
    const cursor = page.nextCursor;
    if (cursor === undefined) throw new Error("커서가 발급되지 않았습니다.");
    const next = await queries.search({ body: sortedBody(10), cursor });
    expect(next.hits.map((hit) => hit.id)).toEqual(messages(10, 11).map((doc) => doc.id));

    // Suspended: continuations get rebuildRequired and new searches are refused.
    await suspendCapture();
    expect(await reader.resolveTarget(first.targetId, READ)).toMatchObject({
      target: { captureEpoch: 1, currentCaptureEpoch: 2, state: "active" },
      rebuildRequired: true,
    });
    const during = await errorOf(queries.search({ body: sortedBody(10), cursor }));
    expect(during).toBeInstanceOf(SearchRebuildRequired);
    expect(during.details?.reason).toBe("rebuild-required");
    expect(await errorOf(queries.search({ body: sortedBody(10) }))).toBeInstanceOf(
      SearchRebuildRequired,
    );

    // After the resume build is cut over, the old target's epoch is behind, so its cursors stay dead.
    const resumed = await resumeWithNewTarget();
    await moveHead(resumed.targetId);
    expect(await reader.resolveTarget(first.targetId, READ)).toMatchObject({
      target: { targetId: first.targetId, captureEpoch: 1, currentCaptureEpoch: 2 },
      rebuildRequired: false,
    });
    const afterResume = await errorOf(queries.search({ body: sortedBody(10), cursor }));
    expect(afterResume).toBeInstanceOf(SearchCursorExpired);
    expect(afterResume.details?.reason).toBe("capture-epoch-invalidated");

    await seedIndex(fake, resumed.physicalIndex, messages(3));
    const fresh = await queries.search({ body: sortedBody(10) });
    expect(fresh.target.targetId).toBe(resumed.targetId);
    expect(fresh.hits).toHaveLength(3);
  });

  it("query 역할은 indexes의 허용된 열만 읽고, 그 열 권한이 없으면 카탈로그 조회가 타입 오류로 실패한다", async () => {
    const target = await setUp();
    await moveHead(target.targetId);
    const reader = readerFor();
    await expect(reader.resolveReadHeads([KEY], READ)).resolves.toBeDefined();

    const denied = await queryKnex.raw(sql`SELECT generation FROM ${table("indexes")}`).then(
      () => "allowed",
      (error: { code?: string }) => error.code,
    );
    expect(denied).toBe("42501");

    // The column grant is required: without it both lookups fail.
    await h.knex.raw(
      sql`REVOKE SELECT (capture_epoch) ON ${table("indexes")} FROM ${identifier(queryRole.name)}`,
    );
    const lookups: Promise<object>[] = [
      reader.resolveReadHeads([KEY], READ),
      reader.resolveTarget(target.targetId, READ),
    ];
    for (const lookup of lookups) {
      const error = await errorOf(lookup);
      expect(error).toBeInstanceOf(SearchCatalogUnavailable);
      expect(error).toMatchObject({
        retryable: false,
        details: { reason: "catalog-statement-failed", sqlstate: "42501" },
      });
    }
    await grantRoles();
    await expect(reader.resolveTarget(target.targetId, READ)).resolves.toMatchObject({
      target: { targetId: target.targetId },
    });
  });

  it("카탈로그 조회는 주변 트랜잭션을 쓰지 않고, 잠금을 기다리지 않으며, 매번 커밋된 최신 포인터를 읽는다", async () => {
    const first = await setUp();
    await moveHead(first.targetId);
    const reader = readerFor();

    // A resolver returning a transaction is refused before anything is sent on it.
    const trx = await queryKnex.transaction();
    const raw = vi.spyOn(trx, "raw");
    const inTransaction = createPostgresCatalogReader({
      getPrimaryDatabase: () => trx,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    const lookups: Promise<object>[] = [
      inTransaction.resolveReadHeads([KEY], READ),
      inTransaction.resolveTarget(first.targetId, READ),
    ];
    for (const lookup of lookups) {
      const error = await errorOf(lookup);
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details?.reason).toBe("resolver-returned-transaction");
    }
    expect(raw).not.toHaveBeenCalled();
    await trx.rollback();

    // The reader sees the newly committed head even while the caller's REPEATABLE READ snapshot sees the old one.
    const caller = await h.knex.transaction({ isolationLevel: "repeatable read" });
    const headOf = async () => {
      const { rows } = await caller.raw<{ rows: { target_id: string }[] }>(
        sql`SELECT target_id FROM ${table("read_heads")} WHERE namespace = ? AND definition = ?`,
        [h.namespace, KEY],
      );
      return rows[0].target_id;
    };
    expect(await headOf()).toBe(first.targetId);
    const second = await createTarget(fixture, spec(), {
      kind: "rebuild",
      oldTargetId: first.targetId,
    });
    await closeOpenBuildsForTest(fixture, spec());
    await moveHead(second.targetId);
    expect(await headOf()).toBe(first.targetId);
    const fresh = await reader.resolveReadHeads([KEY], READ);
    expect(fresh.heads.get(KEY)?.target?.targetId).toBe(second.targetId);
    await caller.rollback();

    // An admin transaction that locks the barrier, the read head and the targets and changes the head uncommitted does
    // not make the reader wait; it reads the committed value.
    const { sessions } = await h.openSessions(["admin"]);
    const admin = sessions.admin;
    await admin.run("BEGIN");
    await admin.run(
      sql`SELECT generation FROM ${table("indexes")} WHERE namespace = $1 AND definition = $2 FOR UPDATE`,
      [h.namespace, KEY],
    );
    await admin.run(
      sql`SELECT target_id FROM ${table("read_heads")} WHERE namespace = $1 AND definition = $2 FOR UPDATE`,
      [h.namespace, KEY],
    );
    await admin.run(
      sql`SELECT state FROM ${table("targets")} WHERE target_id = ANY($1::uuid[]) ORDER BY target_id FOR UPDATE`,
      [[first.targetId, second.targetId]],
    );
    await admin.run(
      sql`UPDATE ${table("read_heads")} SET target_id = $3, generation = generation + 1 WHERE namespace = $1 AND definition = $2`,
      [h.namespace, KEY, first.targetId],
    );
    const unblocked = await reader.resolveReadHeads([KEY], { timeoutMs: 2_000 });
    expect(unblocked.heads.get(KEY)?.target?.targetId).toBe(second.targetId);
    await expect(reader.resolveTarget(first.targetId, { timeoutMs: 2_000 })).resolves.toMatchObject(
      {
        target: { targetId: first.targetId },
      },
    );
    await admin.run("ROLLBACK");
  });

  it("잠금 대기나 풀 대기로 시간이 지나면 SearchCatalogUnavailable로 끝나고, 서버의 문장도 취소된다", async () => {
    const target = await setUp();
    await moveHead(target.targetId);
    const reader = readerFor();
    const { sessions } = await h.openSessions(["locker"]);

    // While another session holds ACCESS EXCLUSIVE on read_heads (a stray DDL, say) the lookup ends at its deadline.
    await sessions.locker.run("BEGIN");
    await sessions.locker.run(sql`LOCK TABLE ${table("read_heads")} IN ACCESS EXCLUSIVE MODE`);
    const lookups: (() => Promise<object>)[] = [
      () => reader.resolveReadHeads([KEY], { timeoutMs: 300 }),
      () => reader.resolveTarget(target.targetId, { timeoutMs: 300 }),
    ];
    for (const lookup of lookups) {
      const startedAt = Date.now();
      const error = await errorOf(lookup());
      expect(error).toBeInstanceOf(SearchCatalogUnavailable);
      expect(error).toMatchObject({
        retryable: true,
        details: { reason: "catalog-timeout", timeoutMs: 300 },
      });
      expect(Date.now() - startedAt).toBeLessThan(3_000);
      await expectNoWaitingQuery("query");
    }

    // An aborted signal ends the call at once; the server statement is cut by the Knex timeout.
    const controller = new AbortController();
    const aborted = reader.resolveReadHeads([KEY], { timeoutMs: 5_000, signal: controller.signal });
    aborted.catch(() => {});
    await waitForLockWait("query");
    controller.abort();
    const abortError = await errorOf(aborted);
    expect(abortError).toBeInstanceOf(SearchCatalogUnavailable);
    expect(abortError.details?.reason).toBe("catalog-aborted");
    await sessions.locker.run("ROLLBACK");
    await expectNoWaitingQuery("query");
    expect(
      await errorOf(
        reader.resolveReadHeads([KEY], { timeoutMs: 1_000, signal: AbortSignal.abort() }),
      ),
    ).toMatchObject({ details: { reason: "catalog-aborted" } });

    // Pool acquisition is bounded by the same deadline.
    const single = queryPool("query-single", 1);
    const holder = await single.transaction();
    const exhausted = readerFor(single);
    const startedAt = Date.now();
    const poolError = await errorOf(exhausted.resolveReadHeads([KEY], { timeoutMs: 300 }));
    expect(poolError).toBeInstanceOf(SearchCatalogUnavailable);
    expect(poolError).toMatchObject({ retryable: true, details: { reason: "catalog-timeout" } });
    expect(Date.now() - startedAt).toBeLessThan(3_000);
    await holder.rollback();

    await expect(reader.resolveReadHeads([KEY], READ)).resolves.toMatchObject({
      heads: expect.any(Map),
    });
    await expect(exhausted.resolveTarget(target.targetId, READ)).resolves.toMatchObject({
      target: { targetId: target.targetId },
    });
  });
});
