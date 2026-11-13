import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { type ApiError, type ApiResponse, Client, Transport } from "@opensearch-project/opensearch";
import {
  type TransportRequestCallback,
  type TransportRequestOptions,
  type TransportRequestParams,
  type TransportRequestPromise,
} from "@opensearch-project/opensearch/lib/Transport.js";
import knexFactory, { type Knex } from "knex";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  applySearchGrants,
  type CreatePlan,
  createSearchAdmin,
  type SearchAdmin,
} from "../../src/admin";
import { createAdminStore } from "../../src/admin/admin-lease";
import { executeCreate, planCreate, type RemoteCreateContext } from "../../src/admin/remote-create";
import { type NativeProperty } from "../../src/client/sdk-types";
import {
  createSearchClient,
  getSearchRequester,
  type SearchClient,
} from "../../src/client/search-client";
import { type DefinedSearch, defineSearch } from "../../src/definition/define-search";
import { composeIndexMappings } from "../../src/definition/envelope";
import {
  SearchAdminBusy,
  SearchAdminLeaseLost,
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  SearchError,
  type SearchErrorDetail,
  SearchNotConfigured,
  SearchTargetUnavailable,
  SearchUnavailable,
  SearchStoreMismatch,
} from "../../src/errors";
import { createPostgresSynchronization, type PostgresSynchronization } from "../../src/postgres";
import { TEST_READ_LIFETIMES } from "../../src/testing";
import { type TestRole, useIntegrationHarness } from "../helpers/harness";
import { rewriteIndexStoreId } from "../helpers/index-meta";
import { aliasExists, indexExists } from "../helpers/opensearch-ops";
import { qualified, sql } from "../helpers/sql";
import { startTcpProxy, type TcpProxy } from "../helpers/tcp-proxy";
import { readDeliveries, readLedger, resetSearchSchema } from "../helpers/test-targets";

/**
 * Remote create state and the single build owner, against the admin role and a real engine. Failures are injected
 * at exact points: a creator stopped before its remote command (client construction hangs), a command that ran but
 * lost its response (tcp-proxy stall-body), a request that never reached the engine (tcp-proxy blackhole), clean
 * refusals and unparseable responses (a transport answering without sending), and a creator in flight (a transport
 * holding the engine's response). Every SDK request is recorded to prove refusals came before any remote command and
 * that no compensating DELETE was sent.
 */

const h = useIntegrationHarness({ sampleDomain: false });
const KEY = "messages";
const TIMEOUTS = {
  lockTimeoutMs: 5_000,
  // A 60 s lease caps each remote request at (60 s - 4 * 5 s) / 3, about 13.3 s.
  statementTimeoutMs: 5_000,
  idleInTransactionTimeoutMs: 30_000,
  adminLeaseMs: 60_000,
};

let adminRole: TestRole;
let captureRole: TestRole;
let adminKnex: Knex;
let captureKnex: Knex;

type Injection =
  | { kind: "respond"; status: number; body: string }
  | { kind: "fail" }
  | { kind: "hold"; sent: () => void; release: Promise<void> };
type Injector = (params: TransportRequestParams) => Injection | undefined;

interface RecordingClient {
  readonly client: Client;
  readonly requests: string[];
  inject(injector: Injector): void;
}

const nativeClients: Client[] = [];
const searchClients: SearchClient[] = [];
const proxies: TcpProxy[] = [];

function engineUrl(): string {
  const endpoint = h.env.opensearch;
  if (endpoint === null) throw new Error("OpenSearch 접속 정보가 없습니다.");
  return endpoint.url;
}

/**
 * A real GET / response with status and body replaced; the injected request itself never reaches the engine. The
 * package's search client reads only statusCode, headers and the body stream of an asStream response.
 */
function syntheticResponse(base: ApiResponse, status: number, body: string): ApiResponse {
  return {
    ...base,
    statusCode: status,
    headers: { "content-type": "application/json" },
    body: Readable.from([Buffer.from(body, "utf8")]),
  };
}

function recordingClient(node = engineUrl()): RecordingClient {
  const requests: string[] = [];
  let injector: Injector = () => undefined;

  class RecordingTransport extends Transport {
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
    ): TransportRequestPromise<ApiResponse>;
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
      callback?: (err: ApiError, result: ApiResponse) => void,
    ): TransportRequestCallback;
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
      callback?: (err: ApiError, result: ApiResponse) => void,
    ): TransportRequestPromise<ApiResponse> | TransportRequestCallback {
      if (callback !== undefined) return super.request(params, options, callback);
      requests.push(params.method + " " + params.path);
      const injection = injector(params);
      if (injection?.kind === "respond") {
        const probe = super.request({ method: "GET", path: "/" }, { ...options, asStream: false });
        const replaced = probe.then((base) =>
          syntheticResponse(base, injection.status, injection.body),
        );
        return Object.assign(replaced, { abort: () => probe.abort() });
      }
      if (injection?.kind === "fail") {
        const error = Object.assign(new Error("injected"), { name: "ConnectionError" });
        return Object.assign(Promise.reject(error), { abort: () => {} });
      }
      const inner = super.request(params, options);
      if (injection?.kind !== "hold") return inner;
      const held = inner.then(async (response) => {
        injection.sent();
        await injection.release;
        return response;
      });
      return Object.assign(held, { abort: () => inner.abort() });
    }
  }

  const base = new Client({ node, maxRetries: 0, requestTimeout: 120_000 });
  nativeClients.push(base);
  return {
    client: base.child({ Transport: RecordingTransport }),
    requests,
    inject(next) {
      injector = next;
    },
  };
}

function searchClientOf(native: Client | Promise<Client>, requestTimeoutMs = 30_000): SearchClient {
  const client = createSearchClient({
    createClient: () => native,
    ownsClient: false,
    requestTimeoutMs,
  });
  searchClients.push(client);
  return client;
}

function fixtureDefinition(
  options: { properties?: Record<string, NativeProperty>; requiredPlugins?: string[] } = {},
): DefinedSearch {
  return defineSearch({
    key: KEY,
    projectionVersion: "1",
    schema: z.object({ body: z.string() }),
    settings: { index: { number_of_shards: 1, number_of_replicas: 0 } },
    mappings: { properties: options.properties ?? { body: { type: "text" } } },
    requiredPlugins: options.requiredPlugins ?? [],
    async materialize(_context, ids) {
      return new Map(ids.map((id) => [id, { state: "deleted" } as const]));
    },
    async captureScanBoundary() {
      return "";
    },
    async scanSourceIds() {
      return { ids: [] };
    },
  });
}

const DEFINITION = fixtureDefinition();

function synchronization(db: Knex): PostgresSynchronization {
  return createPostgresSynchronization({
    getPrimaryDatabase: () => db,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
}

function adminWith(
  client: SearchClient,
  options: { adminLeaseMs?: number; definition?: DefinedSearch } = {},
): SearchAdmin {
  return createSearchAdmin({
    client,
    synchronization: synchronization(adminKnex),
    definitions: [options.definition ?? DEFINITION],
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    timeouts: { ...TIMEOUTS, adminLeaseMs: options.adminLeaseMs ?? TIMEOUTS.adminLeaseMs },
    cutover: { maxPendingDocuments: 0, sampleSize: 0 },
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 30_000 },
  });
}

function audit(operationId = "op-" + randomUUID()): AdminContext {
  return { operationId, actor: "tester", reason: "remote create" };
}

/** Context for calling the same create code as a rebuild registration, on the admin role pool. */
function rebuildContext(client: SearchClient): RemoteCreateContext {
  return {
    store: createAdminStore({
      getPrimaryDatabase: () => adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
      timeouts: TIMEOUTS,
    }),
    requester: getSearchRequester(client),
    definitions: new Map([[DEFINITION.key + "@" + DEFINITION.fingerprint, DEFINITION]]),
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    binding: synchronization(adminKnex),
  };
}

function roleUrl(role: TestRole, application: string): string {
  const url = new URL(role.url);
  url.searchParams.set("application_name", "h:" + h.id + ":" + application);
  return url.toString();
}

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  captureRole = await h.createRole("capture");
  adminKnex = knexFactory({
    client: "pg",
    connection: roleUrl(adminRole, "admin"),
    pool: { min: 0, max: 6 },
  });
  captureKnex = knexFactory({
    client: "pg",
    connection: roleUrl(captureRole, "capture"),
    pool: { min: 0, max: 4 },
  });
});

afterEach(async () => {
  await Promise.allSettled(searchClients.splice(0).map((client) => client.close()));
  await Promise.allSettled(proxies.splice(0).map((proxy) => proxy.close()));
  await Promise.allSettled(nativeClients.splice(0).map((client) => client.close()));
});

afterAll(async () => {
  await adminKnex?.destroy();
  await captureKnex?.destroy();
});

async function setUp(): Promise<void> {
  await resetSearchSchema(h);
  await applySearchGrants(h.knex, {
    schema: h.searchSchema,
    roles: { admin: [adminRole.name], capture: [captureRole.name] },
  });
}

type TargetRow = {
  state: string;
  remote_create_state: string;
  has_token: boolean;
  remote_create_attempts: number;
  started: boolean;
  finished: boolean;
  write_enabled: boolean;
  registered: boolean;
};

async function targetRow(targetId: string): Promise<TargetRow | undefined> {
  const { rows } = await h.knex.raw<{ rows: TargetRow[] }>(
    sql`SELECT state, remote_create_state, remote_create_token IS NOT NULL AS has_token, remote_create_attempts,
       remote_create_started_at IS NOT NULL AS started, remote_create_finished_at IS NOT NULL AS finished,
       write_enabled, registered_at IS NOT NULL AS registered
FROM ${qualified(h.searchSchema, "targets")} WHERE target_id = ?`,
    [targetId],
  );
  return rows[0];
}

async function count(table: string): Promise<number> {
  const { rows } = await h.knex.raw<{ rows: { n: string }[] }>(
    sql`SELECT count(*) AS n FROM ${qualified(h.searchSchema, table)}`,
  );
  return Number(rows[0].n);
}

type BuildRow = { kind: string; phase: string; new_target_id: string };

async function builds(): Promise<BuildRow[]> {
  const { rows } = await h.knex.raw<{ rows: BuildRow[] }>(
    sql`SELECT kind, phase, new_target_id FROM ${qualified(h.searchSchema, "builds")} ORDER BY created_at`,
  );
  return rows;
}

async function generation(): Promise<number> {
  const { rows } = await h.knex.raw<{ rows: { generation: string }[] }>(
    sql`SELECT generation FROM ${qualified(h.searchSchema, "indexes")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, KEY],
  );
  return Number(rows[0]?.generation ?? 0);
}

async function remote(plan: CreatePlan): Promise<{ index: boolean; alias: boolean }> {
  return {
    index: await indexExists(h.opensearch, plan.physicalIndex),
    alias: await aliasExists(h.opensearch, plan.writeAlias),
  };
}

/** Polls committed state; assumes no ordering. */
async function waitUntil(
  check: () => Promise<boolean>,
  what: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(what + "이(가) " + timeoutMs + "ms 안에 관찰되지 않았습니다.");
}

/**
 * Expires the lease now, simulating a creator stalled longer than its lease. With valid settings request timeouts
 * alone can never outlast the lease, so the test forces it.
 */
async function expireLease(): Promise<void> {
  const result = await h.knex.raw<{ rowCount: number }>(
    sql`UPDATE ${qualified(h.searchSchema, "admin_controls")} SET lease_expires_at = clock_timestamp()
WHERE namespace = ? AND definition = ? AND lease_token IS NOT NULL`,
    [h.namespace, KEY],
  );
  expect(result.rowCount).toBe(1);
}

async function controlRow(): Promise<Record<string, string | null> | undefined> {
  const { rows } = await h.knex.raw<{ rows: Record<string, string | null>[] }>(
    sql`SELECT operation_id, lease_token, lease_expires_at::text AS expires
FROM ${qualified(h.searchSchema, "admin_controls")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, KEY],
  );
  return rows[0];
}

async function errorOf<T>(promise: Promise<T>): Promise<SearchError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SearchError) return error;
    throw error;
  }
  throw new Error("오류가 발생하지 않았습니다.");
}

function reasonOf(error: SearchError): SearchErrorDetail | undefined {
  return error.details?.reason;
}

const hasDelete = (requests: readonly string[]) =>
  requests.some((line) => line.startsWith("DELETE"));

/** Runs the guard of retirement's first step directly, which must refuse unresolved identities. */
async function retireGuard(targetId: string): Promise<number> {
  const result = await h.knex.raw<{ rowCount: number }>(
    sql`UPDATE ${qualified(h.searchSchema, "targets")} SET state = 'retiring', write_enabled = false, retiring_at = clock_timestamp()
WHERE target_id = ? AND state IN ('creating', 'active', 'paused', 'failed')
  AND remote_create_state NOT IN ('in_flight', 'ambiguous')
RETURNING target_id`,
    [targetId],
  );
  return result.rowCount;
}

/** Creates the planned index directly; another fingerprint makes it look like someone else's. */
async function createIndexDirectly(
  plan: CreatePlan,
  fingerprint = plan.fingerprint,
): Promise<void> {
  await h.opensearch.indices.create({
    index: plan.physicalIndex,
    body: {
      settings: plan.body.settings,
      aliases: { [plan.writeAlias]: { is_write_index: true } },
      mappings: composeIndexMappings({
        targetId: plan.targetId,
        namespace: plan.namespace,
        logicalKey: plan.logicalKey,
        fingerprint,
        hashVersion: DEFINITION.hashVersion,
        mappings: DEFINITION.mappings,
      }),
    },
  });
}

const PUT_INDEX = (params: TransportRequestParams) => params.method === "PUT";
const mappingPath = (plan: CreatePlan) => "GET /" + plan.physicalIndex + "/_mapping";
// The alias sits in the index position because a secured engine checks permissions against the index behind it.
const aliasPath = (plan: CreatePlan) => `GET /${plan.writeAlias}/_alias/${plan.writeAlias}`;
const REFUSED_429 = '{"error":{"type":"es_rejected_execution_exception"},"status":429}';

const mappingResponseSchema = z.record(
  z.string(),
  z.object({
    mappings: z.looseObject({
      dynamic: z.string(),
      _meta: z.object({ sonamu: z.record(z.string(), z.unknown()) }),
      properties: z.looseObject({
        sonamu_meta: z.looseObject({ dynamic: z.string() }),
        doc: z.looseObject({ dynamic: z.string() }),
      }),
    }),
  }),
);
const aliasResponseSchema = z.record(
  z.string(),
  z.object({
    aliases: z.record(z.string(), z.looseObject({ is_write_index: z.boolean().optional() })),
  }),
);

describe("정상 경로", () => {
  it("계획, 생성, 등록 뒤 인덱스의 _meta와 strict 매핑, 쓰기 alias가 맞고 등록 뒤의 마커만 새 대상에 예약된다", async () => {
    await setUp();
    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));
    const capture = synchronization(captureKnex);
    await capture.initialize();

    const plan = await admin.planCreate(KEY);
    const compact = plan.targetId.replaceAll("-", "");
    expect(plan).toMatchObject({
      logicalKey: KEY,
      namespace: h.namespace,
      fingerprint: DEFINITION.fingerprint,
      hashVersion: "sonamu-c14n-v1",
      physicalIndex: "snm-" + h.namespace + "-" + KEY + "-" + compact,
      writeAlias: "snm-" + h.namespace + "-" + KEY + "-" + compact + "-w",
      missingPlugins: [],
      captureEpoch: 1,
      warnings: [],
    });
    // Planning creates and records nothing.
    expect(recorder.requests).toEqual([]);
    expect(await remote(plan)).toEqual({ index: false, alias: false });
    expect([await count("indexes"), await count("targets")]).toEqual([0, 0]);

    const early = await errorOf(
      captureKnex.transaction((trx) => capture.markChanged(trx, KEY, ["before"])),
    );
    expect(early).toBeInstanceOf(SearchNotConfigured);

    const handle = await admin.executeCreate(plan, audit());
    expect(handle).toEqual({
      targetId: plan.targetId,
      physicalIndex: plan.physicalIndex,
      writeAlias: plan.writeAlias,
      fingerprint: plan.fingerprint,
      captureEpoch: 1,
      remoteCreateState: "verified",
    });
    expect(recorder.requests).toEqual([
      "PUT /" + plan.physicalIndex,
      mappingPath(plan),
      aliasPath(plan),
    ]);
    expect(await targetRow(plan.targetId)).toEqual({
      state: "active",
      remote_create_state: "verified",
      has_token: true,
      remote_create_attempts: 1,
      started: true,
      finished: true,
      write_enabled: true,
      registered: true,
    });
    expect(await builds()).toEqual([
      { kind: "initial", phase: "created", new_target_id: plan.targetId },
    ]);
    expect(await generation()).toBe(2);

    const mappingBody = (await h.opensearch.indices.getMapping({ index: plan.physicalIndex })).body;
    const mapping = mappingResponseSchema.parse(mappingBody)[plan.physicalIndex].mappings;
    const { rows: storeRows } = await h.knex.raw<{ rows: { store_id: string }[] }>(
      sql`SELECT store_id::text FROM ${qualified(h.searchSchema, "store")}`,
    );
    expect(mapping._meta.sonamu).toEqual({
      target_id: plan.targetId,
      namespace: h.namespace,
      logical_key: KEY,
      fingerprint: DEFINITION.fingerprint,
      hash_version: "sonamu-c14n-v1",
      envelope: 1,
      store_id: storeRows[0]?.store_id,
    });
    expect([
      mapping.dynamic,
      mapping.properties.sonamu_meta.dynamic,
      mapping.properties.doc.dynamic,
    ]).toEqual(["strict", "strict", "strict"]);
    const aliasBody = (await h.opensearch.indices.getAlias({ name: plan.writeAlias })).body;
    expect(aliasResponseSchema.parse(aliasBody)).toEqual({
      [plan.physicalIndex]: { aliases: { [plan.writeAlias]: { is_write_index: true } } },
    });

    await expect(
      captureKnex.transaction((trx) => capture.markChanged(trx, KEY, ["after"])),
    ).resolves.toBe("recorded");
    expect(await readLedger(h)).toEqual({ after: 1 });
    expect(await readDeliveries(h)).toEqual({ [plan.targetId + "/after"]: 1 });

    // Re-running the same plan only verifies remotely and returns the same handle.
    recorder.requests.length = 0;
    await expect(admin.executeCreate(plan, audit())).resolves.toEqual(handle);
    expect(recorder.requests).toEqual([mappingPath(plan), aliasPath(plan)]);
    expect((await targetRow(plan.targetId))?.remote_create_attempts).toBe(1);
  });

  for (const isolation of ["read committed", "repeatable read"] as const) {
    it(
      "등록은 장벽을 쥔 도메인 마커를 기다리고, 먼저 잠근 마커는 옛 대상에만, 나중 마커는 새 대상까지 예약된다 (" +
        isolation +
        ")",
      async () => {
        await setUp();
        const recorder = recordingClient();
        const admin = adminWith(searchClientOf(recorder.client));
        const capture = synchronization(captureKnex);
        await capture.initialize();
        const firstPlan = await admin.planCreate(KEY);
        await admin.executeCreate(firstPlan, audit());
        // Close the first target's initial build directly so a rebuild registration is allowed.
        await h.knex.raw(
          sql`UPDATE ${qualified(h.searchSchema, "builds")} SET phase = 'retired', closed_at = clock_timestamp()`,
        );
        // The second target goes through the same create code as a rebuild registration.
        const context = rebuildContext(searchClientOf(recorder.client));
        const secondPlan = await planCreate(context, KEY);

        // A writer whose snapshot predates the registration; only repeatable read behaves differently.
        const stale = await captureKnex.transaction({ isolationLevel: isolation });
        // A writer that reserves the first target and holds the barrier (FOR SHARE) until it commits.
        const holder = await captureKnex.transaction({ isolationLevel: isolation });
        try {
          await stale.raw("SELECT 1");
          const pidResult = await holder.raw<{ rows: { pid: number }[] }>(
            "SELECT pg_backend_pid() AS pid",
          );
          const holderPid = pidResult.rows[0].pid;
          await expect(capture.markChanged(holder, KEY, ["early"])).resolves.toBe("recorded");

          let settled = false;
          const pending = executeCreate(context, secondPlan, audit(), {
            registration: { kind: "rebuild", oldTargetId: firstPlan.targetId },
          });
          pending.then(
            () => {
              settled = true;
            },
            () => {
              settled = true;
            },
          );
          // The registration's exclusive barrier must be seen waiting on that writer.
          let blockedQuery = "";
          await waitUntil(async () => {
            if (settled) await pending;
            const waiting = await h.knex.raw<{ rows: { query: string }[] }>(
              "SELECT query FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND ? = ANY(pg_blocking_pids(pid))",
              [holderPid],
            );
            blockedQuery = waiting.rows[0]?.query ?? "";
            return waiting.rows.length === 1;
          }, "등록 장벽의 잠금 대기");
          expect(blockedQuery).toMatch(/capture_epoch FROM .*indexes.* FOR UPDATE;$/s);
          expect(settled).toBe(false);
          await holder.commit();
          await expect(pending).resolves.toMatchObject({ remoteCreateState: "verified" });

          const staleResult = await capture.markChanged(stale, KEY, ["late"]).then(
            (value) => value,
            (error: SearchError) => error,
          );
          if (isolation === "repeatable read") {
            // A snapshot from before the registration cannot commit with the old target list; a retry reserves both.
            expect(staleResult).toBeInstanceOf(SearchUnavailable);
            expect(staleResult).toMatchObject({ details: { sqlstate: "40001" } });
            await stale.rollback();
            await captureKnex.transaction((trx) => capture.markChanged(trx, KEY, ["late"]), {
              isolationLevel: isolation,
            });
          } else {
            expect(staleResult).toBe("recorded");
            await stale.commit();
          }
        } finally {
          if (!holder.isCompleted()) await holder.rollback().catch(() => {});
          if (!stale.isCompleted()) await stale.rollback().catch(() => {});
        }
        expect(await readDeliveries(h)).toEqual({
          [firstPlan.targetId + "/early"]: 1,
          [firstPlan.targetId + "/late"]: 1,
          [secondPlan.targetId + "/late"]: 1,
        });
        expect((await builds()).at(-1)).toEqual({
          kind: "rebuild",
          phase: "created",
          new_target_id: secondPlan.targetId,
        });
      },
    );
  }
});

describe("원격 생성 상태", () => {
  it("응답을 받지 못한 생성은 ambiguous로 남고 등록, 재생성, 은퇴가 모두 거부되며, 조정 뒤 인덱스가 맞으면 등록된다", async () => {
    await setUp();
    const proxy = await startTcpProxy(engineUrl());
    proxies.push(proxy);
    proxy.setMode({ kind: "stall-body", stallAfterBodyBytes: 0 });
    const lost = recordingClient(proxy.url);
    const lostAdmin = adminWith(searchClientOf(lost.client, 2_000));
    const plan = await lostAdmin.planCreate(KEY);

    const ambiguous = await errorOf(lostAdmin.executeCreate(plan, audit()));
    expect(ambiguous).toBeInstanceOf(SearchAdminPreconditionFailed);
    expect([reasonOf(ambiguous), ambiguous.retryable]).toEqual(["remote-create-ambiguous", false]);
    expect(lost.requests).toEqual(["PUT /" + plan.physicalIndex]);
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "creating",
      remote_create_state: "ambiguous",
      has_token: true,
      remote_create_attempts: 1,
      started: true,
      finished: true,
      write_enabled: false,
    });
    // The engine ran the command; only the response was lost.
    expect(await remote(plan)).toEqual({ index: true, alias: true });

    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));
    // Re-creating and registering are refused before any remote command.
    const unresolved = await errorOf(admin.executeCreate(plan, audit()));
    expect(unresolved).toBeInstanceOf(SearchAdminPreconditionFailed);
    expect(unresolved.details).toMatchObject({
      reason: "remote-create-unresolved",
      state: "ambiguous",
    });
    expect(recorder.requests).toEqual([]);
    expect(await retireGuard(plan.targetId)).toBe(0);

    const unconfirmed = await errorOf(
      // @ts-expect-error confirmQuiescent must be true.
      admin.reconcileCreate(plan.targetId, { confirmQuiescent: false }, audit()),
    );
    expect([unconfirmed.code, reasonOf(unconfirmed)]).toEqual([
      "SEARCH_ADMIN_PRECONDITION_FAILED",
      "quiescence-not-confirmed",
    ]);
    expect(recorder.requests).toEqual([]);
    expect((await targetRow(plan.targetId))?.remote_create_state).toBe("ambiguous");

    await expect(
      admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
    ).resolves.toMatchObject({ targetId: plan.targetId, remoteCreateState: "verified" });
    expect(recorder.requests).toEqual([mappingPath(plan), aliasPath(plan)]);
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "creating",
      remote_create_state: "verified",
      has_token: false,
    });

    recorder.requests.length = 0;
    await expect(admin.executeCreate(plan, audit())).resolves.toMatchObject({
      remoteCreateState: "verified",
    });
    expect(recorder.requests).toEqual([]);
    expect(await targetRow(plan.targetId)).toMatchObject({ state: "active", write_enabled: true });
    expect(hasDelete([...lost.requests, ...recorder.requests])).toBe(false);
  });

  it("조정: 응답을 잃은 인덱스의 _meta.store_id가 다른 저장소의 것이면 verified도 abandoned도 아닌 거부로 남고, store_id가 없으면 verified가 된다", async () => {
    await setUp();
    const proxy = await startTcpProxy(engineUrl());
    proxies.push(proxy);
    proxy.setMode({ kind: "stall-body", stallAfterBodyBytes: 0 });
    const lost = recordingClient(proxy.url);
    const lostAdmin = adminWith(searchClientOf(lost.client, 2_000));
    const plan = await lostAdmin.planCreate(KEY);
    expect(reasonOf(await errorOf(lostAdmin.executeCreate(plan, audit())))).toBe(
      "remote-create-ambiguous",
    );
    const foreign = randomUUID();
    await rewriteIndexStoreId(h.opensearch, plan.physicalIndex, foreign);

    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));
    const refused = await errorOf(
      admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
    );
    expect(refused).toBeInstanceOf(SearchStoreMismatch);
    expect(refused.details).toMatchObject({
      reason: "remote-store-mismatch",
      remoteStoreId: foreign,
    });
    expect(recorder.requests).toEqual([mappingPath(plan)]);
    expect((await targetRow(plan.targetId))?.remote_create_state).toBe("ambiguous");

    await rewriteIndexStoreId(h.opensearch, plan.physicalIndex, undefined);
    await expect(
      admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
    ).resolves.toMatchObject({ remoteCreateState: "verified" });
  });

  it("엔진에 닿지 않은 시도는 조정에서 abandoned로 닫히고, 그 식별자는 다시 만들어지지 않는다", async () => {
    await setUp();
    const proxy = await startTcpProxy(engineUrl());
    proxies.push(proxy);
    proxy.setMode({ kind: "blackhole" });
    const lost = recordingClient(proxy.url);
    const lostAdmin = adminWith(searchClientOf(lost.client, 1_500));
    const plan = await lostAdmin.planCreate(KEY);
    expect(reasonOf(await errorOf(lostAdmin.executeCreate(plan, audit())))).toBe(
      "remote-create-ambiguous",
    );
    expect(await remote(plan)).toEqual({ index: false, alias: false });

    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));
    await expect(
      admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
    ).resolves.toMatchObject({ remoteCreateState: "abandoned" });
    expect(recorder.requests).toEqual([mappingPath(plan)]);
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "failed",
      remote_create_state: "abandoned",
      has_token: false,
    });

    recorder.requests.length = 0;
    const terminal = await errorOf(admin.executeCreate(plan, audit()));
    expect(terminal.details).toMatchObject({ reason: "target-identity-terminal", state: "failed" });
    expect(recorder.requests).toEqual([]);
    expect(await remote(plan)).toEqual({ index: false, alias: false });
    const again = await errorOf(
      admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
    );
    expect(reasonOf(again)).toBe("remote-create-not-unresolved");
  });

  it("원격 명령 전에 멈춘 생성자는 in_flight를 남기고, 임대가 만료돼도 다음 생성은 원격 명령 없이 거부되며 되살아난 생성자는 아무것도 되돌리지 않는다", async () => {
    await setUp();
    const zombieNative = Promise.withResolvers<Client>();
    let created = 0;
    const zombieClient = createSearchClient({
      createClient: () => {
        created += 1;
        return zombieNative.promise;
      },
      ownsClient: false,
      requestTimeoutMs: 30_000,
    });
    searchClients.push(zombieClient);
    const zombieAdmin = adminWith(zombieClient);
    const plan = await zombieAdmin.planCreate(KEY);
    const zombie = zombieAdmin.executeCreate(plan, audit("op-zombie"));
    zombie.catch(() => {});

    await waitUntil(
      async () => (await targetRow(plan.targetId))?.remote_create_state === "in_flight",
      "생성 시작 기록 커밋",
    );
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "creating",
      remote_create_state: "in_flight",
      has_token: true,
      remote_create_attempts: 1,
      started: true,
      finished: false,
    });
    // Stalled while building the client, so no remote command was sent yet.
    expect(created).toBe(1);
    expect(await remote(plan)).toEqual({ index: false, alias: false });

    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));
    const busy = await errorOf(admin.executeCreate(plan, audit()));
    expect([busy instanceof SearchAdminBusy, busy.retryable]).toEqual([true, true]);
    await expireLease();
    const unresolved = await errorOf(admin.executeCreate(plan, audit()));
    expect(unresolved.details).toMatchObject({
      reason: "remote-create-unresolved",
      state: "in_flight",
    });
    expect(recorder.requests).toEqual([]);
    expect(await retireGuard(plan.targetId)).toBe(0);

    await expect(
      admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
    ).resolves.toMatchObject({ remoteCreateState: "abandoned" });

    // The revived creator's request fails, its result record is refused for the lost lease, and it sends no DELETE.
    const revived = recordingClient();
    revived.inject(() => ({ kind: "fail" }));
    zombieNative.resolve(revived.client);
    expect(await errorOf(zombie)).toBeInstanceOf(SearchAdminLeaseLost);
    expect(revived.requests).toEqual(["PUT /" + plan.physicalIndex]);
    expect(hasDelete(revived.requests)).toBe(false);
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "failed",
      remote_create_state: "abandoned",
    });
    expect(await remote(plan)).toEqual({ index: false, alias: false });
  });

  it("토큰을 잃은 생성자는 늦게 성공을 받아도 기록하지 못하고 보상 삭제를 하지 않는다", async () => {
    await setUp();
    const gate = Promise.withResolvers<void>();
    const sent = Promise.withResolvers<void>();
    const slow = recordingClient();
    slow.inject((params) =>
      PUT_INDEX(params)
        ? { kind: "hold", sent: () => sent.resolve(), release: gate.promise }
        : undefined,
    );
    const slowAdmin = adminWith(searchClientOf(slow.client, 120_000));
    const plan = await slowAdmin.planCreate(KEY);
    const first = slowAdmin.executeCreate(plan, audit("op-slow"));
    first.catch(() => {});
    // The engine created the index and answered; the creator has not received the response yet.
    await sent.promise;
    expect(await remote(plan)).toEqual({ index: true, alias: true });
    await expireLease();

    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));
    await expect(
      admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
    ).resolves.toMatchObject({ remoteCreateState: "verified" });
    await admin.executeCreate(plan, audit());
    expect(await targetRow(plan.targetId)).toMatchObject({ state: "active", has_token: false });

    gate.resolve();
    expect(await errorOf(first)).toBeInstanceOf(SearchAdminLeaseLost);
    expect(slow.requests).toEqual([
      "PUT /" + plan.physicalIndex,
      mappingPath(plan),
      aliasPath(plan),
    ]);
    expect(hasDelete(slow.requests)).toBe(false);
    expect(await remote(plan)).toEqual({ index: true, alias: true });
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "active",
      remote_create_state: "verified",
      write_enabled: true,
      remote_create_attempts: 1,
    });
  });

  it("첫 생성자가 진행 중이면 다른 토큰의 두 번째 생성자는 원격 명령 없이 거부되고, 첫 생성자가 끝까지 등록한다", async () => {
    await setUp();
    const gate = Promise.withResolvers<void>();
    const sent = Promise.withResolvers<void>();
    const firstClient = recordingClient();
    firstClient.inject((params) =>
      PUT_INDEX(params)
        ? { kind: "hold", sent: () => sent.resolve(), release: gate.promise }
        : undefined,
    );
    const firstAdmin = adminWith(searchClientOf(firstClient.client, 120_000));
    const plan = await firstAdmin.planCreate(KEY);
    const first = firstAdmin.executeCreate(plan, audit("op-first"));
    first.catch(() => {});
    await sent.promise;

    const secondClient = recordingClient();
    const secondAdmin = adminWith(searchClientOf(secondClient.client));
    expect(await errorOf(secondAdmin.executeCreate(plan, audit("op-second")))).toBeInstanceOf(
      SearchAdminBusy,
    );
    // Re-entering with the same operation id sees in_flight and refuses; the rollback leaves the first creator's
    // lease token in place.
    const reentered = await errorOf(secondAdmin.executeCreate(plan, audit("op-first")));
    expect(reentered.details).toMatchObject({
      reason: "remote-create-unresolved",
      state: "in_flight",
    });
    expect(secondClient.requests).toEqual([]);

    gate.resolve();
    await expect(first).resolves.toMatchObject({ remoteCreateState: "verified" });
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "active",
      remote_create_attempts: 1,
    });
    expect(await builds()).toEqual([
      { kind: "initial", phase: "created", new_target_id: plan.targetId },
    ]);
    await expect(secondAdmin.executeCreate(plan, audit("op-second"))).resolves.toMatchObject({
      targetId: plan.targetId,
    });
    expect(secondClient.requests).toEqual([mappingPath(plan), aliasPath(plan)]);
    expect(hasDelete([...firstClient.requests, ...secondClient.requests])).toBe(false);
  });

  it("깨끗하게 거절된 생성(429)은 not_started로 돌아가 같은 계획으로 다시 시도할 수 있다", async () => {
    await setUp();
    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));
    const plan = await admin.planCreate(KEY);
    recorder.inject((params) =>
      PUT_INDEX(params) ? { kind: "respond", status: 429, body: REFUSED_429 } : undefined,
    );
    const refused = await errorOf(admin.executeCreate(plan, audit()));
    expect(refused).toBeInstanceOf(SearchUnavailable);
    expect([reasonOf(refused), refused.retryable]).toEqual(["remote-create-refused", true]);
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "creating",
      remote_create_state: "not_started",
      remote_create_attempts: 1,
      finished: true,
    });
    expect(await remote(plan)).toEqual({ index: false, alias: false });

    recorder.inject(() => undefined);
    await expect(admin.executeCreate(plan, audit())).resolves.toMatchObject({
      remoteCreateState: "verified",
    });
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "active",
      remote_create_attempts: 2,
    });
  });

  it("엔진이 매핑을 거부하면 식별자는 failed/abandoned로 닫히고 다시 시도하지 않는다", async () => {
    await setUp();
    const rejected = fixtureDefinition({
      properties: { body: { type: "text", analyzer: "sonamu_no_such_analyzer" } },
    });
    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client), { definition: rejected });
    const plan = await admin.planCreate(KEY);
    const error = await errorOf(admin.executeCreate(plan, audit()));
    expect(error).toBeInstanceOf(SearchAdminPreconditionFailed);
    expect(error.details).toMatchObject({ reason: "remote-create-rejected", status: 400 });
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "failed",
      remote_create_state: "abandoned",
    });
    expect(await remote(plan)).toEqual({ index: false, alias: false });

    recorder.requests.length = 0;
    expect((await errorOf(admin.executeCreate(plan, audit()))).details).toMatchObject({
      reason: "target-identity-terminal",
    });
    expect(recorder.requests).toEqual([]);
  });

  it("등록된 대상의 인덱스나 alias가 사라져도 다시 만들지 않는다", async () => {
    await setUp();
    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));
    const plan = await admin.planCreate(KEY);
    await admin.executeCreate(plan, audit());

    await h.opensearch.indices.deleteAlias({ index: plan.physicalIndex, name: plan.writeAlias });
    recorder.requests.length = 0;
    const aliasGone = await errorOf(admin.executeCreate(plan, audit()));
    expect(aliasGone).toBeInstanceOf(SearchTargetUnavailable);
    expect(aliasGone.details).toMatchObject({
      reason: "registered-target-missing-remote",
      remote: "alias-missing",
    });
    expect(recorder.requests).toEqual([mappingPath(plan), aliasPath(plan)]);
    expect(await remote(plan)).toEqual({ index: true, alias: false });

    await h.opensearch.indices.delete({ index: plan.physicalIndex });
    recorder.requests.length = 0;
    const indexGone = await errorOf(admin.executeCreate(plan, audit()));
    expect(indexGone.details).toMatchObject({
      reason: "registered-target-missing-remote",
      remote: "index-missing",
    });
    expect(recorder.requests).toEqual([mappingPath(plan)]);
    expect(await remote(plan)).toEqual({ index: false, alias: false });
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "active",
      remote_create_attempts: 1,
    });
  });

  it("같은 이름의 인덱스가 이미 있으면 _meta가 맞을 때만 verified이고, 남의 인덱스는 채택하지도 지우지도 않는다", async () => {
    await setUp();
    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));

    const ours = await admin.planCreate(KEY);
    await createIndexDirectly(ours);
    await expect(admin.executeCreate(ours, audit())).resolves.toMatchObject({
      remoteCreateState: "verified",
    });
    expect(recorder.requests).toEqual([
      "PUT /" + ours.physicalIndex,
      mappingPath(ours),
      aliasPath(ours),
    ]);
    // A live target exists for the key, so a second first-create is refused before any remote command.
    const foreign = await admin.planCreate(KEY);
    expect(foreign.warnings).toEqual(["index-has-live-target"]);
    recorder.requests.length = 0;
    expect((await errorOf(admin.executeCreate(foreign, audit()))).details).toMatchObject({
      reason: "index-has-live-target",
    });
    expect(recorder.requests).toEqual([]);

    // Someone else's index takes the planned name with another fingerprint. Reinstalling the schema changes store_id,
    // so plan again in the new store.
    await setUp();
    const taken = await admin.planCreate(KEY);
    await createIndexDirectly(taken, "f".repeat(64));
    recorder.requests.length = 0;
    const conflict = await errorOf(admin.executeCreate(taken, audit()));
    expect(conflict.details).toMatchObject({
      reason: "remote-index-conflict",
      readBack: "meta-mismatch",
    });
    expect(await targetRow(taken.targetId)).toMatchObject({
      state: "failed",
      remote_create_state: "abandoned",
    });
    expect(await remote(taken)).toEqual({ index: true, alias: true });
    expect(hasDelete(recorder.requests)).toBe(false);
  });

  it("조정은 원격 인덱스의 _meta fingerprint가 다르면 PostgreSQL에서만 식별자를 버리고, 새 계획은 새 식별자로 진행된다", async () => {
    await setUp();
    const proxy = await startTcpProxy(engineUrl());
    proxies.push(proxy);
    proxy.setMode({ kind: "blackhole" });
    const lost = recordingClient(proxy.url);
    const lostAdmin = adminWith(searchClientOf(lost.client, 1_500));
    const plan = await lostAdmin.planCreate(KEY);
    expect(reasonOf(await errorOf(lostAdmin.executeCreate(plan, audit())))).toBe(
      "remote-create-ambiguous",
    );
    await createIndexDirectly(plan, "f".repeat(64));

    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));
    await expect(
      admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
    ).resolves.toMatchObject({ targetId: plan.targetId, remoteCreateState: "abandoned" });
    // Remote reads only; with a different _meta the alias is not even read.
    expect(recorder.requests).toEqual([mappingPath(plan)]);
    expect(recorder.requests.filter((line) => !line.startsWith("GET "))).toEqual([]);
    expect(await targetRow(plan.targetId)).toMatchObject({
      state: "failed",
      remote_create_state: "abandoned",
      has_token: false,
    });
    expect(await remote(plan)).toEqual({ index: true, alias: true });

    const next = await admin.planCreate(KEY);
    expect(next.targetId).not.toBe(plan.targetId);
    expect(next.physicalIndex).not.toBe(plan.physicalIndex);
    expect(next.warnings).toEqual([]);
    await expect(admin.executeCreate(next, audit())).resolves.toMatchObject({
      targetId: next.targetId,
      remoteCreateState: "verified",
    });
    expect(await targetRow(next.targetId)).toMatchObject({ state: "active", write_enabled: true });
    expect(await targetRow(plan.targetId)).toMatchObject({ state: "failed" });
    expect(hasDelete(recorder.requests)).toBe(false);
    expect(await remote(plan)).toEqual({ index: true, alias: true });
  });

  it("임대가 원격 호출과 결과 기록을 덮지 못하면 원격 명령과 생성 시작 기록 없이 설정 오류로 거부된다", async () => {
    await setUp();
    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));
    const plan = await admin.planCreate(KEY);
    // A clean 429 refusal leaves a creating, not_started identity.
    recorder.inject((params) =>
      PUT_INDEX(params) ? { kind: "respond", status: 429, body: REFUSED_429 } : undefined,
    );
    expect(reasonOf(await errorOf(admin.executeCreate(plan, audit())))).toBe(
      "remote-create-refused",
    );
    recorder.inject(() => undefined);
    const before = await targetRow(plan.targetId);
    const auditsBefore = await count("admin_operations");
    const controlBefore = await controlRow();
    expect(before).toMatchObject({ remote_create_state: "not_started", remote_create_attempts: 1 });

    // A 1.5 s lease is below the required 4 * 5 s + 3 * 1 s = 23 s.
    const shortClient = recordingClient();
    const shortAdmin = adminWith(searchClientOf(shortClient.client), { adminLeaseMs: 1_500 });
    for (const call of [
      () => shortAdmin.executeCreate(plan, audit()),
      () => shortAdmin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
    ]) {
      const error = await errorOf(call());
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details).toMatchObject({
        reason: "admin-lease-too-short",
        adminLeaseMs: 1_500,
        statementTimeoutMs: 5_000,
        requiredMs: 23_000,
      });
    }
    expect(shortClient.requests).toEqual([]);
    expect(await targetRow(plan.targetId)).toEqual(before);
    // Not even the lease was taken: audit records and the control row are unchanged.
    expect(await count("admin_operations")).toBe(auditsBefore);
    expect(await controlRow()).toEqual(controlBefore);
  });

  it("해석할 수 없는 엔진 응답은 생성됨으로 보지 않고 타입 오류로 실패한다", async () => {
    await setUp();
    const recorder = recordingClient();
    const admin = adminWith(searchClientOf(recorder.client));

    for (const body of ['{"unexpected":true}', "not json"]) {
      await setUp();
      const plan = await admin.planCreate(KEY);
      recorder.inject((params) =>
        PUT_INDEX(params) ? { kind: "respond", status: 200, body } : undefined,
      );
      const error = await errorOf(admin.executeCreate(plan, audit()));
      expect(error).toBeInstanceOf(SearchAdminPreconditionFailed);
      expect(reasonOf(error)).toBe("remote-create-ambiguous");
      expect(await targetRow(plan.targetId)).toMatchObject({
        state: "creating",
        remote_create_state: "ambiguous",
      });
      expect(await remote(plan)).toEqual({ index: false, alias: false });

      // Reconciliation does not trust a malformed _mapping response either.
      recorder.inject((params) =>
        params.method === "GET"
          ? { kind: "respond", status: 200, body: '{"other":{"x":1}}' }
          : undefined,
      );
      const malformed = await errorOf(
        admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
      );
      expect(malformed).toBeInstanceOf(SearchUnavailable);
      expect(malformed.details).toMatchObject({
        reason: "invalid-remote-response",
        operation: "get-mapping",
      });
      expect((await targetRow(plan.targetId))?.remote_create_state).toBe("ambiguous");

      recorder.inject(() => undefined);
      await expect(
        admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit()),
      ).resolves.toMatchObject({ remoteCreateState: "abandoned" });
    }
  });
});
