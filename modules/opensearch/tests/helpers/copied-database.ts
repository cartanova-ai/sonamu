import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import knexFactory, { type Knex } from "knex";
import { expect } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  type CreatePlan,
  createSearchAdmin,
  installSearchSchema,
  type SearchAdmin,
} from "../../src/admin";
import { createSearchClient, type SearchClient } from "../../src/client/search-client";
import { SearchError, SearchStoreMismatch } from "../../src/errors";
import {
  createIndexer,
  createPostgresSynchronization,
  type IndexerEvent,
  type PostgresSynchronization,
  type SearchIndexer,
} from "../../src/postgres";
import { createTestDefinition } from "../../src/testing";
import { type IntegrationHarness } from "./harness";
import { type RecordedRequest, requestRecorder } from "./request-recorder";
import { identifier, sql } from "./sql";
import { TEST_LIMITS } from "./worker-fixture";

const run = promisify(execFile);

export const NOTES_KEY = "notes";
const noteSchema = z.object({ body: z.string() });

export function notesDefinition(docs?: Map<string, { body: string }>) {
  return createTestDefinition({
    key: NOTES_KEY,
    schema: noteSchema,
    properties: { body: { type: "text" } },
    documents: () => docs ?? new Map<string, { body: string }>(),
  });
}

export function databaseUrl(
  h: IntegrationHarness,
  database: string,
  user?: { name: string; password: string },
): string {
  const parsed = new URL(h.connectionString("copy"));
  parsed.pathname = `/${database}`;
  if (user !== undefined) {
    parsed.username = user.name;
    parsed.password = user.password;
  }
  return parsed.toString();
}

export async function dropDatabase(h: IntegrationHarness, database: string): Promise<void> {
  await h.knex.raw("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ?", [
    database,
  ]);
  await h.knex.raw(sql`DROP DATABASE IF EXISTS ${identifier(database)}`);
}

export function reserveDatabase(h: IntegrationHarness, label: string): string {
  const name = `${label}_${h.id}`;
  h.onCleanup(() => dropDatabase(h, name));
  return name;
}

// CREATE DATABASE ... TEMPLATE fails while anything is connected to the source.
export async function copyByTemplate(
  h: IntegrationHarness,
  source: string,
  copy: string,
): Promise<void> {
  await h.knex.raw("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ?", [
    source,
  ]);
  await h.knex.raw(sql`CREATE DATABASE ${identifier(copy)} TEMPLATE ${identifier(source)}`);
}

export async function dumpDatabase(h: IntegrationHarness, source: string): Promise<string> {
  const container = containerOf(h);
  const file = `/tmp/${source}.dump`;
  await run("docker", ["exec", container, "pg_dump", "-U", "postgres", "-Fc", "-f", file, source]);
  return file;
}

export async function restoreDatabase(
  h: IntegrationHarness,
  file: string,
  target: string,
): Promise<void> {
  const container = containerOf(h);
  await run("docker", [
    "exec",
    container,
    "pg_restore",
    "-U",
    "postgres",
    "--exit-on-error",
    "-d",
    target,
    file,
  ]);
}

function containerOf(h: IntegrationHarness): string {
  const container = h.env.postgres.containerId;
  if (container === undefined) throw new Error("PostgreSQL 컨테이너 ID가 없습니다 (global-setup).");
  return container;
}

export interface CopyStore {
  readonly knex: Knex;
  readonly docs: Map<string, { body: string }>;
  readonly sync: PostgresSynchronization;
  readonly admin: SearchAdmin;
  readonly indexer: SearchIndexer;
  readonly requests: RecordedRequest[];
  readonly events: IndexerEvent[];
  readonly statements: string[];
  close(): Promise<void>;
}

export const COPY_LIFETIMES = {
  maxSearchLifetimeMs: 200,
  maxCursorLifetimeMs: 300,
  maxPitKeepAliveMs: 300,
  retirementSafetyMarginMs: 100,
};

export function openStore(
  h: IntegrationHarness,
  url: string,
  docs: Map<string, { body: string }>,
  options: { expectedStoreId?: string; instanceName?: string } = {},
): CopyStore {
  const knex = knexFactory({ client: "pg", connection: url, pool: { min: 0, max: 4 } });
  const statements: string[] = [];
  knex.on("query", (query: { sql: string }) => {
    statements.push(query.sql);
  });
  const events: IndexerEvent[] = [];
  const definition = notesDefinition(docs);
  const recorder = requestRecorder(h.opensearch);
  const clients: SearchClient[] = [];
  const client = () => {
    const created = createSearchClient({
      createClient: () => recorder.client,
      ownsClient: false,
      requestTimeoutMs: 20_000,
    });
    clients.push(created);
    return created;
  };
  const synchronization = (extra: { expectedStoreId?: string } = {}) =>
    createPostgresSynchronization({
      getPrimaryDatabase: () => knex,
      namespace: h.namespace,
      instanceName: options.instanceName,
      ...extra,
    });
  return {
    knex,
    docs,
    sync: synchronization(
      options.expectedStoreId === undefined ? {} : { expectedStoreId: options.expectedStoreId },
    ),
    admin: createSearchAdmin({
      client: client(),
      synchronization: synchronization(),
      definitions: [definition],
      lifetimes: COPY_LIFETIMES,
      timeouts: {
        lockTimeoutMs: 10_000,
        statementTimeoutMs: 20_000,
        idleInTransactionTimeoutMs: 60_000,
        adminLeaseMs: 120_000,
      },
      cutover: { maxPendingDocuments: 0, sampleSize: 0 },
      workerBounds: { leaseDurationMs: 200, requestTimeoutMs: 200 },
    }),
    indexer: createIndexer({
      client: client(),
      synchronization: synchronization(),
      definitions: [definition],
      limits: TEST_LIMITS,
      onEvent: (event) => {
        events.push(event);
      },
    }),
    requests: recorder.requests,
    events,
    statements,
    async close() {
      await Promise.allSettled(clients.map((created) => created.close()));
      await knex.destroy();
    },
  };
}

export async function markNote(store: CopyStore, id: string, body: string) {
  store.docs.set(id, { body });
  return store.knex.transaction((trx) => store.sync.markChanged(trx, NOTES_KEY, [id]));
}

export async function drainUntilIdle(
  indexer: SearchIndexer,
): Promise<{ indexed: number; quarantined: number }> {
  const total = { indexed: 0, quarantined: 0 };
  for (let round = 0; round < 60; round += 1) {
    const report = await indexer.drainOnce();
    total.indexed += report.indexed;
    total.quarantined += report.quarantined;
    if (report.cooldownRemainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, report.cooldownRemainingMs));
      continue;
    }
    if (report.claimed === 0) return total;
  }
  throw new Error("drain이 끝나지 않았습니다.");
}

export async function backfillAndCutover(
  h: IntegrationHarness,
  store: CopyStore,
  buildId: string,
  audit: { operationId: string; actor: string; reason: string },
): Promise<void> {
  for (let step = 0; step < 20; step += 1) {
    if ((await store.admin.runBackfillPage(buildId, { limit: 100 })).done) break;
  }
  await drainUntilIdle(store.indexer);
  await h.opensearch.indices.refresh({ index: `${h.indexPrefix}*` });
  await store.admin.cutover(buildId, audit);
}

export async function storeIdOf(db: Knex): Promise<string | undefined> {
  const { rows } = await db.raw<{ rows: { store_id: string }[] }>(
    "SELECT store_id::text FROM sonamu_search.store",
  );
  return rows[0]?.store_id;
}

export async function targetRowsOf(db: Knex) {
  const { rows } = await db.raw<{
    rows: {
      target_id: string;
      physical_index: string;
      write_alias: string;
      state: string;
      write_enabled: boolean;
    }[];
  }>(
    "SELECT target_id::text, physical_index, write_alias, state, write_enabled FROM sonamu_search.targets ORDER BY created_at, target_id",
  );
  return rows;
}

export interface NotesSource {
  readonly name: string;
  readonly docs: Map<string, { body: string }>;
  readonly served: { targetId: string; physicalIndex: string; writeAlias: string };
  readonly plan: CreatePlan;
}

export async function prepareNotesSource(
  h: IntegrationHarness,
  label: string,
  audit: () => AdminContext,
): Promise<NotesSource> {
  const name = reserveDatabase(h, label);
  await h.knex.raw(sql`CREATE DATABASE ${identifier(name)}`);
  const docs = new Map([
    ["a", { body: "원본 a" }],
    ["b", { body: "원본 b" }],
  ]);
  const store = openStore(h, databaseUrl(h, name), docs);
  try {
    await installSearchSchema(store.knex);
    const build = await store.admin.beginRebuild(
      { logicalKey: NOTES_KEY, fingerprint: notesDefinition().fingerprint },
      audit(),
    );
    await backfillAndCutover(h, store, build.buildId, audit());
    const plan = await store.admin.planCreate(NOTES_KEY);
    return { name, docs, served: build.target, plan };
  } finally {
    await store.close();
  }
}

export type RemoteOperation = readonly [string, () => Promise<void>];

export function remoteAdminOperations(
  admin: SearchAdmin,
  inputs: { targetId: string; fingerprint: string; plan: CreatePlan; audit: () => AdminContext },
): readonly RemoteOperation[] {
  const { targetId, fingerprint, plan, audit } = inputs;
  return [
    [
      "executeCreate",
      async () => {
        await admin.executeCreate(plan, audit());
      },
    ],
    [
      "beginRebuild",
      async () => {
        await admin.beginRebuild({ logicalKey: NOTES_KEY, fingerprint }, audit());
      },
    ],
    [
      "runBackfillPage",
      async () => {
        await admin.runBackfillPage(randomUUID(), { limit: 10 });
      },
    ],
    [
      "cutover",
      async () => {
        await admin.cutover(randomUUID(), audit());
      },
    ],
    [
      "rollback",
      async () => {
        await admin.rollback(randomUUID(), audit());
      },
    ],
    [
      "suspendCapture",
      async () => {
        await admin.suspendCapture(NOTES_KEY, audit());
      },
    ],
    [
      "resumeCaptureForRebuild",
      async () => {
        await admin.resumeCaptureForRebuild(NOTES_KEY, audit());
      },
    ],
    [
      "retireTarget",
      async () => {
        await admin.retireTarget(targetId, audit());
      },
    ],
    [
      "reconcileCreate",
      async () => {
        await admin.reconcileCreate(targetId, { confirmQuiescent: true }, audit());
      },
    ],
    [
      "runTargetVerificationPage",
      async () => {
        await admin.runTargetVerificationPage(targetId, { limit: 10 });
      },
    ],
    [
      "resumeTarget",
      async () => {
        await admin.resumeTarget(targetId, audit());
      },
    ],
    [
      "retryQuarantined",
      async () => {
        await admin.retryQuarantined({ targetId, limit: 10 }, audit());
      },
    ],
    [
      "remark",
      async () => {
        await admin.remark({ logicalKey: NOTES_KEY, ids: ["a"] }, audit());
      },
    ],
  ];
}

export async function expectRemoteOperationsRefused(
  store: CopyStore,
  operations: readonly RemoteOperation[],
  reason: string,
): Promise<void> {
  store.requests.splice(0);
  const outcomes: [string, string][] = [];
  for (const [name, operation] of operations) {
    const outcome = await operation().then(
      () => "resolved",
      (error: Error) =>
        error instanceof SearchStoreMismatch
          ? `SearchStoreMismatch:${String(error.details?.reason)}`
          : error instanceof SearchError
            ? `${error.code}:${String(error.details?.reason)}`
            : error.message,
    );
    outcomes.push([name, outcome]);
  }
  expect(outcomes).toEqual(operations.map(([name]) => [name, `SearchStoreMismatch:${reason}`]));
  expect(store.requests).toEqual([]);
}

export async function expectWorkerRefused(store: CopyStore, reason: string): Promise<void> {
  store.requests.splice(0);
  store.events.splice(0);
  const refused = await store.indexer.drainOnce().then(
    () => undefined,
    (error: Error) => error,
  );
  expect(refused).toBeInstanceOf(SearchStoreMismatch);
  expect(refused instanceof SearchError ? refused.details?.reason : undefined).toBe(reason);
  expect(store.requests).toEqual([]);
  expect(store.events).toEqual([{ type: "error", code: "SEARCH_STORE_MISMATCH", reason }]);
  const { rows } = await store.knex.raw<{ rows: { runtime: string; heartbeats: string }[] }>(
    "SELECT (SELECT count(*) FROM sonamu_search.delivery_runtime) AS runtime, (SELECT count(*) FROM sonamu_search.worker_heartbeats) AS heartbeats",
  );
  expect(rows).toEqual([{ runtime: "0", heartbeats: "0" }]);
}
