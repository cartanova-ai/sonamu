import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { afterAll, afterEach, beforeAll } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  applySearchGrants,
  type BuildHandle,
  createSearchAdmin,
  type SearchAdmin,
} from "../../src/admin";
import { createSearchClient, type SearchClient } from "../../src/client/search-client";
import { workerBoundsFrom } from "../../src/defaults";
import { type JsonObject } from "../../src/definition/canonical-json";
import { type DefinedSearch } from "../../src/definition/define-search";
import { SearchError } from "../../src/errors";
import {
  createIndexer,
  createPostgresCatalogReader,
  createPostgresSynchronization,
  type SearchIndexer,
  type WorkerLimits,
} from "../../src/postgres";
import { type ReadLifetimeLimits } from "../../src/query/catalog";
import {
  createSearchQueries,
  type SearchQueries,
  type SearchQueriesOptions,
} from "../../src/query/search-queries";
import { type IntegrationHarness, type TestRole } from "./harness";
import { type Gate, type RecordedRequest, requestRecorder } from "./request-recorder";
import { identifier, qualified, sql, tokenList } from "./sql";
import { resetSearchSchema } from "./test-targets";
import { TEST_LIMITS } from "./worker-fixture";

// Shortened so retirement's in-flight wait (lease plus request timeout) is 11 s.
export const READ_PATH_WORKER_LIMITS: WorkerLimits = Object.freeze({
  ...TEST_LIMITS,
  projectionTimeoutMs: 3_000,
  requestTimeoutMs: 3_000,
  leaseDurationMs: 8_000,
  heartbeatIntervalMs: 2_500,
});

export const LONG_LIFETIMES = Object.freeze({
  maxSearchLifetimeMs: 30_000,
  maxCursorLifetimeMs: 600_000,
  maxPitKeepAliveMs: 60_000,
  retirementSafetyMarginMs: 60_000,
});

export type AdminLifetimes = ReadLifetimeLimits & { retirementSafetyMarginMs: number };

export const SIGNING_KEY = { id: "k1", secret: new Uint8Array(32).fill(7) };

export function audit(reason = "read path"): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason };
}

export async function rejectionOf<T>(pending: Promise<T>): Promise<SearchError> {
  return pending.then(
    () => {
      throw new Error("실패해야 할 호출이 성공했습니다.");
    },
    (error: Error) => {
      if (error instanceof SearchError) return error;
      throw error;
    },
  );
}

const cursorPayloadSchema = z.looseObject({
  tid: z.string(),
  iat: z.number(),
  exp: z.number(),
  pit: z.string().optional(),
});

export function peekCursor(cursor: string): z.infer<typeof cursorPayloadSchema> {
  const [encoded] = cursor.split(".");
  return cursorPayloadSchema.parse(
    JSON.parse(Buffer.from(encoded ?? "", "base64url").toString("utf8")),
  );
}

export interface QueryHandle<TDocument extends JsonObject> {
  readonly queries: SearchQueries<TDocument>;
  readonly requests: RecordedRequest[];
  holdNextSearch(gate: Gate): void;
}

export interface ReadPathFixture {
  readonly adminKnex: Knex;
  readonly workerKnex: Knex;
  readonly queryKnex: Knex;
  readonly captureKnex: Knex;
  readonly roles: Readonly<Record<"admin" | "worker" | "query" | "capture", TestRole>>;
  reset(): Promise<void>;
  admin(definitions: readonly DefinedSearch[], lifetimes?: AdminLifetimes): SearchAdmin;
  indexer(definitions: readonly DefinedSearch[]): SearchIndexer;
  queries<TDocument extends JsonObject>(
    options: Omit<SearchQueriesOptions, "client" | "catalog"> &
      Partial<Pick<SearchQueriesOptions, "catalog">>,
  ): QueryHandle<TDocument>;
  backfill(admin: SearchAdmin, buildId: string): Promise<void>;
  drain(indexer: SearchIndexer): Promise<number>;
  refresh(): Promise<void>;
  serve(
    admin: SearchAdmin,
    definitions: readonly DefinedSearch[],
    definition: DefinedSearch,
  ): Promise<BuildHandle>;
  databaseNow(): Promise<number>;
  waitForDatabaseTime(atMs: number): Promise<void>;
  deselectConfirmedAt(targetId: string): Promise<number | null>;
  targetState(targetId: string): Promise<string>;
}

export function useReadPathFixture(h: IntegrationHarness): ReadPathFixture {
  let roles: ReadPathFixture["roles"] | null = null;
  const pools: Partial<Record<"admin" | "worker" | "query" | "capture", Knex>> = {};
  const clients: SearchClient[] = [];
  const s = (name: string) => qualified(h.searchSchema, name);

  const ready = <T>(value: T | null | undefined, what: string): T => {
    if (value === null || value === undefined) {
      throw new Error(`읽기 경로 픽스처의 ${what}은 beforeAll 이후에만 쓸 수 있습니다.`);
    }
    return value;
  };

  beforeAll(async () => {
    const created = {
      admin: await h.createRole("admin"),
      worker: await h.createRole("worker"),
      query: await h.createRole("query"),
      capture: await h.createRole("capture"),
    };
    roles = created;
    const names = ["admin", "worker", "query", "capture"] as const;
    for (const name of names) {
      const role = created[name];
      const url = new URL(role.url);
      url.searchParams.set("application_name", `h:${h.id}:${name}`);
      pools[name] = knexFactory({
        client: "pg",
        connection: url.toString(),
        searchPath: [h.appSchema, "public"],
        pool: { min: 0, max: name === "query" ? 4 : 6 },
      });
    }
    const app = identifier(h.appSchema);
    const all = tokenList(names.map((name) => identifier(created[name].name)));
    await h.knex.raw(sql`GRANT USAGE ON SCHEMA ${app} TO ${all}`);
    await h.knex.raw(
      sql`GRANT SELECT ON ALL TABLES IN SCHEMA ${app} TO ${identifier(created.admin.name)}, ${identifier(created.worker.name)}, ${identifier(created.query.name)}`,
    );
    await h.knex.raw(
      sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${app} TO ${identifier(created.capture.name)}`,
    );
    await h.knex.raw(
      sql`GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${app} TO ${identifier(created.capture.name)}`,
    );
  });

  afterEach(async () => {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  });

  afterAll(async () => {
    await Promise.allSettled(Object.values(pools).map((pool) => pool.destroy()));
  });

  const searchClient = (requestTimeoutMs: number, native = h.opensearch): SearchClient => {
    const client = createSearchClient({
      createClient: () => native,
      ownsClient: false,
      requestTimeoutMs,
    });
    clients.push(client);
    return client;
  };

  const synchronization = (pool: Knex) =>
    createPostgresSynchronization({
      getPrimaryDatabase: () => pool,
      schema: h.searchSchema,
      namespace: h.namespace,
    });

  const fixture: ReadPathFixture = {
    get adminKnex() {
      return ready(pools.admin, "adminKnex");
    },
    get workerKnex() {
      return ready(pools.worker, "workerKnex");
    },
    get queryKnex() {
      return ready(pools.query, "queryKnex");
    },
    get captureKnex() {
      return ready(pools.capture, "captureKnex");
    },
    get roles() {
      return ready(roles, "roles");
    },

    async reset() {
      await resetSearchSchema(h);
      const r = ready(roles, "roles");
      await applySearchGrants(h.knex, {
        schema: h.searchSchema,
        roles: {
          admin: [r.admin.name],
          worker: [r.worker.name],
          query: [r.query.name],
          capture: [r.capture.name],
        },
      });
    },

    admin(definitions, lifetimes = LONG_LIFETIMES) {
      return createSearchAdmin({
        client: searchClient(30_000),
        synchronization: synchronization(fixture.adminKnex),
        definitions,
        lifetimes,
        timeouts: {
          lockTimeoutMs: 10_000,
          statementTimeoutMs: 20_000,
          idleInTransactionTimeoutMs: 60_000,
          adminLeaseMs: 120_000,
        },
        cutover: { maxPendingDocuments: 0, sampleSize: 0 },
        // Must match the worker's real limits, or retirement waits shorter than a worker can be in flight.
        workerBounds: workerBoundsFrom(READ_PATH_WORKER_LIMITS),
      });
    },

    indexer(definitions) {
      return createIndexer({
        client: searchClient(READ_PATH_WORKER_LIMITS.requestTimeoutMs),
        synchronization: synchronization(fixture.workerKnex),
        definitions,
        limits: READ_PATH_WORKER_LIMITS,
        workerId: randomUUID(),
      });
    },

    queries<TDocument extends JsonObject>(
      options: Omit<SearchQueriesOptions, "client" | "catalog"> &
        Partial<Pick<SearchQueriesOptions, "catalog">>,
    ): QueryHandle<TDocument> {
      let held: Gate | null = null;
      const recorder = requestRecorder(h.opensearch, {
        before: async (request) => {
          if (held !== null && request.path.endsWith("/_search")) {
            const current = held;
            held = null;
            await current.wait();
          }
        },
      });
      const queries = createSearchQueries<TDocument>({
        ...options,
        client: searchClient(30_000, recorder.client),
        catalog:
          options.catalog ??
          createPostgresCatalogReader({
            getPrimaryDatabase: () => fixture.queryKnex,
            schema: h.searchSchema,
            namespace: h.namespace,
          }),
      });
      return {
        queries,
        requests: recorder.requests,
        holdNextSearch(gate) {
          held = gate;
        },
      };
    },

    async backfill(admin, buildId) {
      for (let step = 0; step < 100; step += 1) {
        if ((await admin.runBackfillPage(buildId, { limit: 100 })).done) return;
      }
      throw new Error("backfill이 끝나지 않았습니다.");
    },

    async drain(indexer) {
      let indexed = 0;
      for (let round = 0; round < 60; round += 1) {
        const report = await indexer.drainOnce();
        if (report.quarantined !== 0 || report.leaseLost !== 0) {
          throw new Error(`drain이 격리나 임대 상실을 보고했습니다: ${JSON.stringify(report)}`);
        }
        indexed += report.indexed;
        // A request timeout under load releases the documents and starts a cooldown; wait it out and drain again.
        if (report.cooldownRemainingMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, report.cooldownRemainingMs));
          continue;
        }
        if (report.claimed === 0) return indexed;
      }
      throw new Error("drain이 끝나지 않았습니다.");
    },

    async refresh() {
      await h.opensearch.indices.refresh({ index: `${h.indexPrefix}*` });
    },

    async serve(admin, definitions, definition) {
      const build = await admin.beginRebuild(
        { logicalKey: definition.key, fingerprint: definition.fingerprint },
        audit("serve"),
      );
      await fixture.backfill(admin, build.buildId);
      await fixture.drain(fixture.indexer(definitions));
      await fixture.refresh();
      await admin.cutover(build.buildId, audit("serve"));
      return build;
    },

    async databaseNow() {
      const { rows } = await h.knex.raw<{ rows: { now: string }[] }>(
        "SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now",
      );
      return Number(rows[0]?.now);
    },

    async waitForDatabaseTime(atMs) {
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const now = await fixture.databaseNow();
        if (now >= atMs) return;
        await new Promise((resolve) => setTimeout(resolve, Math.min(200, atMs - now)));
      }
      throw new Error(`데이터베이스 시계가 ${atMs}에 닿지 않았습니다.`);
    },

    async deselectConfirmedAt(targetId) {
      const { rows } = await h.knex.raw<{ rows: { at: string | null }[] }>(
        sql`SELECT (extract(epoch FROM deselect_confirmed_at) * 1000)::bigint AS at FROM ${s("targets")} WHERE target_id = ?`,
        [targetId],
      );
      const at = rows[0]?.at ?? null;
      return at === null ? null : Number(at);
    },

    async targetState(targetId) {
      const { rows } = await h.knex.raw<{ rows: { state: string }[] }>(
        sql`SELECT state FROM ${s("targets")} WHERE target_id = ?`,
        [targetId],
      );
      return rows[0]?.state ?? "missing";
    },
  };
  return fixture;
}
