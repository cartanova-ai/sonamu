import { randomUUID } from "node:crypto";

import { Client } from "@opensearch-project/opensearch";
import knexFactory, { type Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { applySearchGrants, createSearchAdmin, type SearchAdmin } from "../../src/admin";
import { createSearchClient, type SearchClient } from "../../src/client/search-client";
import { type DefinedSearch, defineSearch } from "../../src/definition/define-search";
import { SearchAdminPreconditionFailed, SearchError, SearchNotConfigured } from "../../src/errors";
import {
  createIndexer,
  createPostgresCatalogReader,
  createPostgresSynchronization,
} from "../../src/postgres";
import { createSearchQueries } from "../../src/query/search-queries";
import { TEST_READ_LIFETIMES } from "../../src/testing";
import { type TestRole, useIntegrationHarness } from "../helpers/harness";
import { sendBulk } from "../helpers/opensearch-ops";
import { qualified, sql } from "../helpers/sql";
import { resetSearchSchema } from "../helpers/test-targets";

/**
 * Nothing but executeCreate may create an index or alias: searches, marks, bulks to the write alias and the worker
 * leave the cluster-wide index and alias listings unchanged.
 */

const h = useIntegrationHarness({ sampleDomain: false });
const KEY = "ghosts";
const WORKER_QUERY = { require_alias: "true" } as const;

const nativeClients: Client[] = [];
const searchClients: SearchClient[] = [];
// Each handle runs on a pool of the role applySearchGrants granted.
let adminKnex: Knex;
let captureKnex: Knex;
let queryKnex: Knex;
let workerKnex: Knex;
const roles = {
  admin: "",
  capture: "",
  query: "",
  worker: "",
};

function rolePool(role: TestRole, application: string): Knex {
  const url = new URL(role.url);
  url.searchParams.set("application_name", "h:" + h.id + ":" + application);
  return knexFactory({ client: "pg", connection: url.toString(), pool: { min: 0, max: 4 } });
}

function engineUrl(): string {
  const endpoint = h.env.opensearch;
  if (endpoint === null) throw new Error("OpenSearch 접속 정보가 없습니다.");
  return endpoint.url;
}

function searchClient(): SearchClient {
  const native = new Client({ node: engineUrl(), maxRetries: 0 });
  nativeClients.push(native);
  const client = createSearchClient({
    createClient: () => native,
    ownsClient: false,
    requestTimeoutMs: 10_000,
  });
  searchClients.push(client);
  return client;
}

afterAll(async () => {
  await Promise.allSettled(searchClients.map((client) => client.close()));
  await Promise.allSettled(nativeClients.map((client) => client.close()));
  await Promise.allSettled(
    [adminKnex, captureKnex, queryKnex, workerKnex].map((db) => db?.destroy()),
  );
});

function definition(requiredPlugins: string[] = [], key: string = KEY): DefinedSearch {
  return defineSearch({
    key,
    projectionVersion: "1",
    schema: z.object({ body: z.string() }),
    settings: { index: { number_of_shards: 1, number_of_replicas: 0 } },
    mappings: { properties: { body: { type: "text" } } },
    requiredPlugins,
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

function adminFor(defined: DefinedSearch): SearchAdmin {
  return createSearchAdmin({
    client: searchClient(),
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [defined],
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    timeouts: {
      lockTimeoutMs: 5_000,
      // A 60 s lease leaves a remote request bound of (60 s - 4 * 5 s) / 3.
      statementTimeoutMs: 5_000,
      idleInTransactionTimeoutMs: 30_000,
      adminLeaseMs: 60_000,
    },
    cutover: { maxPendingDocuments: 0, sampleSize: 0 },
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 30_000 },
  });
}

const catIndicesSchema = z.array(z.looseObject({ index: z.string() }));
const catAliasesSchema = z.array(z.looseObject({ alias: z.string(), index: z.string() }));
const catPluginsSchema = z.array(z.looseObject({ component: z.string() }));

/** Every index (hidden and closed included) and alias in the cluster. */
async function clusterObjects(): Promise<{ indices: string[]; aliases: string[] }> {
  const indices = catIndicesSchema.parse(
    (await h.opensearch.cat.indices({ format: "json", h: ["index"], expand_wildcards: "all" }))
      .body,
  );
  const aliases = catAliasesSchema.parse(
    (
      await h.opensearch.cat.aliases({
        format: "json",
        h: ["alias", "index"],
        expand_wildcards: "all",
      })
    ).body,
  );
  return {
    indices: indices.map((row) => row.index).toSorted(),
    aliases: aliases.map((row) => row.alias + "@" + row.index).toSorted(),
  };
}

async function tableCounts(): Promise<number[]> {
  const counts: number[] = [];
  for (const table of ["indexes", "targets", "builds", "documents", "deliveries"]) {
    const { rows } = await h.knex.raw<{ rows: { n: string }[] }>(
      sql`SELECT count(*) AS n FROM ${qualified(h.searchSchema, table)}`,
    );
    counts.push(Number(rows[0].n));
  }
  return counts;
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

async function grantAll(): Promise<void> {
  await applySearchGrants(h.knex, {
    schema: h.searchSchema,
    roles: {
      admin: [roles.admin],
      capture: [roles.capture],
      query: [roles.query],
      worker: [roles.worker],
    },
  });
}

async function schemaNames(): Promise<string[]> {
  const { rows } = await h.knex.raw<{ rows: { name: string }[] }>(
    "SELECT nspname AS name FROM pg_namespace ORDER BY 1",
  );
  return rows.map((row) => row.name);
}

beforeAll(async () => {
  await resetSearchSchema(h);
  const [admin, capture, query, worker] = [
    await h.createRole("admin"),
    await h.createRole("capture"),
    await h.createRole("query"),
    await h.createRole("worker"),
  ];
  roles.admin = admin.name;
  roles.capture = capture.name;
  roles.query = query.name;
  roles.worker = worker.name;
  await grantAll();
  adminKnex = rolePool(admin, "admin");
  captureKnex = rolePool(capture, "capture");
  queryKnex = rolePool(query, "query");
  workerKnex = rolePool(worker, "worker");
});

describe("자동 프로비저닝 없음", () => {
  it("대상이 없는 logical key에 검색, markChanged, 쓰기 alias bulk를 해도 인덱스도 alias도 생기지 않는다", async () => {
    const defined = definition();
    const admin = adminFor(defined);
    const before = await clusterObjects();
    const countsBefore = await tableCounts();

    // Planning only chooses names.
    const plan = await admin.planCreate(KEY);
    expect(await clusterObjects()).toEqual(before);
    expect(await tableCounts()).toEqual(countsBefore);

    const queries = createSearchQueries({
      client: searchClient(),
      catalog: createPostgresCatalogReader({
        getPrimaryDatabase: () => queryKnex,
        schema: h.searchSchema,
        namespace: h.namespace,
      }),
      logicalKey: KEY,
      supportedFingerprints: [defined.fingerprint],
      limits: { maxPageSize: 10, timeoutMs: 5_000, ...TEST_READ_LIFETIMES },
    });
    const searched = await errorOf(queries.search({ body: { query: { match_all: {} } } }));
    expect(["SEARCH_NOT_CONFIGURED", "SEARCH_NOT_READY"]).toContain(searched.code);

    const sync = createPostgresSynchronization({
      getPrimaryDatabase: () => captureKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    await sync.initialize();
    const marked = await errorOf(
      captureKnex.transaction((trx) => sync.markChanged(trx, KEY, ["a"])),
    );
    expect(marked).toBeInstanceOf(SearchNotConfigured);

    // A worker-shaped bulk with require_alias=true gets item 404 for both the alias and the physical name.
    for (const target of [plan.writeAlias, plan.physicalIndex]) {
      const result = await sendBulk(
        h.opensearch,
        target,
        [
          { index: { _id: "a", version: 1, version_type: "external" } },
          {
            sonamu_meta: {
              deleted: true,
              revision: 1,
              hash_version: "sonamu-c14n-v1",
              projection_hash: "x",
            },
          },
        ],
        WORKER_QUERY,
      );
      expect(result.items.map((item) => item.status)).toEqual([404]);
    }

    expect(await clusterObjects()).toEqual(before);
    expect(await tableCounts()).toEqual(countsBefore);
    expect(before.indices).not.toContain(plan.physicalIndex);
  });

  it("필요한 플러그인이 없으면 executeCreate는 원격 명령과 PostgreSQL 기록 없이 거부하고 클러스터 설정을 바꾸지 않는다", async () => {
    // afterEach emptied the store too, and planCreate needs the store_id for _meta.
    await resetSearchSchema(h);
    await grantAll();
    const installed = catPluginsSchema.parse(
      (await h.opensearch.cat.plugins({ format: "json" })).body,
    );
    const present = installed[0]?.component;
    if (present !== undefined) {
      const satisfied = await adminFor(definition([present])).planCreate(KEY);
      expect(satisfied.missingPlugins).toEqual([]);
    }

    const missing = "sonamu-missing-plugin-" + randomUUID().slice(0, 8);
    const admin = adminFor(definition([missing]));
    const settingsBefore = (await h.opensearch.cluster.getSettings({ flat_settings: true })).body;
    const before = await clusterObjects();
    const countsBefore = await tableCounts();

    const plan = await admin.planCreate(KEY);
    expect(plan.missingPlugins).toEqual([missing]);
    expect(plan.warnings).toContain("plugins-missing");

    const refused = await errorOf(
      admin.executeCreate(plan, { operationId: "op-plugins", actor: "tester", reason: "plugins" }),
    );
    expect(refused).toBeInstanceOf(SearchAdminPreconditionFailed);
    expect(refused.details).toMatchObject({ reason: "plugins-missing", count: 1 });

    expect((await h.opensearch.cluster.getSettings({ flat_settings: true })).body).toEqual(
      settingsBefore,
    );
    expect(await clusterObjects()).toEqual(before);
    expect(await tableCounts()).toEqual(countsBefore);
  });
  it("start와 drainOnce는 인덱스, alias, 스키마를 만들지 않는다 (대상이 없는 logical key 포함)", async () => {
    // afterEach emptied the package tables, so reinstall the store.
    await resetSearchSchema(h);
    await grantAll();
    const real = definition([], "reals");
    const ghost = definition();
    const admin = adminFor(real);
    const plan = await admin.planCreate("reals");
    await admin.executeCreate(plan, { operationId: "op-reals", actor: "tester", reason: "worker" });
    const sync = createPostgresSynchronization({
      getPrimaryDatabase: () => captureKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    await sync.initialize();
    await captureKnex.transaction((trx) => sync.markChanged(trx, "reals", ["r1"]));
    const ghostPlan = await adminFor(ghost).planCreate(KEY);

    const before = await clusterObjects();
    const schemasBefore = await schemaNames();
    expect(before.indices).toContain(plan.physicalIndex);
    const client = searchClient();
    const indexer = createIndexer({
      client,
      synchronization: createPostgresSynchronization({
        getPrimaryDatabase: () => workerKnex,
        schema: h.searchSchema,
        namespace: h.namespace,
      }),
      definitions: [real, ghost],
      limits: {
        maxDocumentsPerClaim: 10,
        maxBulkBytes: 1_000_000,
        maxConcurrentBulkRequests: 1,
        projectionTimeoutMs: 2_000,
        requestTimeoutMs: 5_000,
        leaseDurationMs: 20_000,
        heartbeatIntervalMs: 5_000,
        maxRetryAttempts: 3,
        maxRetryAgeMs: 60_000,
        maxIsolationCallsPerBatch: 10,
        retryBaseDelayMs: 20,
        retryMaxDelayMs: 200,
        maxInFlightBytes: 10_000_000,
        statementTimeoutMs: 2_000,
        fenceRenewIntervalMs: 30_000,
      },
    });
    // The key with a target indexes a tombstone; the key without one has nothing to claim.
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 1, indexed: 1 });
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 0 });
    const handle = indexer.start({ pollIntervalMs: 20 });
    const deadline = Date.now() + 10_000;
    while (handle.status().lastDrainAt === undefined && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(handle.status().lastDrainAt).toBeDefined();
    await handle.stop({ deadlineMs: 5_000 });

    expect(await clusterObjects()).toEqual(before);
    expect(await schemaNames()).toEqual(schemasBefore);
    expect(before.indices).not.toContain(ghostPlan.physicalIndex);
    expect(before.aliases.some((alias) => alias.startsWith(ghostPlan.writeAlias + "@"))).toBe(
      false,
    );
  });
});
