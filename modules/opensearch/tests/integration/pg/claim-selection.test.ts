import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { renderDeliveryStatements } from "../../../src/postgres/delivery-store";
import { renderSql, schemaIdentifier } from "../../../src/postgres/sql";
import {
  type DeliveryFixture,
  LONG_LEASE_MS,
  useDeliveryFixture,
} from "../../helpers/delivery-fixture";
import { useIntegrationHarness } from "../../helpers/harness";
import { type PgSession } from "../../helpers/pg-sessions";
import { identifier, quoteIdentifier, sql } from "../../helpers/sql";
import { createTarget, type PreparedTarget } from "../../helpers/test-targets";

/**
 * Claim selection. The claim statement reads intents without a runtime row (in index order) and claimable intents
 * with a runtime row separately and merges them on the same key, so it never scans or sorts the whole backlog.
 * The single-pass statement it replaced is kept here as an oracle: for every limit both must claim the same rows,
 * which also proves the same order. Both run as the worker role inside rolled-back transactions.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const fixture = useDeliveryFixture(h);
const { setUp, mark, table, workerPool } = fixture;

// Single-pass claim statement used as the selection oracle; <s> is replaced with the quoted schema.
const PREVIOUS_CLAIM = `WITH picked AS MATERIALIZED (
  SELECT d.target_id, d.document_id, d.intent_id, d.desired_revision
  FROM <s>.deliveries d
  JOIN <s>.targets t ON t.target_id = d.target_id
  JOIN <s>.indexes i ON i.namespace = t.namespace AND i.definition = t.definition
  LEFT JOIN <s>.delivery_runtime r
    ON r.target_id = d.target_id AND r.document_id = d.document_id AND r.intent_id = d.intent_id
  WHERE d.target_id = ANY($1::uuid[])
    AND t.state = 'active' AND t.write_enabled
    AND i.capture_mode = 'active' AND t.capture_epoch = i.capture_epoch
    AND (r.lease_expires_at IS NULL OR r.lease_expires_at <= clock_timestamp())
    AND d.desired_revision > COALESCE(r.applied_revision, 0)
    AND (r.quarantined_revision IS NULL OR r.quarantined_revision < d.desired_revision)
    AND (r.available_revision IS NULL OR r.available_revision < d.desired_revision OR r.available_at <= clock_timestamp())
  ORDER BY GREATEST(d.enqueued_at, COALESCE(r.claim_started_at, d.enqueued_at)), d.target_id, d.document_id
  LIMIT $2
  FOR UPDATE OF d SKIP LOCKED
)
INSERT INTO <s>.delivery_runtime AS r
  (target_id, document_id, intent_id, claimed_revision, lease_token, lease_expires_at, claim_started_at)
SELECT p.target_id, p.document_id, p.intent_id, p.desired_revision, $3::uuid,
       clock_timestamp() + ($4::bigint * interval '1 millisecond'), clock_timestamp()
FROM picked p
ORDER BY p.target_id, p.document_id
ON CONFLICT (target_id, document_id, intent_id) DO UPDATE
SET claimed_revision = EXCLUDED.claimed_revision, lease_token = EXCLUDED.lease_token,
    lease_expires_at = EXCLUDED.lease_expires_at, claim_started_at = EXCLUDED.claim_started_at,
    updated_at = clock_timestamp()
WHERE (r.lease_expires_at IS NULL OR r.lease_expires_at <= clock_timestamp())
  AND EXCLUDED.claimed_revision > r.applied_revision
  AND (r.quarantined_revision IS NULL OR r.quarantined_revision < EXCLUDED.claimed_revision)
  AND (r.available_revision < EXCLUDED.claimed_revision OR r.available_at <= clock_timestamp())
RETURNING r.target_id, r.document_id, r.intent_id, r.claimed_revision, r.attempts, r.failure_revision;`;

const previousClaim = () => PREVIOUS_CLAIM.replaceAll("<s>", quoteIdentifier(h.searchSchema));
const currentClaim = () =>
  renderSql(renderDeliveryStatements(schemaIdentifier(h.searchSchema)).claim);

type Claimed = { target_id: string; document_id: string; claimed_revision: string | number };

/** Runs a claim statement as the worker role and rolls back; returns "document@revision" sorted. */
async function claimRolledBack(
  session: PgSession,
  text: string,
  targetIds: readonly string[],
  limit: number,
): Promise<string[]> {
  await session.run("BEGIN");
  try {
    const result = await session.run<Claimed>(text, [
      [...targetIds],
      limit,
      randomUUID(),
      LONG_LEASE_MS,
    ]);
    return result.rows
      .map((row) => `${row.document_id}@${Number(row.claimed_revision)}`)
      .toSorted();
  } finally {
    await session.run("ROLLBACK");
  }
}

async function workerSession(label: string): Promise<PgSession> {
  const { sessions } = await h.openSessions([label]);
  const session = sessions[label];
  await session.run(sql`SET ROLE ${identifier(fixture.workerRole().name)}`);
  return session;
}

async function addTarget(logicalKey: string): Promise<PreparedTarget> {
  return createTarget(fixture.admin().run, {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey,
  });
}

type Intent = {
  target: string;
  id: string;
  /** Minutes after the base time. */
  at: number;
  desired?: number;
  runtime?: {
    lease?: "live" | "expired";
    /** Minutes after the base time of the last claim. */
    claimedAt?: number;
    applied?: number;
    quarantined?: number;
    /** Revisions up to this one wait for available_at, an hour ahead. */
    delayedRevision?: number;
  };
};

/** Inserts intents and runtime rows as superuser; times are a day back and an hour away from any clock boundary. */
async function load(intents: readonly Intent[]): Promise<void> {
  for (const intent of intents) {
    await h.knex.raw(
      sql`INSERT INTO ${table("deliveries")} (target_id, document_id, desired_revision, enqueued_at)
VALUES (?, ?, ?, now() - interval '1 day' + (? * interval '1 minute'))`,
      [intent.target, intent.id, intent.desired ?? 1, intent.at],
    );
    const runtime = intent.runtime;
    if (runtime === undefined) continue;
    const lease = runtime.lease;
    await h.knex.raw(
      sql`INSERT INTO ${table("delivery_runtime")}
  (target_id, document_id, intent_id, claimed_revision, applied_revision, quarantined_revision,
   lease_token, lease_expires_at, claim_started_at, available_revision, available_at)
SELECT d.target_id, d.document_id, d.intent_id, d.desired_revision, ?, ?,
       CASE WHEN ?::text IS NULL THEN NULL ELSE gen_random_uuid() END,
       CASE ?::text WHEN 'live' THEN now() + interval '1 hour' WHEN 'expired' THEN now() - interval '1 hour' END,
       CASE WHEN ?::float8 IS NULL THEN NULL ELSE now() - interval '1 day' + (?::float8 * interval '1 minute') END,
       ?, CASE WHEN ?::bigint IS NULL THEN now() - interval '1 hour' ELSE now() + interval '1 hour' END
FROM ${table("deliveries")} d WHERE d.target_id = ? AND d.document_id = ?`,
      [
        runtime.applied ?? 0,
        runtime.quarantined ?? null,
        lease ?? null,
        lease ?? null,
        runtime.claimedAt ?? null,
        runtime.claimedAt ?? null,
        runtime.delayedRevision ?? 0,
        runtime.delayedRevision ?? null,
        intent.target,
        intent.id,
      ],
    );
  }
}

describe("claim 선택: 예전 문장과의 차등 검사", () => {
  it("섞인 상태(런타임 없음, 임대 중, 만료된 임대, 지연, 격리, 이미 적용, 두 대상, 부적격 대상)에서 모든 한도에 대해 예전 문장과 같은 행을 같은 순서로 claim한다", async () => {
    const f = await setUp();
    const a = f.target.targetId;
    const b = (await addTarget("second")).targetId;
    const c = (await addTarget("third")).targetId;
    await h.knex.raw(
      sql`UPDATE ${table("targets")} SET write_enabled = false WHERE target_id = ?`,
      [c],
    );
    await load([
      { target: a, id: "a01", at: 1 },
      { target: a, id: "a02", at: 3 },
      { target: a, id: "a03", at: 5 },
      { target: a, id: "a04", at: 10 },
      { target: a, id: "a05", at: 12 },
      { target: a, id: "a06", at: 20 },
      // Live lease: excluded.
      { target: a, id: "a07", at: 2, runtime: { lease: "live", claimedAt: 2 } },
      // Expired leases sort by their last claim time.
      { target: a, id: "a08", at: 4, runtime: { lease: "expired", claimedAt: 30 } },
      { target: a, id: "a09", at: 6, runtime: { lease: "expired", claimedAt: 7 } },
      // Delayed revision: excluded; a newer revision does not wait for the delay.
      { target: a, id: "a10", at: 8, desired: 2, runtime: { delayedRevision: 2 } },
      { target: a, id: "a11", at: 9, desired: 3, runtime: { delayedRevision: 2 } },
      // Quarantined revision: excluded; a newer revision is claimable.
      { target: a, id: "a12", at: 11, desired: 2, runtime: { quarantined: 2 } },
      { target: a, id: "a13", at: 13, desired: 3, runtime: { quarantined: 2 } },
      // Already applied: excluded; an advanced runtime with a newer revision sorts by its last claim time.
      { target: a, id: "a14", at: 14, desired: 2, runtime: { applied: 2 } },
      { target: a, id: "a15", at: 15, desired: 3, runtime: { applied: 2, claimedAt: 50 } },
      { target: b, id: "b01", at: 0.5 },
      { target: b, id: "b02", at: 3.5 },
      { target: b, id: "b03", at: 11.5 },
      { target: b, id: "b04", at: 25 },
      { target: b, id: "b05", at: 2.5, runtime: { lease: "expired", claimedAt: 40 } },
      // Ineligible target: excluded even though oldest.
      { target: c, id: "c01", at: 0.1 },
      { target: c, id: "c02", at: 0.2 },
    ]);
    const expectedOrder = [
      "b01@1",
      "a01@1",
      "a02@1",
      "b02@1",
      "a03@1",
      "a09@1",
      "a11@3",
      "a04@1",
      "b03@1",
      "a05@1",
      "a13@3",
      "a06@1",
      "b04@1",
      "a08@1",
      "b05@1",
      "a15@3",
    ];

    const session = await workerSession("oracle");
    const targets = [a, b, c];
    for (let limit = 1; limit <= expectedOrder.length + 2; limit += 1) {
      const before = await claimRolledBack(session, previousClaim(), targets, limit);
      const after = await claimRolledBack(session, currentClaim(), targets, limit);
      expect({ limit, rows: after }).toEqual({ limit, rows: before });
      expect(after).toEqual(expectedOrder.slice(0, limit).toSorted());
    }

    const batch = await f.store.claimBatch(workerPool(), {
      targetIds: targets,
      limit: 5,
      leaseToken: randomUUID(),
      leaseMs: LONG_LEASE_MS,
    });
    expect(batch.rows.map((row) => `${row.documentId}@${row.claimedRevision}`).toSorted()).toEqual(
      expectedOrder.slice(0, 5).toSorted(),
    );
    // Candidates are bounded at twice the limit.
    expect(batch.candidates).toBe(10);
  });
});

describe("claim 선택: 마커가 잡은 후보", () => {
  /** Marks one document at a time so enqueued_at order equals name order. */
  async function markInOrder(f: DeliveryFixture, count: number): Promise<string[]> {
    const ids = Array.from({ length: count }, (_, index) => `d${String(index).padStart(2, "0")}`);
    for (const id of ids) await mark(f, [id]);
    return ids;
  }

  /** Leaves a marker transaction open after re-marking ids, holding their intent rows until commit. */
  async function holdMarker(f: DeliveryFixture, ids: readonly string[]) {
    const trx = await f.capture.transaction();
    expect(await f.sync.markChanged(trx, fixture.key, ids)).toBe("recorded");
    return trx;
  }

  it("후보 안에서 한도보다 많이 잠겨 있으면 짧은 claim이 되고 candidates가 그것을 드러내며, 잠금이 풀리면 다음 claim들이 아무것도 빠뜨리지 않는다", async () => {
    const f = await setUp();
    const ids = await markInOrder(f, 10);
    // With limit 3 the candidates are d00..d05; four of them are locked.
    const marker = await holdMarker(f, ["d00", "d01", "d02", "d03"]);
    const session = await workerSession("short");
    const before = await claimRolledBack(session, previousClaim(), [f.target.targetId], 3);
    // The single-pass statement keeps scanning past the locked rows to fill the limit.
    expect(before).toEqual(["d04@1", "d05@1", "d06@1"]);

    const worker = workerPool();
    const claimInput = () => ({
      targetIds: [f.target.targetId],
      limit: 3,
      leaseToken: randomUUID(),
      leaseMs: LONG_LEASE_MS,
    });
    const short = await f.store.claimBatch(worker, claimInput());
    expect(short.rows.map((row) => row.documentId)).toEqual(["d04", "d05"]);
    expect(short.candidates).toBe(6);
    expect(short.candidates).toBeGreaterThan(short.rows.length);

    // Later claims still progress while the rows stay locked.
    const next = await f.store.claimBatch(worker, claimInput());
    expect(next.rows.map((row) => row.documentId)).toEqual(["d06", "d07"]);
    const third = await f.store.claimBatch(worker, claimInput());
    expect(third.rows.map((row) => row.documentId)).toEqual(["d08", "d09"]);
    // Every remaining candidate is locked: nothing is claimed and no candidate count is returned.
    expect(await f.store.claimBatch(worker, claimInput())).toEqual({ rows: [], candidates: 0 });

    // After the marker commits the four are claimed at the new revision; no document is skipped for good.
    await marker.commit();
    const released = await f.store.claimBatch(worker, { ...claimInput(), limit: 10 });
    expect(released.rows.map((row) => `${row.documentId}@${row.claimedRevision}`)).toEqual([
      "d00@2",
      "d01@2",
      "d02@2",
      "d03@2",
    ]);
    const claimedAll = [short, next, third, released].flatMap((batch) =>
      batch.rows.map((row) => row.documentId),
    );
    expect(claimedAll.toSorted()).toEqual(ids);
  });
});

type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Sort Method"?: string;
  Plans?: PlanNode[];
};

function walk(node: PlanNode, visit: (node: PlanNode) => void): void {
  visit(node);
  for (const child of node.Plans ?? []) walk(child, visit);
}

/** Rows a node actually produced, across loops. */
const produced = (node: PlanNode) => (node["Actual Rows"] ?? 0) * (node["Actual Loops"] ?? 1);

describe("claim 선택: 비용 가드", () => {
  const BACKLOG = 200_000;
  const LIMIT = 500;

  it("20만 intent의 backlog에서 claim은 deliveries를 순차 스캔하지 않고 backlog 전체를 정렬하지 않는다 (ANALYZE 뒤). 통계가 없을 때도 순차 스캔과 디스크 정렬은 없다", async () => {
    const f = await setUp();
    const a = f.target.targetId;
    const b = (await addTarget("second")).targetId;
    const deliveries = table("deliveries");
    const runtime = table("delivery_runtime");
    // Target a: 200,000 intents; the oldest 2,000 quarantined, the next 2,000 leased, the next 1,000 expired leases.
    await h.knex.raw(
      sql`INSERT INTO ${deliveries} (target_id, document_id, desired_revision, enqueued_at)
SELECT ?, 'doc-' || lpad(g::text, 7, '0'), 1, now() - interval '2 days' + g * interval '100 milliseconds'
FROM generate_series(1, ?) AS g`,
      [a, BACKLOG],
    );
    await h.knex.raw(
      sql`INSERT INTO ${deliveries} (target_id, document_id, desired_revision, enqueued_at)
SELECT ?, 'doc-' || g, 1, now() - interval '3 days' + g * interval '1 hour' FROM generate_series(1, 5) AS g`,
      [b],
    );
    await h.knex.raw(
      sql`INSERT INTO ${runtime} (target_id, document_id, intent_id, claimed_revision, quarantined_revision,
  lease_token, lease_expires_at, claim_started_at)
SELECT d.target_id, d.document_id, d.intent_id, 1,
       CASE WHEN g <= 2000 THEN 1 END,
       CASE WHEN g > 2000 THEN gen_random_uuid() END,
       CASE WHEN g > 4000 THEN now() - interval '1 hour' WHEN g > 2000 THEN now() + interval '1 hour' END,
       CASE WHEN g > 2000 THEN now() - interval '1 hour' END
FROM generate_series(1, 5000) AS g
JOIN ${deliveries} d ON d.target_id = ? AND d.document_id = 'doc-' || lpad(g::text, 7, '0')`,
      [a],
    );

    const session = await workerSession("cost");
    const explain = async (text: string) => {
      await session.run("BEGIN");
      try {
        const result = await session.run<{
          "QUERY PLAN": [{ Plan: PlanNode; "Execution Time": number }];
        }>(`EXPLAIN (ANALYZE, FORMAT JSON) ${text}`, [[a, b], LIMIT, randomUUID(), LONG_LEASE_MS]);
        return result.rows[0]["QUERY PLAN"][0];
      } finally {
        await session.run("ROLLBACK");
      }
    };
    const planCost = (plan: PlanNode) => {
      const seqScans: string[] = [];
      const sortMethods: string[] = [];
      let deliveryRows = 0;
      let largestSort = 0;
      walk(plan, (node) => {
        if (node["Relation Name"] === "deliveries") {
          if (node["Node Type"] === "Seq Scan") seqScans.push(node["Node Type"]);
          deliveryRows += produced(node);
        }
        if (node["Node Type"] === "Sort" || node["Node Type"] === "Incremental Sort") {
          if (node["Sort Method"] !== undefined) sortMethods.push(node["Sort Method"]);
          for (const child of node.Plans ?? [])
            largestSort = Math.max(largestSort, produced(child));
        }
      });
      return { seqScans, sortMethods, deliveryRows, largestSort };
    };
    const assertBoundedClaimPlan = (plan: PlanNode) => {
      const { seqScans, deliveryRows, largestSort } = planCost(plan);
      expect(seqScans).toEqual([]);
      // Sorts only see candidates (2 * LIMIT per branch) and claimable runtime rows (1,000 expired leases).
      expect(largestSort).toBeLessThanOrEqual(4 * LIMIT + 1_000);
      // Rows read from deliveries scale with the runtime prefix and the candidates, not with the backlog.
      expect(deliveryRows).toBeLessThan(BACKLOG / 10);
    };

    // Before autovacuum has statistics the planner may use a bitmap scan plus a top-N sort (in memory, proportional
    // to the backlog); a sequential scan or an on-disk sort is still not allowed.
    const unanalyzed = planCost((await explain(currentClaim())).Plan);
    expect(unanalyzed.seqScans).toEqual([]);
    expect(unanalyzed.sortMethods.filter((method) => method.startsWith("external"))).toEqual([]);
    await h.knex.raw(sql`ANALYZE ${deliveries}`);
    await h.knex.raw(sql`ANALYZE ${runtime}`);
    const analyzed = await explain(currentClaim());
    assertBoundedClaimPlan(analyzed.Plan);

    // The single-pass statement fails the same guard, which proves the guard catches the regression.
    const old = await explain(previousClaim());
    expect(() => assertBoundedClaimPlan(old.Plan)).toThrow();

    const before = await claimRolledBack(session, previousClaim(), [a, b], LIMIT);
    const after = await claimRolledBack(session, currentClaim(), [a, b], LIMIT);
    expect(after).toHaveLength(LIMIT);
    expect(after).toEqual(before);
  });
});
