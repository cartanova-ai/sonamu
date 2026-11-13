import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

function countActiveResources(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const resource of process.getActiveResourcesInfo()) {
    counts.set(resource, (counts.get(resource) ?? 0) + 1);
  }
  return counts;
}

// Resources added since `before`, per kind; older timers that finished meanwhile are ignored.
function addedResources(before: ReadonlyMap<string, number>): Map<string, number> {
  const added = new Map<string, number>();
  for (const [resource, count] of countActiveResources()) {
    const increase = count - (before.get(resource) ?? 0);
    if (increase > 0) added.set(resource, increase);
  }
  return added;
}

describe("비활성 팩토리", () => {
  it("모든 진입점을 import하고 팩토리를 만들어도 연결, 타이머, 스키마 접근이 생기지 않는다", async () => {
    // Node creates stdio handles on first access, and a dependency of sonamu touches process.stdin on import,
    // so the process-owned stdio handles join the baseline first.
    expect(process.stdin.readableFlowing).not.toBe(true);
    expect(process.stdout.writable).toBe(true);
    expect(process.stderr.writable).toBe(true);
    const before = countActiveResources();

    const entries = await Promise.all([
      import("../../src/index"),
      import("../../src/postgres/index"),
      import("../../src/admin/index"),
      import("../../src/sonamu/index"),
      import("../../src/testing/index"),
    ]);
    // Surfaces work an entry point scheduled at import time.
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(entries).toHaveLength(5);
    // Exported factories; the tests below spy on their construction paths.
    expect(Object.keys(entries[1]).toSorted()).toEqual([
      "WORKER_HEARTBEAT_EXPIRY_MS",
      "createIndexer",
      "createPostgresCatalogReader",
      "createPostgresSynchronization",
      "parseWorkerLimits",
    ]);
    expect(Object.keys(entries[2]).toSorted()).toEqual([
      "DEFAULT_INSPECT_COUNT_LIMIT",
      "POSTGRES_ONLY_ADMIN_OPERATIONS",
      "SEARCH_SCHEMA_VERSION",
      "applySearchGrants",
      "checkSearchSchema",
      "createSearchAdmin",
      "installSearchSchema",
      "renderSearchGrantsSql",
      "renderSearchSchemaSql",
    ]);
    expect(Object.keys(entries[3]).toSorted()).toEqual([
      "createSearchLifecycle",
      "createSonamuSearchQueries",
      "createSonamuSynchronization",
      "defineSonamuSearch",
      "getSearchLifecycleStatus",
      "getSearchResourceContainer",
      "resolveSonamuPrimary",
      "withProjectionScope",
    ]);
    expect(Object.keys(entries[4]).toSorted()).toEqual([
      "FAKE_CATALOG_START_MS",
      "TEST_READ_LIFETIMES",
      "createFakeCatalog",
      "createFakeOpenSearch",
      "createTestDefinition",
      "createTestReadHead",
      "createTestReadTarget",
      "traceProjectionConnections",
    ]);
    expect(Object.keys(entries[0])).toContain("SearchError");
    expect(Object.keys(entries[0])).toEqual(
      expect.arrayContaining(["createSearchClient", "createSearchQueries"]),
    );

    expect(addedResources(before)).toEqual(new Map());
  });

  it("클라이언트, 검색 핸들, 테스트용 가짜를 만들어도 클라이언트 생성, 카탈로그 조회, 타이머가 생기지 않는다", async () => {
    const root = await import("../../src/index");
    const testing = await import("../../src/testing/index");
    const before = countActiveResources();

    const fake = testing.createFakeOpenSearch();
    const createClient = vi.fn(() => fake.client);
    const client = root.createSearchClient({
      createClient,
      ownsClient: true,
      requestTimeoutMs: 1_000,
    });
    const catalog = testing.createFakeCatalog();
    const resolveReadHeads = vi.spyOn(catalog, "resolveReadHeads");
    const resolveTarget = vi.spyOn(catalog, "resolveTarget");
    root.createSearchQueries({
      client,
      catalog,
      logicalKey: "chat-messages",
      supportedFingerprints: ["a".repeat(64)],
      limits: { ...testing.TEST_READ_LIFETIMES, maxPageSize: 10, timeoutMs: 1_000 },
      cursor: { signingKeys: [{ id: "k1", secret: new Uint8Array(32) }] },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(createClient).not.toHaveBeenCalled();
    expect(resolveReadHeads).not.toHaveBeenCalled();
    expect(resolveTarget).not.toHaveBeenCalled();
    expect(fake.requests()).toEqual([]);
    expect(addedResources(before)).toEqual(new Map());
    // Closing a never-used client does not create one.
    await client.close();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("트랜잭션 동기화와 Sonamu 동기화를 만들어도 primary 조회, 연결, 타이머가 생기지 않는다", async () => {
    const postgres = await import("../../src/postgres/index");
    const sonamuEntry = await import("../../src/sonamu/index");
    const before = countActiveResources();

    const getPrimaryDatabase = vi.fn(() => {
      throw new Error("a factory must not look up the primary");
    });
    const synchronization = postgres.createPostgresSynchronization({
      getPrimaryDatabase,
      namespace: "app",
    });
    sonamuEntry.createSonamuSynchronization(synchronization);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(getPrimaryDatabase).not.toHaveBeenCalled();
    expect(synchronization.storeId()).toBeUndefined();
    expect(synchronization.options).toMatchObject({
      schema: "sonamu_search",
      namespace: "app",
      maxIdsPerCall: 10_000,
    });
    expect(addedResources(before)).toEqual(new Map());
  });

  it("카탈로그 reader와 관리 핸들을 만들어도 primary 조회, 클라이언트 생성, 연결, 타이머가 생기지 않는다", async () => {
    const root = await import("../../src/index");
    const postgres = await import("../../src/postgres/index");
    const admin = await import("../../src/admin/index");
    const testing = await import("../../src/testing/index");
    const before = countActiveResources();

    const getPrimaryDatabase = vi.fn(() => {
      throw new Error("a factory must not look up the primary");
    });
    postgres.createPostgresCatalogReader({ getPrimaryDatabase, namespace: "app" });
    const fake = testing.createFakeOpenSearch();
    const createClient = vi.fn(() => fake.client);
    const client = root.createSearchClient({
      createClient,
      ownsClient: true,
      requestTimeoutMs: 1_000,
    });
    const synchronization = postgres.createPostgresSynchronization({
      getPrimaryDatabase,
      namespace: "app",
    });
    admin.createSearchAdmin({
      client,
      synchronization,
      definitions: [],
      lifetimes: { ...testing.TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
      timeouts: {
        lockTimeoutMs: 1_000,
        statementTimeoutMs: 5_000,
        idleInTransactionTimeoutMs: 10_000,
        adminLeaseMs: 60_000,
      },
      cutover: { maxPendingDocuments: 0, sampleSize: 10 },
      workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 10_000 },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(getPrimaryDatabase).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(fake.requests()).toEqual([]);
    expect(addedResources(before)).toEqual(new Map());
  });
});

describe("Sonamu 수명 주기 팩토리", () => {
  it("createSearchLifecycle과 getSearchResourceContainer는 primary 조회, 클라이언트 생성, 연결, 타이머를 만들지 않는다", async () => {
    const postgres = await import("../../src/postgres/index");
    const sonamuEntry = await import("../../src/sonamu/index");
    const testing = await import("../../src/testing/index");
    const before = countActiveResources();

    const getPrimaryDatabase = vi.fn(() => {
      throw new Error("a factory must not look up the primary");
    });
    const fake = testing.createFakeOpenSearch();
    const createClient = vi.fn(() => fake.client);
    const lifecycle = sonamuEntry.createSearchLifecycle({
      name: "inert-factories",
      synchronization: postgres.createPostgresSynchronization({
        getPrimaryDatabase,
        namespace: "app",
      }),
      worker: {
        enabled: true,
        client: { createClient, ownsClient: false, requestTimeoutMs: 1_000 },
        definitions: [
          testing.createTestDefinition({
            key: "chat-messages",
            schema: z.object({ body: z.string() }),
          }),
        ],
        limits: {
          maxDocumentsPerClaim: 100,
          maxBulkBytes: 1_000_000,
          maxConcurrentBulkRequests: 1,
          projectionTimeoutMs: 1_000,
          requestTimeoutMs: 1_000,
          leaseDurationMs: 10_000,
          heartbeatIntervalMs: 2_000,
          maxRetryAttempts: 3,
          maxRetryAgeMs: 60_000,
          maxIsolationCallsPerBatch: 20,
          retryBaseDelayMs: 100,
          retryMaxDelayMs: 1_000,
          maxInFlightBytes: 2_000_000,
          statementTimeoutMs: 1_000,
          fenceRenewIntervalMs: 30_000,
        },
        pollIntervalMs: 1_000,
      },
      stopDeadlineMs: 1_000,
    });
    sonamuEntry.getSearchResourceContainer("inert-factories");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(lifecycle.status()).toMatchObject({ state: "idle", generation: undefined });
    expect(lifecycle.handle()).toBeUndefined();
    expect(getPrimaryDatabase).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(fake.requests()).toEqual([]);
    expect(addedResources(before)).toEqual(new Map());
  });

  it("getSearchLifecycleStatus는 읽기만 한다: 없는 이름은 undefined이고 슬롯을 만들지 않으며, 있는 이름은 그 lifecycle의 status()와 같다", async () => {
    const sonamuEntry = await import("../../src/sonamu/index");
    const before = countActiveResources();
    const slots = Symbol.for("@sonamu-kit/opensearch/sonamu/lifecycle-slots");
    // SAFETY: only counts the slot map's keys (a global key private to lifecycle.ts).
    const slotNames = () => [
      ...((globalThis as Record<symbol, Map<string, unknown> | undefined>)[slots]?.keys() ?? []),
    ];

    const namesBefore = slotNames();
    expect(sonamuEntry.getSearchLifecycleStatus("never-created")).toBeUndefined();
    expect(slotNames()).toEqual(namesBefore);

    const lifecycle = sonamuEntry.createSearchLifecycle({
      name: "status-accessor",
      stopDeadlineMs: 1_000,
    });
    expect(sonamuEntry.getSearchLifecycleStatus("status-accessor")).toEqual(lifecycle.status());
    expect(sonamuEntry.getSearchLifecycleStatus("status-accessor")).toMatchObject({
      name: "status-accessor",
      state: "idle",
      latestGeneration: 1,
    });
    await lifecycle.onStart();
    expect(sonamuEntry.getSearchLifecycleStatus("status-accessor")?.state).toBe("running");
    await lifecycle.onShutdown();
    // A created name stays visible as stopped after shutdown.
    expect(sonamuEntry.getSearchLifecycleStatus("status-accessor")?.state).toBe("stopped");

    for (const invalid of ["", "x".repeat(201)]) {
      expect(() => sonamuEntry.getSearchLifecycleStatus(invalid)).toThrow(
        expect.objectContaining({
          code: "SEARCH_CONFIGURATION_ERROR",
          details: expect.objectContaining({ reason: "invalid-lifecycle-options", path: "name" }),
        }),
      );
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(addedResources(before)).toEqual(new Map());
  });
});

describe("색인 워커 팩토리", () => {
  it("createIndexer는 primary 조회, 클라이언트 생성, 연결, 타이머를 만들지 않는다", async () => {
    const root = await import("../../src/index");
    const postgres = await import("../../src/postgres/index");
    const testing = await import("../../src/testing/index");
    const before = countActiveResources();

    const getPrimaryDatabase = vi.fn(() => {
      throw new Error("a factory must not look up the primary");
    });
    const fake = testing.createFakeOpenSearch();
    const createClient = vi.fn(() => fake.client);
    postgres.createIndexer({
      client: root.createSearchClient({ createClient, ownsClient: true, requestTimeoutMs: 1_000 }),
      synchronization: postgres.createPostgresSynchronization({
        getPrimaryDatabase,
        namespace: "app",
      }),
      definitions: [
        testing.createTestDefinition({
          key: "chat-messages",
          schema: z.object({ body: z.string() }),
        }),
      ],
      limits: {
        maxDocumentsPerClaim: 100,
        maxBulkBytes: 1_000_000,
        maxConcurrentBulkRequests: 1,
        projectionTimeoutMs: 1_000,
        requestTimeoutMs: 1_000,
        leaseDurationMs: 10_000,
        heartbeatIntervalMs: 2_000,
        maxRetryAttempts: 3,
        maxRetryAgeMs: 60_000,
        maxIsolationCallsPerBatch: 20,
        retryBaseDelayMs: 100,
        retryMaxDelayMs: 1_000,
        maxInFlightBytes: 2_000_000,
        statementTimeoutMs: 1_000,
        fenceRenewIntervalMs: 30_000,
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(getPrimaryDatabase).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(fake.requests()).toEqual([]);
    expect(addedResources(before)).toEqual(new Map());
  });
});
describe("Sonamu 쿼리 핸들 팩토리", () => {
  it("createSonamuSearchQueries는 Sonamu primary 조회, 카탈로그 조회, 클라이언트 생성, 연결, 타이머를 만들지 않는다", async () => {
    const root = await import("../../src/index");
    const sonamuEntry = await import("../../src/sonamu/index");
    const testing = await import("../../src/testing/index");
    const sonamu = await import("sonamu");
    const before = countActiveResources();

    const getDB = vi.spyOn(sonamu.DB, "getDB");
    const fake = testing.createFakeOpenSearch();
    const createClient = vi.fn(() => fake.client);
    const client = root.createSearchClient({
      createClient,
      ownsClient: true,
      requestTimeoutMs: 1_000,
    });
    const definition = testing.createTestDefinition({
      key: "chat-messages",
      schema: z.object({ body: z.string() }),
    });
    // Both catalog forms, a location and a reader, stay inert at factory time.
    sonamuEntry.createSonamuSearchQueries({
      client,
      catalog: { namespace: "app" },
      logicalKey: "chat-messages",
      supportedFingerprints: [definition.fingerprint],
      limits: root.RECOMMENDED_QUERY_LIMITS,
    });
    const catalog = testing.createFakeCatalog();
    sonamuEntry.createSonamuSearchQueries({
      client,
      catalog,
      logicalKey: "chat-messages",
      supportedFingerprints: [definition.fingerprint],
      limits: root.RECOMMENDED_QUERY_LIMITS,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(getDB).not.toHaveBeenCalled();
    expect(catalog.calls()).toEqual([]);
    expect(createClient).not.toHaveBeenCalled();
    expect(fake.requests()).toEqual([]);
    expect(addedResources(before)).toEqual(new Map());
    getDB.mockRestore();
  });
});
