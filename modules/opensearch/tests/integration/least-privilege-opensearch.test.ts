import { randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";

import { Client } from "@opensearch-project/opensearch";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type ChatMessageDocument,
  chatMessagesSearch,
} from "../../examples/search/chat-messages.definition";
import { type AdminContext, createSearchAdmin, type SearchAdmin } from "../../src/admin";
import { type NativeSearchBody } from "../../src/client/sdk-types";
import {
  createSearchClient,
  getSearchRequester,
  type SearchClient,
} from "../../src/client/search-client";
import { workerBoundsFrom } from "../../src/defaults";
import { type JsonObject } from "../../src/definition/canonical-json";
import { defineSearch } from "../../src/definition/define-search";
import { buildSearchEnvelope } from "../../src/definition/envelope";
import { type SearchError } from "../../src/errors";
import {
  createIndexer,
  createPostgresCatalogReader,
  createPostgresSynchronization,
  type SearchIndexer,
} from "../../src/postgres";
import { createSearchQueries } from "../../src/query/search-queries";
import { BULK_QUERYSTRING, bulkPath, packBulkRequests } from "../../src/worker/bulk";
import { bulkResponseSchema, INDEX_NOT_FOUND_TYPE } from "../../src/worker/classify";
import {
  compareSemanticVersions,
  CONTAINER_LABEL_KEY,
  CONTAINER_LABEL_VALUE,
  parseSemanticVersion,
  resolveOpenSearchImage,
} from "../helpers/env";
import { useIntegrationHarness } from "../helpers/harness";
import {
  CLUSTER_PERMISSIONS_REQUIRED_FROM,
  LEAST_PRIVILEGE_ROLES,
  type LeastPrivilegeRole,
} from "../helpers/opensearch-roles";
import { READ_PATH_WORKER_LIMITS, useReadPathFixture } from "../helpers/read-path-fixture";

/**
 * The shared test engine runs without the security plugin, so this file starts its own single-node container with the
 * demo security setup and creates the three documented roles from tests/helpers/opensearch-roles.ts. Every remote
 * operation of each handle must succeed under its role alone, and removing any one permission must make the package
 * request that needs it fail. Managed-service permission models (AWS and others) are not covered.
 */

const PORT = 9200;
const PASSWORD = `Sn${randomBytes(6).toString("hex")}!9aA`;
const PREFIX = `snm-lp${randomBytes(3).toString("hex")}-`;
const PHYSICAL = `${PREFIX}0001`;
const ALIAS = `${PHYSICAL}-w`;
const OTHER = `${PREFIX}0002`;

let container: StartedTestContainer | null = null;
let url = "";
const opened: Client[] = [];

function clientAs(username: string, password: string): Client {
  const client = new Client({
    node: url,
    auth: { username, password },
    ssl: { rejectUnauthorized: false },
    maxRetries: 0,
    requestTimeout: 30_000,
  });
  opened.push(client);
  return client;
}

beforeAll(async () => {
  container = await new GenericContainer(resolveOpenSearchImage())
    .withEnvironment({
      "discovery.type": "single-node",
      OPENSEARCH_INITIAL_ADMIN_PASSWORD: PASSWORD,
      OPENSEARCH_JAVA_OPTS: "-Xms512m -Xmx512m",
    })
    .withUlimits({ nofile: { soft: 65536, hard: 65536 } })
    .withExposedPorts(PORT)
    .withLabels({ [CONTAINER_LABEL_KEY]: CONTAINER_LABEL_VALUE })
    .withWaitStrategy(
      Wait.forHttp("/_cluster/health?wait_for_status=yellow&timeout=5s", PORT)
        .usingTls()
        .allowInsecure()
        .withBasicCredentials("admin", PASSWORD)
        .forStatusCode(200),
    )
    .withStartupTimeout(240_000)
    .start();
  url = `https://${container.getHost()}:${container.getMappedPort(PORT)}`;
  const admin = clientAs("admin", PASSWORD);
  const security = async (path: string, body: JsonObject) => {
    const response = await admin.transport.request({ method: "PUT", path, body });
    expect([200, 201]).toContain(response.statusCode);
  };
  for (const [role, definition] of Object.entries(LEAST_PRIVILEGE_ROLES)) {
    await security(`/_plugins/_security/api/roles/${role}`, definition);
    await security(`/_plugins/_security/api/internalusers/${role}_user`, {
      password: PASSWORD,
      backend_roles: [],
    });
    await security(`/_plugins/_security/api/rolesmapping/${role}`, { users: [`${role}_user`] });
  }
}, 300_000);

afterAll(async () => {
  await Promise.allSettled(opened.map((client) => client.close()));
  await container?.stop({ remove: true, removeVolumes: true });
}, 120_000);

const as = (role: "admin" | "worker" | "query") => clientAs(`sonamu_${role}_user`, PASSWORD);

/** Returns the status instead of throwing, so refusals can be compared as values. */
async function statusOf(
  client: Client,
  request: { method: string; path: string; body?: JsonObject },
): Promise<{ status: number; type: string | undefined }> {
  const response = await client.transport.request(request, { ignore: [400, 401, 403, 404] });
  const parsed = z
    .looseObject({ error: z.looseObject({ type: z.string() }).optional() })
    .safeParse(response.body);
  return { status: response.statusCode ?? 0, type: parsed.data?.error?.type };
}

/** Sends a request built by the package's own bulk builder, exactly as the worker would. */
async function packageBulk(client: Client, target: string, ids: readonly string[]) {
  const packed = packBulkRequests(
    ids.map((id) => ({
      documentId: id,
      envelope: buildSearchEnvelope({ state: "present", document: { body: id } }, 1),
    })),
    { maxBulkBytes: 1_000_000, maxDocuments: 50 },
  );
  const searchClient = createSearchClient({
    createClient: () => client,
    ownsClient: false,
    requestTimeoutMs: 30_000,
  });
  try {
    const response = await getSearchRequester(searchClient).send({
      method: "POST",
      path: bulkPath(target),
      ndjson: packed.requests[0].body,
      querystring: BULK_QUERYSTRING,
    });
    const body = bulkResponseSchema.safeParse(response.body);
    return { status: response.status, body: body.success ? body.data : undefined };
  } finally {
    await searchClient.close();
  }
}

const catIndicesSchema = z.array(z.looseObject({ index: z.string() }));
async function indices(): Promise<string[]> {
  const response = await clientAs("admin", PASSWORD).cat.indices({
    index: `${PREFIX}*`,
    format: "json",
    expand_wildcards: "all",
  });
  return catIndicesSchema
    .parse(response.body)
    .map((row) => row.index)
    .toSorted();
}

describe("보안 플러그인을 켠 엔진의 역할별 권한", () => {
  it("쓰기 전용 역할은 인덱스를 만들 수 없고 늦은 전송은 실패한다", async () => {
    const admin = as("admin");
    const worker = as("worker");
    const query = as("query");

    // The admin role creates the index and its write alias in one request.
    const created = await statusOf(admin, {
      method: "PUT",
      path: `/${PHYSICAL}`,
      body: {
        settings: { index: { number_of_shards: 1, number_of_replicas: 0 } },
        aliases: { [ALIAS]: { is_write_index: true } },
        mappings: {
          dynamic: "strict",
          properties: {
            sonamu_meta: { type: "object", enabled: false },
            doc: { type: "object", enabled: false },
          },
        },
      },
    });
    expect(created.status).toBe(200);

    // Worker role: bulk to the write alias only; creating, deleting, alias changes and search are denied.
    const written = await packageBulk(worker, ALIAS, ["w1"]);
    expect(written.status).toBe(200);
    expect(written.body?.errors).toBe(false);
    expect(await statusOf(worker, { method: "PUT", path: `/${OTHER}` })).toMatchObject({
      status: 403,
      type: "security_exception",
    });
    expect(await statusOf(worker, { method: "DELETE", path: `/${PHYSICAL}` })).toMatchObject({
      status: 403,
    });
    expect(
      await statusOf(worker, { method: "DELETE", path: `/${PHYSICAL}/_alias/${ALIAS}` }),
    ).toMatchObject({ status: 403 });
    expect(
      await statusOf(worker, { method: "POST", path: `/${PHYSICAL}/_search`, body: {} }),
    ).toMatchObject({ status: 403 });

    // Query role: search only.
    expect(
      await statusOf(query, { method: "POST", path: `/${PHYSICAL}/_search`, body: {} }),
    ).toMatchObject({ status: 200 });
    const denied = await packageBulk(query, ALIAS, ["q1"]);
    expect(
      denied.status === 403 || denied.body?.items.every((item) => item.index.status === 403),
    ).toBe(true);
    expect(await statusOf(query, { method: "PUT", path: `/${OTHER}` })).toMatchObject({
      status: 403,
    });

    // After the admin role removes the alias, the worker's late send gets item 404 and creates nothing.
    expect(
      (await statusOf(admin, { method: "DELETE", path: `/${PHYSICAL}/_alias/${ALIAS}` })).status,
    ).toBe(200);
    const before = await indices();
    const late = await packageBulk(worker, ALIAS, ["late"]);
    expect(late.status).toBe(200);
    expect(late.body?.items.map((item) => [item.index.status, item.index.error?.type])).toEqual([
      [404, INDEX_NOT_FOUND_TYPE],
    ]);
    // Even without require_alias, the worker role may not auto-create an index.
    const unguarded = await statusOf(worker, {
      method: "PUT",
      path: `/${ALIAS}/_doc/x`,
      body: { sonamu_meta: {} },
    });
    expect(unguarded.status).toBe(403);
    expect(await indices()).toEqual(before);

    expect((await statusOf(admin, { method: "DELETE", path: `/${PHYSICAL}` })).status).toBe(200);
    const afterDelete = await packageBulk(worker, ALIAS, ["late-2"]);
    expect(afterDelete.body?.items.map((item) => item.index.status)).toEqual([404]);
    expect(await indices()).toEqual([]);
  });
});

const h = useIntegrationHarness();
const rp = useReadPathFixture(h);
const handleClients: SearchClient[] = [];

afterAll(async () => {
  await Promise.allSettled(handleClients.map((client) => client.close()));
});

function packageClientAs(role: "admin" | "worker" | "query"): SearchClient {
  const native = as(role);
  const client = createSearchClient({
    createClient: () => native,
    ownsClient: false,
    requestTimeoutMs: 15_000,
  });
  handleClients.push(client);
  return client;
}

// Requires a plugin so the rebuild really runs the plugin check; every node here has the security plugin.
const {
  fingerprint: _f,
  hashVersion: _h,
  key,
  schema,
  settings,
  mappings,
  materialize,
  captureScanBoundary,
  scanSourceIds,
} = chatMessagesSearch;
const withPlugin = defineSearch<ChatMessageDocument>({
  key,
  projectionVersion: "2-security",
  schema,
  settings,
  mappings,
  requiredPlugins: ["opensearch-security"],
  materialize,
  captureScanBoundary,
  scanSourceIds,
});
const DEFINITIONS = [chatMessagesSearch, withPlugin];
const LIFETIMES = {
  maxSearchLifetimeMs: 3_000,
  maxCursorLifetimeMs: 6_000,
  maxPitKeepAliveMs: 6_000,
  retirementSafetyMarginMs: 100,
};

function auditOf(): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason: "least privilege" };
}

async function errorOf(pending: Promise<unknown>): Promise<SearchError> {
  return pending.then(
    () => {
      throw new Error("실패해야 할 호출이 성공했습니다.");
    },
    (error: SearchError) => error,
  );
}

async function drain(indexer: SearchIndexer): Promise<void> {
  for (let round = 0; round < 30; round += 1) {
    const report = await indexer.drainOnce();
    if (report.cooldownRemainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, report.cooldownRemainingMs));
      continue;
    }
    if (report.claimed === 0) return;
  }
  throw new Error("drain이 끝나지 않았습니다.");
}

async function backfill(admin: SearchAdmin, buildId: string): Promise<void> {
  for (let step = 0; step < 50; step += 1) {
    if ((await admin.runBackfillPage(buildId, { limit: 100 })).done) return;
  }
  throw new Error("backfill이 끝나지 않았습니다.");
}

describe("최소 권한 역할로 각 핸들의 실제 작업 전부", () => {
  it("관리, 워커, 쿼리 핸들의 모든 원격 작업이 각자의 역할만으로 끝까지 간다", async () => {
    await rp.reset();
    const s0 = h.sample;
    const alice = (await s0.createUser("alice")).id;
    const room = (await s0.createRoom("general")).id;
    await s0.addMember(room, alice);
    const messages: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      messages.push(
        String((await s0.sendMessage({ roomId: room, authorId: alice, body: `hello ${i}` })).id),
      );
    }
    const capture = createPostgresSynchronization({
      getPrimaryDatabase: () => rp.captureKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    await capture.initialize();
    const adminFor = (definitions: readonly (typeof chatMessagesSearch)[]) =>
      createSearchAdmin({
        client: packageClientAs("admin"),
        synchronization: createPostgresSynchronization({
          getPrimaryDatabase: () => rp.adminKnex,
          schema: h.searchSchema,
          namespace: h.namespace,
        }),
        definitions,
        lifetimes: LIFETIMES,
        timeouts: {
          lockTimeoutMs: 10_000,
          statementTimeoutMs: 20_000,
          idleInTransactionTimeoutMs: 60_000,
          adminLeaseMs: 120_000,
        },
        // Makes cutover run sample verification (_refresh, _mget).
        cutover: { maxPendingDocuments: 0, sampleSize: 50 },
        workerBounds: workerBoundsFrom(READ_PATH_WORKER_LIMITS),
      });
    const admin = adminFor(DEFINITIONS);
    const indexer = createIndexer({
      client: packageClientAs("worker"),
      synchronization: createPostgresSynchronization({
        getPrimaryDatabase: () => rp.workerKnex,
        schema: h.searchSchema,
        namespace: h.namespace,
      }),
      definitions: DEFINITIONS,
      limits: READ_PATH_WORKER_LIMITS,
      workerId: randomUUID(),
    });
    const queries = createSearchQueries<ChatMessageDocument>({
      client: packageClientAs("query"),
      catalog: createPostgresCatalogReader({
        getPrimaryDatabase: () => rp.queryKnex,
        schema: h.searchSchema,
        namespace: h.namespace,
      }),
      logicalKey: key,
      supportedFingerprints: DEFINITIONS.map((definition) => definition.fingerprint),
      limits: {
        maxPageSize: 10,
        timeoutMs: 3_000,
        maxSearchLifetimeMs: LIFETIMES.maxSearchLifetimeMs,
        maxCursorLifetimeMs: LIFETIMES.maxCursorLifetimeMs,
        maxPitKeepAliveMs: LIFETIMES.maxPitKeepAliveMs,
      },
      cursor: { signingKeys: [{ id: "k1", secret: new Uint8Array(32).fill(7) }] },
      policy: { sourceIncludes: ["body"] },
    });
    const markEdit = async (id: string, body: string) => {
      await rp.captureKnex.transaction(async (trx) => {
        await s0.editMessage(id, body, trx);
        expect(await capture.markChanged(trx, key, [id])).toBe("recorded");
      });
    };

    // Create, backfill, drain and a verified cutover.
    const plan = await admin.planCreate(key, { fingerprint: chatMessagesSearch.fingerprint });
    const first = await admin.executeCreate(plan, auditOf());
    const build = (await admin.inspect(key)).openBuild;
    if (build === null) throw new Error("열린 빌드가 없습니다.");
    await backfill(admin, build.buildId);
    await drain(indexer);
    await admin.cutover(build.buildId, auditOf());

    // Search with a PIT cursor over two pages, close it, then a cursor without PIT.
    const body = {
      query: { match: { "doc.body": "hello" } },
      // Cursors need a unique sort; search_after skips ties.
      sort: ["doc.room_id", "_id"],
      size: 2,
    } satisfies NativeSearchBody;
    const page = await queries.search({ body, paginate: { pit: true } });
    expect(page.hits).toHaveLength(2);
    const cursor = page.nextCursor ?? "";
    const next = await queries.search({ body, cursor });
    expect(next.hits.length).toBeGreaterThan(0);
    await queries.closeCursor(next.nextCursor ?? cursor);
    expect((await queries.search({ body, paginate: {} })).nextCursor).toEqual(expect.any(String));

    // Conflict verification (worker _mget): an external write ahead of the ledger pauses the target.
    const stray = messages[0] ?? "";
    await clientAs("admin", PASSWORD).index({
      index: first.physicalIndex,
      id: stray,
      version: 3,
      version_type: "external",
      refresh: true,
      body: {
        sonamu_meta: {
          deleted: false,
          revision: 3,
          hash_version: "sonamu-c14n-v1",
          projection_hash: "0".repeat(64),
        },
        doc: {
          room_id: String(room),
          author_id: null,
          body: "외부",
          updated_at: new Date().toISOString(),
        },
      },
    });
    await markEdit(stray, "hello edited");
    await drain(indexer);
    expect(
      (await admin.inspect(key)).targets.find((t) => t.targetId === first.targetId)?.state,
    ).toBe("paused");

    // Verification scan of the paused target (_stats, _refresh, PIT) and resume (_mapping, _alias).
    await admin.remark({ logicalKey: key, ids: [stray] }, auditOf());
    let progress;
    for (let attempt = 0; ; attempt += 1) {
      const result = await admin.runTargetVerificationPage(first.targetId, { limit: 2 }).then(
        (value) => value,
        (error: SearchError) => error,
      );
      if ("done" in result) {
        progress = result;
        if (result.done) break;
        continue;
      }
      // Right after the pause the in-flight bound must pass first.
      expect(result.details?.reason).toBe("verification-not-quiesced");
      if (attempt > 100) throw result;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(progress).toMatchObject({ done: true, violations: 0, checked: 5 });
    await admin.resumeTarget(first.targetId, auditOf());
    await drain(indexer);

    // Rebuild with the plugin check, cutover, and retirement of the old target.
    const rebuild = await admin.beginRebuild(
      { logicalKey: key, fingerprint: withPlugin.fingerprint },
      auditOf(),
    );
    await backfill(admin, rebuild.buildId);
    await drain(indexer);
    await admin.cutover(rebuild.buildId, auditOf());
    const confirmed = await rp.deselectConfirmedAt(first.targetId);
    await rp.waitForDatabaseTime(
      (confirmed ?? 0) +
        LIFETIMES.maxCursorLifetimeMs +
        LIFETIMES.maxSearchLifetimeMs +
        LIFETIMES.retirementSafetyMarginMs +
        50,
    );
    await admin.retireTarget(first.targetId, auditOf());
    expect(await rp.targetState(first.targetId)).toBe("retired");

    // Ownership confirmation takes over the serving target's fence (_mget and a bulk to the write alias).
    const owned = await admin.confirmStoreOwnership({ confirmSoleOwner: true }, auditOf());
    expect(owned.fencedTargets.map((fenced) => fenced.targetId)).toEqual([rebuild.target.targetId]);

    // Suspend and resume at a new epoch; resume needs a handle with a single definition for the key.
    await admin.suspendCapture(key, auditOf());
    const resumed = await adminFor([withPlugin]).resumeCaptureForRebuild(key, auditOf());
    expect(resumed.target.remoteCreateState).toBe("verified");
    expect(
      (
        await errorOf(
          admin.reconcileCreate(resumed.target.targetId, { confirmQuiescent: true }, auditOf()),
        )
      ).details?.reason,
    ).toEqual(expect.any(String));
  }, 240_000);

  /** A package request that needs exactly one permission; without it the request must be denied. */
  interface ProbeRequest {
    method: string;
    path: string;
    body?: JsonObject;
    querystring?: Record<string, string>;
  }
  const PROBES = {
    sonamu_admin: {
      "indices:data/read/mget": () => ({
        method: "POST",
        path: `/${PROBE_INDEX}/_mget`,
        body: { ids: ["x"] },
      }),
      "cluster:monitor/nodes/info": () => ({
        method: "GET",
        path: "/_cat/plugins",
        querystring: { format: "json" },
      }),
      "cluster:monitor/nodes/stats": () => ({
        method: "GET",
        path: "/_cat/nodes",
        querystring: { format: "json" },
      }),
      "cluster:monitor/state": () => ({
        method: "GET",
        path: "/_cat/nodes",
        querystring: { format: "json" },
      }),
      // Fence takeover in confirmStoreOwnership.
      "indices:data/write/bulk": () => bulkProbe(),
      "indices:data/write/bulk*": () => bulkProbe(),
      "indices:data/write/index": () => bulkProbe(),
      "indices:admin/create": () => ({
        method: "PUT",
        path: `/${PREFIX}probe-${randomUUID().slice(0, 8)}`,
      }),
      "indices:admin/delete": () => ({ method: "DELETE", path: `/${PROBE_INDEX}-gone` }),
      "indices:admin/aliases": () => ({
        method: "DELETE",
        path: `/${PROBE_INDEX}/_alias/${PROBE_INDEX}-w`,
      }),
      "indices:admin/aliases/get": () => ({
        method: "GET",
        path: `/${PROBE_INDEX}-w/_alias/${PROBE_INDEX}-w`,
      }),
      "indices:admin/mappings/get": () => ({ method: "GET", path: `/${PROBE_INDEX}/_mapping` }),
      "indices:admin/refresh*": () => ({ method: "POST", path: `/${PROBE_INDEX}/_refresh` }),
      "indices:monitor/stats": () => ({
        method: "GET",
        path: `/${PROBE_INDEX}/_stats/docs`,
        querystring: { level: "shards" },
      }),
      "indices:data/read/mget*": () => ({
        method: "POST",
        path: `/${PROBE_INDEX}/_mget`,
        body: { ids: ["x"] },
      }),
      "indices:data/read/search*": () => ({
        method: "POST",
        path: `/${PROBE_INDEX}/_search`,
        body: { size: 1 },
      }),
      "indices:data/read/point_in_time/create": () => ({
        method: "POST",
        path: `/${PROBE_INDEX}/_search/point_in_time`,
        querystring: { keep_alive: "1m" },
      }),
      "indices:data/read/point_in_time/delete": () => ({
        method: "DELETE",
        path: "/_search/point_in_time",
        body: { pit_id: [probePit] },
      }),
    },
    sonamu_worker: {
      "indices:data/write/bulk": () => bulkProbe(),
      "indices:data/read/mget": () => ({
        method: "POST",
        path: `/${PROBE_INDEX}/_mget`,
        body: { ids: ["x"] },
      }),
      "indices:data/write/bulk*": () => bulkProbe(),
      "indices:data/write/index": () => bulkProbe(),
      "indices:data/read/mget*": () => ({
        method: "POST",
        path: `/${PROBE_INDEX}/_mget`,
        body: { ids: ["x"] },
      }),
    },
    sonamu_query: {
      "indices:data/read/search*": () => ({
        method: "POST",
        path: `/${PROBE_INDEX}/_search`,
        body: { size: 1 },
      }),
      "indices:data/read/point_in_time/create": () => ({
        method: "POST",
        path: `/${PROBE_INDEX}/_search/point_in_time`,
        querystring: { keep_alive: "1m" },
      }),
      "indices:data/read/point_in_time/delete": () => ({
        method: "DELETE",
        path: "/_search/point_in_time",
        body: { pit_id: [probePit] },
      }),
    },
  } satisfies Record<LeastPrivilegeRole, Record<string, () => ProbeRequest>>;
  const PROBE_INDEX = `${PREFIX}probe`;
  let probePit = "";
  const bulkProbe = (): ProbeRequest => ({
    method: "POST",
    path: `/${PROBE_INDEX}-w/_bulk`,
    querystring: { require_alias: "true" },
    body: { index: { _id: "p" } },
  });

  it("역할의 권한은 모두 필요하다: 하나를 빼면 그 권한을 쓰는 패키지 요청이 거부된다", async () => {
    const superuser = clientAs("admin", PASSWORD);
    await superuser.transport.request({
      method: "PUT",
      path: `/${PROBE_INDEX}`,
      // Like package targets, the mapping never changes; a dynamic mapping update needs another permission.
      body: {
        aliases: { [`${PROBE_INDEX}-w`]: { is_write_index: true } },
        mappings: { dynamic: false },
      },
    });
    await superuser.transport.request({ method: "PUT", path: `/${PROBE_INDEX}-gone` });
    /** Denied means 403, or item-level denial for bulk and mget. */
    const probeDenied = async (
      role: LeastPrivilegeRole,
      request: ProbeRequest,
    ): Promise<{ denied: boolean; status: number }> => {
      // An earlier probe may have removed the alias; restore it and open a fresh PIT to close.
      await superuser.transport.request({
        method: "PUT",
        path: `/${PROBE_INDEX}/_alias/${PROBE_INDEX}-w`,
        body: { is_write_index: true },
      });
      const pit = await superuser.transport.request({
        method: "POST",
        path: `/${PROBE_INDEX}/_search/point_in_time`,
        querystring: { keep_alive: "1m" },
      });
      probePit = z.looseObject({ pit_id: z.string() }).parse(pit.body).pit_id;
      const user = clientAs(`${role}_user`, PASSWORD);
      const response = await user.transport.request(
        request.path.endsWith("/_bulk")
          ? {
              method: request.method,
              path: request.path,
              querystring: request.querystring,
              bulkBody: [request.body ?? {}, { sonamu_meta: {} }],
            }
          : {
              method: request.method,
              path: request.path,
              querystring: request.querystring,
              body: request.body,
            },
        { ignore: [400, 401, 403, 404, 409] },
      );
      const status = response.statusCode ?? 0;
      const items = z
        .looseObject({
          items: z.array(z.looseObject({ index: z.looseObject({ status: z.number() }) })).min(1),
        })
        .safeParse(response.body);
      const docs = z
        .looseObject({
          docs: z
            .array(z.looseObject({ error: z.looseObject({ type: z.string() }).optional() }))
            .min(1),
        })
        .safeParse(response.body);
      return {
        status,
        denied:
          status === 403 ||
          (items.success && items.data.items.every((item) => item.index.status === 403)) ||
          (docs.success && docs.data.docs.every((doc) => doc.error?.type === "security_exception")),
      };
    };
    const info = z
      .looseObject({ version: z.looseObject({ number: z.string() }) })
      .parse((await superuser.transport.request({ method: "GET", path: "/" })).body);
    const engine = parseSemanticVersion(info.version.number);
    if (engine === null) throw new Error(`엔진 버전을 읽지 못했습니다: ${info.version.number}`);
    /** Only some cluster permissions depend on the engine version. */
    const requiredHere = (action: string, cluster: boolean): boolean => {
      const from = cluster ? CLUSTER_PERMISSIONS_REQUIRED_FROM.get(action) : undefined;
      const parsed = from === undefined ? null : parseSemanticVersion(from);
      return parsed === null || compareSemanticVersions(engine, parsed) >= 0;
    };
    const allRoles: readonly LeastPrivilegeRole[] = [
      "sonamu_admin",
      "sonamu_worker",
      "sonamu_query",
    ];
    // Baseline: with the full role every probe is allowed, so each probe tests only its permission.
    for (const role of allRoles) {
      const probes: Record<string, () => ProbeRequest> = PROBES[role];
      for (const [action, probe] of Object.entries(probes)) {
        const result = await probeDenied(role, probe());
        expect(
          result.denied,
          `${role}의 전체 역할에서 ${action} 탐침이 거부됐습니다 (${result.status})`,
        ).toBe(false);
      }
    }
    for (const role of allRoles) {
      const probes: Record<string, () => ProbeRequest> = PROBES[role];
      const definition = LEAST_PRIVILEGE_ROLES[role];
      for (const [action, probe] of Object.entries(probes)) {
        const reduced = {
          cluster_permissions: definition.cluster_permissions.filter((item) => item !== action),
          index_permissions: definition.index_permissions.map((entry) => ({
            ...entry,
            allowed_actions: entry.allowed_actions.filter((item) => item !== action),
          })),
        };
        await superuser.transport.request({
          method: "PUT",
          path: `/_plugins/_security/api/roles/${role}`,
          body: reduced,
        });
        try {
          const request = probe();
          const result = await probeDenied(role, request);
          const cluster = definition.cluster_permissions.some((item) => item === action);
          expect
            .soft(
              result.denied,
              `${role}에서 ${action}을 빼면 ${request.method} ${request.path}가 ${result.status}였습니다 (엔진 ${info.version.number})`,
            )
            .toBe(requiredHere(action, cluster));
        } finally {
          await superuser.transport.request({
            method: "PUT",
            path: `/_plugins/_security/api/roles/${role}`,
            body: definition,
          });
        }
      }
    }
  }, 240_000);
});
