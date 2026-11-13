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
import { cutoverStatementsFor } from "../../../src/admin/cutover";
import { inspectStatementsFor } from "../../../src/admin/search-admin";
import { createSearchClient, type SearchClient } from "../../../src/client/search-client";
import { SearchAdminPreconditionFailed } from "../../../src/errors";
import { createPostgresSynchronization } from "../../../src/postgres";
import { type SqlFragment, statement } from "../../../src/postgres/sql";
import { createTestDefinition, TEST_READ_LIFETIMES } from "../../../src/testing";
import { type TestRole, useIntegrationHarness } from "../../helpers/harness";
import { qualified, sql } from "../../helpers/sql";
import { createTarget, openAdminClient, resetSearchSchema } from "../../helpers/test-targets";

/**
 * Cost bounds of the admin path: inspect's backlog counts and the cutover blocking check must not do work
 * proportional to the backlog. Rows are counted from EXPLAIN ANALYZE plans, (emitted + filtered) times loops per node;
 * wall-clock time is not measured.
 */

const h = useIntegrationHarness({ sampleDomain: false });
const KEY = "messages";
const s = (name: string) => qualified(h.searchSchema, name);
const INTENTS = 20_000;
const QUARANTINED = 5;
const STALE_QUARANTINE = 3;
const LEASED = 10;
const DELAYED = 20;

const definition = createTestDefinition({
  key: KEY,
  schema: z.object({ body: z.string() }),
  properties: { body: { type: "text" } },
  documents: () => new Map(),
});

let adminRole: TestRole;
let adminKnex: Knex;
let searchClient: SearchClient;
let admin: SearchAdmin;
let targetId: string;

function auditOf(): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason: "bounded counts" };
}

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  const url = new URL(adminRole.url);
  url.searchParams.set("application_name", `h:${h.id}:admin`);
  adminKnex = knexFactory({ client: "pg", connection: url.toString(), pool: { min: 0, max: 4 } });
  // No remote request is expected; creating a client fails the test.
  searchClient = createSearchClient({
    createClient: () => {
      throw new Error("원격 요청이 없어야 합니다.");
    },
    ownsClient: false,
    requestTimeoutMs: 30_000,
  });
});

afterAll(async () => {
  await searchClient?.close();
  await adminKnex?.destroy();
});

function adminWith(maxPendingDocuments: number): SearchAdmin {
  return createSearchAdmin({
    client: searchClient,
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [definition],
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    timeouts: {
      lockTimeoutMs: 15_000,
      statementTimeoutMs: 20_000,
      idleInTransactionTimeoutMs: 60_000,
      adminLeaseMs: 120_000,
    },
    cutover: { maxPendingDocuments, sampleSize: 0 },
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 30_000 },
  });
}

beforeEach(async () => {
  await resetSearchSchema(h);
  await applySearchGrants(h.knex, { schema: h.searchSchema, roles: { admin: [adminRole.name] } });
  const client = await openAdminClient(h);
  try {
    const target = await createTarget(client.run, {
      schema: h.searchSchema,
      namespace: h.namespace,
      logicalKey: KEY,
      fingerprint: definition.fingerprint,
    });
    targetId = target.targetId;
  } finally {
    await client.close();
  }
  admin = adminWith(50);
});

/** INTENTS intents, 1,000 of them with runtime rows: 5 quarantined, 3 stale quarantines, 10 leased, 20 delayed. */
async function seedBacklog(): Promise<void> {
  await h.knex.raw(
    sql`INSERT INTO ${s("deliveries")} (target_id, document_id, desired_revision, enqueued_at)
SELECT ?, 'd' || lpad(g::text, 6, '0'), 2, clock_timestamp() - (g * interval '1 second') FROM generate_series(1, ?) AS g`,
    [targetId, INTENTS],
  );
  await h.knex.raw(
    sql`INSERT INTO ${s("delivery_runtime")} (target_id, document_id, intent_id, quarantined_revision, lease_token, lease_expires_at, available_at)
SELECT d.target_id, d.document_id, d.intent_id,
       CASE WHEN n <= ? THEN 2 WHEN n <= ? THEN 1 END,
       CASE WHEN n > 100 AND n <= 100 + ? THEN gen_random_uuid() END,
       CASE WHEN n > 100 AND n <= 100 + ? THEN clock_timestamp() + interval '1 hour' END,
       CASE WHEN n > 200 AND n <= 200 + ? THEN clock_timestamp() + interval '1 hour' ELSE clock_timestamp() END
FROM (SELECT target_id, document_id, intent_id, row_number() OVER (ORDER BY document_id DESC) AS n
      FROM ${s("deliveries")} WHERE target_id = ?) d
WHERE n <= 1000`,
    [QUARANTINED, QUARANTINED + STALE_QUARANTINE, LEASED, LEASED, DELAYED, targetId],
  );
  await h.knex.raw(sql`ANALYZE ${s("deliveries")}`);
  await h.knex.raw(sql`ANALYZE ${s("delivery_runtime")}`);
}

const planNodeSchema: z.ZodType<PlanNode> = z.lazy(() =>
  z.looseObject({
    "Relation Name": z.string().optional(),
    "Actual Rows": z.number(),
    "Actual Loops": z.number(),
    "Rows Removed by Filter": z.number().optional(),
    "Rows Removed by Index Recheck": z.number().optional(),
    Plans: z.array(planNodeSchema).optional(),
  }),
);
interface PlanNode {
  "Relation Name"?: string;
  "Actual Rows": number;
  "Actual Loops": number;
  "Rows Removed by Filter"?: number;
  "Rows Removed by Index Recheck"?: number;
  Plans?: PlanNode[];
}
const explainSchema = z.tuple([z.looseObject({ Plan: planNodeSchema })]);

/** Rows the plan actually visited per relation: (emitted + discarded) times loops. */
async function rowsVisited(fragment: SqlFragment, bindings: readonly (string | number | null)[]) {
  const { text } = statement(fragment, bindings);
  // Package statements use $n placeholders, so they run on a plain pg client rather than through Knex.
  const client = await openAdminClient(h, "explain");
  try {
    const result = await client.run<{ "QUERY PLAN": unknown }>(
      `EXPLAIN (ANALYZE, FORMAT JSON) ${text}`,
      [...bindings],
    );
    const [root] = explainSchema.parse(result.rows[0]?.["QUERY PLAN"]);
    const visited = new Map<string, number>();
    const walk = (node: PlanNode) => {
      const relation = node["Relation Name"];
      if (relation !== undefined) {
        const rows =
          (node["Actual Rows"] +
            (node["Rows Removed by Filter"] ?? 0) +
            (node["Rows Removed by Index Recheck"] ?? 0)) *
          node["Actual Loops"];
        visited.set(relation, (visited.get(relation) ?? 0) + rows);
      }
      for (const child of node.Plans ?? []) walk(child);
    };
    walk(root.Plan);
    return visited;
  } finally {
    await client.close();
  }
}

describe("관리 경로의 행 수 상한", () => {
  it("inspect의 수치 문장은 수치마다 limit행까지만 읽고, 비교 기준인 예전 문장은 대상의 모든 intent를 읽는다", async () => {
    await seedBacklog();
    const q = inspectStatementsFor(h.searchSchema);
    const before = await rowsVisited(q.countTargetLag, [targetId]);
    // The reference statement reads every intent, which shows the seed is large enough to tell the two apart.
    expect(before.get("deliveries") ?? 0).toBeGreaterThanOrEqual(INTENTS);
    const LIMIT = 100;
    const after = await rowsVisited(q.readTargetBacklog, [targetId, LIMIT]);
    // Each of the five counts reads at most LIMIT rows in index order plus as many primary-key probes.
    expect(after.get("deliveries") ?? 0).toBeLessThanOrEqual(4 * LIMIT);
    expect(after.get("delivery_runtime") ?? 0).toBeLessThanOrEqual(6 * LIMIT);
  });

  it("cutover 차단 판정은 대기를 maxPendingDocuments + 1에서 멈추고 격리는 존재만 본다", async () => {
    await seedBacklog();
    const q = cutoverStatementsFor(h.searchSchema);
    const m = 50;
    const visited = await rowsVisited(q.readCutoverBacklog, [targetId, m]);
    // m + 1 pending rows, the quarantined rows met on the way, and the candidates of the quarantine existence check.
    expect(visited.get("deliveries") ?? 0).toBeLessThanOrEqual(
      m + 1 + QUARANTINED + QUARANTINED + STALE_QUARANTINE,
    );
    expect(visited.get("delivery_runtime") ?? 0).toBeLessThanOrEqual(
      m + 1 + QUARANTINED + QUARANTINED + STALE_QUARANTINE,
    );
  });

  it("inspect는 기본으로 하한과 exact: false를, counts: exact면 정확한 수를 돌려주고, 차단 판정은 두 모드에서 같다", async () => {
    await seedBacklog();
    const bounded = await admin.inspect(KEY, { countLimit: 100 });
    const target = bounded.targets.find((row) => row.targetId === targetId);
    expect(target?.backlog).toMatchObject({ intents: 100, exact: false, limit: 100 });
    const exact = await admin.inspect(KEY, { counts: "exact" });
    expect(exact.targets.find((row) => row.targetId === targetId)?.backlog).toEqual({
      intents: INTENTS,
      pending: INTENTS - QUARANTINED,
      quarantined: QUARANTINED,
      leased: LEASED,
      delayed: DELAYED,
      oldestPendingAgeMs: expect.any(Number),
      exact: true,
      limit: null,
    });
    // The default limit is 10,000, so 20,000 intents report a lower bound.
    expect((await admin.inspect(KEY)).targets[0]?.backlog).toMatchObject({
      exact: false,
      intents: 10_000,
    });
    for (const inspection of [bounded, exact]) {
      expect(inspection.openBuild?.blockers).toEqual(
        expect.arrayContaining(["quarantined-documents", "pending-above-limit"]),
      );
    }
    // inspectBuild reads only the build's targets and reaches the same verdict.
    const buildId = bounded.openBuild?.buildId ?? "";
    expect((await admin.inspectBuild(buildId, { countLimit: 100 })).blockers).toEqual(
      bounded.openBuild?.blockers,
    );
  });
});

describe("기록된 읽기 수명 최대치 바꾸기", () => {
  it("올리기와 PIT keep_alive 낮추기는 곧바로 적용하고, 유예를 줄이는 낮추기는 아무것도 바꾸지 않고 거부한다", async () => {
    const recorded = (await admin.inspect(KEY)).lifetimes;
    if (recorded === null) throw new Error("수명 최대치가 기록되지 않았습니다.");
    const raised = {
      maxSearchLifetimeMs: recorded.maxSearchLifetimeMs + 1_000,
      maxCursorLifetimeMs: recorded.maxCursorLifetimeMs + 60_000,
      maxPitKeepAliveMs: recorded.maxPitKeepAliveMs,
      retirementSafetyMarginMs: recorded.retirementSafetyMarginMs + 1,
    };
    expect(await admin.changeReadLifetimes(KEY, raised, auditOf())).toEqual({
      logicalKey: KEY,
      previous: recorded,
      current: raised,
      changed: true,
    });
    expect((await admin.inspect(KEY)).lifetimes).toEqual(raised);

    for (const field of [
      "maxSearchLifetimeMs",
      "maxCursorLifetimeMs",
      "retirementSafetyMarginMs",
    ] as const) {
      const lowered = { ...raised, [field]: raised[field] - 1 };
      const error = await admin.changeReadLifetimes(KEY, lowered, auditOf()).then(
        () => undefined,
        (thrown: SearchAdminPreconditionFailed) => thrown,
      );
      expect(error).toBeInstanceOf(SearchAdminPreconditionFailed);
      expect(error?.details).toMatchObject({
        reason: "read-lifetime-decrease-unsupported",
        field,
        recordedMs: raised[field],
        requestedMs: raised[field] - 1,
      });
      expect((await admin.inspect(KEY)).lifetimes).toEqual(raised);
    }

    const shorterPit = { ...raised, maxPitKeepAliveMs: Math.max(1, raised.maxPitKeepAliveMs - 1) };
    expect((await admin.changeReadLifetimes(KEY, shorterPit, auditOf())).current).toEqual(
      shorterPit,
    );
    expect((await admin.changeReadLifetimes(KEY, shorterPit, auditOf())).changed).toBe(false);
    const { rows } = await h.knex.raw<{ rows: { outcome: string }[] }>(
      sql`SELECT outcome FROM ${s("admin_operations")} WHERE kind = 'change-lifetimes' ORDER BY operation_seq`,
    );
    expect(rows.map((row) => row.outcome)).toEqual([
      "succeeded",
      "failed",
      "failed",
      "failed",
      "succeeded",
      "succeeded",
    ]);
    const lease = await h.knex.raw<{ rows: { lease_token: string | null }[] }>(
      sql`SELECT lease_token FROM ${s("admin_controls")} WHERE namespace = ? AND definition = ?`,
      [h.namespace, KEY],
    );
    expect(lease.rows[0]?.lease_token).toBeNull();
  });
});
