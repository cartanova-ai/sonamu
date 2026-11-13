import { randomUUID } from "node:crypto";

import { type Client } from "@opensearch-project/opensearch";
import knexFactory, { type Knex } from "knex";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  applySearchGrants,
  type BuildHandle,
  createSearchAdmin,
  type SearchAdmin,
} from "../../src/admin";
import { createSearchClient, type SearchClient } from "../../src/client/search-client";
import { SearchAdminPreconditionFailed, type SearchError } from "../../src/errors";
import { type MarkChangedResult } from "../../src/postgres";
import { createPostgresSynchronization } from "../../src/postgres";
import { TEST_READ_LIFETIMES } from "../../src/testing";
import { type IntegrationHarness, type TestRole } from "./harness";
import { type RecordedRequest, requestRecorder, type RequestHooks } from "./request-recorder";
import { qualified, sql } from "./sql";
import { type PreparedTarget } from "./test-targets";
import { type WorkerFixtureKit, type WorkerSetup, waitFor } from "./worker-fixture";

export const KEY = "notes";
export const GRACE_MS = 600;

export function audit(reason = "retirement"): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason };
}

export async function errorOf(pending: Promise<unknown>): Promise<SearchError> {
  return pending.then(
    () => {
      throw new Error("실패해야 할 호출이 성공했습니다.");
    },
    (error: SearchError) => error,
  );
}

export function expectRefused(error: SearchError, reason: string): void {
  expect(error).toBeInstanceOf(SearchAdminPreconditionFailed);
  expect(error.details?.reason).toBe(reason);
}

export interface AdminOverrides {
  adminLeaseMs?: number;
  workerBounds?: { leaseDurationMs: number; requestTimeoutMs: number };
  timeouts?: {
    lockTimeoutMs?: number;
    statementTimeoutMs?: number;
    idleInTransactionTimeoutMs?: number;
  };
}

export interface RetirementSetup {
  readonly setup: WorkerSetup;
  readonly admin: SearchAdmin;
  readonly requests: RecordedRequest[];
  readonly first: PreparedTarget;
  readonly fingerprint: string;
}

export interface TargetRow {
  state: string;
  write_enabled: boolean;
  alias_removed: boolean;
  index_deleted: boolean;
  retired: boolean;
  deselected_at_ms: string | null;
  deselect_confirmed_at_ms: string | null;
}

export interface RetirementFixture {
  adminFor(setup: WorkerSetup, native: Client, overrides?: AdminOverrides): SearchAdmin;
  prepare(options?: {
    hooks?: RequestHooks;
    setup?: Parameters<WorkerFixtureKit["setUp"]>[0];
    shortGrace?: boolean;
    admin?: AdminOverrides;
  }): Promise<RetirementSetup>;
  backfill(admin: SearchAdmin, buildId: string): Promise<void>;
  serveOpenBuild(admin: SearchAdmin): Promise<void>;
  replaceFirst(prepared: RetirementSetup): Promise<BuildHandle>;
  waitForGrace(targetId: string): Promise<void>;
  mark(setup: WorkerSetup, ids: readonly string[]): Promise<MarkChangedResult>;
  target(targetId: string): Promise<TargetRow>;
  residue(targetId: string): Promise<{ intents: number; runtimes: number }>;
  leaseToken(): Promise<string | null>;
  indexedIn(physicalIndex: string, id: string): Promise<boolean>;
}

const foundSchema = z.looseObject({ found: z.boolean() });

export function useRetirementFixture(
  h: IntegrationHarness,
  kit: WorkerFixtureKit,
): RetirementFixture {
  let adminRole: TestRole | null = null;
  let adminKnex: Knex | null = null;
  const clients: SearchClient[] = [];
  const s = (name: string) => qualified(h.searchSchema, name);

  beforeAll(async () => {
    adminRole = await h.createRole("admin");
    const url = new URL(adminRole.url);
    url.searchParams.set("application_name", `h:${h.id}:admin`);
    adminKnex = knexFactory({ client: "pg", connection: url.toString(), pool: { min: 0, max: 4 } });
  });
  afterEach(async () => {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  });
  afterAll(async () => {
    await adminKnex?.destroy();
  });

  const ready = <T>(value: T | null): T => {
    if (value === null) throw new Error("은퇴 픽스처는 beforeAll 이후에만 쓸 수 있습니다.");
    return value;
  };

  const adminFor = (setup: WorkerSetup, native: Client, overrides: AdminOverrides = {}) => {
    const client = createSearchClient({
      createClient: () => native,
      ownsClient: false,
      requestTimeoutMs: 30_000,
    });
    clients.push(client);
    const pool = ready(adminKnex);
    return createSearchAdmin({
      client,
      synchronization: createPostgresSynchronization({
        getPrimaryDatabase: () => pool,
        schema: h.searchSchema,
        namespace: h.namespace,
      }),
      definitions: [...setup.definitions.values()],
      lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
      timeouts: {
        lockTimeoutMs: 15_000,
        statementTimeoutMs: 20_000,
        idleInTransactionTimeoutMs: 60_000,
        adminLeaseMs: overrides.adminLeaseMs ?? 120_000,
        ...overrides.timeouts,
      },
      cutover: { maxPendingDocuments: 1_000_000, sampleSize: 0 },
      workerBounds: overrides.workerBounds ?? { leaseDurationMs: 300, requestTimeoutMs: 300 },
    });
  };

  const backfill = async (admin: SearchAdmin, buildId: string) => {
    for (let step = 0; step < 20; step += 1) {
      if ((await admin.runBackfillPage(buildId, { limit: 100 })).done) return;
    }
    throw new Error("backfill이 끝나지 않았습니다.");
  };

  const serveOpenBuild = async (admin: SearchAdmin) => {
    const build = (await admin.inspect(KEY)).openBuild;
    if (build === null) throw new Error("열린 빌드가 없습니다.");
    await backfill(admin, build.buildId);
    await admin.cutover(build.buildId, audit());
  };

  return {
    adminFor,
    backfill,
    serveOpenBuild,

    async prepare(options = {}) {
      const setup = await kit.setUp(options.setup);
      await applySearchGrants(h.knex, {
        schema: h.searchSchema,
        roles: { admin: [ready(adminRole).name] },
      });
      // Lowers the lifetime maxima before any target has served reads, so no maximum drops while a served target remains.
      if (options.shortGrace === true) {
        await h.knex.raw(
          sql`UPDATE ${s("read_heads")} SET max_search_lifetime_ms = 200, max_cursor_lifetime_ms = 300,
  retirement_safety_margin_ms = 100 WHERE namespace = ? AND definition = ?`,
          [h.namespace, KEY],
        );
      }
      const recorder = requestRecorder(kit.nativeClient(), options.hooks);
      const first = setup.targets.get(KEY);
      const definition = setup.definitions.get(KEY);
      if (first === undefined || definition === undefined) throw new Error("대상이 없습니다.");
      return {
        setup,
        admin: adminFor(setup, recorder.client, options.admin),
        requests: recorder.requests,
        first,
        fingerprint: definition.fingerprint,
      };
    },

    async replaceFirst(prepared) {
      await serveOpenBuild(prepared.admin);
      const second = await prepared.admin.beginRebuild(
        { logicalKey: KEY, fingerprint: prepared.fingerprint },
        audit(),
      );
      await backfill(prepared.admin, second.buildId);
      await prepared.admin.cutover(second.buildId, audit());
      return second;
    },

    async waitForGrace(targetId) {
      await waitFor("읽기 유예", async () => {
        const { rows } = await h.knex.raw<{ rows: { elapsed: boolean | null }[] }>(
          sql`SELECT clock_timestamp() >= t.deselect_confirmed_at
       + ((h.max_cursor_lifetime_ms + h.max_search_lifetime_ms + h.retirement_safety_margin_ms) * interval '1 millisecond') AS elapsed
FROM ${s("targets")} t JOIN ${s("read_heads")} h USING (namespace, definition) WHERE t.target_id = ?`,
          [targetId],
        );
        return rows[0]?.elapsed === true;
      });
    },

    async mark(setup, ids) {
      return setup.capture.transaction(async (trx) => {
        for (const id of ids) await kit.upsert(trx, KEY, id, `본문 ${id}`, { tag: id });
        return setup.captureSync.markChanged(trx, KEY, ids);
      });
    },

    async target(targetId) {
      const { rows } = await h.knex.raw<{ rows: TargetRow[] }>(
        sql`SELECT state, write_enabled, alias_removed_at IS NOT NULL AS alias_removed,
       index_deleted_at IS NOT NULL AS index_deleted, retired_at IS NOT NULL AS retired,
       floor(extract(epoch FROM deselected_at) * 1000)::bigint AS deselected_at_ms,
       floor(extract(epoch FROM deselect_confirmed_at) * 1000)::bigint AS deselect_confirmed_at_ms
FROM ${s("targets")} WHERE target_id = ?`,
        [targetId],
      );
      return rows[0];
    },

    async residue(targetId) {
      const { rows } = await h.knex.raw<{ rows: { intents: number; runtimes: number }[] }>(
        sql`SELECT (SELECT count(*)::int FROM ${s("deliveries")} WHERE target_id = ?) AS intents,
       (SELECT count(*)::int FROM ${s("delivery_runtime")} WHERE target_id = ?) AS runtimes`,
        [targetId, targetId],
      );
      return rows[0];
    },

    async leaseToken() {
      const { rows } = await h.knex.raw<{ rows: { lease_token: string | null }[] }>(
        sql`SELECT lease_token::text AS lease_token FROM ${s("admin_controls")} WHERE namespace = ? AND definition = ?`,
        [h.namespace, KEY],
      );
      return rows[0]?.lease_token ?? null;
    },

    async indexedIn(physicalIndex, id) {
      const response = await h.opensearch.get(
        { index: physicalIndex, id, realtime: true },
        { ignore: [404] },
      );
      return foundSchema.parse(response.body).found;
    },
  };
}
