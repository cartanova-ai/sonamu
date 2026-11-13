import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { describe, expect, it } from "vitest";

import { SearchConfigurationError } from "../../../src/errors";
import { createDeliveryStore, type DeliveryKey } from "../../../src/postgres/delivery-store";
import {
  DELIVERY_KEY,
  type DeliveryFixture,
  LONG_LEASE_MS,
  useDeliveryFixture,
} from "../../helpers/delivery-fixture";
import { useIntegrationHarness } from "../../helpers/harness";
import { sql } from "../../helpers/sql";

/**
 * The worker delivery store. Store calls run as the worker role and domain marking as the capture role, both granted
 * by applySearchGrants, so a missing privilege surfaces here as 42501.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const fixture = useDeliveryFixture(h);
const { workerPool, setUp, mark, table, intents, runtimes, waitForExpiry } = fixture;
const KEY = DELIVERY_KEY;
type Fixture = DeliveryFixture;

const key = (f: Fixture, documentId: string, intentId: string): DeliveryKey => ({
  targetId: f.target.targetId,
  documentId,
  intentId,
});

const strip = ({ targetId, documentId, intentId }: DeliveryKey): DeliveryKey => ({
  targetId,
  documentId,
  intentId,
});

async function leaseExpiry(token: string): Promise<string[]> {
  const { rows } = await h.knex.raw<{ rows: { expires: string }[] }>(
    sql`SELECT (extract(epoch FROM lease_expires_at) * 1000000)::bigint::text AS expires FROM ${table("delivery_runtime")} WHERE lease_token = ? ORDER BY document_id COLLATE "C"`,
    [token],
  );
  return rows.map((row) => row.expires);
}

describe("claim 가능한 대상 목록과 대상 적격성", () => {
  it("등록된 active 대상만 돌려주고, 일시 정지된 대상은 대상 목록, claim, heartbeat에서 모두 빠진다", async () => {
    const f = await setUp();
    const worker = workerPool();
    expect(await f.store.listClaimableTargets(worker, h.namespace)).toEqual([
      {
        targetId: f.target.targetId,
        definition: KEY,
        fingerprint: "a".repeat(64),
        hashVersion: "sonamu-c14n-v1",
        physicalIndex: f.target.physicalIndex,
        writeAlias: f.target.writeAlias,
        captureEpoch: 1,
      },
    ]);
    await mark(f, ["a", "b"]);
    const token = randomUUID();
    const claimed = await f.store.claim(worker, {
      targetIds: [f.target.targetId],
      limit: 1,
      leaseToken: token,
      leaseMs: LONG_LEASE_MS,
    });
    expect(claimed.map((row) => row.documentId)).toEqual(["a"]);

    expect(
      await f.store.pauseTarget(worker, {
        targetId: f.target.targetId,
        reason: { class: "write_alias_missing" },
      }),
    ).toBe(true);
    expect(await f.store.listClaimableTargets(worker, h.namespace)).toEqual([]);
    expect(
      await f.store.claim(worker, {
        targetIds: [f.target.targetId],
        limit: 10,
        leaseToken: randomUUID(),
        leaseMs: LONG_LEASE_MS,
      }),
    ).toEqual([]);
    const before = await leaseExpiry(token);
    expect(
      await f.store.heartbeat(worker, {
        leaseToken: token,
        deliveries: claimed,
        leaseMs: LONG_LEASE_MS * 2,
      }),
    ).toEqual([]);
    expect(await leaseExpiry(token)).toEqual(before);
  });
});

describe("claim", () => {
  it("enqueued_at 순서로 limit만큼 잡고, 살아 있는 임대는 다시 잡지 않으며 intent 행을 갱신하지 않는다", async () => {
    const f = await setUp();
    const worker = workerPool();
    for (const id of ["c", "a", "b"]) await mark(f, [id]);
    const before = await intents();
    const claim = (limit: number) =>
      f.store.claim(worker, {
        targetIds: [f.target.targetId],
        limit,
        leaseToken: randomUUID(),
        leaseMs: LONG_LEASE_MS,
      });

    const first = await claim(2);
    // Selection follows enqueued_at (c, a); the returned rows follow insert order (target_id, document_id).
    expect(first.map((row) => [row.documentId, row.claimedRevision])).toEqual([
      ["a", 1],
      ["c", 1],
    ]);
    expect(first.map((row) => row.intentId)).toEqual([
      before.find((row) => row.document_id === "a")?.intent_id,
      before.find((row) => row.document_id === "c")?.intent_id,
    ]);
    expect((await claim(10)).map((row) => row.documentId)).toEqual(["b"]);
    expect(await claim(10)).toEqual([]);
    // Unchanged row versions: the claim locked the intents without updating them.
    expect(await intents()).toEqual(before);
    expect((await runtimes()).map((row) => [row.document_id, row.live])).toEqual([
      ["a", true],
      ["b", true],
      ["c", true],
    ]);
  });

  it("두 워커가 동시에 claim해도 같은 delivery를 함께 잡지 않는다", async () => {
    const f = await setUp();
    const workers = [workerPool(), workerPool()];
    let total = 0;
    for (let round = 0; round < 5; round += 1) {
      const ids = Array.from(
        { length: 40 },
        (_, index) => `r${round}-${String(index).padStart(2, "0")}`,
      );
      await mark(f, ids);
      const tokens = [randomUUID(), randomUUID()];
      const results = await Promise.all(
        workers.map((worker, index) =>
          f.store.claim(worker, {
            targetIds: [f.target.targetId],
            limit: 25,
            leaseToken: tokens[index],
            leaseMs: LONG_LEASE_MS,
          }),
        ),
      );
      const claimedIds = results.flat().map((row) => row.documentId);
      expect(new Set(claimedIds).size).toBe(claimedIds.length);
      // Leftovers from earlier rounds are claimed first, so compare against all live leases.
      total += claimedIds.length;
      const leased = (await runtimes()).filter((row) => row.live);
      expect(leased).toHaveLength(total);
      for (const [index, rows] of results.entries()) {
        for (const row of rows) {
          expect(leased.find((entry) => entry.document_id === row.documentId)?.lease_token).toBe(
            tokens[index],
          );
        }
      }
    }
  });
});

describe("heartbeat", () => {
  it("자기 토큰의 임대만 연장하고 다른 토큰으로는 아무것도 바꾸지 않는다", async () => {
    const f = await setUp();
    const worker = workerPool();
    await mark(f, ["a", "b"]);
    const token = randomUUID();
    const claimed = await f.store.claim(worker, {
      targetIds: [f.target.targetId],
      limit: 10,
      leaseToken: token,
      leaseMs: 60_000,
    });
    const before = await intents();
    const expiry = await leaseExpiry(token);

    expect(
      await f.store.heartbeat(worker, {
        leaseToken: randomUUID(),
        deliveries: claimed,
        leaseMs: LONG_LEASE_MS,
      }),
    ).toEqual([]);
    expect(await leaseExpiry(token)).toEqual(expiry);

    const extended = await f.store.heartbeat(worker, {
      leaseToken: token,
      deliveries: claimed,
      leaseMs: LONG_LEASE_MS,
    });
    expect(extended).toEqual(
      claimed.map(({ targetId, documentId, intentId }) => ({ targetId, documentId, intentId })),
    );
    const after = await leaseExpiry(token);
    expect(after.map(BigInt).every((value, index) => value > BigInt(expiry[index]))).toBe(true);
    expect(await f.store.leasedBy(worker, token)).toHaveLength(2);
    expect(await intents()).toEqual(before);
  });
});

describe("확인", () => {
  it("원하는 리비전까지 색인했으면 런타임과 intent를 지우고, 더 새 리비전이 있으면 런타임만 전진한다", async () => {
    const f = await setUp();
    const worker = workerPool();
    await mark(f, ["a", "b"]);
    const token = randomUUID();
    const claimed = await f.store.claim(worker, {
      targetIds: [f.target.targetId],
      limit: 10,
      leaseToken: token,
      leaseMs: LONG_LEASE_MS,
    });
    await mark(f, ["b"]);
    const before = await intents();

    const acknowledged = await f.store.acknowledge(worker, {
      leaseToken: token,
      items: claimed.map((row) => ({ ...row, materializedRevision: 1 })),
    });
    expect(acknowledged.map((row) => [row.documentId, row.outcome]).toSorted()).toEqual([
      ["a", "deleted"],
      ["b", "advanced"],
    ]);
    // b keeps the same incarnation and row version: acknowledge never updates an intent.
    expect(await intents()).toEqual(before.filter((row) => row.document_id === "b"));
    expect(await runtimes()).toEqual([
      expect.objectContaining({ document_id: "b", applied_revision: 1, lease_token: null }),
    ]);
    const again = await f.store.claim(worker, {
      targetIds: [f.target.targetId],
      limit: 10,
      leaseToken: randomUUID(),
      leaseMs: LONG_LEASE_MS,
    });
    expect(again.map((row) => [row.documentId, row.claimedRevision])).toEqual([["b", 2]]);
  });

  it("교체된 토큰이나 다시 만들어진 incarnation에 대한 확인과 heartbeat는 아무것도 바꾸지 않는다", async () => {
    const f = await setUp();
    const first = workerPool();
    const second = workerPool();
    await mark(f, ["a"]);
    const claimOn = (worker: Knex, token: string, leaseMs = LONG_LEASE_MS) =>
      f.store.claim(worker, {
        targetIds: [f.target.targetId],
        limit: 10,
        leaseToken: token,
        leaseMs,
      });

    // Stale token: the lease expired and another worker claimed again.
    const oldToken = randomUUID();
    const [old] = await claimOn(first, oldToken, 50);
    await waitForExpiry(oldToken);
    const replacedToken = randomUUID();
    const [replaced] = await claimOn(second, replacedToken);
    expect(replaced.intentId).toBe(old.intentId);
    expect(
      await f.store.acknowledge(first, {
        leaseToken: oldToken,
        items: [{ ...old, materializedRevision: 1 }],
      }),
    ).toEqual([]);
    expect(await intents()).toHaveLength(1);
    expect(await runtimes()).toEqual([
      expect.objectContaining({ lease_token: replacedToken, live: true }),
    ]);

    // New incarnation: deleted by acknowledge, then a new mark creates a new intent_id.
    expect(
      await f.store.acknowledge(second, {
        leaseToken: replacedToken,
        items: [{ ...replaced, materializedRevision: 1 }],
      }),
    ).toEqual([expect.objectContaining({ outcome: "deleted" })]);
    await mark(f, ["a"]);
    const newToken = randomUUID();
    const [fresh] = await claimOn(second, newToken);
    expect(fresh.intentId).not.toBe(old.intentId);
    const before = { intents: await intents(), runtimes: await runtimes() };

    const staleCalls = [
      f.store.acknowledge(first, {
        leaseToken: replacedToken,
        items: [{ ...replaced, materializedRevision: 5 }],
      }),
      f.store.acknowledge(first, {
        leaseToken: replacedToken,
        items: [{ ...key(f, "a", fresh.intentId), materializedRevision: 5 }],
      }),
      f.store.acknowledge(first, {
        leaseToken: newToken,
        items: [{ ...key(f, "a", old.intentId), materializedRevision: 5 }],
      }),
      f.store.heartbeat(first, {
        leaseToken: replacedToken,
        deliveries: [key(f, "a", fresh.intentId)],
        leaseMs: 1,
      }),
      f.store.heartbeat(first, {
        leaseToken: newToken,
        deliveries: [key(f, "a", old.intentId)],
        leaseMs: 1,
      }),
    ];
    for (const call of staleCalls) expect(await call).toEqual([]);
    expect({ intents: await intents(), runtimes: await runtimes() }).toEqual(before);
    expect(before.runtimes).toEqual([
      expect.objectContaining({
        intent_id: fresh.intentId,
        lease_token: newToken,
        claimed_revision: 2,
        live: true,
      }),
    ]);
  });
});

describe("임대 만료", () => {
  it("만료됐지만 아무도 다시 잡지 않은 임대는 아직 원래 토큰의 것이라 heartbeat가 연장하고, 그 뒤의 claim은 가져가지 못한다", async () => {
    const f = await setUp();
    const holder = workerPool();
    const other = workerPool();
    await mark(f, ["a"]);
    const token = randomUUID();
    const [claimed] = await f.store.claim(holder, {
      targetIds: [f.target.targetId],
      limit: 10,
      leaseToken: token,
      leaseMs: 50,
    });
    await waitForExpiry(token);
    // Heartbeat fences by token, not by expiry time; a lease is lost only once the token is gone.
    expect(
      await f.store.heartbeat(holder, {
        leaseToken: token,
        deliveries: [claimed],
        leaseMs: LONG_LEASE_MS,
      }),
    ).toHaveLength(1);
    expect(
      await f.store.claim(other, {
        targetIds: [f.target.targetId],
        limit: 10,
        leaseToken: randomUUID(),
        leaseMs: LONG_LEASE_MS,
      }),
    ).toEqual([]);
    expect(await runtimes()).toEqual([expect.objectContaining({ lease_token: token, live: true })]);
  });
});

describe("돌아오지 않은 행의 분류", () => {
  it("돌아오지 않은 행을 임대 상실(토큰 없음)과 잠겨서 건너뜀(토큰 남음)으로 가른다", async () => {
    const f = await setUp();
    const holder = workerPool();
    const reclaimer = workerPool();
    await mark(f, ["a", "b"]);
    const token = randomUUID();
    const claimed = await f.store.claim(holder, {
      targetIds: [f.target.targetId],
      limit: 10,
      leaseToken: token,
      leaseMs: 50,
    });
    await waitForExpiry(token);
    // a is reclaimed by another worker; b's runtime row is locked by another transaction (a marker holding only the
    // intent would not make acknowledge skip the row). Reclaim first: the claim's ON CONFLICT would wait on b's lock.
    const reclaimed = await f.store.claim(reclaimer, {
      targetIds: [f.target.targetId],
      limit: 1,
      leaseToken: randomUUID(),
      leaseMs: LONG_LEASE_MS,
    });
    expect(reclaimed.map((row) => row.documentId)).toEqual(["a"]);
    const runtimeHolder = await h.knex.transaction();
    try {
      await runtimeHolder.raw(
        sql`SELECT 1 FROM ${table("delivery_runtime")} WHERE document_id = 'b' FOR UPDATE`,
      );
      const acknowledged = await f.store.acknowledge(holder, {
        leaseToken: token,
        items: claimed.map((row) => ({ ...row, materializedRevision: 1 })),
      });
      expect(acknowledged).toEqual([]);
      expect(await f.store.classifyUnreturned(holder, token, claimed, acknowledged)).toEqual({
        leaseLost: claimed.filter((row) => row.documentId === "a").map(strip),
        skippedLocked: claimed.filter((row) => row.documentId === "b").map(strip),
      });
      expect(await f.store.leasedBy(holder, token)).toEqual(
        claimed.filter((row) => row.documentId === "b").map(strip),
      );
    } finally {
      await runtimeHolder.commit();
    }
  });
});

describe("원장 읽기", () => {
  it("요청한 ID 중 원장에 있는 것의 리비전만 돌려준다", async () => {
    const f = await setUp();
    const worker = workerPool();
    await mark(f, ["a", "b"]);
    await mark(f, ["a"]);
    const ledger = await f.store.readLedger(worker, {
      namespace: h.namespace,
      definition: KEY,
      documentIds: ["a", "b", "missing"],
    });
    expect(
      ledger.toSorted((left, right) => left.documentId.localeCompare(right.documentId)),
    ).toEqual([
      { documentId: "a", revision: 2 },
      { documentId: "b", revision: 1 },
    ]);
  });
});

describe("입력 검증", () => {
  it("잘못된 입력은 문장을 보내기 전에 SearchConfigurationError로 거부한다", async () => {
    const store = createDeliveryStore({ schema: h.searchSchema });
    const target = randomUUID();
    const item = { targetId: target, documentId: "a", intentId: randomUUID() };
    const attempts = [
      store.claim(h.knex, { targetIds: [target], limit: 1, leaseToken: randomUUID(), leaseMs: 0 }),
      store.claim(h.knex, { targetIds: [target], limit: 1, leaseToken: "not-a-uuid", leaseMs: 1 }),
      store.heartbeat(h.knex, { leaseToken: randomUUID(), deliveries: [item, item], leaseMs: 1 }),
      store.acknowledge(h.knex, {
        leaseToken: randomUUID(),
        items: [{ ...item, materializedRevision: 0 }],
      }),
      store.readLedger(h.knex, { namespace: h.namespace, definition: KEY, documentIds: [""] }),
    ];
    for (const attempt of attempts) {
      const error = await attempt.catch((caught: Error) => caught);
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error).toMatchObject({
        retryable: false,
        details: { reason: expect.stringMatching(/^(invalid-delivery-input|duplicate-delivery)$/) },
      });
    }
  });
});
