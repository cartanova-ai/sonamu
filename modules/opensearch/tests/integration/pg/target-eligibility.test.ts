import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { describe, expect, it } from "vitest";

import {
  type ClaimedDelivery,
  type DeliveryKey,
  type TargetIneligibleReason,
} from "../../../src/postgres/delivery-store";
import { createWorkerHeartbeatStore } from "../../../src/postgres/worker-heartbeat";
import {
  type DeliveryFixture,
  GATE_KEY,
  inspectIndex,
  LONG_LEASE_MS,
  useDeliveryFixture,
} from "../../helpers/delivery-fixture";
import { useIntegrationHarness } from "../../helpers/harness";
import { sql } from "../../helpers/sql";
import { backendPid, waitForLockWait } from "../../helpers/test-targets";

/**
 * Target eligibility: state = 'active' AND write_enabled AND capture_mode = 'active' AND target epoch = current epoch.
 * An ineligible target's deliveries are not claimed (the claim re-checks inside the statement), held leases are not
 * renewed, and the pre-send check reports the reason so the worker releases without spending budget. Ineligible states
 * other than pausing are written directly as superuser.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const fixture = useDeliveryFixture(h);
const { workerPool, poolPid, setUp, mark, table, runtimes, installGate } = fixture;
type Fixture = DeliveryFixture;

async function claimAll(f: Fixture, worker: Knex | Knex.Transaction, token = randomUUID()) {
  const claimed = await f.store.claim(worker, {
    targetIds: [f.target.targetId],
    limit: 10,
    leaseToken: token,
    leaseMs: LONG_LEASE_MS,
  });
  return { token, claimed };
}

const keyOf = ({ targetId, documentId, intentId }: DeliveryKey): DeliveryKey => ({
  targetId,
  documentId,
  intentId,
});

/** Lease expiry in microseconds, and the retry budget. */
async function leaseState(token: string) {
  const { rows } = await h.knex.raw<{
    rows: { document_id: string; expires: string; attempts: number; retry_age_ms: number }[];
  }>(
    sql`SELECT document_id, (extract(epoch FROM lease_expires_at) * 1000000)::bigint::text AS expires,
       attempts, retry_age_ms::integer
FROM ${table("delivery_runtime")} WHERE lease_token = ? ORDER BY document_id COLLATE "C"`,
    [token],
  );
  return rows;
}

async function targetRow(targetId: string) {
  const { rows } = await h.knex.raw<{
    rows: { state: string; pause_reason: unknown; paused_at_ms: string | null }[];
  }>(
    sql`SELECT state, pause_reason, (extract(epoch FROM paused_at) * 1000000)::bigint::text AS paused_at_ms
FROM ${table("targets")} WHERE target_id = ?`,
    [targetId],
  );
  return rows[0];
}

type Ineligibility = {
  apply(f: Fixture, worker: Knex): Promise<void>;
  revert(f: Fixture): Promise<void>;
  reason: TargetIneligibleReason;
};

const setTarget = (f: Fixture, assignments: "retiring" | "retired" | "write-off" | "active") => {
  const statements = {
    retiring: sql`UPDATE ${table("targets")} SET state = 'retiring', write_enabled = false, retiring_at = clock_timestamp() WHERE target_id = ?`,
    retired: sql`UPDATE ${table("targets")} SET state = 'retired', write_enabled = false, retired_at = clock_timestamp() WHERE target_id = ?`,
    "write-off": sql`UPDATE ${table("targets")} SET write_enabled = false WHERE target_id = ?`,
    active: sql`UPDATE ${table("targets")} SET state = 'active', write_enabled = true, pause_reason = NULL WHERE target_id = ?`,
  };
  return h.knex.raw(statements[assignments], [f.target.targetId]);
};
const setIndex = (mode: "active" | "suspended", epochDelta: number) =>
  h.knex.raw(
    sql`UPDATE ${table("indexes")} SET capture_mode = ?, capture_epoch = capture_epoch + ?, generation = generation + 1 WHERE namespace = ?`,
    [mode, epochDelta, h.namespace],
  );

// One case per predicate of the eligibility rule.
const INELIGIBLE = {
  "일시 정지": {
    apply: async (f, worker) => {
      expect(
        await f.store.pauseTarget(worker, {
          targetId: f.target.targetId,
          reason: { class: "write_alias_missing" },
        }),
      ).toBe(true);
    },
    revert: async (f) => {
      await setTarget(f, "active");
    },
    reason: "target-not-active",
  },
  "쓰기 꺼짐": {
    apply: async (f) => {
      await setTarget(f, "write-off");
    },
    revert: async (f) => {
      await setTarget(f, "active");
    },
    reason: "write-disabled",
  },
  "캡처 모드만 suspended": {
    apply: async () => {
      await setIndex("suspended", 0);
    },
    revert: async () => {
      await setIndex("active", 0);
    },
    reason: "capture-suspended",
  },
  "epoch만 뒤처짐": {
    apply: async () => {
      await setIndex("active", 1);
    },
    revert: async () => {
      await setIndex("active", -1);
    },
    reason: "capture-epoch-behind",
  },
} satisfies Record<string, Ineligibility>;

describe("부적격 대상", () => {
  it("전송 직전 확인은 적격 대상을 적격으로 보고하고, 없는 대상은 target-missing이다", async () => {
    const f = await setUp();
    const worker = workerPool();
    expect(await f.store.checkTargetEligibility(worker, f.target.targetId)).toEqual({
      eligible: true,
      reason: null,
      target: {
        state: "active",
        writeEnabled: true,
        captureEpoch: 1,
        currentCaptureEpoch: 1,
        captureMode: "active",
      },
    });
    expect(await f.store.checkTargetEligibility(worker, randomUUID())).toEqual({
      eligible: false,
      reason: "target-missing",
      target: null,
    });
  });

  it.each(Object.entries(INELIGIBLE))(
    "%s: 캐시된 대상 목록으로 호출해도 claim이 비어 있고, 임대는 heartbeat로 연장되지 않으며, 전송 직전 확인이 부적격을 보고한다",
    async (_name, kind) => {
      const f = await setUp();
      await mark(f, ["a", "b"]);
      const worker = workerPool();
      // Only a is claimed while eligible: work in flight.
      const held = await f.store.claim(worker, {
        targetIds: [f.target.targetId],
        limit: 1,
        leaseToken: randomUUID(),
        leaseMs: LONG_LEASE_MS,
      });
      expect(held.map((row) => row.documentId)).toEqual(["a"]);
      const token = (await runtimes())[0].lease_token ?? "";
      const leaseBefore = await leaseState(token);
      const cached = await f.store.listClaimableTargets(worker, h.namespace);
      expect(cached.map((target) => target.targetId)).toEqual([f.target.targetId]);

      await kind.apply(f, worker);

      expect(await f.store.listClaimableTargets(worker, h.namespace)).toEqual([]);
      expect((await claimAll(f, worker)).claimed).toEqual([]);
      // Nothing is renewed, but the token remains, so the unreturned row counts as skipped, not lost.
      const beat = await f.store.heartbeat(worker, {
        leaseToken: token,
        deliveries: held,
        leaseMs: LONG_LEASE_MS * 10,
      });
      expect(beat).toEqual([]);
      expect(await leaseState(token)).toEqual(leaseBefore);
      expect(await f.store.classifyUnreturned(worker, token, held, beat)).toEqual({
        leaseLost: [],
        skippedLocked: held.map(keyOf),
      });
      const eligibility = await f.store.checkTargetEligibility(worker, f.target.targetId);
      expect(eligibility).toMatchObject({ eligible: false, reason: kind.reason });

      // Release frees the worker's own lease regardless of eligibility.
      expect(
        await f.store.release(worker, {
          leaseToken: token,
          items: held.map((row) => ({
            ...keyOf(row),
            revision: row.claimedRevision,
            delayMs: 0,
            error: { class: "target_ineligible" },
          })),
        }),
      ).toHaveLength(1);
      expect((await claimAll(f, worker)).claimed).toEqual([]);

      await kind.revert(f);
      expect(await f.store.checkTargetEligibility(worker, f.target.targetId)).toMatchObject({
        eligible: true,
      });
      const resumed = await claimAll(f, worker);
      expect(resumed.claimed.map((row) => row.documentId)).toEqual(["a", "b"]);
      expect(
        (await leaseState(resumed.token)).map((row) => [row.attempts, row.retry_age_ms]),
      ).toEqual([
        [0, 0],
        [0, 0],
      ]);
    },
  );

  it("스냅샷이 일시 정지보다 앞선 claim은 진행 중인 작업이 되고, 전송 직전 확인이 그것을 잡는다", async () => {
    const f = await setUp();
    await installGate();
    await mark(f, ["a"]);
    const gated = workerPool();
    await gated.raw("SET sonamu_test.gate = 'on'");
    const gatedPid = await poolPid(gated);
    const { sessions } = await h.openSessions(["holder"]);
    await sessions.holder.run("SELECT pg_advisory_lock($1)", [GATE_KEY]);

    // The gated claim has taken its snapshot and waits at the gate.
    const token = randomUUID();
    const pending = claimAll(f, gated, token);
    pending.catch(() => {});
    await waitForLockWait(h.knex, gatedPid, sessions.holder.pid);

    // The claim does not lock the targets row, so pausing does not wait.
    const other = workerPool();
    expect(
      await f.store.pauseTarget(other, {
        targetId: f.target.targetId,
        reason: { class: "revision_divergence", documents: [{ id: "a", indexed: 3, ledger: 2 }] },
      }),
    ).toBe(true);
    await waitForLockWait(h.knex, gatedPid, sessions.holder.pid);
    await sessions.holder.run("SELECT pg_advisory_unlock($1)", [GATE_KEY]);

    const { claimed } = await pending;
    expect(claimed.map((row) => row.documentId)).toEqual(["a"]);
    expect((await claimAll(f, other)).claimed).toEqual([]);
    expect(
      await f.store.heartbeat(other, { leaseToken: token, deliveries: claimed, leaseMs: 60_000 }),
    ).toEqual([]);
    expect(await f.store.checkTargetEligibility(other, f.target.targetId)).toMatchObject({
      eligible: false,
      reason: "target-not-active",
      target: { state: "paused" },
    });
    expect(
      await f.store.release(other, {
        leaseToken: token,
        items: claimed.map((row) => ({
          ...keyOf(row),
          revision: row.claimedRevision,
          delayMs: 0,
          error: { class: "target_ineligible" },
        })),
      }),
    ).toHaveLength(1);
    expect((await claimAll(f, other)).claimed).toEqual([]);
  });
});

describe("일시 정지", () => {
  it("일시 정지는 멱등이고 첫 이유를 기록하며, 은퇴 중이거나 은퇴한 대상은 paused로 돌아가지 않는다", async () => {
    const f = await setUp();
    const worker = workerPool();
    const reason = {
      class: "revision_divergence" as const,
      documents: [{ id: "a", indexed: 5, ledger: 4 }],
    };
    expect(await f.store.pauseTarget(worker, { targetId: f.target.targetId, reason })).toBe(true);
    const first = await targetRow(f.target.targetId);
    expect(first).toMatchObject({ state: "paused", pause_reason: reason });
    expect(first.paused_at_ms).not.toBeNull();

    expect(
      await f.store.pauseTarget(worker, {
        targetId: f.target.targetId,
        reason: { class: "write_alias_missing" },
      }),
    ).toBe(false);
    expect(await targetRow(f.target.targetId)).toEqual(first);

    for (const state of ["retiring", "retired"] as const) {
      await setTarget(f, state);
      expect(await f.store.pauseTarget(worker, { targetId: f.target.targetId, reason })).toBe(
        false,
      );
      expect((await targetRow(f.target.targetId)).state).toBe(state);
    }
    expect(await f.store.pauseTarget(worker, { targetId: randomUUID(), reason })).toBe(false);
  });

  it("동시에 두 워커가 일시 정지해도 한 번만 바뀌고 먼저 커밋한 이유가 남는다", async () => {
    const f = await setUp();
    const first = await workerPool().transaction();
    const second = workerPool();
    const secondPid = await poolPid(second);
    expect(
      await f.store.pauseTarget(first, {
        targetId: f.target.targetId,
        reason: { class: "revision_divergence" },
      }),
    ).toBe(true);
    const firstPid = await backendPid(first);
    const racing = f.store.pauseTarget(second, {
      targetId: f.target.targetId,
      reason: { class: "write_alias_missing" },
    });
    racing.catch(() => {});
    await waitForLockWait(h.knex, secondPid, firstPid);
    await first.commit();
    // The waiting UPDATE re-checks state = 'active' on the committed row and changes nothing.
    expect(await racing).toBe(false);
    expect(await targetRow(f.target.targetId)).toMatchObject({
      state: "paused",
      pause_reason: { class: "revision_divergence" },
    });
  });

  it.each(["일시 정지가 먼저 잠금", "claim이 먼저 잠금"] as const)(
    "%s: 일시 정지와 claim이 겹쳐도 서로 기다리지 않고, 끝난 뒤 paused 대상에 claim 가능한 delivery가 남지 않는다",
    async (order) => {
      const f = await setUp();
      await mark(f, ["a", "b"]);
      const pauser = await workerPool().transaction();
      const claimer = workerPool();
      let claimed: ClaimedDelivery[];
      let token: string;
      const pause = () =>
        f.store.pauseTarget(pauser, {
          targetId: f.target.targetId,
          reason: { class: "write_alias_missing" },
        });
      if (order === "일시 정지가 먼저 잠금") {
        expect(await pause()).toBe(true);
        // The claim does not see the uncommitted pause and does not lock the targets row.
        ({ token, claimed } = await claimAll(f, claimer));
        await pauser.commit();
      } else {
        const claimTrx = await claimer.transaction();
        ({ token, claimed } = await claimAll(f, claimTrx));
        // Pausing does not wait on the intent rows the claim holds.
        expect(await pause()).toBe(true);
        await pauser.commit();
        await claimTrx.commit();
      }
      expect(claimed.map((row) => row.documentId)).toEqual(["a", "b"]);

      const worker = workerPool();
      expect((await claimAll(f, worker)).claimed).toEqual([]);
      expect(
        await f.store.heartbeat(worker, {
          leaseToken: token,
          deliveries: claimed,
          leaseMs: 60_000,
        }),
      ).toEqual([]);
      expect(await f.store.checkTargetEligibility(worker, f.target.targetId)).toMatchObject({
        eligible: false,
        reason: "target-not-active",
      });
      expect(
        await f.store.release(worker, {
          leaseToken: token,
          items: claimed.map((row) => ({
            ...keyOf(row),
            revision: row.claimedRevision,
            delayMs: 0,
            error: { class: "target_ineligible" },
          })),
        }),
      ).toHaveLength(2);
      expect((await claimAll(f, worker)).claimed).toEqual([]);
      const inspection = await inspectIndex(h);
      expect(inspection.targets).toEqual([
        expect.objectContaining({
          targetId: f.target.targetId,
          state: "paused",
          pauseReason: { class: "write_alias_missing" },
        }),
      ]);
    },
  );

  it("pause_reason의 문서 목록은 20개까지 받고, 저장 한도를 넘으면 앞쪽 문서만 남긴다", async () => {
    const f = await setUp();
    const worker = workerPool();
    const documents = Array.from({ length: 20 }, (_unused, index) => ({
      id: `${String(index).padStart(2, "0")}${"x".repeat(510)}`,
      indexed: 2,
      ledger: 1,
    }));
    await expect(
      f.store.pauseTarget(worker, {
        targetId: f.target.targetId,
        reason: { class: "revision_divergence", documents: [...documents, documents[0]] },
      }),
    ).rejects.toMatchObject({
      code: "SEARCH_CONFIGURATION_ERROR",
      details: { reason: "invalid-delivery-input" },
    });
    expect(
      await f.store.pauseTarget(worker, {
        targetId: f.target.targetId,
        reason: { class: "revision_divergence", documents },
      }),
    ).toBe(true);
    const { rows } = await h.knex.raw<{ rows: { kept: number; bytes: number; first: string }[] }>(
      sql`SELECT jsonb_array_length(pause_reason->'documents') AS kept, octet_length(pause_reason::text) AS bytes,
       pause_reason->'documents'->0->>'id' AS first FROM ${table("targets")} WHERE target_id = ?`,
      [f.target.targetId],
    );
    expect(rows[0].kept).toBeGreaterThan(0);
    expect(rows[0].kept).toBeLessThan(20);
    expect(rows[0].bytes).toBeLessThanOrEqual(4096);
    expect(rows[0].first).toBe(documents[0].id);
  });
});

async function heartbeatRow(workerId: string) {
  const { rows } = await h.knex.raw<{
    rows: {
      capabilities: string[];
      state: string;
      started_at_ms: string;
      last_report: unknown;
      age_ms: number;
    }[];
  }>(
    sql`SELECT capabilities, state, (extract(epoch FROM started_at) * 1000)::bigint::text AS started_at_ms, last_report,
       (extract(epoch FROM clock_timestamp() - heartbeat_at) * 1000)::integer AS age_ms
FROM ${table("worker_heartbeats")} WHERE worker_id = ?`,
    [workerId],
  );
  return rows;
}

describe("능력 heartbeat", () => {
  const FINGERPRINT = "a".repeat(64);

  it("넣기, 갱신, 삭제: 점검은 이 logical key의 능력을 가진 워커와 데이터베이스 시계로 잰 나이를 본다", async () => {
    await setUp();
    const store = createWorkerHeartbeatStore({ schema: h.searchSchema });
    const worker = workerPool();
    const workerId = randomUUID();
    const bystander = randomUUID();
    const startedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

    await store.beat(worker, {
      workerId,
      namespace: h.namespace,
      capabilities: [
        `${fixture.key}@${FINGERPRINT}`,
        `other-key@${"b".repeat(64)}`,
        `${fixture.key}@${FINGERPRINT}`,
      ],
      state: "running",
      startedAt,
      lastReport: null,
    });
    await store.beat(worker, {
      workerId: bystander,
      namespace: h.namespace,
      capabilities: [`other-key@${"b".repeat(64)}`],
      state: "idle",
      startedAt,
      lastReport: null,
    });
    expect(await heartbeatRow(workerId)).toEqual([
      expect.objectContaining({
        capabilities: [`messages@${FINGERPRINT}`, `other-key@${"b".repeat(64)}`],
        state: "running",
        started_at_ms: String(startedAt.getTime()),
        last_report: null,
      }),
    ]);
    const inserted = await inspectIndex(h);
    expect(inserted.workers).toEqual([
      { workerId, fingerprints: [FINGERPRINT], heartbeatAgeMs: expect.any(Number) },
    ]);
    expect(inserted.workers[0].heartbeatAgeMs).toBeLessThan(10_000);

    // Rows never expire; inspection reports their age.
    await h.knex.raw(
      sql`UPDATE ${table("worker_heartbeats")} SET heartbeat_at = clock_timestamp() - interval '1 hour' WHERE worker_id = ?`,
      [workerId],
    );
    const stale = await inspectIndex(h);
    expect(stale.workers[0].heartbeatAgeMs).toBeGreaterThanOrEqual(3_600_000);

    // An update keeps the original start time.
    const report = { claimed: 2, indexed: 1, released: 1, unsupportedTargets: [] };
    await store.beat(worker, {
      workerId,
      namespace: h.namespace,
      capabilities: [`${fixture.key}@${FINGERPRINT}`],
      state: "degraded",
      startedAt: new Date(),
      lastReport: report,
    });
    expect(await heartbeatRow(workerId)).toEqual([
      expect.objectContaining({
        capabilities: [`messages@${FINGERPRINT}`],
        state: "degraded",
        started_at_ms: String(startedAt.getTime()),
        last_report: report,
      }),
    ]);
    const refreshed = await inspectIndex(h);
    expect(refreshed.workers).toHaveLength(1);
    expect(refreshed.workers[0].heartbeatAgeMs).toBeLessThan(10_000);

    expect(await store.remove(worker, workerId)).toBe(true);
    expect(await store.remove(worker, workerId)).toBe(false);
    expect((await inspectIndex(h)).workers).toEqual([]);
    expect(await heartbeatRow(bystander)).toHaveLength(1);
  });

  it("잘못된 능력, 상태, 너무 큰 보고는 문장 전에 거부한다", async () => {
    await setUp();
    const store = createWorkerHeartbeatStore({ schema: h.searchSchema });
    const worker = workerPool();
    const base = {
      workerId: randomUUID(),
      namespace: h.namespace,
      capabilities: [`${fixture.key}@${FINGERPRINT}`],
      state: "running" as const,
      startedAt: new Date(),
      lastReport: null,
    };
    const invalid = [
      { ...base, capabilities: [`${fixture.key}@not-a-fingerprint`] },
      { ...base, capabilities: [`Bad Key@${FINGERPRINT}`] },
      { ...base, workerId: "worker-1" },
      { ...base, startedAt: new Date(Number.NaN) },
      { ...base, lastReport: { padding: "p".repeat(3_000) } },
    ];
    for (const input of invalid) {
      await expect(store.beat(worker, input)).rejects.toMatchObject({
        code: "SEARCH_CONFIGURATION_ERROR",
        details: { reason: "invalid-heartbeat-input" },
      });
    }
    expect(await heartbeatRow(base.workerId)).toEqual([]);
  });
});
