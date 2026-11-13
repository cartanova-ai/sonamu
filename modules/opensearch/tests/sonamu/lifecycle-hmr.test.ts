import { type ChildProcess, type Serializable, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Sonamu, type SonamuConfig } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createSearchClient } from "../../src/client/search-client";
import {
  type DefinedSearch,
  type DocumentId,
  type Projection,
} from "../../src/definition/define-search";
import {
  SearchConfigurationError,
  SearchStopping,
  SearchStoreMismatch,
  SearchUnavailable,
} from "../../src/errors";
import { getSearchLocale } from "../../src/i18n";
import {
  createPostgresSynchronization,
  type PostgresSynchronization,
  type WorkerLimits,
} from "../../src/postgres";
import {
  createSearchLifecycle,
  defineSonamuSearch,
  getSearchResourceContainer,
  resolveSonamuPrimary,
  type SearchLifecycle,
  type SearchLifecycleOptions,
} from "../../src/sonamu";
import { createFakeOpenSearch, type FakeOpenSearch } from "../../src/testing";
import { useIntegrationHarness } from "../helpers/harness";
import { configureSonamuDatabase, sonamuDatabaseConfig } from "../helpers/sonamu-app";
import { identifier, qualified, sql } from "../helpers/sql";
import {
  createTarget,
  openAdminClient,
  type PreparedTarget,
  resetSearchSchema,
  type StatementRunner,
} from "../helpers/test-targets";
import { trackTimersFrom } from "../helpers/timers";
import { waitFor } from "../helpers/worker-fixture";

/**
 * Sonamu lifecycle hooks and dev-server module re-evaluation.
 *
 * 1. In process: real PostgreSQL and Sonamu DB config with the fake OpenSearch, covering onStart/onShutdown order, the
 *    failure rules, what shutdown leaves behind, worker.enabled, and the resource container.
 * 2. Re-evaluation: calling a factory twice does not prove module re-evaluation, so a child process runs with the loaders
 *    of `sonamu dev` (--import=sonamu/ts-loader-register --import=sonamu/hmr-hook-register, HOT=yes, API_ROOT_PATH). It
 *    does what Syncer.hmrAndSync does: hot.invalidateFile(path, "change"), then a dynamic re-import that gets a new
 *    ?hmr-hook=N URL. It skips the file watcher and Syncer (they need a full project) and imports the package from source
 *    instead of dist; the package modules are never re-evaluated, so the behaviour is the same.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const KEY = "notes";
const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** A package source entry as a file URL, so the child's ts-loader treats it as TypeScript source. */
const sourceUrl = (relative: string) =>
  JSON.stringify(pathToFileURL(path.join(PACKAGE_ROOT, "src", relative)).href);

const LIMITS: WorkerLimits = Object.freeze({
  maxDocumentsPerClaim: 50,
  maxBulkBytes: 1_000_000,
  maxConcurrentBulkRequests: 2,
  projectionTimeoutMs: 3_000,
  requestTimeoutMs: 5_000,
  leaseDurationMs: 30_000,
  heartbeatIntervalMs: 10_000,
  maxRetryAttempts: 3,
  maxRetryAgeMs: 600_000,
  maxIsolationCallsPerBatch: 20,
  retryBaseDelayMs: 20,
  retryMaxDelayMs: 200,
  maxInFlightBytes: 50_000_000,
  statementTimeoutMs: 2_000,
  fenceRenewIntervalMs: 30_000,
});

let admin: { run: StatementRunner; close(): Promise<void> };
let markerSync: PostgresSynchronization;
const LIFECYCLE_SOURCE = /[\\/]src[\\/]sonamu[\\/]lifecycle\.ts:/;

beforeAll(async () => {
  configureSonamuDatabase(h, "lifecycle");
  admin = await openAdminClient(h);
  // SAFETY: the package reads only i18n from Sonamu.config.
  Sonamu.config = { i18n: { defaultLocale: "ko", supportedLocales: ["ko"] } } as SonamuConfig;
});
afterAll(async () => {
  await admin.close();
});
beforeEach(async () => {
  await resetSearchSchema(h);
  markerSync = createPostgresSynchronization({
    getPrimaryDatabase: () => h.knex,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
  await markerSync.initialize();
});

function noteDefinition(projectionVersion = "1"): DefinedSearch<{ body: string }> {
  return defineSonamuSearch<{ body: string }>({
    key: KEY,
    projectionVersion,
    schema: z.object({ body: z.string() }),
    settings: {},
    mappings: { properties: { body: { type: "text" } } },
    requiredPlugins: [],
    async materialize(_context, ids) {
      return new Map(
        ids.map((id): [DocumentId, Projection<{ body: string }>] => [
          id,
          { state: "present", document: { body: id } },
        ]),
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

async function registerTarget(fingerprint: string): Promise<PreparedTarget> {
  return createTarget(admin.run, {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey: KEY,
    fingerprint,
  });
}

async function mark(ids: readonly string[]): Promise<void> {
  await h.knex.transaction(async (trx) => {
    const result = await markerSync.markChanged(trx, KEY, ids);
    if (result !== "recorded") throw new Error(`markChanged가 ${result}를 돌려줬습니다.`);
  });
}

const heartbeatRowSchema = z.object({ worker_id: z.string(), capabilities: z.array(z.string()) });

async function heartbeats(): Promise<z.infer<typeof heartbeatRowSchema>[]> {
  const { rows } = await h.knex.raw<{ rows: unknown[] }>(
    sql`SELECT worker_id::text, capabilities FROM ${qualified(h.searchSchema, "worker_heartbeats")} ORDER BY worker_id`,
  );
  return z.array(heartbeatRowSchema).parse(rows);
}

async function heldLeases(): Promise<number> {
  const { rows } = await h.knex.raw<{ rows: { held: string }[] }>(
    sql`SELECT count(*)::text AS held FROM ${qualified(h.searchSchema, "delivery_runtime")} WHERE lease_token IS NOT NULL`,
  );
  return Number(rows[0]?.held ?? "0");
}

async function prepareAlias(fake: FakeOpenSearch, target: PreparedTarget): Promise<void> {
  await fake.client.indices.create({
    index: target.physicalIndex,
    body: { aliases: { [target.writeAlias]: {} } },
  });
}

function lifecycleOptions(
  fake: FakeOpenSearch,
  overrides: Partial<SearchLifecycleOptions> = {},
): SearchLifecycleOptions {
  return {
    name: `in-process-${randomUUID()}`,
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: resolveSonamuPrimary,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    worker: {
      enabled: true,
      client: { createClient: () => fake.client, ownsClient: false, requestTimeoutMs: 5_000 },
      definitions: [noteDefinition()],
      limits: LIMITS,
      pollIntervalMs: 60_000,
    },
    stopDeadlineMs: 5_000,
    ...overrides,
  };
}

describe("onStart와 onShutdown (같은 프로세스)", () => {
  it("onStart는 locale 적용 → initialize → 워커 시작 순서이고, onShutdown은 기한 안에 멈춰 heartbeat 행과 임대를 남기지 않으며 두 번 불러도 된다", async () => {
    const definition = noteDefinition();
    const target = await registerTarget(definition.fingerprint);
    const fake = createFakeOpenSearch();
    await prepareAlias(fake, target);
    await mark(["a", "b"]);

    const order: string[] = [];
    const base = createPostgresSynchronization({
      getPrimaryDatabase: () => {
        order.push("primary");
        return resolveSonamuPrimary();
      },
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    const synchronization: PostgresSynchronization = {
      ...base,
      async initialize(options) {
        order.push(`initialize:${getSearchLocale()}`);
        const result = await base.initialize(options);
        order.push("initialized");
        return result;
      },
    };
    const queryClient = createSearchClient({
      createClient: () => fake.client,
      ownsClient: true,
      requestTimeoutMs: 5_000,
    });
    const lifecycle = createSearchLifecycle(
      lifecycleOptions(fake, { synchronization, clients: [queryClient] }),
    );

    await lifecycle.onStart();
    // The Sonamu default locale (ko) is applied before initialize, and the store ID is resolved before the worker uses
    // the primary.
    expect(order.slice(0, 3)).toEqual(["initialize:ko", "primary", "initialized"]);
    expect(synchronization.storeId()).toBeDefined();
    await waitFor("문서 색인", () => fake.documents(target.writeAlias).size === 2);
    expect(order.slice(3).every((step) => step === "primary")).toBe(true);
    expect(lifecycle.status()).toMatchObject({
      state: "running",
      initialized: true,
      generation: 1,
    });
    expect(await heartbeats()).toHaveLength(1);
    // A second onStart does not create a second worker.
    const handle = lifecycle.handle();
    await lifecycle.onStart();
    expect(lifecycle.handle()).toBe(handle);

    await lifecycle.onShutdown();
    const status = lifecycle.status();
    expect(status.state).toBe("stopped");
    expect(status.lastStop).toMatchObject({ drained: true, clientClosed: true });
    expect(status.lastStop?.elapsedMs).toBeLessThan(5_000);
    expect(handle?.status().state).toBe("stopped");
    expect(lifecycle.handle()).toBeUndefined();
    expect(await heartbeats()).toEqual([]);
    expect(await heldLeases()).toBe(0);
    // onShutdown leaves the latest generation's query clients open so that a restart can keep using them.
    expect(await queryClient.checkConnection()).toMatchObject({ ok: true });

    await expect(lifecycle.onShutdown()).resolves.toBeUndefined();
    expect(lifecycle.status().state).toBe("stopped");

    // Restarting the same lifecycle in this process keeps the query client and indexes with a new worker.
    await mark(["c"]);
    await lifecycle.onStart();
    await waitFor("다시 시작한 뒤의 색인", () => fake.documents(target.writeAlias).has("c"));
    expect(lifecycle.status()).toMatchObject({
      state: "running",
      initialized: true,
      generation: 1,
    });
    expect(lifecycle.handle()).not.toBe(handle);
    expect(lifecycle.handle()?.status().state).toBe("running");
    expect(await heartbeats()).toHaveLength(1);
    expect(await queryClient.checkConnection()).toMatchObject({ ok: true });
    await lifecycle.onShutdown();
    expect(lifecycle.status()).toMatchObject({
      state: "stopped",
      lastStop: { drained: true, clientClosed: true },
    });
    expect(await heartbeats()).toEqual([]);
    expect(await heldLeases()).toBe(0);
    // An exiting application closes the query client itself.
    await queryClient.close();
    await expect(queryClient.checkConnection()).rejects.toBeInstanceOf(SearchStopping);
  });

  it("onStart가 불리지 않았거나 재시도할 수 없는 오류로 중간에 실패한 뒤의 onShutdown도 안전하다", async () => {
    const fake = createFakeOpenSearch();

    // A lifecycle that never started closes nothing, its own clients included.
    const neverClient = createSearchClient({
      createClient: () => fake.client,
      ownsClient: false,
      requestTimeoutMs: 5_000,
    });
    const never = createSearchLifecycle(lifecycleOptions(fake, { clients: [neverClient] }));
    await never.onShutdown();
    await never.onShutdown();
    expect(never.status()).toMatchObject({ state: "stopped", generation: undefined });
    expect(await neverClient.checkConnection()).toMatchObject({ ok: true });
    await neverClient.close();

    // A store mismatch is not retryable: onStart rejects and leaves no worker or heartbeat row.
    const mismatched = createSearchLifecycle(
      lifecycleOptions(fake, {
        synchronization: createPostgresSynchronization({
          getPrimaryDatabase: resolveSonamuPrimary,
          schema: h.searchSchema,
          namespace: h.namespace,
          expectedStoreId: randomUUID(),
        }),
      }),
    );
    const failure = mismatched.onStart();
    await expect(failure).rejects.toBeInstanceOf(SearchStoreMismatch);
    await expect(failure).rejects.toMatchObject({ retryable: false });
    expect(mismatched.status()).toMatchObject({
      state: "failed",
      generation: undefined,
      lastError: { code: "SEARCH_STORE_MISMATCH" },
    });
    expect(mismatched.handle()).toBeUndefined();
    expect(await heartbeats()).toEqual([]);
    await mismatched.onShutdown();
    await mismatched.onShutdown();
    expect(mismatched.status().state).toBe("stopped");

    // A missing schema fails the start too.
    await h.knex.raw(sql`DROP SCHEMA ${identifier(h.searchSchema)} CASCADE`);
    const missing = createSearchLifecycle(lifecycleOptions(fake));
    await expect(missing.onStart()).rejects.toMatchObject({
      code: "SEARCH_SCHEMA_MISSING",
      retryable: false,
    });
    expect(missing.handle()).toBeUndefined();
    await missing.onShutdown();
  });

  it("일시적 initialize 실패는 시작을 막지 않는다: degraded로 남기고 재시도하며, 종료하면 재시도 타이머도 사라진다", async () => {
    const definition = noteDefinition();
    const target = await registerTarget(definition.fingerprint);
    const fake = createFakeOpenSearch();
    await prepareAlias(fake, target);
    // Counts only the lifecycle's own initialize-retry timers; the worker and the pools have timers of their own.
    const retryTimers = trackTimersFrom(LIFECYCLE_SOURCE);
    try {
      // Only the first two primary lookups fail.
      let failures = 2;
      const flaky = createPostgresSynchronization({
        getPrimaryDatabase: () => {
          if (failures > 0) {
            failures -= 1;
            throw new SearchUnavailable(
              { key: "error.unavailable" },
              { details: { reason: "test-transient" } },
            );
          }
          return resolveSonamuPrimary();
        },
        schema: h.searchSchema,
        namespace: h.namespace,
      });
      const lifecycle = createSearchLifecycle(
        lifecycleOptions(fake, {
          synchronization: flaky,
          initializeRetry: { baseDelayMs: 20, maxDelayMs: 40 },
        }),
      );
      await lifecycle.onStart();
      expect(lifecycle.status()).toMatchObject({
        state: "degraded",
        initialized: false,
        lastError: { code: "SEARCH_UNAVAILABLE" },
      });
      // The worker starts anyway; its loop rides out database failures with its own backoff.
      expect(lifecycle.handle()).toBeDefined();
      await waitFor("initialize 재시도 성공", () => lifecycle.status().initialized);
      expect(lifecycle.status().state).toBe("running");
      expect(flaky.storeId()).toBeDefined();
      expect(retryTimers.created()).toBeGreaterThan(0);
      expect(retryTimers.pending()).toBe(0);
      await lifecycle.onShutdown();

      // Shutting down while initialize keeps failing cancels the scheduled retry.
      const down = createSearchLifecycle(
        lifecycleOptions(fake, {
          synchronization: createPostgresSynchronization({
            getPrimaryDatabase: () => {
              throw new SearchUnavailable(
                { key: "error.unavailable" },
                { details: { reason: "test-down" } },
              );
            },
            schema: h.searchSchema,
            namespace: h.namespace,
          }),
          initializeRetry: { baseDelayMs: 10_000, maxDelayMs: 20_000 },
        }),
      );
      await down.onStart();
      expect(down.status().state).toBe("degraded");
      expect(retryTimers.pending()).toBe(1);
      await down.onShutdown();
      expect(down.status().state).toBe("stopped");
      expect(retryTimers.pending()).toBe(0);
    } finally {
      retryTimers.restore();
    }
  });

  it("worker.enabled가 false인 프로세스는 동기화만 초기화하고 워커와 heartbeat 행을 만들지 않는다", async () => {
    const fake = createFakeOpenSearch();
    const base = lifecycleOptions(fake);
    if (base.worker === undefined) throw new Error("worker 옵션이 있어야 합니다.");
    const lifecycle = createSearchLifecycle({
      ...base,
      worker: { ...base.worker, enabled: false },
    });
    await lifecycle.onStart();
    expect(lifecycle.status()).toMatchObject({
      state: "running",
      initialized: true,
      worker: undefined,
    });
    expect(lifecycle.handle()).toBeUndefined();
    expect(base.synchronization?.storeId()).toBeDefined();
    expect(await heartbeats()).toEqual([]);
    expect(fake.requests()).toEqual([]);
    await lifecycle.onShutdown();
  });

  it("저장소 결속 불일치는 시작을 막지 않는다: onStart는 끝나고 status()에 남으며, 워커는 아무것도 보내지 않고 설정 오류 간격으로 다시 시도한다", async () => {
    const definition = noteDefinition();
    const target = await registerTarget(definition.fingerprint);
    const fake = createFakeOpenSearch();
    await prepareAlias(fake, target);
    await mark(["a"]);
    // Make the database look copied from elsewhere.
    await h.knex.raw(
      sql`UPDATE ${qualified(h.searchSchema, "store")} SET origin_database_name = 'elsewhere'`,
    );
    const sentBefore = fake.requests().length;
    const errors: string[] = [];
    const base = lifecycleOptions(fake);
    if (base.worker === undefined) throw new Error("worker 옵션이 있어야 합니다.");
    const lifecycle = createSearchLifecycle({
      ...base,
      worker: {
        ...base.worker,
        onEvent: (event) => {
          if (event.type === "error") errors.push(`${event.code}:${event.reason ?? ""}`);
        },
      },
    });
    try {
      await lifecycle.onStart();
      expect(lifecycle.status()).toMatchObject({
        state: "running",
        initialized: true,
        lastError: { code: "SEARCH_STORE_MISMATCH", key: "binding.originChanged" },
      });
      await waitFor("워커의 첫 실패", () => lifecycle.status().worker?.lastError !== undefined);
      expect(lifecycle.status().worker).toMatchObject({
        state: "degraded",
        lastError: { code: "SEARCH_STORE_MISMATCH", key: "binding.originChanged" },
      });
      const started = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      // Retries at retryMaxDelayMs (200 ms), about five per second; an immediate retry loop would make hundreds.
      const elapsed = Date.now() - started;
      expect(errors.length).toBeLessThanOrEqual(Math.ceil(elapsed / 200) + 2);
      expect(new Set(errors)).toEqual(new Set(["SEARCH_STORE_MISMATCH:store-origin-changed"]));
      expect(fake.requests().length).toBe(sentBefore);
      expect(await heldLeases()).toBe(0);
      // Capture keeps working.
      await mark(["b"]);
    } finally {
      await lifecycle.onShutdown();
    }
  });

  it("잘못된 옵션은 연결 없이 SearchConfigurationError로 거부된다", () => {
    const fake = createFakeOpenSearch();
    const base = lifecycleOptions(fake);
    const worker = base.worker;
    if (worker === undefined) throw new Error("worker 옵션이 있어야 합니다.");
    const detailsOf = (run: () => SearchLifecycle): SearchConfigurationError["details"] => {
      try {
        run();
      } catch (error) {
        expect(error).toBeInstanceOf(SearchConfigurationError);
        return error instanceof SearchConfigurationError ? error.details : undefined;
      }
      throw new Error("거부되어야 했습니다.");
    };
    expect(detailsOf(() => createSearchLifecycle({ ...base, name: "" }))).toMatchObject({
      reason: "invalid-lifecycle-options",
      path: "name",
    });
    expect(
      detailsOf(() => createSearchLifecycle({ ...base, synchronization: undefined })),
    ).toMatchObject({ path: "synchronization" });
    // createSearchClient validates the worker client options and createIndexer the definitions.
    expect(
      detailsOf(() =>
        createSearchLifecycle({
          ...base,
          worker: { ...worker, client: { ...worker.client, requestTimeoutMs: -1 } },
        }),
      ),
    ).toBeDefined();
    expect(
      detailsOf(() =>
        createSearchLifecycle({
          ...base,
          worker: { ...worker, definitions: [noteDefinition(), noteDefinition()] },
        }),
      ),
    ).toMatchObject({ reason: "duplicate-definition" });
    expect(
      detailsOf(() =>
        createSearchLifecycle({ ...base, initializeRetry: { baseDelayMs: 50, maxDelayMs: 10 } }),
      ),
    ).toMatchObject({ path: "initializeRetry" });
    expect(fake.requests()).toEqual([]);
  });
});

describe("리소스 컨테이너", () => {
  it("replace는 같은 이름의 이전 리소스를 dispose한 뒤 새로 만들고, 동시 호출을 차례로 실행하며, disposeAll은 모두 정리한다", async () => {
    const scope = `container-${randomUUID()}`;
    const container = getSearchResourceContainer(scope);
    // The same scope shares state, as it does after a module re-evaluation.
    const again = getSearchResourceContainer(scope);
    const log: string[] = [];
    const resource = (label: string) => ({
      create: async () => {
        log.push(`create:${label}`);
        return label;
      },
      dispose: async (value: string) => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        log.push(`dispose:${value}`);
      },
    });
    const one = resource("1");
    const two = resource("2");
    const three = resource("3");
    const other = resource("other");
    const results = await Promise.all([
      container.replace("loop", one.create, one.dispose),
      again.replace("loop", two.create, two.dispose),
      container.replace("loop", three.create, three.dispose),
      container.replace("other", other.create, other.dispose),
    ]);
    expect(results).toEqual(["1", "2", "3", "other"]);
    expect(log.filter((entry) => !entry.endsWith("other"))).toEqual([
      "create:1",
      "dispose:1",
      "create:2",
      "dispose:2",
      "create:3",
    ]);
    await again.disposeAll();
    expect(log.slice(-2).toSorted()).toEqual(["dispose:3", "dispose:other"]);
    await container.disposeAll();
    expect(log.filter((entry) => entry.startsWith("dispose"))).toHaveLength(4);

    // When disposing the previous resource fails, replace rejects with that error and creates nothing.
    const failing = new Error("dispose 실패");
    await container.replace(
      "loop",
      async () => "x",
      () => Promise.reject(failing),
    );
    let created = false;
    await expect(
      container.replace(
        "loop",
        () => {
          created = true;
          return "y";
        },
        async () => {},
      ),
    ).rejects.toBe(failing);
    expect(created).toBe(false);
    await expect(
      container.replace(
        "",
        () => 1,
        async () => {},
      ),
    ).rejects.toBeInstanceOf(SearchConfigurationError);
  });
});

// ---------------------------------------------------------------------------
// Module re-evaluation (the Sonamu dev server's HMR path)

const reportSchema = z.object({
  generation: z.number().optional(),
  latestGeneration: z.number(),
  state: z.string(),
  workerState: z.string().optional(),
  unsupported: z.array(z.string()).optional(),
  lastError: z.string().optional(),
  lastStop: z
    .object({ drained: z.boolean(), clientClosed: z.boolean(), elapsedMs: z.number() })
    .optional(),
  fingerprint: z.string(),
  handleStates: z.array(z.string()),
  queryOk: z.boolean(),
  queryError: z.string().optional(),
  sdkCloses: z.number(),
  indexed: z.array(z.string()),
  locale: z.string(),
  searchEvaluations: z.number(),
  clientEvaluations: z.number(),
});

const replySchema = z.discriminatedUnion("ok", [
  z.object({ id: z.number(), ok: z.literal(true), result: z.json() }),
  z.object({ id: z.number(), ok: z.literal(false), error: z.string() }),
]);
const readySchema = z.object({ type: z.literal("ready") });

const FIXTURE_DEADLINE_MS = 5_000;

/** The module the child re-evaluates: the definition and the lifecycle. */
function searchModuleSource(projectionVersion: string, revision: number): string {
  return `// revision ${revision}
import { z } from "zod";
import { createSearchLifecycle, defineSonamuSearch } from ${sourceUrl("sonamu/index.ts")};
import { queryClient, sharedSdk, synchronization } from "./client.ts";

export const definition = defineSonamuSearch({
  key: "notes",
  projectionVersion: "${projectionVersion}",
  schema: z.object({ body: z.string() }),
  settings: {},
  mappings: { properties: { body: { type: "text" } } },
  requiredPlugins: [],
  async materialize(_context, ids) {
    return new Map(ids.map((id) => [id, { state: "present", document: { body: id } }]));
  },
  async captureScanBoundary() {
    return "";
  },
  async scanSourceIds() {
    return { ids: [] };
  },
});

export const lifecycle = createSearchLifecycle({
  name: "hmr-fixture",
  synchronization,
  worker: {
    enabled: true,
    client: { createClient: () => sharedSdk, ownsClient: false, requestTimeoutMs: 5000 },
    definitions: [definition],
    limits: ${JSON.stringify(LIMITS)},
    pollIntervalMs: 60000,
  },
  clients: [queryClient],
  stopDeadlineMs: ${FIXTURE_DEADLINE_MS},
});

globalThis.__searchEvaluations = (globalThis.__searchEvaluations ?? 0) + 1;
`;
}

/** Never re-evaluated: the shared SDK client, the query client and the synchronization. */
const CLIENT_MODULE = `import { createSearchClient } from ${sourceUrl("index.ts")};
import { createPostgresSynchronization } from ${sourceUrl("postgres/index.ts")};
import { resolveSonamuPrimary } from ${sourceUrl("sonamu/index.ts")};
import { createFakeOpenSearch } from ${sourceUrl("testing/index.ts")};

const env = JSON.parse(process.env.FIXTURE_ENV ?? "{}");
export const fake = createFakeOpenSearch();
export const sdkCloses = { count: 0 };
// One SDK client shared by the query handle and the worker; counts close calls.
export const sharedSdk = new Proxy(fake.client, {
  get(target, property, receiver) {
    if (property === "close") {
      return async () => {
        sdkCloses.count += 1;
        return target.close();
      };
    }
    return Reflect.get(target, property, receiver);
  },
});
// The query client handed to the lifecycle. It owns the SDK client, so closing it would close the shared client.
export const queryClient = createSearchClient({
  createClient: () => sharedSdk,
  ownsClient: true,
  requestTimeoutMs: 5000,
});
export const synchronization = createPostgresSynchronization({
  getPrimaryDatabase: resolveSonamuPrimary,
  schema: env.schema,
  namespace: env.namespace,
});
globalThis.__clientEvaluations = (globalThis.__clientEvaluations ?? 0) + 1;
`;

/** Entry point: keeps the first evaluation's onStart/onShutdown as the Sonamu server does and runs commands. */
const ENTRY_MODULE = `import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DB, Sonamu } from "sonamu";
import { getSearchLocale } from ${sourceUrl("index.ts")};
import { fake, queryClient, sdkCloses } from "./search/client.ts";

const env = JSON.parse(process.env.FIXTURE_ENV ?? "{}");
DB.setConfig(env.dbConfig);
Sonamu.config = { i18n: { defaultLocale: "ko", supportedLocales: ["ko"] } };
const hot = globalThis.hot;
if (hot === undefined) throw new Error("hmr-hook이 초기화되지 않았습니다.");
const searchFile = realpathSync(fileURLToPath(new URL("./search/search.ts", import.meta.url)));

let current = await import("./search/search.ts");
// sonamu.config.ts is not re-evaluated, so Sonamu calls the first generation's hooks.
const hooks = { onStart: current.lifecycle.onStart, onShutdown: current.lifecycle.onShutdown };
const handles = [];
let writeAlias = "";

async function settle() {
  const deadline = Date.now() + 20000;
  for (;;) {
    const status = current.lifecycle.status();
    if (
      status.generation !== undefined &&
      status.generation === status.latestGeneration &&
      status.state === "running" &&
      status.worker?.state === "running" &&
      status.worker.lastDrainAt !== undefined
    ) {
      return;
    }
    if (Date.now() > deadline) throw new Error("settle: " + JSON.stringify(status));
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function report() {
  const status = current.lifecycle.status();
  // checkConnection on a closed client rejects with SearchStopping.
  const connection = await queryClient.checkConnection().catch((error) => ({ ok: false, error }));
  return {
    generation: status.generation,
    latestGeneration: status.latestGeneration,
    state: status.state,
    workerState: status.worker?.state,
    unsupported: status.worker === undefined ? undefined : [...status.worker.unsupportedTargets],
    lastError: status.lastError?.code,
    lastStop: status.lastStop,
    fingerprint: current.definition.fingerprint,
    handleStates: handles.map((handle) => handle.status().state),
    queryOk: connection.ok,
    queryError: connection.error?.code,
    sdkCloses: sdkCloses.count,
    indexed: writeAlias === "" ? [] : [...fake.documents(writeAlias).keys()].sort(),
    locale: getSearchLocale(),
    searchEvaluations: globalThis.__searchEvaluations,
    clientEvaluations: globalThis.__clientEvaluations,
  };
}

async function run(message) {
  switch (message.type) {
    case "prepare":
      writeAlias = message.writeAlias;
      await fake.client.indices.create({
        index: message.physicalIndex,
        body: { aliases: { [message.writeAlias]: {} } },
      });
      return { fingerprint: current.definition.fingerprint };
    case "start":
      await hooks.onStart();
      await settle();
      handles.push(current.lifecycle.handle());
      return report();
    case "reload":
      // The two steps of Syncer.hmrAndSync: invalidate, then re-import (autoload's importMembers).
      await hot.invalidateFile(searchFile, "change");
      current = await import("./search/search.ts");
      await settle();
      handles.push(current.lifecycle.handle());
      return report();
    case "shutdown": {
      await hooks.onShutdown();
      await hooks.onShutdown();
      const result = await report();
      await DB.destroy();
      return result;
    }
    case "exit":
      setImmediate(() => process.exit(0));
      return {};
    default:
      throw new Error("알 수 없는 명령 " + message.type);
  }
}

process.on("message", (message) => {
  run(message).then(
    (result) => process.send({ id: message.id, ok: true, result }),
    (error) => process.send({ id: message.id, ok: false, error: String(error?.stack ?? error) }),
  );
});
process.send({ type: "ready" });
`;

type FixtureCommand =
  | { type: "prepare"; physicalIndex: string; writeAlias: string }
  | { type: "start" }
  | { type: "reload" }
  | { type: "shutdown" }
  | { type: "exit" };
type FixtureResult = z.infer<ReturnType<typeof z.json>>;

interface Fixture {
  readonly appDir: string;
  readonly child: ChildProcess;
  request<T>(command: FixtureCommand, schema: z.ZodType<T>): Promise<T>;
}

/** Tracked separately so that cleanup still works when startup fails. */
const fixtureAppDirs = new Set<string>();
const fixtureChildren = new Set<ChildProcess>();

function writeFixtureApp(): string {
  const appDir = mkdtempSync(path.join(realpathSync(tmpdir()), "sonamu-opensearch-hmr-"));
  fixtureAppDirs.add(appDir);
  mkdirSync(path.join(appDir, "src/search"), { recursive: true });
  mkdirSync(path.join(appDir, "node_modules"), { recursive: true });
  const link = (name: string, target: string) =>
    symlinkSync(realpathSync(target), path.join(appDir, "node_modules", name), "dir");
  link("sonamu", path.join(PACKAGE_ROOT, "node_modules/sonamu"));
  link("zod", path.join(PACKAGE_ROOT, "node_modules/zod"));
  writeFileSync(path.join(appDir, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(
    path.join(appDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext", target: "es2022" } }),
  );
  writeFileSync(path.join(appDir, "src/index.ts"), ENTRY_MODULE);
  writeFileSync(path.join(appDir, "src/search/client.ts"), CLIENT_MODULE);
  writeFileSync(path.join(appDir, "src/search/search.ts"), searchModuleSource("1", 0));
  return appDir;
}

async function startFixture(appDir: string): Promise<Fixture> {
  const dbConfig = sonamuDatabaseConfig(h, "hmr-fixture");
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (name === "NODE_OPTIONS" || name.startsWith("VITEST")) continue;
    env[name] = value;
  }
  // The loader flags and environment of `sonamu dev`.
  const child = spawn(
    process.execPath,
    ["--import=sonamu/ts-loader-register", "--import=sonamu/hmr-hook-register", "src/index.ts"],
    {
      cwd: appDir,
      env: {
        ...env,
        NODE_ENV: "development",
        HOT: "yes",
        API_ROOT_PATH: appDir,
        FIXTURE_ENV: JSON.stringify({ dbConfig, schema: h.searchSchema, namespace: h.namespace }),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  fixtureChildren.add(child);
  let output = "";
  const collect = (chunk: Buffer) => {
    output += chunk.toString();
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  const pending = new Map<
    number,
    { resolve(value: FixtureResult): void; reject(error: Error): void }
  >();
  let nextId = 1;
  const ready = new Promise<void>((resolve, reject) => {
    child.on("message", (message: Serializable) => {
      if (readySchema.safeParse(message).success) {
        resolve();
        return;
      }
      // hmr-hook also sends its own notices (hmr-hook:invalidated) over IPC; only replies are handled here.
      const parsed = replySchema.safeParse(message);
      if (!parsed.success) return;
      const reply = parsed.data;
      const waiter = pending.get(reply.id);
      pending.delete(reply.id);
      if (reply.ok) waiter?.resolve(reply.result);
      else waiter?.reject(new Error(`${reply.error}\n${output}`));
    });
    child.on("exit", (code) => {
      const error = new Error(`자식 프로세스가 종료됐습니다 (${code}).\n${output}`);
      reject(error);
      for (const waiter of pending.values()) waiter.reject(error);
      pending.clear();
    });
  });
  await ready;
  return {
    appDir,
    child,
    async request(command, schema) {
      const id = nextId;
      nextId += 1;
      const result = await new Promise<FixtureResult>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.send({ ...command, id });
      });
      return schema.parse(result);
    },
  };
}

const hasExited = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null;

/** Asks each child to exit, kills it after 10 s, and removes the app directories. */
async function cleanUpFixtures(fixture: Fixture | undefined): Promise<void> {
  for (const child of fixtureChildren) {
    if (!hasExited(child)) {
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      if (fixture?.child === child) {
        await fixture.request({ type: "exit" }, z.json()).catch(() => undefined);
      } else {
        child.kill("SIGKILL");
      }
      const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      await exited;
      clearTimeout(timer);
    }
    fixtureChildren.delete(child);
  }
  for (const appDir of fixtureAppDirs) {
    rmSync(appDir, { recursive: true, force: true });
    fixtureAppDirs.delete(appDir);
  }
}

describe("모듈 재평가", () => {
  let fixture: Fixture | undefined;
  afterEach(async () => {
    await cleanUpFixtures(fixture);
    fixture = undefined;
  });

  it("모듈을 다시 평가해도 루프는 하나뿐이다: 이전 세대를 멈춘 뒤 새 세대가 시작하고, 정의가 바뀌면 새 정의로 바뀐다. stop은 기한 안에 끝나고 소유한 클라이언트만 닫는다", async () => {
    // Logs heartbeat inserts and deletes to prove that two workers' rows never coexisted.
    const log = qualified(h.searchSchema, "hb_log");
    const logFunction = qualified(h.searchSchema, "hb_log_fn");
    await h.knex.raw(
      sql`CREATE TABLE ${log} (seq bigserial PRIMARY KEY, op text NOT NULL, worker_id uuid NOT NULL)`,
    );
    await h.knex.raw(sql`CREATE FUNCTION ${logFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO ${log} (op, worker_id) VALUES ('delete', OLD.worker_id);
  ELSE
    INSERT INTO ${log} (op, worker_id) VALUES ('insert', NEW.worker_id);
  END IF;
  RETURN NULL;
END
$$`);
    await h.knex.raw(
      sql`CREATE TRIGGER hb_log_trigger AFTER INSERT OR DELETE ON ${qualified(h.searchSchema, "worker_heartbeats")} FOR EACH ROW EXECUTE FUNCTION ${logFunction}()`,
    );

    const fingerprintV1 = noteDefinition("1").fingerprint;
    const fingerprintV2 = noteDefinition("2").fingerprint;
    expect(fingerprintV2).not.toBe(fingerprintV1);
    const target = await registerTarget(fingerprintV1);
    const app = writeFixtureApp();
    fixture = await startFixture(app);
    const prepared = await fixture.request(
      { type: "prepare", physicalIndex: target.physicalIndex, writeAlias: target.writeAlias },
      z.object({ fingerprint: z.string() }),
    );
    expect(prepared.fingerprint).toBe(fingerprintV1);

    await mark(["d0"]);
    const first = await fixture.request({ type: "start" }, reportSchema);
    expect(first).toMatchObject({
      generation: 1,
      state: "running",
      workerState: "running",
      indexed: ["d0"],
      queryOk: true,
      sdkCloses: 0,
      locale: "ko",
      searchEvaluations: 1,
      clientEvaluations: 1,
    });
    const workers = new Set((await heartbeats()).map((row) => row.worker_id));
    expect(workers.size).toBe(1);

    // Four re-evaluations without a definition change: each generation replaces the previous one and indexes the
    // documents marked in between.
    const RELOADS = 4;
    for (let index = 1; index <= RELOADS; index += 1) {
      await mark([`d${index}`]);
      writeFileSync(path.join(app, "src/search/search.ts"), searchModuleSource("1", index));
      const report = await fixture.request({ type: "reload" }, reportSchema);
      expect(report).toMatchObject({
        generation: index + 1,
        latestGeneration: index + 1,
        state: "running",
        fingerprint: fingerprintV1,
        searchEvaluations: index + 1,
        // The query client of the module that was not re-evaluated stays open and the shared SDK client is not closed.
        clientEvaluations: 1,
        queryOk: true,
        sdkCloses: 0,
        lastStop: { drained: true, clientClosed: true },
      });
      expect(report.indexed).toEqual(Array.from({ length: index + 1 }, (_, n) => `d${n}`));
      expect(report.handleStates).toEqual([...Array<string>(index).fill("stopped"), "running"]);
      expect(report.lastStop?.elapsedMs).toBeLessThan(FIXTURE_DEADLINE_MS);
      const rows = await heartbeats();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.capabilities).toEqual([`${KEY}@${fingerprintV1}`]);
      workers.add(rows[0]?.worker_id ?? "");
    }
    expect(workers.size).toBe(RELOADS + 1);

    // A changed definition: the new worker advertises the new fingerprint and leaves the old target alone.
    await mark(["pending-for-v1"]);
    writeFileSync(path.join(app, "src/search/search.ts"), searchModuleSource("2", RELOADS + 1));
    const changed = await fixture.request({ type: "reload" }, reportSchema);
    expect(changed).toMatchObject({
      generation: RELOADS + 2,
      fingerprint: fingerprintV2,
      unsupported: [target.targetId],
      queryOk: true,
      sdkCloses: 0,
    });
    expect(changed.indexed).not.toContain("pending-for-v1");
    const rows = await heartbeats();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.capabilities).toEqual([`${KEY}@${fingerprintV2}`]);

    // The first generation's onShutdown, which Sonamu calls, stops the latest generation. It leaves the latest query
    // client open and no generation retired a client, so the shared SDK client is never closed.
    const final = await fixture.request({ type: "shutdown" }, reportSchema);
    expect(final).toMatchObject({
      state: "stopped",
      queryOk: true,
      sdkCloses: 0,
      lastStop: { drained: true, clientClosed: true },
    });
    expect(final.generation).toBeUndefined();
    expect(final.handleStates.every((state) => state === "stopped")).toBe(true);
    expect(final.lastStop?.elapsedMs).toBeLessThan(FIXTURE_DEADLINE_MS);
    expect(await heartbeats()).toEqual([]);
    expect(await heldLeases()).toBe(0);

    const { rows: logRows } = await h.knex.raw<{ rows: { op: string; worker_id: string }[] }>(
      sql`SELECT op, worker_id::text FROM ${log} ORDER BY seq`,
    );
    let live = 0;
    let maxLive = 0;
    for (const row of logRows) {
      live += row.op === "insert" ? 1 : -1;
      maxLive = Math.max(maxLive, live);
    }
    expect(maxLive).toBe(1);
    expect(live).toBe(0);
    expect(logRows.filter((row) => row.op === "insert")).toHaveLength(RELOADS + 2);
  });
});
