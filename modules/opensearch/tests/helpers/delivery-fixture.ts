import knexFactory, { type Knex } from "knex";
import { afterAll, afterEach, beforeAll, expect } from "vitest";

import { applySearchGrants, createSearchAdmin } from "../../src/admin";
import { createSearchClient } from "../../src/index";
import { createPostgresSynchronization, type PostgresSynchronization } from "../../src/postgres";
import { createDeliveryStore, type DeliveryStore } from "../../src/postgres/delivery-store";
import { createFakeOpenSearch } from "../../src/testing";
import { type IntegrationHarness, type TestRole } from "./harness";
import { qualified, sql, type SqlToken } from "./sql";
import {
  createTarget,
  openAdminClient,
  type PreparedTarget,
  resetSearchSchema,
  type StatementRunner,
} from "./test-targets";

export const DELIVERY_KEY = "messages";
export const LONG_LEASE_MS = 120_000;
// installGate's trigger hard-codes the same key.
export const GATE_KEY = 4242;

export type DeliveryFixture = {
  target: PreparedTarget;
  store: DeliveryStore;
  sync: PostgresSynchronization;
  capture: Knex;
};

// version is xmin: it changes when the worker updates the intent row, not when it only locks it.
export type IntentRow = {
  document_id: string;
  intent_id: string;
  desired_revision: number;
  version: string;
};

export type RuntimeRow = {
  document_id: string;
  intent_id: string;
  claimed_revision: number;
  applied_revision: number;
  lease_token: string | null;
  live: boolean;
};

export type DeliveryFixtureKit = {
  readonly key: string;
  admin(): { run: StatementRunner; close(): Promise<void> };
  captureRole(): TestRole;
  workerRole(): TestRole;
  rolePool(role: TestRole, options?: { max?: number }): Knex;
  workerPool(): Knex;
  poolPid(pool: Knex): Promise<number>;
  setUp(): Promise<DeliveryFixture>;
  mark(f: DeliveryFixture, ids: readonly string[]): Promise<void>;
  table(name: string): SqlToken;
  intents(): Promise<IntentRow[]>;
  runtimes(): Promise<RuntimeRow[]>;
  waitForExpiry(token: string): Promise<void>;
  installGate(): Promise<void>;
};

// Call right after the harness: after-hooks run in reverse order, so role pools close before tables are truncated.
export function useDeliveryFixture(
  h: IntegrationHarness,
  options: { key?: string } = {},
): DeliveryFixtureKit {
  return makeKit(h, options.key ?? DELIVERY_KEY);
}

export async function inspectIndex(h: IntegrationHarness, key: string = DELIVERY_KEY) {
  const admin = createSearchAdmin({
    client: createSearchClient({
      createClient: () => createFakeOpenSearch().client,
      ownsClient: true,
      requestTimeoutMs: 1_000,
    }),
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => h.knex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [],
    lifetimes: {
      maxSearchLifetimeMs: 30_000,
      maxCursorLifetimeMs: 600_000,
      maxPitKeepAliveMs: 300_000,
      retirementSafetyMarginMs: 60_000,
    },
    timeouts: {
      lockTimeoutMs: 2_000,
      statementTimeoutMs: 10_000,
      idleInTransactionTimeoutMs: 30_000,
      adminLeaseMs: 60_000,
    },
    cutover: { maxPendingDocuments: 0, sampleSize: 10 },
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 10_000 },
  });
  return admin.inspect(key);
}

function ready<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new Error(`delivery 픽스처의 ${what}은 beforeAll 이후에만 쓸 수 있습니다.`);
  }
  return value;
}

function makeKit(h: IntegrationHarness, key: string): DeliveryFixtureKit {
  let admin: { run: StatementRunner; close(): Promise<void> } | null = null;
  let captureRole: TestRole | null = null;
  let workerRole: TestRole | null = null;
  const pools: Knex[] = [];

  beforeAll(async () => {
    admin = await openAdminClient(h);
    captureRole = await h.createRole("capture");
    workerRole = await h.createRole("worker");
  });
  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.destroy()));
  });
  afterAll(async () => {
    await admin?.close();
  });

  const table = (name: string) => qualified(h.searchSchema, name);

  const rolePool = (role: TestRole, poolOptions: { max?: number } = {}): Knex => {
    const pool = knexFactory({
      client: "pg",
      connection: role.url,
      pool: { min: 0, max: poolOptions.max ?? 1, idleTimeoutMillis: 600_000 },
    });
    pools.push(pool);
    return pool;
  };

  return {
    key,
    admin: () => ready(admin, "admin"),
    captureRole: () => ready(captureRole, "captureRole"),
    workerRole: () => ready(workerRole, "workerRole"),
    rolePool,
    workerPool: () => rolePool(ready(workerRole, "workerRole")),

    async poolPid(pool) {
      const { rows } = await pool.raw<{ rows: { pid: number }[] }>(
        "SELECT pg_backend_pid() AS pid",
      );
      return rows[0].pid;
    },

    async setUp() {
      await resetSearchSchema(h);
      await applySearchGrants(h.knex, {
        schema: h.searchSchema,
        roles: {
          capture: [ready(captureRole, "captureRole").name],
          worker: [ready(workerRole, "workerRole").name],
        },
      });
      const target = await createTarget(ready(admin, "admin").run, {
        schema: h.searchSchema,
        namespace: h.namespace,
        logicalKey: key,
      });
      const capture = rolePool(ready(captureRole, "captureRole"), { max: 4 });
      const sync = createPostgresSynchronization({
        getPrimaryDatabase: () => capture,
        schema: h.searchSchema,
        namespace: h.namespace,
      });
      await sync.initialize();
      return { target, store: createDeliveryStore({ schema: h.searchSchema }), sync, capture };
    },

    async mark(f, ids) {
      await f.capture.transaction(async (trx) => {
        expect(await f.sync.markChanged(trx, key, ids)).toBe("recorded");
      });
    },

    table,

    async intents() {
      const { rows } = await h.knex.raw<{ rows: IntentRow[] }>(
        sql`SELECT document_id, intent_id::text, desired_revision::integer, xmin::text AS version FROM ${table("deliveries")} ORDER BY document_id COLLATE "C"`,
      );
      return rows;
    },

    async runtimes() {
      const { rows } = await h.knex.raw<{ rows: RuntimeRow[] }>(
        sql`SELECT document_id, intent_id::text, claimed_revision::integer, applied_revision::integer, lease_token::text,
       COALESCE(lease_expires_at > clock_timestamp(), false) AS live
FROM ${table("delivery_runtime")} ORDER BY document_id COLLATE "C", intent_id`,
      );
      return rows;
    },

    async waitForExpiry(token) {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const { rows } = await h.knex.raw<{ rows: { expired: boolean | null }[] }>(
          sql`SELECT bool_and(lease_expires_at <= clock_timestamp()) AS expired FROM ${table("delivery_runtime")} WHERE lease_token = ?`,
          [token],
        );
        if (rows[0].expired === true) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error(`임대 ${token}가 15초 안에 만료되지 않았습니다.`);
    },

    async installGate() {
      await h.knex
        .raw(sql`CREATE FUNCTION ${table("gate_stmt")}() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF current_setting('sonamu_test.gate', true) = 'on' THEN PERFORM pg_advisory_xact_lock(4242); END IF;
  RETURN NULL;
END $f$`);
      await h.knex.raw(
        sql`CREATE TRIGGER gate BEFORE INSERT ON ${table("delivery_runtime")} FOR EACH STATEMENT EXECUTE FUNCTION ${table("gate_stmt")}()`,
      );
    },
  };
}
