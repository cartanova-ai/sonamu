import { randomUUID } from "node:crypto";

import { type ApiError, type ApiResponse, Client, Transport } from "@opensearch-project/opensearch";
import {
  type TransportRequestCallback,
  type TransportRequestOptions,
  type TransportRequestParams,
  type TransportRequestPromise,
} from "@opensearch-project/opensearch/lib/Transport.js";
import knexFactory, { type Knex } from "knex";
import { afterAll, afterEach, beforeAll } from "vitest";
import { z } from "zod";

import { applySearchGrants } from "../../src/admin";
import { createSearchClient, type SearchClient } from "../../src/client/search-client";
import { type JsonObject, jsonValueSchema } from "../../src/definition/canonical-json";
import {
  type DefinedSearch,
  defineSearch,
  type DocumentId,
  type Projection,
  type ProjectionReadContext,
} from "../../src/definition/define-search";
import {
  createIndexer,
  createPostgresSynchronization,
  type IndexerEvent,
  type PostgresSynchronization,
  type SearchIndexer,
  type WorkerLimits,
} from "../../src/postgres";
import { FENCE_DOCUMENT_ID } from "../../src/worker/fence";
import { type IntegrationHarness, type TestRole } from "./harness";
import { identifier, qualified, sql } from "./sql";
import { createTarget, type PreparedTarget, resetSearchSchema } from "./test-targets";

export type WriterIsolation = "read committed" | "repeatable read";
export const WRITER_ISOLATIONS: readonly WriterIsolation[] = ["read committed", "repeatable read"];

export type Note = JsonObject & { body: string };

export interface NoteHooks {
  beforeRead?: (context: ProjectionReadContext, ids: readonly DocumentId[]) => Promise<void>;
}

export interface BulkRecord {
  readonly path: string;
  readonly ids: readonly string[];
  readonly versions: readonly number[];
  readonly body: string;
  readonly fenceEpoch?: number;
}

export interface BulkHooks {
  before?: (record: BulkRecord) => Promise<void>;
  after?: (record: BulkRecord) => Promise<void>;
}

export interface RecordedStatement {
  readonly sql: string;
  readonly bindings: readonly unknown[];
  readonly at: number;
}

export interface WorkerSetup {
  readonly targets: ReadonlyMap<string, PreparedTarget>;
  readonly definitions: ReadonlyMap<string, DefinedSearch>;
  readonly capture: Knex;
  readonly captureSync: PostgresSynchronization;
  readonly worker: Knex;
  readonly statements: RecordedStatement[];
}

export const TEST_LIMITS: WorkerLimits = Object.freeze({
  maxDocumentsPerClaim: 50,
  maxBulkBytes: 1_000_000,
  maxConcurrentBulkRequests: 2,
  projectionTimeoutMs: 3_000,
  requestTimeoutMs: 10_000,
  leaseDurationMs: 30_000,
  heartbeatIntervalMs: 10_000,
  maxRetryAttempts: 3,
  maxRetryAgeMs: 600_000,
  maxIsolationCallsPerBatch: 20,
  retryBaseDelayMs: 20,
  retryMaxDelayMs: 200,
  maxInFlightBytes: 50_000_000,
  statementTimeoutMs: 1_000,
  fenceRenewIntervalMs: 30_000,
});

const noteRowSchema = z.object({
  id: z.string(),
  body: z.string(),
  extra: z.record(z.string(), z.json()).nullable(),
  slow: z.boolean(),
});
const rowsSchema = z.object({ rows: z.array(noteRowSchema) });

export function noteDefinition(
  h: IntegrationHarness,
  key: string,
  hooks: NoteHooks = {},
): DefinedSearch<Note> {
  const notes = qualified(h.appSchema, "notes");
  return defineSearch<Note>({
    key,
    projectionVersion: "1",
    // Extra keys pass through so that the engine's strict mapping rejects them.
    schema: z.object({ body: z.string() }).catchall(jsonValueSchema),
    settings: { index: { number_of_shards: 1, number_of_replicas: 0 } },
    mappings: { properties: { body: { type: "text" }, tag: { type: "keyword" } } },
    requiredPlugins: [],
    async materialize(context, ids) {
      await hooks.beforeRead?.(context, ids);
      const { rows } = rowsSchema.parse(
        await context.trx.raw(
          sql`SELECT id, body, extra, slow FROM ${notes} WHERE key = ? AND id = ANY(?) ORDER BY id`,
          [key, [...ids]],
        ),
      );
      if (rows.some((row) => row.slow)) {
        // Outlasts statement_timeout, which equals projectionTimeoutMs.
        await context.trx.raw("SELECT pg_sleep(30)");
      }
      const byId = new Map(rows.map((row) => [row.id, row]));
      return new Map(
        ids.map((id): [DocumentId, Projection<Note>] => {
          const row = byId.get(id);
          return [
            id,
            row === undefined
              ? { state: "deleted" }
              : { state: "present", document: { ...row.extra, body: row.body } },
          ];
        }),
      );
    },
    async captureScanBoundary() {
      return "";
    },
    async scanSourceIds() {
      return { ids: [] };
    },
  });
}

function bulkRecordOf(params: TransportRequestParams): BulkRecord {
  const text = z.string().safeParse(params.bulkBody).data ?? "";
  const lines = text.split("\n").filter((line) => line !== "");
  const ids: string[] = [];
  const versions: number[] = [];
  let fenceEpoch: number | undefined;
  const actionSchema = z.object({ index: z.object({ _id: z.string(), version: z.number() }) });
  for (let index = 0; index < lines.length; index += 2) {
    const action = actionSchema.parse(JSON.parse(lines[index] ?? "{}"));
    // The fence item the worker prefixes to every bulk is not a document.
    if (action.index._id === FENCE_DOCUMENT_ID) {
      fenceEpoch = action.index.version;
      continue;
    }
    ids.push(action.index._id);
    versions.push(action.index.version);
  }
  return fenceEpoch === undefined
    ? { path: params.path, ids, versions, body: text }
    : { path: params.path, ids, versions, body: text, fenceEpoch };
}

// The Transport awaits the hooks around each document bulk so tests can interleave commits without sleeps.
export function recordingClient(base: Client, hooks: BulkHooks = {}) {
  const bulks: BulkRecord[] = [];
  const fenceBulks: BulkRecord[] = [];
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
      if (
        callback !== undefined ||
        !params.path.endsWith("/_bulk") ||
        params.bulkBody === undefined
      ) {
        return super.request(params, options, callback);
      }
      const record = bulkRecordOf(params);
      if (record.ids.length === 0 && record.fenceEpoch !== undefined) {
        fenceBulks.push(record);
        return super.request(params, options);
      }
      bulks.push(record);
      let inner: TransportRequestPromise<ApiResponse> | undefined;
      let aborted = false;
      const send = (): TransportRequestPromise<ApiResponse> => super.request(params, options);
      const pending = (async () => {
        await hooks.before?.(record);
        if (aborted) throw new Error("요청이 보내기 전에 중단됐습니다.");
        inner = send();
        const response = await inner;
        await hooks.after?.(record);
        return response;
      })();
      return Object.assign(pending, {
        abort: () => {
          aborted = true;
          inner?.abort();
        },
      });
    }
  }
  return { client: base.child({ Transport: RecordingTransport }), bulks, fenceBulks };
}

export interface Latch {
  readonly promise: Promise<void>;
  open(): void;
}

export function latch(): Latch {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

export async function waitFor(
  what: string,
  check: () => Promise<boolean> | boolean,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${what}: ${timeoutMs}ms 안에 조건이 참이 되지 않았습니다.`);
}

export interface IndexedDocument {
  readonly version: number;
  readonly deleted: boolean;
  readonly revision: number;
  readonly doc: JsonObject | undefined;
}

const indexedSourceSchema = z.object({
  sonamu_meta: z.object({ deleted: z.boolean(), revision: z.number() }),
  doc: z.record(z.string(), z.json()).optional(),
});
const getResponseSchema = z.looseObject({
  found: z.boolean(),
  _version: z.number().optional(),
  _source: z.unknown().optional(),
});

export interface WorkerFixtureKit {
  setUp(options?: {
    keys?: readonly string[];
    hooks?: Readonly<Record<string, NoteHooks>>;
  }): Promise<WorkerSetup>;
  nativeClient(): Client;
  indexer(
    setup: WorkerSetup,
    options?: {
      client?: Client;
      limits?: Partial<WorkerLimits>;
      events?: IndexerEvent[];
      primary?: () => Knex;
      ownsClient?: boolean;
    },
  ): { indexer: SearchIndexer; searchClient: SearchClient };
  write(
    setup: WorkerSetup,
    key: string,
    ids: readonly string[],
    mutate: (trx: Knex.Transaction) => Promise<void>,
    isolation?: WriterIsolation,
  ): Promise<void>;
  upsert(
    trx: Knex.Transaction,
    key: string,
    id: string,
    body: string,
    extra?: JsonObject,
    slow?: boolean,
  ): Promise<void>;
  remove(trx: Knex.Transaction, key: string, id: string): Promise<void>;
  indexed(target: PreparedTarget, id: string): Promise<IndexedDocument | null>;
  ledger(key: string): Promise<Record<string, number>>;
  intents(): Promise<{ target_id: string; document_id: string; desired_revision: number }[]>;
  runtimes(): Promise<RuntimeRow[]>;
}

export interface RuntimeRow {
  target_id: string;
  document_id: string;
  applied_revision: number;
  attempts: number;
  retry_age_ms: number;
  failure_revision: number;
  quarantined_revision: number | null;
  available_revision: number;
  lease_token: string | null;
  last_error: JsonObject | null;
}

export function useWorkerFixture(h: IntegrationHarness): WorkerFixtureKit {
  let captureRole: TestRole | null = null;
  let workerRole: TestRole | null = null;
  const pools: Knex[] = [];
  const natives: Client[] = [];
  const searchClients: SearchClient[] = [];
  const notes = () => qualified(h.appSchema, "notes");

  beforeAll(async () => {
    captureRole = await h.createRole("capture");
    workerRole = await h.createRole("worker");
  });
  afterEach(async () => {
    await Promise.allSettled(searchClients.splice(0).map((client) => client.close()));
    await Promise.all(pools.splice(0).map((pool) => pool.destroy()));
  });
  afterAll(async () => {
    await Promise.allSettled(natives.splice(0).map((client) => client.close()));
  });

  const ready = <T>(value: T | null): T => {
    if (value === null) throw new Error("워커 픽스처는 beforeAll 이후에만 쓸 수 있습니다.");
    return value;
  };

  const pool = (role: TestRole, max: number): Knex => {
    const created = knexFactory({
      client: "pg",
      connection: role.url,
      pool: { min: 0, max, idleTimeoutMillis: 600_000 },
    });
    pools.push(created);
    return created;
  };

  const engineUrl = (): string => {
    const endpoint = h.env.opensearch;
    if (endpoint === null) throw new Error("OpenSearch 접속 정보가 없습니다.");
    return endpoint.url;
  };

  return {
    async setUp(options = {}) {
      const keys = options.keys ?? ["notes"];
      await resetSearchSchema(h);
      const capture = ready(captureRole);
      const worker = ready(workerRole);
      await applySearchGrants(h.knex, {
        schema: h.searchSchema,
        roles: { capture: [capture.name], worker: [worker.name] },
      });
      await h.knex.raw(sql`CREATE TABLE IF NOT EXISTS ${notes()} (
  key text NOT NULL,
  id text NOT NULL,
  body text NOT NULL,
  extra jsonb,
  slow boolean NOT NULL DEFAULT false,
  PRIMARY KEY (key, id)
)`);
      await h.knex.raw(sql`TRUNCATE ${notes()}`);
      await h.knex.raw(
        sql`GRANT USAGE ON SCHEMA ${identifier(h.appSchema)} TO ${identifier(capture.name)}, ${identifier(worker.name)}`,
      );
      await h.knex.raw(
        sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ${notes()} TO ${identifier(capture.name)}`,
      );
      await h.knex.raw(sql`GRANT SELECT ON ${notes()} TO ${identifier(worker.name)}`);

      const definitions = new Map<string, DefinedSearch>();
      const targets = new Map<string, PreparedTarget>();
      for (const key of keys) {
        const definition = noteDefinition(h, key, options.hooks?.[key]);
        definitions.set(key, definition);
        targets.set(
          key,
          await createTarget(
            async () => {
              throw new Error("관리 경로는 remote.knex를 씁니다.");
            },
            {
              schema: h.searchSchema,
              namespace: h.namespace,
              logicalKey: key,
              remote: { client: h.opensearch, definition, knex: h.knex },
            },
          ),
        );
      }
      const capturePool = pool(capture, 4);
      const captureSync = createPostgresSynchronization({
        getPrimaryDatabase: () => capturePool,
        schema: h.searchSchema,
        namespace: h.namespace,
      });
      await captureSync.initialize();
      const workerPool = pool(worker, 6);
      const statements: RecordedStatement[] = [];
      workerPool.on("query", (query: { sql: string; bindings?: readonly unknown[] }) => {
        statements.push({ sql: query.sql, bindings: query.bindings ?? [], at: Date.now() });
      });
      return {
        targets,
        definitions,
        capture: capturePool,
        captureSync,
        worker: workerPool,
        statements,
      };
    },

    nativeClient() {
      const client = new Client({ node: engineUrl(), maxRetries: 0 });
      natives.push(client);
      return client;
    },

    indexer(setup, options = {}) {
      const native = options.client ?? this.nativeClient();
      const searchClient = createSearchClient({
        createClient: () => native,
        ownsClient: options.ownsClient ?? false,
        requestTimeoutMs: 10_000,
      });
      searchClients.push(searchClient);
      const primary = options.primary ?? (() => setup.worker);
      const indexer = createIndexer({
        client: searchClient,
        synchronization: createPostgresSynchronization({
          getPrimaryDatabase: primary,
          schema: h.searchSchema,
          namespace: h.namespace,
        }),
        definitions: [...setup.definitions.values()],
        limits: { ...TEST_LIMITS, ...options.limits },
        workerId: randomUUID(),
        onEvent: (event) => options.events?.push(event),
      });
      return { indexer, searchClient };
    },

    async write(setup, key, ids, mutate, isolation = "read committed") {
      await setup.capture.transaction(
        async (trx) => {
          await mutate(trx);
          const result = await setup.captureSync.markChanged(trx, key, ids);
          if (result !== "recorded") throw new Error(`markChanged가 ${result}를 돌려줬습니다.`);
        },
        { isolationLevel: isolation },
      );
    },

    async upsert(trx, key, id, body, extra, slow = false) {
      await trx.raw(
        sql`INSERT INTO ${notes()} (key, id, body, extra, slow) VALUES (?, ?, ?, ?::jsonb, ?)
ON CONFLICT (key, id) DO UPDATE SET body = EXCLUDED.body, extra = EXCLUDED.extra, slow = EXCLUDED.slow`,
        [key, id, body, extra === undefined ? null : JSON.stringify(extra), slow],
      );
    },

    async remove(trx, key, id) {
      await trx.raw(sql`DELETE FROM ${notes()} WHERE key = ? AND id = ?`, [key, id]);
    },

    async indexed(target, id) {
      const response = await h.opensearch.get(
        { index: target.physicalIndex, id, realtime: true },
        { ignore: [404] },
      );
      const parsed = getResponseSchema.parse(response.body);
      if (!parsed.found) return null;
      const source = indexedSourceSchema.parse(parsed._source);
      return {
        version: parsed._version ?? 0,
        deleted: source.sonamu_meta.deleted,
        revision: source.sonamu_meta.revision,
        doc: source.doc,
      };
    },

    async ledger(key) {
      const { rows } = await h.knex.raw<{ rows: { document_id: string; revision: string }[] }>(
        sql`SELECT document_id, revision FROM ${qualified(h.searchSchema, "documents")} WHERE definition = ? ORDER BY document_id COLLATE "C"`,
        [key],
      );
      return Object.fromEntries(rows.map((row) => [row.document_id, Number(row.revision)]));
    },

    async intents() {
      const { rows } = await h.knex.raw<{
        rows: { target_id: string; document_id: string; desired_revision: number }[];
      }>(
        sql`SELECT target_id::text, document_id, desired_revision::integer FROM ${qualified(h.searchSchema, "deliveries")} ORDER BY 1, 2`,
      );
      return rows;
    },

    async runtimes() {
      const { rows } = await h.knex.raw<{ rows: RuntimeRow[] }>(
        sql`SELECT target_id::text, document_id, applied_revision::integer, attempts, retry_age_ms::integer,
       failure_revision::integer, quarantined_revision::integer, available_revision::integer,
       lease_token::text, last_error
FROM ${qualified(h.searchSchema, "delivery_runtime")} ORDER BY 1, 2`,
      );
      return rows;
    },
  };
}

export function outcomeSum(report: {
  indexed: number;
  superseded: number;
  retried: number;
  quarantined: number;
  released: number;
  leaseLost: number;
  skippedLocked: number;
  abandoned: number;
}): number {
  return (
    report.indexed +
    report.superseded +
    report.retried +
    report.quarantined +
    report.released +
    report.leaseLost +
    report.skippedLocked +
    report.abandoned
  );
}
