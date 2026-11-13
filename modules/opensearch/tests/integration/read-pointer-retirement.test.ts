import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  SearchCursorExpired,
  SearchRebuildRequired,
} from "../../src/errors";
import { createPostgresCatalogReader } from "../../src/postgres";
import { encodeCursor } from "../../src/query/cursor";
import { type SearchCandidates } from "../../src/query/search-queries";
import { createTestDefinition } from "../../src/testing";
import { useIntegrationHarness } from "../helpers/harness";
import {
  type AdminLifetimes,
  audit,
  LONG_LIFETIMES,
  peekCursor,
  rejectionOf,
  SIGNING_KEY,
  useReadPathFixture,
} from "../helpers/read-path-fixture";
import { gate } from "../helpers/request-recorder";
import { qualified, sql } from "../helpers/sql";

/**
 * Searches go through the query role's catalog reader with a real worker and admin handle. V2 prefixes bodies with
 * "v2 ", so a result body tells which index was read. Grace boundaries shrink the admin lifetimes (a supported setting)
 * and wait in real time, always until the database clock reaches a known instant.
 */

const h = useIntegrationHarness({ sampleDomain: true });
const rp = useReadPathFixture(h);
const KEY = "messages";

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
const BOTH = [V1, V2] as const;

/** Lifetimes for tests that really wait out the grace: 8 s + 5 s + 2 s. */
const SHORT: AdminLifetimes = {
  maxSearchLifetimeMs: 5_000,
  maxCursorLifetimeMs: 8_000,
  maxPitKeepAliveMs: 8_000,
  retirementSafetyMarginMs: 2_000,
};
const GRACE_MS =
  SHORT.maxCursorLifetimeMs + SHORT.maxSearchLifetimeMs + SHORT.retirementSafetyMarginMs;

function queryLimits(lifetimes: AdminLifetimes) {
  return {
    maxPageSize: 100,
    timeoutMs: lifetimes.maxSearchLifetimeMs,
    maxSearchLifetimeMs: lifetimes.maxSearchLifetimeMs,
    maxCursorLifetimeMs: lifetimes.maxCursorLifetimeMs,
    maxPitKeepAliveMs: lifetimes.maxPitKeepAliveMs,
  };
}

function handle(lifetimes: AdminLifetimes = LONG_LIFETIMES) {
  return rp.queries<Doc>({
    logicalKey: KEY,
    supportedFingerprints: [V1.fingerprint, V2.fingerprint],
    limits: queryLimits(lifetimes),
    cursor: { signingKeys: [SIGNING_KEY] },
    policy: { sourceIncludes: ["body", "seq"] },
  });
}

const ALL = { body: { query: { match_all: {} }, _source: true, size: 10 } } as const;
const PAGE = {
  query: { match_all: {} },
  _source: true,
  size: 2,
  sort: [{ "doc.seq": "asc" as const }],
};

function bodies(page: SearchCandidates<Doc>): string[] {
  return page.hits.map((hit) => hit.source?.body ?? "");
}

async function seed(): Promise<void> {
  source.clear();
  for (let i = 1; i <= 5; i += 1) source.set(`doc-${i}`, { body: `본문 ${i}`, seq: i });
  await rp.reset();
}

/** Prepares the V2 rebuild up to cutover: build, backfill, drain, refresh. */
async function prepareRebuild(admin: ReturnType<typeof rp.admin>) {
  const build = await admin.beginRebuild({ logicalKey: KEY, fingerprint: V2.fingerprint }, audit());
  await rp.backfill(admin, build.buildId);
  await rp.drain(rp.indexer(BOTH));
  await rp.refresh();
  return build;
}

describe("새 검색은 언제나 카탈로그의 현재 읽기 대상을 읽는다", () => {
  it("카탈로그 조회는 주변 트랜잭션의 스냅샷을 쓰지 않는다", async () => {
    await seed();
    const admin = rp.admin(BOTH);
    const first = await rp.serve(admin, BOTH, V1);
    const q = handle();
    expect((await q.queries.search(ALL)).target.targetId).toBe(first.target.targetId);

    // The caller's repeatable read snapshot keeps seeing the pre-cutover head.
    const trx = await rp.queryKnex.transaction({ isolationLevel: "repeatable read" });
    try {
      const headSql = sql`SELECT target_id::text AS target_id FROM ${qualified(h.searchSchema, "read_heads")} WHERE namespace = ? AND definition = ?`;
      const before = await trx.raw<{ rows: { target_id: string }[] }>(headSql, [h.namespace, KEY]);
      expect(before.rows[0]?.target_id).toBe(first.target.targetId);
      const build = await prepareRebuild(admin);
      await admin.cutover(build.buildId, audit());

      const stale = await trx.raw<{ rows: { target_id: string }[] }>(headSql, [h.namespace, KEY]);
      expect(stale.rows[0]?.target_id).toBe(first.target.targetId);
      // Searching while that transaction is open still reads the current head on a separate connection.
      const page = await q.queries.search(ALL);
      expect(page.target.targetId).toBe(build.target.targetId);
      expect(bodies(page).every((body) => body.startsWith("v2 "))).toBe(true);

      // A catalog resolver that returns a transaction is refused without sending anything on it.
      const sent: string[] = [];
      const record = (query: { sql: string }) => sent.push(query.sql);
      trx.on("query", record);
      const inTransaction = handle();
      const viaTransaction = rp.queries<Doc>({
        logicalKey: KEY,
        supportedFingerprints: [V1.fingerprint, V2.fingerprint],
        limits: queryLimits(LONG_LIFETIMES),
        catalog: createPostgresCatalogReader({
          getPrimaryDatabase: () => trx,
          schema: h.searchSchema,
          namespace: h.namespace,
        }),
      });
      const error = await rejectionOf(viaTransaction.queries.search(ALL));
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details?.reason).toBe("resolver-returned-transaction");
      expect(sent).toEqual([]);
      expect(viaTransaction.requests).toEqual([]);
      expect(inTransaction.requests).toEqual([]);
    } finally {
      await trx.rollback();
    }
  });

  it("cutover, rollback, 다시 cutover마다 각 검색은 시작할 때의 읽기 대상에서 끝난다", async () => {
    await seed();
    const admin = rp.admin(BOTH);
    const first = await rp.serve(admin, BOTH, V1);
    const build = await prepareRebuild(admin);
    const q = handle();
    const oldTarget = first.target.targetId;
    const newTarget = build.target.targetId;

    /** Runs an admin step while a search is held after its catalog read and before its engine request. */
    async function searchAcross(change: () => Promise<object>): Promise<SearchCandidates<Doc>> {
      const held = gate();
      q.holdNextSearch(held);
      const pending = q.queries.search(ALL);
      await held.reached;
      await change();
      held.open();
      return pending;
    }

    const duringCutover = await searchAcross(() => admin.cutover(build.buildId, audit()));
    expect(duringCutover.target).toMatchObject({ targetId: oldTarget, readGeneration: 1 });
    expect(bodies(duringCutover).every((body) => !body.startsWith("v2 "))).toBe(true);
    const afterCutover = await q.queries.search(ALL);
    expect(afterCutover.target).toMatchObject({ targetId: newTarget, readGeneration: 2 });
    expect(bodies(afterCutover).every((body) => body.startsWith("v2 "))).toBe(true);

    const duringRollback = await searchAcross(() => admin.rollback(build.buildId, audit()));
    expect(duringRollback.target).toMatchObject({ targetId: newTarget, readGeneration: 2 });
    const afterRollback = await q.queries.search(ALL);
    expect(afterRollback.target).toMatchObject({ targetId: oldTarget, readGeneration: 3 });
    expect(bodies(afterRollback).every((body) => !body.startsWith("v2 "))).toBe(true);

    const duringRecutover = await searchAcross(() => admin.cutover(build.buildId, audit()));
    expect(duringRecutover.target).toMatchObject({ targetId: oldTarget, readGeneration: 3 });
    const afterRecutover = await q.queries.search(ALL);
    expect(afterRecutover.target).toMatchObject({ targetId: newTarget, readGeneration: 4 });
    expect(afterRecutover.hits).toHaveLength(5);
  });
});

describe("커서와 PIT의 수명", () => {
  it("커서는 원래 대상에 고정되고 원래 만료 시각을 넘겨 연장되지 않으며, 만료 뒤에는 SearchCursorExpired이다", async () => {
    await seed();
    const admin = rp.admin(BOTH, SHORT);
    const first = await rp.serve(admin, BOTH, V1);
    const build = await prepareRebuild(admin);
    const q = handle(SHORT);

    const plain = await q.queries.search({ body: PAGE, paginate: {} });
    const withPit = await q.queries.search({ body: PAGE, paginate: { pit: true } });
    const cursor = plain.nextCursor ?? "";
    const pitCursor = withPit.nextCursor ?? "";
    expect(peekCursor(cursor)).toMatchObject({ tid: first.target.targetId });
    expect(peekCursor(pitCursor).pit).toBeDefined();
    const exp = peekCursor(cursor).exp;
    expect(exp - peekCursor(cursor).iat).toBe(SHORT.maxCursorLifetimeMs);

    await admin.cutover(build.buildId, audit());
    expect((await q.queries.search(ALL)).target.targetId).toBe(build.target.targetId);

    // After cutover, continuations stay on the original target and the next cursor keeps the original expiry.
    for (const original of [cursor, pitCursor]) {
      const next = await q.queries.search({ body: PAGE, cursor: original });
      expect(next.target.targetId).toBe(first.target.targetId);
      expect(next.hits.map((hit) => hit.source?.seq)).toEqual([3, 4]);
      expect(bodies(next).every((body) => !body.startsWith("v2 "))).toBe(true);
      expect(peekCursor(next.nextCursor ?? "").exp).toBe(peekCursor(original).exp);
    }

    await rp.waitForDatabaseTime(Math.max(exp, peekCursor(pitCursor).exp));
    const requestsBefore = q.requests.length;
    for (const original of [cursor, pitCursor]) {
      const error = await rejectionOf(q.queries.search({ body: PAGE, cursor: original }));
      expect(error).toBeInstanceOf(SearchCursorExpired);
      expect(error.details?.reason).toBe("expired");
    }
    // An expired cursor neither moves to another target nor sends anything to the engine.
    expect(q.requests.slice(requestsBefore)).toEqual([]);
  });
});

describe("은퇴 유예", () => {
  it("유예 시간이 지나기 전에는 은퇴가 거부되고, 커서가 읽을 수 있는 동안 인덱스는 남으며, 지난 뒤에는 은퇴하고 옛 대상에 닿을 수 없다", async () => {
    await seed();
    const admin = rp.admin(BOTH, SHORT);
    const first = await rp.serve(admin, BOTH, V1);
    const oldTarget = first.target;
    const build = await prepareRebuild(admin);
    const q = handle(SHORT);

    // The latest possible cursor: a search that read the catalog just before the cutover commit and finishes after it.
    const held = gate();
    q.holdNextSearch(held);
    const pending = q.queries.search({ body: PAGE, paginate: {} });
    await held.reached;
    await admin.cutover(build.buildId, audit());
    held.open();
    const late = await pending;
    expect(late.target.targetId).toBe(oldTarget.targetId);
    const cursor = late.nextCursor ?? "";
    const payload = peekCursor(cursor);
    const confirmedAt = await rp.deselectConfirmedAt(oldTarget.targetId);
    expect(confirmedAt).not.toBeNull();
    // Its issue time is never later than the confirmed deselection time.
    expect(payload.iat).toBeLessThanOrEqual(confirmedAt ?? 0);

    // Before the boundary retirement is refused; the earliest time is after this cursor's last continuation can end.
    const refused = await rejectionOf(admin.retireTarget(oldTarget.targetId, audit()));
    expect(refused).toBeInstanceOf(SearchAdminPreconditionFailed);
    expect(refused.details?.reason).toBe("retirement-grace-pending");
    const earliestAtMs = z.number().parse(refused.details?.earliestAtMs);
    expect(Math.abs(earliestAtMs - ((confirmedAt ?? 0) + GRACE_MS))).toBeLessThanOrEqual(1);
    expect(earliestAtMs).toBeGreaterThanOrEqual(payload.exp + SHORT.maxSearchLifetimeMs);
    expect(await rp.targetState(oldTarget.targetId)).toBe("active");

    const next = await q.queries.search({ body: PAGE, cursor });
    expect(next.target.targetId).toBe(oldTarget.targetId);
    expect(next.hits.map((hit) => hit.source?.seq)).toEqual([3, 4]);

    // Even after the cursor expires, a continuation started just before may still run (search lifetime plus margin),
    // so retirement is still refused.
    await rp.waitForDatabaseTime(payload.exp);
    const expired = await rejectionOf(q.queries.search({ body: PAGE, cursor }));
    expect(expired).toBeInstanceOf(SearchCursorExpired);
    expect(expired.details?.reason).toBe("expired");
    const stillRefused = await rejectionOf(admin.retireTarget(oldTarget.targetId, audit()));
    expect(stillRefused.details?.reason).toBe("retirement-grace-pending");
    expect((await h.opensearch.indices.exists({ index: oldTarget.physicalIndex })).body).toBe(true);

    await rp.waitForDatabaseTime(earliestAtMs);
    await admin.retireTarget(oldTarget.targetId, audit());
    expect(await rp.targetState(oldTarget.targetId)).toBe("retired");
    expect((await h.opensearch.indices.exists({ index: oldTarget.physicalIndex })).body).toBe(
      false,
    );

    // The public API cannot reach the retired target: new searches use the current one, the old cursor is refused,
    // and a forged cursor fails its signature.
    const requestsBefore = q.requests.length;
    expect((await q.queries.search(ALL)).target.targetId).toBe(build.target.targetId);
    const retired = await rejectionOf(q.queries.search({ body: PAGE, cursor }));
    expect(retired).toBeInstanceOf(SearchCursorExpired);
    expect(retired.details).toMatchObject({ reason: "target-not-readable", state: "retired" });
    const forged = encodeCursor(
      {
        ...payload,
        v: 1,
        fp: V1.fingerprint,
        qh: "0".repeat(64),
        sa: [2],
        n: 2,
        g: 1,
        exp: payload.exp + 3_600_000,
      },
      { id: SIGNING_KEY.id, secret: new Uint8Array(32).fill(9) },
    );
    const forgedError = await rejectionOf(q.queries.search({ body: PAGE, cursor: forged }));
    expect(forgedError).toBeInstanceOf(SearchCursorExpired);
    expect(forgedError.details?.reason).toBe("bad-signature");
    expect(
      q.requests
        .slice(requestsBefore)
        .filter((request) => request.path.includes(oldTarget.physicalIndex)),
    ).toEqual([]);
  });

  it("중단 뒤 검색은 SearchRebuildRequired이고, 옛 epoch의 커서는 재개 빌드가 cutover된 뒤에도 무효다", async () => {
    await seed();
    const admin = rp.admin([V1]);
    const first = await rp.serve(admin, [V1], V1);
    const q = handle();
    const cursor =
      (await q.queries.search({ body: PAGE, paginate: { pit: true } })).nextCursor ?? "";
    expect(peekCursor(cursor).tid).toBe(first.target.targetId);

    await admin.suspendCapture(KEY, audit());
    const requestsBefore = q.requests.length;
    const blocked = await rejectionOf(q.queries.search(ALL));
    expect(blocked).toBeInstanceOf(SearchRebuildRequired);
    expect(blocked.details?.reason).toBe("rebuild-required");
    const blockedCursor = await rejectionOf(q.queries.search({ body: PAGE, cursor }));
    expect(blockedCursor).toBeInstanceOf(SearchRebuildRequired);
    expect(q.requests.slice(requestsBefore)).toEqual([]);

    const resumed = await admin.resumeCaptureForRebuild(KEY, audit());
    await rp.backfill(admin, resumed.buildId);
    await rp.drain(rp.indexer([V1]));
    await rp.refresh();
    await admin.cutover(resumed.buildId, audit());

    const page = await q.queries.search(ALL);
    expect(page.target.targetId).toBe(resumed.target.targetId);
    expect(page.target.targetId).not.toBe(first.target.targetId);
    expect(page.hits).toHaveLength(5);
    const invalidated = await rejectionOf(q.queries.search({ body: PAGE, cursor }));
    expect(invalidated).toBeInstanceOf(SearchCursorExpired);
    expect(invalidated.details?.reason).toBe("capture-epoch-invalidated");
  });
});
