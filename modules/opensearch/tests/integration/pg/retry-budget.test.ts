import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { describe, expect, it } from "vitest";

import { type JsonObject } from "../../../src/definition/canonical-json";
import {
  type ClaimedDelivery,
  type ClassifyFailuresInput,
  type DeliveryError,
  type FailureItem,
} from "../../../src/postgres/delivery-store";
import {
  type DeliveryFixture,
  inspectIndex,
  LONG_LEASE_MS,
  useDeliveryFixture,
} from "../../helpers/delivery-fixture";
import { useIntegrationHarness } from "../../helpers/harness";
import { sql } from "../../helpers/sql";

/**
 * Active retry budget. The counters (attempts, retry_age_ms) belong to the materialized revision (failure_revision)
 * and change only when a failure is classified. Claims and budget-free releases never touch them, and a newer revision
 * does not inherit an older revision's failures.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const fixture = useDeliveryFixture(h);
const { workerPool, setUp, mark, table, intents, waitForExpiry } = fixture;
type Fixture = DeliveryFixture;

const LIMITS = { maxRetryAttempts: 3, maxRetryAgeMs: 3_600_000 } as const;
const TRANSIENT: DeliveryError = { class: "transient_item", status: 500, type: "unknown_failure" };
const OUTAGE: DeliveryError = { class: "request_unavailable", status: 503 };

type Budget = {
  intent_id: string;
  attempts: number;
  retry_age_ms: number;
  failure_revision: number;
  quarantined_revision: number | null;
  first_attempt_set: boolean;
  available_revision: number;
  last_error: JsonObject | null;
  lease_token: string | null;
};
async function budget(documentId = "a"): Promise<Budget[]> {
  const { rows } = await h.knex.raw<{ rows: Budget[] }>(
    sql`SELECT intent_id::text, attempts, retry_age_ms::integer, failure_revision::integer,
       quarantined_revision::integer, first_attempt_at IS NOT NULL AS first_attempt_set,
       available_revision::integer, last_error, lease_token::text
FROM ${table("delivery_runtime")} WHERE document_id = ? ORDER BY updated_at`,
    [documentId],
  );
  return rows;
}

async function only(documentId = "a"): Promise<Budget> {
  const rows = await budget(documentId);
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function claimOne(
  f: Fixture,
  worker: Knex | Knex.Transaction,
  leaseMs = LONG_LEASE_MS,
): Promise<{ token: string; claimed: ClaimedDelivery }> {
  const token = randomUUID();
  const rows = await f.store.claim(worker, {
    targetIds: [f.target.targetId],
    limit: 10,
    leaseToken: token,
    leaseMs,
  });
  expect(rows).toHaveLength(1);
  return { token, claimed: rows[0] };
}

async function claimNothing(f: Fixture, worker: Knex): Promise<void> {
  expect(
    await f.store.claim(worker, {
      targetIds: [f.target.targetId],
      limit: 10,
      leaseToken: randomUUID(),
      leaseMs: LONG_LEASE_MS,
    }),
  ).toEqual([]);
}

const failure = (
  claimed: ClaimedDelivery,
  materializedRevision: number,
  mode: FailureItem["mode"] = "retry",
  delayMs = 0,
  error: DeliveryError = TRANSIENT,
): FailureItem => ({
  targetId: claimed.targetId,
  documentId: claimed.documentId,
  intentId: claimed.intentId,
  materializedRevision,
  mode,
  delayMs,
  error,
});

function classify(
  f: Fixture,
  worker: Knex | Knex.Transaction,
  token: string,
  items: readonly FailureItem[],
  limits: Pick<ClassifyFailuresInput, "maxRetryAttempts" | "maxRetryAgeMs"> = LIMITS,
) {
  return f.store.classifyFailures(worker, { leaseToken: token, items, ...limits });
}

function release(
  f: Fixture,
  worker: Knex,
  token: string,
  claimed: ClaimedDelivery,
  revision: number,
  delayMs = 0,
  error: DeliveryError | null = OUTAGE,
) {
  const { targetId, documentId, intentId } = claimed;
  return f.store.release(worker, {
    leaseToken: token,
    items: [{ targetId, documentId, intentId, revision, delayMs, error }],
  });
}

async function countedFailure(f: Fixture, worker: Knex, revision: number, delayMs = 0) {
  const { token, claimed } = await claimOne(f, worker);
  const [result] = await classify(f, worker, token, [failure(claimed, revision, "retry", delayMs)]);
  return result;
}

describe("예산을 쓰지 않는 반납", () => {
  it("claim과 반납은 집계된 실패 카운터를 늘리지도 지우지도 않는다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    await countedFailure(f, worker, 1);
    await countedFailure(f, worker, 1);
    const counted = await only();
    expect(counted.attempts).toBe(2);

    for (let round = 0; round < 20; round += 1) {
      const { token, claimed } = await claimOne(f, worker);
      await release(f, worker, token, claimed, 1);
    }
    expect(await only()).toMatchObject({
      attempts: 2,
      retry_age_ms: counted.retry_age_ms,
      failure_revision: 1,
      quarantined_revision: null,
    });
    // Only the third counted failure reaches the limit of 3.
    expect(await countedFailure(f, worker, 1)).toMatchObject({
      outcome: "quarantined",
      attempts: 3,
    });
  });

  it("오래 전의 첫 시도 시각만으로는 격리되지 않는다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    await countedFailure(f, worker, 1);
    // A long outage: only the diagnostic first-attempt time moves a day back.
    await h.knex.raw(
      sql`UPDATE ${table("delivery_runtime")} SET first_attempt_at = clock_timestamp() - interval '1 day'`,
    );
    expect(await countedFailure(f, worker, 1)).toMatchObject({
      outcome: "retry_scheduled",
      attempts: 2,
    });
    const after = await only();
    expect(after.quarantined_revision).toBeNull();
    expect(after.retry_age_ms).toBeLessThan(60_000);
  });
});

describe("실패 집계와 격리", () => {
  it("집계된 실패가 한도에 닿으면 격리하고 last_error에 exhausted를 남긴다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    const outcomes = [];
    for (let round = 0; round < 3; round += 1) {
      const row = await countedFailure(f, worker, 1);
      outcomes.push([row.outcome, row.attempts]);
    }
    expect(outcomes).toEqual([
      ["retry_scheduled", 1],
      ["retry_scheduled", 2],
      ["quarantined", 3],
    ]);
    expect(await only()).toMatchObject({
      quarantined_revision: 1,
      last_error: { ...TRANSIENT, exhausted: true },
      lease_token: null,
    });
    await claimNothing(f, worker);
    expect(await intents()).toEqual([
      expect.objectContaining({ document_id: "a", desired_revision: 1 }),
    ]);
  });

  it("claim은 같은 행의 집계된 실패 수와 그 리비전을 돌려주어 backoff에 쓰게 하고, 그 값을 바꾸지 않는다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    const first = await claimOne(f, worker);
    expect(first.claimed).toMatchObject({ attempts: 0, failureRevision: 0 });
    await classify(f, worker, first.token, [failure(first.claimed, 1)]);
    const second = await claimOne(f, worker);
    expect(second.claimed).toMatchObject({ claimedRevision: 1, attempts: 1, failureRevision: 1 });
    await classify(f, worker, second.token, [failure(second.claimed, 1)]);
    // A newer revision's claim still returns the old revision's counters; the worker treats them as 0 when
    // failureRevision differs from the materialized revision.
    await mark(f, ["a"]);
    const third = await claimOne(f, worker);
    expect(third.claimed).toMatchObject({ claimedRevision: 2, attempts: 2, failureRevision: 1 });
    expect(await only()).toMatchObject({ attempts: 2, failure_revision: 1 });
  });

  it("활성 예산은 claim 처리 시간과 예약된 지연의 합이고, 한도에 닿으면 격리한다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    const { token, claimed } = await claimOne(f, worker);
    const [row] = await classify(f, worker, token, [failure(claimed, 1, "retry", 5_000)], {
      maxRetryAttempts: 100,
      maxRetryAgeMs: 4_000,
    });
    expect(row.outcome).toBe("quarantined");
    expect(row.attempts).toBe(1);
    expect(row.retryAgeMs).toBeGreaterThanOrEqual(5_000);
    expect((await only()).last_error).toMatchObject({ exhausted: true });
  });

  it("poison은 시도 횟수를 늘리지 않고 그 리비전을 바로 격리한다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    await countedFailure(f, worker, 1);
    const { token, claimed } = await claimOne(f, worker);
    const rejected: DeliveryError = {
      class: "rejected",
      status: 400,
      type: "mapper_parsing_exception",
    };
    expect(await classify(f, worker, token, [failure(claimed, 1, "poison", 0, rejected)])).toEqual([
      expect.objectContaining({ outcome: "quarantined", attempts: 1 }),
    ]);
    expect(await only()).toMatchObject({ quarantined_revision: 1, last_error: rejected });
    await claimNothing(f, worker);
  });

  it("완료 문장을 다시 보내도 실패는 완료된 시도마다 한 번만 센다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    const { token, claimed } = await claimOne(f, worker);
    const items = [failure(claimed, 1)];

    const trx = await worker.transaction();
    expect(await classify(f, trx, token, items)).toHaveLength(1);
    await trx.rollback();
    expect(await only()).toMatchObject({ attempts: 0, lease_token: token });

    expect(await classify(f, worker, token, items)).toEqual([
      expect.objectContaining({ outcome: "retry_scheduled", attempts: 1 }),
    ]);
    // A caller that lost the response and resends finds the token already released.
    expect(await classify(f, worker, token, items)).toEqual([]);
    expect(await classify(f, worker, token, items)).toEqual([]);
    expect(await only()).toMatchObject({ attempts: 1 });
    expect(await f.store.classifyUnreturned(worker, token, [claimed], [])).toEqual({
      leaseLost: [{ targetId: claimed.targetId, documentId: "a", intentId: claimed.intentId }],
      skippedLocked: [],
    });
  });

  it("옛 임대 토큰이나 교체된 incarnation으로는 카운터를 바꾸지 못한다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    const other = workerPool();

    const stale = await claimOne(f, worker, 50);
    await waitForExpiry(stale.token);
    const fresh = await claimOne(f, other);
    const before = await only();
    expect(await classify(f, worker, stale.token, [failure(stale.claimed, 1)])).toEqual([]);
    expect(await classify(f, worker, stale.token, [failure(stale.claimed, 1, "poison")])).toEqual(
      [],
    );
    expect(await release(f, worker, stale.token, stale.claimed, 1, 600_000)).toEqual([]);
    expect(await only()).toEqual(before);
    expect(before).toMatchObject({ attempts: 0, lease_token: fresh.token });

    expect(
      (
        await f.store.acknowledge(other, {
          leaseToken: fresh.token,
          items: [{ ...fresh.claimed, materializedRevision: 1 }],
        })
      ).map((row) => row.outcome),
    ).toEqual(["deleted"]);
    await mark(f, ["a"]);
    const next = await claimOne(f, other);
    expect(next.claimed.intentId).not.toBe(fresh.claimed.intentId);
    const replacedKey = { ...next.claimed };
    for (const token of [stale.token, fresh.token]) {
      expect(await classify(f, worker, token, [failure(replacedKey, 2)])).toEqual([]);
      expect(await classify(f, worker, token, [failure(fresh.claimed, 2)])).toEqual([]);
      expect(await release(f, worker, token, replacedKey, 2)).toEqual([]);
    }
    expect(await only()).toMatchObject({
      intent_id: next.claimed.intentId,
      attempts: 0,
      quarantined_revision: null,
      lease_token: next.token,
    });
  });
});

describe("새 리비전은 새 예산", () => {
  it("claim 이후 마커가 리비전을 올리면 옛 리비전의 실패는 newer_pending으로 끝난다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    await countedFailure(f, worker, 1);
    await countedFailure(f, worker, 1);

    for (const mode of ["retry", "poison"] as const) {
      const { token, claimed } = await claimOne(f, worker);
      await mark(f, ["a"]);
      const [row] = await classify(f, worker, token, [
        failure(claimed, claimed.claimedRevision, mode, 600_000),
      ]);
      // Not counted, not quarantined, not delayed.
      expect(row).toMatchObject({ outcome: "newer_pending", attempts: 2 });
      expect(await only()).toMatchObject({
        attempts: 2,
        failure_revision: 1,
        quarantined_revision: null,
        lease_token: null,
      });
    }
    const { token, claimed } = await claimOne(f, worker);
    expect(claimed.claimedRevision).toBe(3);
    expect(await classify(f, worker, token, [failure(claimed, 3)])).toEqual([
      expect.objectContaining({ outcome: "retry_scheduled", attempts: 1 }),
    ]);
  });

  it("시도 중 스냅샷이 새 리비전을 읽었으면 실패는 그 리비전의 첫 실패로 센다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    await countedFailure(f, worker, 1);
    await countedFailure(f, worker, 1);
    const { token, claimed } = await claimOne(f, worker);
    await mark(f, ["a"]);
    // Claimed revision 1, but the snapshot read ledger revision 2.
    expect(await classify(f, worker, token, [failure(claimed, 2)])).toEqual([
      expect.objectContaining({ outcome: "retry_scheduled", attempts: 1 }),
    ]);
    expect(await only()).toMatchObject({ failure_revision: 2, attempts: 1 });
  });

  it("실패 뒤에 도착한 새 리비전은 옛 리비전의 지연을 기다리지 않고 새 예산으로 시작한다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    await countedFailure(f, worker, 1);
    expect(await countedFailure(f, worker, 1, 600_000)).toMatchObject({
      outcome: "retry_scheduled",
      attempts: 2,
    });
    await claimNothing(f, worker);
    await mark(f, ["a"]);
    const { token, claimed } = await claimOne(f, worker);
    expect(claimed.claimedRevision).toBe(2);
    expect(await classify(f, worker, token, [failure(claimed, 2)])).toEqual([
      expect.objectContaining({ outcome: "retry_scheduled", attempts: 1 }),
    ]);
  });
});

describe("격리된 delivery", () => {
  it("격리된 delivery는 claim되지 않고 점검에 보이며, 같은 문서의 새 표시는 새 예산으로 다시 전달 가능하게 한다", async () => {
    const f = await setUp();
    await mark(f, ["a", "b"]);
    const worker = workerPool();
    const token = randomUUID();
    const claimed = await f.store.claim(worker, {
      targetIds: [f.target.targetId],
      limit: 10,
      leaseToken: token,
      leaseMs: LONG_LEASE_MS,
    });
    expect(claimed.map((row) => row.documentId)).toEqual(["a", "b"]);
    const [a, b] = claimed;
    expect(
      (
        await classify(f, worker, token, [
          failure(a, 1, "poison", 0, { class: "rejected", status: 400 }),
          failure(b, 1, "retry", 600_000),
        ])
      )
        .map((row) => [row.documentId, row.outcome])
        .toSorted(),
    ).toEqual([
      ["a", "quarantined"],
      ["b", "retry_scheduled"],
    ]);
    await claimNothing(f, worker);

    const quarantined = await inspectIndex(h);
    expect(quarantined.openBuild?.newTarget).toMatchObject({ pending: 1, quarantined: 1 });

    await mark(f, ["a"]);
    const remarked = await inspectIndex(h);
    expect(remarked.openBuild?.newTarget).toMatchObject({ pending: 2, quarantined: 0 });

    const again = await claimOne(f, worker);
    expect(again.claimed).toMatchObject({ documentId: "a", claimedRevision: 2 });
    expect(await classify(f, worker, again.token, [failure(again.claimed, 2)])).toEqual([
      expect.objectContaining({ outcome: "retry_scheduled", attempts: 1 }),
    ]);
    expect(await only()).toMatchObject({ quarantined_revision: null, failure_revision: 2 });
  });
});

describe("입력 검증", () => {
  it("실패 집계와 반납은 잘못된 입력을 문장 전에 거부한다", async () => {
    const f = await setUp();
    const worker = workerPool();
    const key = { targetId: f.target.targetId, documentId: "a", intentId: randomUUID() };
    const cases = [
      () =>
        f.store.classifyFailures(worker, {
          leaseToken: randomUUID(),
          items: [
            { ...key, materializedRevision: 1, mode: "retry", delayMs: -1, error: TRANSIENT },
          ],
          ...LIMITS,
        }),
      () =>
        f.store.classifyFailures(worker, {
          leaseToken: randomUUID(),
          items: [
            {
              ...key,
              materializedRevision: 1,
              mode: "retry",
              delayMs: 0,
              error: { class: "Connection reset by peer, see log" },
            },
          ],
          ...LIMITS,
        }),
      () =>
        f.store.classifyFailures(worker, {
          leaseToken: randomUUID(),
          items: [
            {
              ...key,
              materializedRevision: 1,
              mode: "retry",
              delayMs: 0,
              error: { class: "x", padding: "p".repeat(2_000) },
            },
          ],
          ...LIMITS,
        }),
      () =>
        f.store.classifyFailures(worker, {
          leaseToken: randomUUID(),
          items: [
            failure({ ...key, claimedRevision: 1 }, 1),
            failure({ ...key, claimedRevision: 1 }, 1),
          ],
          ...LIMITS,
        }),
      () =>
        f.store.release(worker, {
          leaseToken: "not-a-token",
          items: [{ ...key, revision: 1, delayMs: 0, error: null }],
        }),
    ];
    for (const call of cases) {
      await expect(call()).rejects.toMatchObject({
        code: "SEARCH_CONFIGURATION_ERROR",
        retryable: false,
        details: { reason: expect.stringMatching(/^(invalid|duplicate)-delivery(-input)?$/) },
      });
    }
  });
});
