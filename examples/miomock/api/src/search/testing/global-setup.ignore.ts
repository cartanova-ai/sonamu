// The .ignore.ts suffix keeps sonamu build from bundling it: testcontainers pulls in a native module.
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "@opensearch-project/opensearch";
import {
  createSearchClient,
  RECOMMENDED_ADMIN_LIFETIMES,
  RECOMMENDED_ADMIN_TIMEOUTS,
  RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  RECOMMENDED_CUTOVER,
  RECOMMENDED_WORKER_LIMITS,
  workerBoundsFrom,
} from "@sonamu-kit/opensearch";
import { createSearchAdmin, installSearchSchema } from "@sonamu-kit/opensearch/admin";
import { createPostgresSynchronization } from "@sonamu-kit/opensearch/postgres";
import dotenv from "dotenv";
import knex, { type Knex } from "knex";
import { GenericContainer, Wait } from "testcontainers";
import { type TestProject } from "vitest/node";

import {
  DEFAULT_OPENSEARCH_IMAGE,
  SEARCH_IT_COPY_DATABASE,
  SEARCH_IT_DATABASE,
  SEARCH_IT_RENAMED_COPY_DATABASE,
  SEARCH_IT_TEMPLATE_DATABASE,
} from "./constants";

const OPENSEARCH_PORT = 9200;

const CLONED_DATABASES = [
  SEARCH_IT_DATABASE,
  SEARCH_IT_COPY_DATABASE,
  SEARCH_IT_RENAMED_COPY_DATABASE,
] as const;

/** Same defaults as sonamu.config.ts. */
function connection(database: string): Knex.PgConnectionConfig {
  const file = path.join(import.meta.dirname, "../../../.env.development");
  const env = { ...dotenv.parse(readFileSync(file)), ...process.env };
  return {
    host: env.SONAMU_DB_HOST ?? "0.0.0.0",
    port: Number(env.SONAMU_DB_PORT ?? 5432),
    user: env.SONAMU_DB_USER ?? "postgres",
    password: env.SONAMU_DB_PASSWORD ?? "miomock123",
    database,
  };
}

async function withDatabase<T>(database: string, use: (db: Knex) => Promise<T>): Promise<T> {
  const db = knex({ client: "pg", connection: connection(database), pool: { min: 0, max: 1 } });
  try {
    return await use(db);
  } finally {
    await db.destroy();
  }
}

async function terminateConnections(admin: Knex, database: string): Promise<void> {
  await admin.raw(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ? AND pid <> pg_backend_pid()",
    [database],
  );
}

async function dropSearchDatabases(): Promise<void> {
  await withDatabase("postgres", async (admin) => {
    for (const database of CLONED_DATABASES) {
      await terminateConnections(admin, database);
      await admin.raw("DROP DATABASE IF EXISTS ??", [database]);
    }
  });
}

/*
  Adopts rather than confirms ownership: the TEMPLATE clone coexists with its source, so it is a copy, and confirming
  would make two databases claim the same index. Only plans and registers the first target (the initial build stays
  open for ensureInitialTarget, which needs Sonamu), so the second clone inherits a registered index and write target.
*/
async function prepareTestStore(database: string, opensearchUrl: string): Promise<void> {
  // The definition loads models lazily, so importing it needs no Sonamu init.
  const { projectsSearchDefinition } = await import("../projects.definition");
  const { PROJECTS_SEARCH_KEY } = await import("../synchronization");
  await withDatabase(database, async (db) => {
    const client = createSearchClient({
      createClient: () => new Client({ node: opensearchUrl }),
      ownsClient: true,
      requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
    });
    const admin = createSearchAdmin({
      client,
      synchronization: createPostgresSynchronization({
        getPrimaryDatabase: () => db,
        namespace: "miomock",
      }),
      // planCreate needs exactly one definition for the key.
      definitions: [projectsSearchDefinition],
      lifetimes: RECOMMENDED_ADMIN_LIFETIMES,
      timeouts: RECOMMENDED_ADMIN_TIMEOUTS,
      cutover: RECOMMENDED_CUTOVER,
      workerBounds: workerBoundsFrom(RECOMMENDED_WORKER_LIMITS),
    });
    const audit = (step: string) => ({
      operationId: `miomock-search-it-${step}-${Date.now()}`,
      actor: "miomock-search-it",
      reason: "검색 통합 테스트용 TEMPLATE 복제본 준비",
    });
    try {
      await admin.adoptCopiedStore({ confirmCopy: true }, audit("adopt"));
      const plan = await admin.planCreate(PROJECTS_SEARCH_KEY);
      await admin.executeCreate(plan, audit("create"));
    } finally {
      await client.close();
    }
  });
}

/** Clones miomock_test, installs the schema (the dump may lag behind), prepares the store, then clones it again unadopted. */
export default async function setup(project: TestProject) {
  const image = process.env.MIOMOCK_OPENSEARCH_IMAGE ?? DEFAULT_OPENSEARCH_IMAGE;
  const container = await new GenericContainer(image)
    .withEnvironment({
      "discovery.type": "single-node",
      DISABLE_SECURITY_PLUGIN: "true",
      DISABLE_INSTALL_DEMO_CONFIG: "true",
      OPENSEARCH_JAVA_OPTS: "-Xms512m -Xmx512m",
    })
    .withUlimits({ nofile: { soft: 65536, hard: 65536 } })
    .withExposedPorts(OPENSEARCH_PORT)
    .withWaitStrategy(
      Wait.forHttp(
        "/_cluster/health?wait_for_status=yellow&timeout=5s",
        OPENSEARCH_PORT,
      ).forStatusCode(200),
    )
    .withStartupTimeout(240_000)
    .start();
  const opensearchUrl = `http://${container.getHost()}:${container.getMappedPort(OPENSEARCH_PORT)}`;

  try {
    await withDatabase("postgres", async (admin) => {
      // TEMPLATE needs a source without other connections. FILE_COPY because the PostgreSQL 15+ default (WAL_LOG)
      // does not copy PGroonga index files and later writes to projects fail.
      await terminateConnections(admin, SEARCH_IT_TEMPLATE_DATABASE);
      for (const database of CLONED_DATABASES) {
        await terminateConnections(admin, database);
        await admin.raw("DROP DATABASE IF EXISTS ??", [database]);
      }
      await admin.raw("CREATE DATABASE ?? TEMPLATE ?? STRATEGY FILE_COPY", [
        SEARCH_IT_DATABASE,
        SEARCH_IT_TEMPLATE_DATABASE,
      ]);
    });
    await withDatabase(SEARCH_IT_DATABASE, (db) => installSearchSchema(db));
    await prepareTestStore(SEARCH_IT_DATABASE, opensearchUrl);
    // Left unadopted so store-binding.search.test.ts can show the refusals.
    await withDatabase("postgres", async (admin) => {
      await terminateConnections(admin, SEARCH_IT_DATABASE);
      await admin.raw("CREATE DATABASE ?? TEMPLATE ?? STRATEGY FILE_COPY", [
        SEARCH_IT_COPY_DATABASE,
        SEARCH_IT_DATABASE,
      ]);
    });
  } catch (error) {
    await dropSearchDatabases().catch(() => {});
    await container.stop({ remove: true, removeVolumes: true });
    throw error;
  }

  project.provide("opensearchUrl", opensearchUrl);

  return async function teardown() {
    try {
      await dropSearchDatabases();
    } finally {
      await container.stop({ remove: true, removeVolumes: true });
    }
  };
}
