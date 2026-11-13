import { describe, expect, it, vi } from "vitest";

import { createSearchClient } from "../../src/client/search-client";
import {
  SearchCatalogUnavailable,
  SearchConfigurationError,
  SearchDefinitionMismatch,
  SearchInTransactionError,
  SearchNotConfigured,
  SearchNotReady,
  SearchQueryInvalid,
  SearchRebuildRequired,
  SearchStopping,
  SearchTargetUnavailable,
  SearchTimeout,
  SearchUnavailable,
} from "../../src/errors";
import { type SearchCatalogReader } from "../../src/query/catalog";
import { createSearchQueries, type SearchQueriesOptions } from "../../src/query/search-queries";
import {
  createFakeCatalog,
  createFakeOpenSearch,
  createTestReadHead,
  createTestReadTarget,
} from "../../src/testing";
import {
  createQueryHarness,
  FINGERPRINT,
  LOGICAL_KEY,
  type Message,
  messages,
  NAMESPACE,
  NEXT_FINGERPRINT,
  QUERY_LIMITS,
  searchErrorOf,
  seedIndex,
  SIGNING_KEY,
  sortedBody,
  TARGET_ID,
  thrownSearchError,
} from "./query-fixtures";

// A catalog whose lookups never settle; records the signals it receives.
function hangingCatalog(signals: AbortSignal[]): SearchCatalogReader {
  const hang = (options: { signal?: AbortSignal }) => {
    if (options.signal !== undefined) signals.push(options.signal);
    return new Promise<never>(() => undefined);
  };
  return {
    resolveReadHeads: (_keys, options) => hang(options),
    resolveTarget: (_id, options) => hang(options),
  };
}

describe("새 검색", () => {
  it("카탈로그의 물리 인덱스에서 검색하고, 감싼 쿼리와 패키지가 정한 _source를 보낸다", async () => {
    const { fake, queries, target } = await createQueryHarness({
      documents: [...messages(3), { id: "gone", revision: 2, deleted: true }],
    });
    const spy = vi.spyOn(fake.client.transport, "request");
    const result = await queries.search({
      body: { query: { match_all: {} }, sort: ["_id"], size: 10 },
    });
    expect(result.target).toEqual({
      targetId: TARGET_ID,
      fingerprint: FINGERPRINT,
      readGeneration: 1,
    });
    // Tombstones are filtered out; by default only id and revision come back.
    expect(result.hits).toEqual([
      { id: "m0001", revision: 1, score: null, sort: ["m0001"] },
      { id: "m0002", revision: 1, score: null, sort: ["m0002"] },
      { id: "m0003", revision: 1, score: null, sort: ["m0003"] },
    ]);
    expect(result.total).toBeUndefined();
    expect(result.timedOut).toBe(false);
    expect(result.nextCursor).toBeUndefined();
    const [params, options] = spy.mock.calls[0] ?? [];
    expect(params).toEqual({
      method: "POST",
      path: `/${target.physicalIndex}/_search`,
      body: {
        query: {
          bool: { must: [{ match_all: {} }], filter: [{ term: { "sonamu_meta.deleted": false } }] },
        },
        _source: { includes: ["sonamu_meta.revision"] },
        track_total_hits: false,
        sort: ["_id"],
        size: 10,
      },
    });
    expect(options).toMatchObject({ maxRetries: 0, asStream: true });
  });

  it("정책이 허용한 doc 필드만 source로 돌려주고, 허용되면 total을 준다", async () => {
    const { queries } = await createQueryHarness({
      overrides: { policy: { sourceIncludes: ["body", "seq"], allowTrackTotalHits: true } },
    });
    const result = await queries.search({
      body: {
        query: { term: { "doc.roomId": "odd" } },
        sort: [{ "doc.seq": "asc" }],
        size: 2,
        _source: ["body"],
        track_total_hits: true,
      },
    });
    expect(result.hits.map((hit) => hit.source)).toEqual([
      { body: "message 1" },
      { body: "message 3" },
    ]);
    expect(result.total).toEqual({ value: 13, relation: "eq" });
    const denied = await searchErrorOf(queries.search({ body: { _source: ["roomId"] } }));
    expect(denied.details).toEqual({ reason: "source-field-not-allowed", field: "roomId" });
  });

  it("카탈로그 상태에 따라 SearchNotConfigured, SearchNotReady, SearchRebuildRequired, SearchDefinitionMismatch, SearchTargetUnavailable이다", async () => {
    const { catalog, queries, target } = await createQueryHarness();
    const cases = [
      [
        createTestReadHead({ logicalKey: LOGICAL_KEY, target: null }),
        SearchNotReady,
        "no-read-target",
      ],
      [
        createTestReadHead({ logicalKey: LOGICAL_KEY, target, rebuildRequired: true }),
        SearchRebuildRequired,
        "rebuild-required",
      ],
      [
        createTestReadHead({
          logicalKey: LOGICAL_KEY,
          target: { ...target, captureEpoch: 1, currentCaptureEpoch: 2 },
        }),
        SearchRebuildRequired,
        "capture-epoch-invalidated",
      ],
      [
        createTestReadHead({
          logicalKey: LOGICAL_KEY,
          target: { ...target, fingerprint: NEXT_FINGERPRINT },
        }),
        SearchDefinitionMismatch,
        "unsupported-fingerprint",
      ],
      [
        createTestReadHead({ logicalKey: LOGICAL_KEY, target: { ...target, state: "retiring" } }),
        SearchTargetUnavailable,
        "target-not-readable",
      ],
    ] as const;
    for (const [head, ErrorClass, reason] of cases) {
      catalog.set(head);
      const error = await searchErrorOf(queries.search({ body: {} }));
      expect(error).toBeInstanceOf(ErrorClass);
      expect(error.details?.reason).toBe(reason);
    }
    const missing = await createQueryHarness({ overrides: { logicalKey: "other-key" } });
    const error = await searchErrorOf(missing.queries.search({ body: {} }));
    expect(error).toBeInstanceOf(SearchNotConfigured);
  });

  it("설정한 수명이 카탈로그 최대치를 넘으면 SearchConfigurationError로 실패 닫힘한다", async () => {
    const { catalog, queries, target } = await createQueryHarness();
    for (const limit of [
      "maxSearchLifetimeMs",
      "maxCursorLifetimeMs",
      "maxPitKeepAliveMs",
    ] as const) {
      catalog.set(
        createTestReadHead({
          logicalKey: LOGICAL_KEY,
          target,
          lifetimes: { [limit]: QUERY_LIMITS[limit] - 1 },
        }),
      );
      const error = await searchErrorOf(queries.search({ body: {} }));
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details).toEqual({ reason: "lifetime-exceeds-catalog", limit });
    }
  });

  it("카탈로그 실패는 메시지를 싣지 않은 SearchCatalogUnavailable이고, 캐시된 포인터로 대신하지 않는다", async () => {
    const { catalog, fake, queries } = await createQueryHarness();
    await queries.search({ body: {} });
    const requests = fake.requests().length;
    catalog.fail(new Error("connection to 10.0.0.1 failed: password authentication failed"));
    const error = await searchErrorOf(queries.search({ body: {} }));
    expect(error).toBeInstanceOf(SearchCatalogUnavailable);
    expect(error.details).toEqual({ reason: "catalog-failed" });
    expect(error.message).not.toContain("password");
    expect(error.cause).toBeUndefined();
    expect(fake.requests()).toHaveLength(requests);
    // A package error thrown by the catalog passes through unchanged.
    catalog.fail(new SearchTimeout());
    expect(await searchErrorOf(queries.search({ body: {} }))).toBeInstanceOf(SearchTimeout);
  });

  it("카탈로그가 마감 안에 답하지 않으면 SearchTimeout이고 카탈로그에 넘긴 signal이 중단된다", async () => {
    const signals: AbortSignal[] = [];
    const { queries } = await createQueryHarness({ catalog: () => hangingCatalog(signals) });
    const error = await searchErrorOf(queries.search({ body: {}, timeoutMs: 50 }));
    expect(error).toBeInstanceOf(SearchTimeout);
    expect(error.details).toEqual({ reason: "search-deadline", timeoutMs: 50 });
    expect(signals[0]?.aborted).toBe(true);
  });

  it("카탈로그 결과의 모양이 다르거나 대상과 인덱스 이름이 맞지 않으면 SearchCatalogUnavailable이다", async () => {
    const { catalog, queries, target } = await createQueryHarness();
    catalog.set(
      createTestReadHead({
        logicalKey: LOGICAL_KEY,
        target: {
          ...target,
          physicalIndex: "snm-t-unit-chat-messages-00000000000040008000000000000000",
        },
      }),
    );
    const mismatch = await searchErrorOf(queries.search({ body: {} }));
    expect(mismatch.details).toEqual({ reason: "invalid-catalog-result" });

    const broken = await createQueryHarness({
      catalog: (fake) => ({
        resolveReadHeads: async (keys, options) => ({
          ...(await fake.resolveReadHeads(keys, options)),
          cursorIssueMs: -1,
        }),
        resolveTarget: (id, options) => fake.resolveTarget(id, options),
      }),
    });
    const error = await searchErrorOf(broken.queries.search({ body: {} }));
    expect(error).toBeInstanceOf(SearchCatalogUnavailable);
    expect(error.retryable).toBe(false);
  });

  it("본문이 허용 목록을 벗어나면 카탈로그와 엔진에 닿기 전에 거부한다", async () => {
    const { catalog, fake, queries } = await createQueryHarness();
    const calls = catalog.calls().length;
    const requests = fake.requests().length;
    for (const body of [
      { aggs: {} },
      { pit: { id: "x" } },
      { from: 10 },
      { query: { match_all: {} }, index: "other" },
    ]) {
      expect(await searchErrorOf(queries.search({ body: Object(body) }))).toBeInstanceOf(
        SearchQueryInvalid,
      );
    }
    expect(catalog.calls()).toHaveLength(calls);
    expect(fake.requests()).toHaveLength(requests);
  });

  it("입력의 모르는 키(예: index)와 잘못된 값은 SearchQueryInvalid다", async () => {
    const { queries } = await createQueryHarness();
    const withIndex = Object.assign({ body: {} }, { index: "snm-other" });
    expect((await searchErrorOf(queries.search(withIndex))).details).toEqual({
      reason: "invalid-search-input",
      path: "index",
    });
    expect((await searchErrorOf(queries.search({ body: {}, timeoutMs: 0 }))).details?.path).toBe(
      "timeoutMs",
    );
  });

  it("주변 트랜잭션 검사가 실패하면 어떤 I/O도 하지 않는다", async () => {
    const { catalog, fake, queries } = await createQueryHarness({
      hooks: {
        assertNoAmbientTransaction: () => {
          throw new SearchInTransactionError();
        },
      },
    });
    const requests = fake.requests().length;
    expect(await searchErrorOf(queries.search({ body: {} }))).toBeInstanceOf(
      SearchInTransactionError,
    );
    expect(await searchErrorOf(queries.closeCursor("x"))).toBeInstanceOf(SearchInTransactionError);
    expect(catalog.calls()).toEqual([]);
    expect(fake.requests()).toHaveLength(requests);
  });

  it("엔진 오류를 분류한다: 400은 SearchQueryInvalid, 503은 SearchUnavailable, 인덱스가 없으면 SearchTargetUnavailable", async () => {
    const { fake, queries } = await createQueryHarness();
    fake.scriptRequest((request) =>
      request.path.endsWith("_search")
        ? { kind: "error", status: 400, type: "parsing_exception" }
        : undefined,
    );
    expect(await searchErrorOf(queries.search({ body: {} }))).toBeInstanceOf(SearchQueryInvalid);

    const unavailable = await createQueryHarness();
    unavailable.fake.scriptRequest(() => ({
      kind: "error",
      status: 503,
      type: "unavailable_shards_exception",
    }));
    const error = await searchErrorOf(unavailable.queries.search({ body: {} }));
    expect(error).toBeInstanceOf(SearchUnavailable);
    expect(error.retryable).toBe(true);

    const missing = await createQueryHarness();
    await missing.fake.client.transport.request({
      method: "DELETE",
      path: `/${missing.target.physicalIndex}`,
    });
    const gone = await searchErrorOf(missing.queries.search({ body: {} }));
    expect(gone).toBeInstanceOf(SearchTargetUnavailable);
    expect(gone.details?.reason).toBe("index-not-found");
  });

  it("엔진 응답의 모양이 다르면 SearchUnavailable invalid-search-response다", async () => {
    const { fake, queries } = await createQueryHarness();
    fake.scriptRequest((request) =>
      request.path.endsWith("_search")
        ? {
            kind: "response",
            status: 200,
            body: { timed_out: false, hits: { hits: [{ _id: "x", _source: {} }] } },
          }
        : undefined,
    );
    const error = await searchErrorOf(queries.search({ body: {} }));
    expect(error).toBeInstanceOf(SearchUnavailable);
    expect(error.details).toEqual({ reason: "invalid-search-response" });
  });

  it("엔진이 마감 안에 답하지 않으면 SearchTimeout이고, 호출자가 중단하면 그 reason으로 실패한다", async () => {
    const { fake, queries } = await createQueryHarness();
    fake.scriptRequest((request) =>
      request.path.endsWith("_search") ? { kind: "hang" } : undefined,
    );
    const timedOut = await searchErrorOf(queries.search({ body: {}, timeoutMs: 50 }));
    expect(timedOut).toBeInstanceOf(SearchTimeout);

    const controller = new AbortController();
    const reason = new Error("호출자 중단");
    const pending = queries.search({ body: {}, signal: controller.signal });
    setTimeout(() => controller.abort(reason), 10);
    await expect(pending).rejects.toBe(reason);

    const already = new AbortController();
    already.abort(reason);
    await expect(queries.search({ body: {}, signal: already.signal })).rejects.toBe(reason);
  });

  it("호출별 timeoutMs는 maxSearchLifetimeMs를 넘지 않는다", async () => {
    const signals: AbortSignal[] = [];
    const { queries } = await createQueryHarness({
      catalog: () => hangingCatalog(signals),
      overrides: { limits: { ...QUERY_LIMITS, timeoutMs: 40, maxSearchLifetimeMs: 60 } },
    });
    const error = await searchErrorOf(queries.search({ body: {}, timeoutMs: 60_000 }));
    expect(error.details).toEqual({ reason: "search-deadline", timeoutMs: 60 });
  });

  it("닫힌 클라이언트로는 SearchStopping이다", async () => {
    const { client, queries } = await createQueryHarness();
    await client.close();
    expect(await searchErrorOf(queries.search({ body: {} }))).toBeInstanceOf(SearchStopping);
  });
});

describe("페이지 조회", () => {
  it("search_after 커서로 끝까지 중복 없이 순서대로 읽고, 마지막 페이지에는 커서가 없다", async () => {
    const { queries } = await createQueryHarness();
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page =
        cursor === undefined
          ? await queries.search({ body: sortedBody(10), paginate: {} })
          : await queries.search({ body: sortedBody(10), cursor });
      seen.push(...page.hits.map((hit) => hit.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== undefined && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual(messages(25).map((document) => document.id));
  });

  it("PIT 페이지 조회는 첫 페이지 시점의 스냅샷을 읽고, 인덱스 없이 PIT으로만 검색하며, 마지막 페이지 뒤 PIT을 닫는다", async () => {
    const { fake, queries, target } = await createQueryHarness({ documents: messages(12) });
    const spy = vi.spyOn(fake.client.transport, "request");
    const first = await queries.search({ body: sortedBody(5), paginate: { pit: true } });
    await seedIndex(fake, target.physicalIndex, messages(5, 13));
    const second = await queries.search({ body: sortedBody(5), cursor: first.nextCursor });
    const third = await queries.search({ body: sortedBody(5), cursor: second.nextCursor });
    expect([...first.hits, ...second.hits, ...third.hits].map((hit) => hit.id)).toEqual(
      messages(12).map((document) => document.id),
    );
    expect(third.nextCursor).toBeUndefined();
    const paths = spy.mock.calls.map(([params]) => `${params.method} ${params.path}`);
    expect(paths[0]).toBe(`POST /${target.physicalIndex}/_search/point_in_time`);
    expect(paths.filter((path) => path === "POST /_search")).toHaveLength(3);
    // The package closes the PIT after the last page, which carries no cursor.
    await vi.waitFor(() => expect(paths).toContain("DELETE /_search/point_in_time"));
    const created = spy.mock.calls[0]?.[0];
    expect(created?.querystring).toEqual({ keep_alive: `${QUERY_LIMITS.maxPitKeepAliveMs}ms` });
  });

  it("PIT 요청 형식을 엔진이 거부하면(400 action_request_validation_exception) SearchQueryInvalid pit-request-rejected다", async () => {
    const { fake, queries } = await createQueryHarness();
    fake.scriptRequest((request) =>
      request.path === "/_search"
        ? { kind: "error", status: 400, type: "action_request_validation_exception" }
        : undefined,
    );
    const error = await searchErrorOf(
      queries.search({ body: sortedBody(5), paginate: { pit: true } }),
    );
    expect(error).toBeInstanceOf(SearchQueryInvalid);
    expect(error.details?.reason).toBe("pit-request-rejected");
  });

  it("paginate에는 sort와 서명 키가 필요하고, 커서와 search_after는 함께 쓸 수 없다", async () => {
    const { queries } = await createQueryHarness();
    expect(
      (await searchErrorOf(queries.search({ body: { size: 5 }, paginate: {} }))).details,
    ).toEqual({
      reason: "paginate-requires-sort",
    });
    const page = await queries.search({ body: sortedBody(5), paginate: {} });
    const mixed = await searchErrorOf(
      queries.search({
        body: { ...sortedBody(5), search_after: ["m0003"] },
        cursor: page.nextCursor,
      }),
    );
    expect(mixed.details).toEqual({ reason: "search-after-with-cursor" });

    const unsigned = await createQueryHarness({ overrides: { cursor: undefined } });
    for (const error of [
      await searchErrorOf(unsigned.queries.search({ body: sortedBody(5), paginate: {} })),
      await searchErrorOf(
        unsigned.queries.search({ body: sortedBody(5), cursor: page.nextCursor }),
      ),
      await searchErrorOf(unsigned.queries.closeCursor(page.nextCursor ?? "")),
    ]) {
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details).toEqual({ reason: "cursors-not-configured" });
    }
  });

  it("PIT 없는 커서의 closeCursor는 아무 요청도 보내지 않는다", async () => {
    const { fake, queries } = await createQueryHarness();
    const page = await queries.search({ body: sortedBody(5), paginate: {} });
    const requests = fake.requests().length;
    await queries.closeCursor(page.nextCursor ?? "");
    expect(fake.requests()).toHaveLength(requests);
  });
});

describe("검색 핸들 옵션", () => {
  function baseOptions(): SearchQueriesOptions {
    const fake = createFakeOpenSearch();
    return {
      client: createSearchClient({
        createClient: () => fake.client,
        ownsClient: false,
        requestTimeoutMs: 1_000,
      }),
      catalog: createFakeCatalog(),
      logicalKey: LOGICAL_KEY,
      supportedFingerprints: [FINGERPRINT],
      limits: QUERY_LIMITS,
      cursor: { signingKeys: [SIGNING_KEY] },
    };
  }

  it("물리 인덱스 이름 같은 모르는 옵션과 잘못된 값은 SearchConfigurationError다", () => {
    // Widened so keys outside the type (index, physicalIndex) can be passed at runtime.
    const cases: [
      Partial<SearchQueriesOptions> & { index?: string; physicalIndex?: string },
      string,
    ][] = [
      [{ index: "snm-x" }, "index"],
      [{ physicalIndex: "snm-x" }, "physicalIndex"],
      [{ logicalKey: "Bad Key" }, "logicalKey"],
      [{ supportedFingerprints: [] }, "supportedFingerprints"],
      [{ supportedFingerprints: ["abc"] }, "supportedFingerprints.0"],
      [{ limits: { ...QUERY_LIMITS, maxPageSize: 0 } }, "limits.maxPageSize"],
      [{ limits: { ...QUERY_LIMITS, maxPageSize: 10_001 } }, "limits.maxPageSize"],
      [
        { cursor: { signingKeys: [{ id: "k1", secret: new Uint8Array(31) }] } },
        "cursor.signingKeys.0.secret",
      ],
      [
        { cursor: { signingKeys: [{ id: "a.b", secret: new Uint8Array(32) }] } },
        "cursor.signingKeys.0.id",
      ],
      [{ policy: { sourceIncludes: ["doc.*"] } }, "policy.sourceIncludes.0"],
    ];
    for (const [override, path] of cases) {
      const error = thrownSearchError(() =>
        createSearchQueries<Message>({ ...baseOptions(), ...override }),
      );
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details).toEqual({ reason: "invalid-query-option", path });
    }
  });

  it("중복 서명 키 ID, 검색 수명보다 긴 timeoutMs, createSearchClient로 만들지 않은 클라이언트는 거부한다", () => {
    const duplicate = thrownSearchError(() =>
      createSearchQueries<Message>({
        ...baseOptions(),
        cursor: { signingKeys: [SIGNING_KEY, { ...SIGNING_KEY }] },
      }),
    );
    expect(duplicate.details).toEqual({ reason: "duplicate-signing-key", keyId: "k1" });
    const longTimeout = thrownSearchError(() =>
      createSearchQueries<Message>({
        ...baseOptions(),
        limits: { ...QUERY_LIMITS, timeoutMs: QUERY_LIMITS.maxSearchLifetimeMs + 1 },
      }),
    );
    expect(longTimeout.details).toEqual({ reason: "timeout-exceeds-search-lifetime" });
    const foreign = thrownSearchError(() =>
      createSearchQueries<Message>({
        ...baseOptions(),
        client: {
          checkConnection: async () => ({ ok: true, latencyMs: 0 }),
          withNativeClient: async () => Promise.reject(new Error("x")),
          close: async () => undefined,
        },
      }),
    );
    expect(foreign.details).toEqual({ reason: "foreign-search-client" });
  });

  it("서명 키 배열을 나중에 바꿔도 핸들의 키는 바뀌지 않는다", async () => {
    const secret = new Uint8Array(32).fill(1);
    const { queries } = await createQueryHarness({
      overrides: { cursor: { signingKeys: [{ id: "k1", secret }] } },
    });
    const page = await queries.search({ body: sortedBody(5), paginate: {} });
    secret.fill(2);
    expect(
      (await queries.search({ body: sortedBody(5), cursor: page.nextCursor })).hits,
    ).toHaveLength(5);
  });

  it("다른 namespace의 대상도 같은 logical key면 검색한다 (namespace는 카탈로그 구현이 고정)", async () => {
    const fake = createFakeOpenSearch();
    const target = createTestReadTarget({
      namespace: "prod-a",
      logicalKey: LOGICAL_KEY,
      targetId: TARGET_ID,
      fingerprint: FINGERPRINT,
    });
    await seedIndex(fake, target.physicalIndex, messages(2));
    const queries = createSearchQueries<Message>({
      ...baseOptions(),
      client: createSearchClient({
        createClient: () => fake.client,
        ownsClient: false,
        requestTimeoutMs: 1_000,
      }),
      catalog: createFakeCatalog([createTestReadHead({ logicalKey: LOGICAL_KEY, target })]),
    });
    expect((await queries.search({ body: {} })).hits).toHaveLength(2);
    expect(target.physicalIndex.startsWith(`snm-${NAMESPACE}`)).toBe(false);
  });
});
