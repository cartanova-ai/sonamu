import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { composeIndexMappings } from "../../src/definition/envelope";
import { buildPhysicalIndexName, buildWriteAliasName } from "../../src/definition/names";
import { SearchConfigurationError } from "../../src/errors";
import { useIntegrationHarness } from "../helpers/harness";
import { aliasExists, indexExists, listIndices } from "../helpers/opensearch-ops";
import { type RecordedRequest, requestRecorder } from "../helpers/request-recorder";
import {
  audit,
  errorOf,
  expectRefused,
  GRACE_MS,
  KEY,
  useRetirementFixture,
} from "../helpers/retirement-fixture";
import { qualified, sql } from "../helpers/sql";
import { useWorkerFixture } from "../helpers/worker-fixture";

/**
 * Tests that need the grace period shrink the read_heads maxima before serving so the grace becomes GRACE_MS (600 ms)
 * and check its passage by the database clock. Remote request order comes from the admin handle's request recorder.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const fixture = useRetirementFixture(h, kit);
const s = (name: string) => qualified(h.searchSchema, name);

const path = (request: RecordedRequest) => `${request.method} ${request.path}`;

describe("은퇴 거부 조건", () => {
  it("확정 시각이 없으면 은퇴가 먼저 그 시각을 찍고, 커밋 전 시각(deselected_at)으로는 세지 않는다", async () => {
    const prepared = await fixture.prepare({ shortGrace: true });
    await fixture.replaceFirst(prepared);
    const id = prepared.first.targetId;
    // A process that died between the cutover commit and the confirmation: an hour-old deselection, no confirmation.
    await h.knex.raw(
      sql`UPDATE ${s("targets")} SET deselected_at = clock_timestamp() - interval '1 hour', deselect_confirmed_at = NULL WHERE target_id = ?`,
      [id],
    );
    const { rows } = await h.knex.raw<{ rows: { now_ms: string }[] }>(
      "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms",
    );
    const error = await errorOf(prepared.admin.retireTarget(id, audit()));
    expectRefused(error, "retirement-grace-pending");
    const stamped = await fixture.target(id);
    expect(Number(stamped.deselect_confirmed_at_ms)).toBeGreaterThanOrEqual(Number(rows[0].now_ms));
    expect(error.details?.earliestAtMs).toBe(Number(stamped.deselect_confirmed_at_ms) + GRACE_MS);
    expect(stamped.state).toBe("active");

    await fixture.waitForGrace(id);
    await prepared.admin.retireTarget(id, audit());
    expect((await fixture.target(id)).state).toBe("retired");
  });

  it("서빙 중인 대상과 열린 빌드의 새 대상은 원격 명령 없이 거부된다", async () => {
    const prepared = await fixture.prepare({ shortGrace: true });
    await fixture.serveOpenBuild(prepared.admin);
    const sent = prepared.requests.length;
    expectRefused(
      await errorOf(prepared.admin.retireTarget(prepared.first.targetId, audit())),
      "target-serving",
    );
    const rebuild = await prepared.admin.beginRebuild(
      { logicalKey: KEY, fingerprint: prepared.fingerprint },
      audit(),
    );
    await fixture.backfill(prepared.admin, rebuild.buildId);
    const afterBuild = prepared.requests.length;
    expectRefused(
      await errorOf(prepared.admin.retireTarget(rebuild.target.targetId, audit())),
      "target-in-open-build",
    );
    expect(prepared.requests.slice(afterBuild).map(path)).toEqual([
      `POST /${rebuild.target.physicalIndex}/_mget`,
    ]);
    expect(
      prepared.requests.slice(sent, afterBuild).every((request) => request.method !== "DELETE"),
    ).toBe(true);
    expect((await fixture.target(rebuild.target.targetId)).state).toBe("active");
    expect((await fixture.target(prepared.first.targetId)).state).toBe("active");
  });

  it("임대가 원격 호출을 덮지 못하는 설정이면 은퇴는 아무것도 보내거나 쓰기 전에 거부된다", async () => {
    const prepared = await fixture.prepare({ shortGrace: true });
    await fixture.replaceFirst(prepared);
    await fixture.waitForGrace(prepared.first.targetId);
    const recorder = requestRecorder(kit.nativeClient());
    const short = fixture.adminFor(prepared.setup, recorder.client, { adminLeaseMs: 5_000 });
    const before = await fixture.target(prepared.first.targetId);
    const error = await errorOf(short.retireTarget(prepared.first.targetId, audit()));
    expect(error).toBeInstanceOf(SearchConfigurationError);
    expect(error.details?.reason).toBe("admin-lease-too-short");
    expect(recorder.requests).toEqual([]);
    expect(await fixture.target(prepared.first.targetId)).toEqual(before);
    expect(await fixture.leaseToken()).toBeNull();
  });
});

describe("은퇴 순서와 멱등성", () => {
  it("캡처를 끄고 alias를 뗀 뒤 인덱스를 지우고, 잔여 intent를 정리한 다음 retired가 된다", async () => {
    const prepared = await fixture.prepare({ shortGrace: true });
    const second = await fixture.replaceFirst(prepared);
    const first = prepared.first;
    // Dual writes during the rollback window give both targets intents.
    expect(await fixture.mark(prepared.setup, ["a", "b"])).toBe("recorded");
    expect(await fixture.residue(first.targetId)).toEqual({ intents: 2, runtimes: 0 });
    await fixture.waitForGrace(first.targetId);
    const generation = async () =>
      Number(
        (
          await h.knex.raw<{ rows: { generation: string }[] }>(
            sql`SELECT generation FROM ${s("indexes")} WHERE namespace = ? AND definition = ?`,
            [h.namespace, KEY],
          )
        ).rows[0].generation,
      );
    const generationBefore = await generation();
    const sent = prepared.requests.length;

    await prepared.admin.retireTarget(first.targetId, audit());

    expect(prepared.requests.slice(sent).map(path)).toEqual([
      // Fence check, read only, before any state change.
      `POST /${first.physicalIndex}/_mget`,
      // The index must belong to this target and store before the alias is removed.
      `GET /${first.physicalIndex}/_mapping`,
      `DELETE /${first.physicalIndex}/_alias/${first.writeAlias}`,
      `GET /${first.physicalIndex}/_mapping`,
      // The fence is checked again right before the delete.
      `POST /${first.physicalIndex}/_mget`,
      `DELETE /${first.physicalIndex}`,
    ]);
    expect(await fixture.target(first.targetId)).toMatchObject({
      state: "retired",
      write_enabled: false,
      alias_removed: true,
      index_deleted: true,
      retired: true,
    });
    expect(await fixture.residue(first.targetId)).toEqual({ intents: 0, runtimes: 0 });
    expect(await fixture.residue(second.target.targetId)).toEqual({ intents: 2, runtimes: 0 });
    // The transaction that completes retirement deletes this target's fence row; the new target's stays.
    const fences = await h.knex.raw<{ rows: { target_id: string }[] }>(
      sql`SELECT target_id::text FROM ${s("target_fences")}`,
    );
    expect(fences.rows.map((row) => row.target_id)).not.toContain(first.targetId);
    expect(await generation()).toBe(generationBefore + 1);
    // The rollback window is closed.
    const { rows } = await h.knex.raw<{ rows: { phase: string }[] }>(
      sql`SELECT phase FROM ${s("builds")} WHERE build_id = ?`,
      [second.buildId],
    );
    expect(rows[0].phase).toBe("retired");
    expect(await listIndices(h.opensearch, h.indexPrefix)).toEqual([second.target.physicalIndex]);
    expect(await aliasExists(h.opensearch, first.writeAlias)).toBe(false);
    expect(await fixture.mark(prepared.setup, ["c"])).toBe("recorded");
    expect(await fixture.residue(first.targetId)).toEqual({ intents: 0, runtimes: 0 });

    const again = prepared.requests.length;
    await prepared.admin.retireTarget(first.targetId, audit());
    expect(prepared.requests.slice(again)).toEqual([]);
  });

  it("alias와 인덱스가 이미 없어도 엔진의 404를 성공으로 보고 끝까지 진행한다", async () => {
    const prepared = await fixture.prepare({ shortGrace: true });
    await fixture.replaceFirst(prepared);
    const first = prepared.first;
    await fixture.waitForGrace(first.targetId);
    await h.opensearch.indices.deleteAlias({ index: first.physicalIndex, name: first.writeAlias });
    await h.opensearch.indices.delete({ index: first.physicalIndex });
    const sent = prepared.requests.length;
    await prepared.admin.retireTarget(first.targetId, audit());
    // Both _meta checks and the alias removal get 404, so no index delete is sent.
    expect(prepared.requests.slice(sent).map(path)).toEqual([
      // The fence check passes on a missing index; the pre-delete fence check is skipped.
      `POST /${first.physicalIndex}/_mget`,
      `GET /${first.physicalIndex}/_mapping`,
      `DELETE /${first.physicalIndex}/_alias/${first.writeAlias}`,
      `GET /${first.physicalIndex}/_mapping`,
    ]);
    expect((await fixture.target(first.targetId)).state).toBe("retired");
    expect(await indexExists(h.opensearch, first.physicalIndex)).toBe(false);
  });

  it("은퇴한 식별자의 alias와 인덱스는 같은 계획으로도 다시 만들어지지 않는다", async () => {
    const prepared = await fixture.prepare({ shortGrace: true });
    await fixture.replaceFirst(prepared);
    const first = prepared.first;
    await fixture.waitForGrace(first.targetId);
    await prepared.admin.retireTarget(first.targetId, audit());
    const definition = prepared.setup.definitions.get(KEY);
    if (definition === undefined) throw new Error("정의가 없습니다.");
    const physicalIndex = buildPhysicalIndexName(h.namespace, KEY, first.targetId);
    // The plan body must carry the current store_id in _meta to pass plan validation.
    const { rows: storeRows } = await h.knex.raw<{ rows: { store_id: string }[] }>(
      sql`SELECT store_id::text FROM ${s("store")}`,
    );
    const plan = {
      logicalKey: KEY,
      namespace: h.namespace,
      fingerprint: definition.fingerprint,
      hashVersion: definition.hashVersion,
      targetId: first.targetId,
      physicalIndex,
      writeAlias: buildWriteAliasName(physicalIndex),
      body: {
        settings: definition.settings,
        mappings: composeIndexMappings({
          targetId: first.targetId,
          namespace: h.namespace,
          logicalKey: KEY,
          fingerprint: definition.fingerprint,
          hashVersion: definition.hashVersion,
          mappings: definition.mappings,
          storeId: storeRows[0]?.store_id,
        }),
      },
      missingPlugins: [],
      captureEpoch: 1,
      warnings: [],
    };
    const indices = await listIndices(h.opensearch, h.indexPrefix);
    const sent = prepared.requests.length;
    expectRefused(
      await errorOf(prepared.admin.executeCreate(plan, audit())),
      "target-identity-terminal",
    );
    expect(prepared.requests.slice(sent).filter((request) => request.method === "PUT")).toEqual([]);
    expect(await listIndices(h.opensearch, h.indexPrefix)).toEqual(indices);
    expect(await aliasExists(h.opensearch, first.writeAlias)).toBe(false);
  });
});

describe("최종 비어 있음 검사", () => {
  it("intent나 고아 런타임 행이 남아 있으면 retired로 넘어가지 않는다", async () => {
    const prepared = await fixture.prepare({ shortGrace: true });
    await fixture.replaceFirst(prepared);
    const first = prepared.first;
    expect(await fixture.mark(prepared.setup, ["a", "b"])).toBe("recorded");
    // An orphan runtime row with no current incarnation.
    const orphanIntent = randomUUID();
    await h.knex.raw(
      sql`INSERT INTO ${s("delivery_runtime")} (target_id, document_id, intent_id) VALUES (?, 'z', ?)`,
      [first.targetId, orphanIntent],
    );
    await fixture.waitForGrace(first.targetId);
    const { sessions } = await h.openSessions(["intent", "orphan"]);
    await sessions.intent.run("BEGIN");
    await sessions.intent.run(
      sql`SELECT 1 FROM ${s("deliveries")} WHERE target_id = $1 AND document_id = 'a' FOR UPDATE`,
      [first.targetId],
    );
    await sessions.orphan.run("BEGIN");
    await sessions.orphan.run(
      sql`SELECT 1 FROM ${s("delivery_runtime")} WHERE target_id = $1 AND document_id = 'z' FOR UPDATE`,
      [first.targetId],
    );

    // The residue purge skips locked rows instead of waiting, so the final emptiness check refuses.
    const both = await errorOf(prepared.admin.retireTarget(first.targetId, audit()));
    expectRefused(both, "retirement-residue");
    expect(both.retryable).toBe(true);
    expect(await fixture.target(first.targetId)).toMatchObject({
      state: "retiring",
      alias_removed: true,
      index_deleted: true,
      retired: false,
    });
    expect(await fixture.residue(first.targetId)).toEqual({ intents: 1, runtimes: 1 });

    await sessions.intent.run("ROLLBACK");
    const sent = prepared.requests.length;
    const orphanOnly = await errorOf(prepared.admin.retireTarget(first.targetId, audit()));
    expectRefused(orphanOnly, "retirement-residue");
    expect(await fixture.residue(first.targetId)).toEqual({ intents: 0, runtimes: 1 });
    // Continuing does not resend remote steps that already finished.
    expect(prepared.requests.slice(sent)).toEqual([]);

    await sessions.orphan.run("ROLLBACK");
    await prepared.admin.retireTarget(first.targetId, audit());
    expect((await fixture.target(first.targetId)).state).toBe("retired");
    expect(await fixture.residue(first.targetId)).toEqual({ intents: 0, runtimes: 0 });
  });
});

describe("긴 잔여 정리", () => {
  it("잔여 정리가 관리 임대보다 오래 걸려도 묶음 사이에 임대를 연장해 끝까지 가고, 묶음은 키셋으로 한 번씩만 본다", async () => {
    const prepared = await fixture.prepare({ shortGrace: true });
    await fixture.replaceFirst(prepared);
    const first = prepared.first;
    await fixture.waitForGrace(first.targetId);
    // 40,000 residual intents (half with runtime rows) and 400 orphan runtime rows.
    const INTENTS = 40_000;
    await h.knex.raw(
      sql`INSERT INTO ${s("deliveries")} (target_id, document_id, desired_revision)
SELECT ?, 'r' || lpad(g::text, 6, '0'), 1 FROM generate_series(1, ?) AS g`,
      [first.targetId, INTENTS],
    );
    await h.knex.raw(
      sql`INSERT INTO ${s("delivery_runtime")} (target_id, document_id, intent_id)
SELECT target_id, document_id, intent_id FROM ${s("deliveries")} WHERE target_id = ? AND document_id < 'r020001'`,
      [first.targetId],
    );
    await h.knex.raw(
      sql`INSERT INTO ${s("delivery_runtime")} (target_id, document_id, intent_id)
SELECT ?, 'o' || lpad(g::text, 6, '0'), gen_random_uuid() FROM generate_series(1, 400) AS g`,
      [first.targetId],
    );
    // A statement trigger makes each batch delete take 200 ms: 80 batches take 16 s, longer than the 10 s lease.
    const trigger = qualified(h.searchSchema, "slow_purge");
    await h.knex.raw(
      sql`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NULL; END $$`,
    );
    await h.knex.raw(
      sql`CREATE TRIGGER slow_purge AFTER DELETE ON ${s("deliveries")} FOR EACH STATEMENT EXECUTE FUNCTION ${trigger}()`,
    );
    const LEASE_MS = 10_000;
    // A 10 s lease leaves (10,000 - 4 * 1,000) / 3 = 2,000 ms per remote request, above the minimum.
    const admin = fixture.adminFor(prepared.setup, kit.nativeClient(), {
      adminLeaseMs: LEASE_MS,
      timeouts: { lockTimeoutMs: 1_000, statementTimeoutMs: 1_000 },
    });
    try {
      const started = performance.now();
      await admin.retireTarget(first.targetId, audit());
      const elapsed = performance.now() - started;
      // Without extension the lease would have expired mid-purge with SearchAdminLeaseLost.
      expect(elapsed).toBeGreaterThan(LEASE_MS);
    } finally {
      await h.knex.raw(sql`DROP TRIGGER IF EXISTS slow_purge ON ${s("deliveries")}`);
      await h.knex.raw(sql`DROP FUNCTION IF EXISTS ${trigger}()`);
    }
    expect(await fixture.target(first.targetId)).toMatchObject({ state: "retired", retired: true });
    expect(await fixture.residue(first.targetId)).toEqual({ intents: 0, runtimes: 0 });
    // Keyset batches: exactly INTENTS / 500 = 80, no row visited twice.
    const { rows } = await h.knex.raw<{
      rows: { batches: number; intents: number; runtimes: number }[];
    }>(
      sql`SELECT count(*) FILTER (WHERE detail->>'step' = 'retire-purge')::int AS batches,
       coalesce(sum((detail->>'intents')::int) FILTER (WHERE detail->>'step' = 'retire-purge'), 0)::int AS intents,
       coalesce(sum((detail->>'runtimes')::int) FILTER (WHERE detail->>'step' = 'retire-purge-orphans'), 0)::int AS runtimes
FROM ${s("admin_operations")} WHERE target_id = ? AND kind = 'retire'`,
      [first.targetId],
    );
    expect(rows[0]).toEqual({ batches: INTENTS / 500, intents: INTENTS, runtimes: 400 });
  }, 120_000);
});
