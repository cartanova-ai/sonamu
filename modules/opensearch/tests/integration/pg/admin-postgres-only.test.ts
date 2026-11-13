import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  applySearchGrants,
  createSearchAdmin,
  POSTGRES_ONLY_ADMIN_OPERATIONS,
  type SearchAdmin,
} from "../../../src/admin";
import { createSearchClient, type SearchClient } from "../../../src/client/search-client";
import { SearchAdminPreconditionFailed, type SearchError } from "../../../src/errors";
import { createPostgresSynchronization } from "../../../src/postgres";
import { createTestDefinition, TEST_READ_LIFETIMES } from "../../../src/testing";
import { type TestRole, useIntegrationHarness } from "../../helpers/harness";
import { type RecordedRequest, requestRecorder } from "../../helpers/request-recorder";
import { createTarget, openAdminClient, resetSearchSchema } from "../../helpers/test-targets";

/**
 * Admin operations that need no engine. inspect of an unregistered key reports instead of refusing. A handle built
 * without a client runs the PostgreSQL-only operations and refuses remote ones before reading or writing anything;
 * with a client, PostgreSQL-only operations still send no request.
 */

const h = useIntegrationHarness({ sampleDomain: false });
const KEY = "messages";
const source = new Map<string, { body: string }>([["m1", { body: "하나" }]]);
const V1 = createTestDefinition({
  key: KEY,
  schema: z.object({ body: z.string() }),
  properties: { body: { type: "text" } },
  documents: () => source,
});
const V2 = createTestDefinition({
  key: KEY,
  projectionVersion: "2",
  schema: z.object({ body: z.string() }),
  properties: { body: { type: "text" } },
  documents: () => source,
});

let adminRole: TestRole;
let adminKnex: Knex;
const clients: SearchClient[] = [];

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  const url = new URL(adminRole.url);
  url.searchParams.set("application_name", `h:${h.id}:admin`);
  adminKnex = knexFactory({ client: "pg", connection: url.toString(), pool: { min: 0, max: 4 } });
});

afterAll(async () => {
  await Promise.allSettled(clients.map((client) => client.close()));
  await adminKnex?.destroy();
});

beforeEach(async () => {
  await resetSearchSchema(h);
  await applySearchGrants(h.knex, { schema: h.searchSchema, roles: { admin: [adminRole.name] } });
});

function auditOf(): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason: "postgres-only" };
}

function adminWith(client: SearchClient | undefined): SearchAdmin {
  const base = {
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [V1, V2],
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    timeouts: {
      lockTimeoutMs: 15_000,
      statementTimeoutMs: 20_000,
      idleInTransactionTimeoutMs: 60_000,
      adminLeaseMs: 120_000,
    },
    cutover: { maxPendingDocuments: 1_000, sampleSize: 0 },
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 30_000 },
  };
  return createSearchAdmin(client === undefined ? base : { ...base, client });
}

interface RecordedAdmin {
  admin: SearchAdmin;
  requests: RecordedRequest[];
}

function recordedAdmin(): RecordedAdmin {
  const recorder = requestRecorder(h.opensearch);
  const client = createSearchClient({
    createClient: () => recorder.client,
    ownsClient: false,
    requestTimeoutMs: 30_000,
  });
  clients.push(client);
  return { admin: adminWith(client), requests: recorder.requests };
}

async function registerFirst(): Promise<string> {
  const client = await openAdminClient(h);
  try {
    const target = await createTarget(client.run, {
      schema: h.searchSchema,
      namespace: h.namespace,
      logicalKey: KEY,
      fingerprint: V1.fingerprint,
    });
    return target.targetId;
  } finally {
    await client.close();
  }
}

async function errorOf(pending: Promise<unknown>): Promise<SearchError> {
  return pending.then(
    () => {
      throw new Error("실패해야 할 호출이 성공했습니다.");
    },
    (error: SearchError) => error,
  );
}

describe("등록되지 않은 key의 inspect", () => {
  it("거부하지 않고 registered: false, 저장소 결속, 빈 대상 목록을 돌려준다", async () => {
    const admin = adminWith(undefined);
    const inspection = await admin.inspect(KEY);
    expect(inspection).toMatchObject({
      logicalKey: KEY,
      registered: false,
      targets: [],
      openBuild: null,
      lifetimes: null,
      readHead: { targetId: null, generation: 0, rebuildRequired: false },
      binding: { storeId: expect.any(String), originRecorded: true, originMatches: true },
    });
    // Invalid input is still a typed error.
    expect((await errorOf(admin.inspect("Not A Key"))).details?.reason).toBe("invalid-logical-key");
    await registerFirst();
    expect((await admin.inspect(KEY)).registered).toBe(true);
  });
});

describe("PostgreSQL만 쓰는 관리 작업", () => {
  it("클라이언트가 있어도 원격 요청을 하나도 보내지 않는다", async () => {
    const targetId = await registerFirst();
    const { admin, requests } = recordedAdmin();
    const inspection = await admin.inspect(KEY);
    const buildId = inspection.openBuild?.buildId ?? "";
    await admin.inspectBuild(buildId);
    await admin.runBackfillPage(buildId, { limit: 10 });
    await admin.remark({ logicalKey: KEY, ids: ["m1"] }, auditOf());
    await admin.retryQuarantined({ targetId, limit: 10 }, auditOf());
    const lifetimes = inspection.lifetimes;
    if (lifetimes === null) throw new Error("수명 최대치가 없습니다.");
    await admin.changeReadLifetimes(KEY, lifetimes, auditOf());
    await admin.suspendCapture(KEY, auditOf());
    await admin.adoptCopiedStore({ confirmCopy: true }, auditOf());
    // Planning a definition without requiredPlugins reads nothing remote either.
    await admin.planCreate(KEY, { fingerprint: V1.fingerprint });
    expect(requests).toEqual([]);
    expect(POSTGRES_ONLY_ADMIN_OPERATIONS).toEqual([
      "inspect",
      "inspectBuild",
      "runBackfillPage",
      "suspendCapture",
      "remark",
      "retryQuarantined",
      "adoptCopiedStore",
      "changeReadLifetimes",
    ]);
  });

  it("confirmStoreOwnership은 fence를 인수하려고 원격에 쓰므로, 클라이언트 없는 핸들은 인수할 대상이 있으면 아무것도 바꾸기 전에 거부한다", async () => {
    await registerFirst();
    const admin = adminWith(undefined);
    const origin = async () =>
      (
        await h.knex.raw<{ rows: { recorded: string }[] }>(
          `SELECT origin_recorded_at::text AS recorded FROM "${h.searchSchema}".store`,
        )
      ).rows[0]?.recorded;
    const before = await origin();
    const refused = await errorOf(
      admin.confirmStoreOwnership({ confirmSoleOwner: true }, auditOf()),
    );
    expect(refused).toBeInstanceOf(SearchAdminPreconditionFailed);
    expect(refused.details).toMatchObject({
      reason: "search-client-not-configured",
      operation: "confirmStoreOwnership",
    });
    expect(await origin()).toBe(before);
    // With nothing to take over (every target detached) no client is needed.
    await admin.adoptCopiedStore({ confirmCopy: true }, auditOf());
    await expect(
      admin.confirmStoreOwnership({ confirmSoleOwner: true }, auditOf()),
    ).resolves.toMatchObject({ fencedTargets: [] });
  });

  it("클라이언트 없이 만든 핸들은 PostgreSQL 작업을 하고, 원격 작업은 아무것도 쓰기 전에 search-client-not-configured로 거부한다", async () => {
    const targetId = await registerFirst();
    const admin = adminWith(undefined);
    expect((await admin.inspect(KEY)).registered).toBe(true);
    await admin.remark({ logicalKey: KEY, ids: ["m1"] }, auditOf());
    const audits = async () =>
      Number(
        (
          await h.knex.raw<{ rows: { count: string }[] }>(
            `SELECT count(*) FROM "${h.searchSchema}".admin_operations`,
          )
        ).rows[0]?.count,
      );
    const before = await audits();
    const plan = await admin.planCreate(KEY, { fingerprint: V2.fingerprint });
    const buildId = (await admin.inspect(KEY)).openBuild?.buildId ?? "";
    const attempts: [string, Promise<unknown>][] = [
      ["executeCreate", admin.executeCreate(plan, auditOf())],
      ["reconcileCreate", admin.reconcileCreate(targetId, { confirmQuiescent: true }, auditOf())],
      [
        "beginRebuild",
        admin.beginRebuild({ logicalKey: KEY, fingerprint: V2.fingerprint }, auditOf()),
      ],
      ["cutover", admin.cutover(buildId, auditOf())],
      ["rollback", admin.rollback(buildId, auditOf())],
      ["retireTarget", admin.retireTarget(targetId, auditOf())],
      ["resumeCaptureForRebuild", admin.resumeCaptureForRebuild(KEY, auditOf())],
      ["runTargetVerificationPage", admin.runTargetVerificationPage(targetId, { limit: 10 })],
      ["resumeTarget", admin.resumeTarget(targetId, auditOf())],
    ];
    for (const [operation, pending] of attempts) {
      const error = await errorOf(pending);
      expect(error, operation).toBeInstanceOf(SearchAdminPreconditionFailed);
      expect(error.details).toEqual({ reason: "search-client-not-configured", operation });
    }
    // Nothing was written, not even an audit record.
    expect(await audits()).toBe(before);
  });
});

describe("planCreate의 정의 선택", () => {
  it("한 key에 정의가 둘인 핸들은 fingerprint 없이 거부하고, fingerprint로 고른 정의를 계획한다", async () => {
    const admin = adminWith(undefined);
    expect((await errorOf(admin.planCreate(KEY))).details).toMatchObject({
      reason: "definition-ambiguous",
      count: 2,
    });
    const plan = await admin.planCreate(KEY, { fingerprint: V2.fingerprint });
    expect(plan).toMatchObject({
      logicalKey: KEY,
      fingerprint: V2.fingerprint,
      missingPlugins: [],
    });
    expect(
      (await errorOf(admin.planCreate(KEY, { fingerprint: "0".repeat(64) }))).details,
    ).toMatchObject({
      reason: "definition-not-registered",
    });
    expect((await errorOf(admin.planCreate(KEY, { fingerprint: "nope" }))).details).toMatchObject({
      reason: "invalid-admin-option",
    });
  });
});
