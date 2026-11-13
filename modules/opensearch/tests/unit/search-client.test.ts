import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MAX_RESPONSE_BYTES } from "../../src/client/request-limits";
import { type OpenSearchClient } from "../../src/client/sdk-types";
import {
  createSearchClient,
  getSearchRequester,
  type SearchClient,
} from "../../src/client/search-client";
import {
  SearchConfigurationError,
  SearchQueryInvalid,
  SearchStopping,
  SearchTimeout,
  SearchUnavailable,
} from "../../src/errors";
import { createFakeOpenSearch } from "../../src/testing";
import { searchErrorOf, thrownSearchError } from "./query-fixtures";

function clientFor(fake = createFakeOpenSearch()): SearchClient {
  return createSearchClient({
    createClient: () => fake.client,
    ownsClient: false,
    requestTimeoutMs: 1_000,
  });
}

interface StreamReply {
  statusCode: number;
  headers: Record<string, string>;
  chunks: Buffer[];
}

interface StreamingClient {
  native: OpenSearchClient;
  destroyed: () => boolean;
}

// Checks only the surface the wrapper uses (transport.request, close).
function hasClientSurface<Value extends object>(value: Value): value is Value & OpenSearchClient {
  return "transport" in value && "close" in value;
}

// Minimal client whose transport.request returns a fixed stream response.
function streamingClient(reply: StreamReply): StreamingClient {
  let stream: Readable | undefined;
  const surface = {
    transport: {
      request: () =>
        Object.assign(
          Promise.resolve().then(() => {
            stream = Readable.from(reply.chunks);
            return { statusCode: reply.statusCode, headers: reply.headers, body: stream };
          }),
          { abort: () => undefined },
        ),
    },
    close: async () => undefined,
  };
  if (!hasClientSurface(surface)) throw new TypeError("surface");
  const result: StreamingClient = { native: surface, destroyed: () => stream?.destroyed === true };
  return result;
}

describe("검색 클라이언트", () => {
  it("모르는 옵션과 잘못된 값은 경로를 담은 SearchConfigurationError다", () => {
    const valid = {
      createClient: () => createFakeOpenSearch().client,
      ownsClient: true,
      requestTimeoutMs: 1_000,
    };
    const cases = [
      [{ ...valid, node: "http://localhost:9200" }, "node"],
      [{ ...valid, requestTimeoutMs: 0 }, "requestTimeoutMs"],
      [{ ...valid, requestTimeoutMs: 2 ** 31 }, "requestTimeoutMs"],
      [{ ...valid, maxResponseBytes: 0 }, "maxResponseBytes"],
      [{ ...valid, createClient: "client" }, "createClient"],
    ] as const;
    for (const [options, path] of cases) {
      const error = thrownSearchError(() => createSearchClient(Object(options)));
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details).toEqual({ reason: "invalid-client-option", path });
    }
  });

  it("클라이언트를 첫 연산에서 한 번만 만들고, 생성 실패 뒤에는 다시 시도한다", async () => {
    const fake = createFakeOpenSearch();
    const createClient = vi
      .fn<() => OpenSearchClient>()
      .mockImplementationOnce(() => {
        throw new Error("credential provider failed: secret=abc");
      })
      .mockImplementation(() => fake.client);
    const client = createSearchClient({ createClient, ownsClient: false, requestTimeoutMs: 1_000 });
    expect(createClient).not.toHaveBeenCalled();
    const failed = await client.checkConnection();
    expect(failed.ok).toBe(false);
    expect(failed.error).toBeInstanceOf(SearchUnavailable);
    expect(failed.error?.details).toEqual({ reason: "client-create-failed" });
    expect(failed.error?.message).not.toContain("secret");

    const report = await client.checkConnection();
    expect(report).toMatchObject({
      ok: true,
      clusterName: "fake-cluster",
      version: { number: "3.5.0", distribution: "opensearch" },
    });
    await client.withNativeClient(async (native) => expect(native).toBe(fake.client));
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("transport 표면이 없는 객체를 돌려주면 SearchConfigurationError다", async () => {
    const client = createSearchClient({
      // SAFETY: deliberately invalid client.
      createClient: () => ({}) as OpenSearchClient,
      ownsClient: false,
      requestTimeoutMs: 1_000,
    });
    const report = await client.checkConnection();
    expect(report.error).toBeInstanceOf(SearchConfigurationError);
    expect(report.error?.details).toEqual({ reason: "invalid-native-client" });
  });

  it("checkConnection은 엔진 오류와 연결 실패를 보고서에 담고 던지지 않는다", async () => {
    const fake = createFakeOpenSearch();
    fake.scriptRequest(() => ({ kind: "error", status: 401, type: "security_exception" }));
    const denied = await clientFor(fake).checkConnection();
    expect(denied.ok).toBe(false);
    expect(denied.error?.details).toEqual({
      reason: "authentication",
      status: 401,
      type: "security_exception",
    });

    const offline = createFakeOpenSearch();
    offline.scriptRequest(() => ({ kind: "connection" }));
    const report = await clientFor(offline).checkConnection();
    expect(report.error).toBeInstanceOf(SearchUnavailable);
    expect(report.error?.details).toEqual({ reason: "connection" });

    const odd = createFakeOpenSearch();
    odd.scriptRequest(() => ({ kind: "response", status: 200, body: { hello: "world" } }));
    expect((await clientFor(odd).checkConnection()).error?.details).toEqual({
      reason: "invalid-info",
    });
  });

  it("요청은 SDK 재시도를 끄고 스트림으로 받으며, 4xx도 상태와 본문으로 돌려준다", async () => {
    const fake = createFakeOpenSearch();
    const spy = vi.spyOn(fake.client.transport, "request");
    const requester = getSearchRequester(clientFor(fake));
    const response = await requester.send({ method: "POST", path: "/missing/_search", body: {} });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { type: "index_not_found_exception" } });
    expect(spy.mock.calls[0]?.[1]).toEqual({
      requestTimeout: 1_000,
      maxRetries: 0,
      asStream: true,
    });
  });

  it("응답 본문이 maxResponseBytes를 넘으면 스트림을 끊고 SearchUnavailable이다 (압축 응답 포함)", async () => {
    const large = Buffer.from(JSON.stringify({ data: "x".repeat(10_000) }));
    const cases: StreamReply[] = [
      { statusCode: 200, headers: { "content-length": String(large.length) }, chunks: [large] },
      { statusCode: 200, headers: {}, chunks: [large.subarray(0, 600), large.subarray(600)] },
      { statusCode: 200, headers: { "content-encoding": "gzip" }, chunks: [gzipSync(large)] },
    ];
    for (const reply of cases) {
      const { native, destroyed } = streamingClient(reply);
      const client = createSearchClient({
        createClient: () => native,
        ownsClient: false,
        requestTimeoutMs: 1_000,
        maxResponseBytes: 1_024,
      });
      const error = await searchErrorOf(
        getSearchRequester(client).send({ method: "GET", path: "/" }),
      );
      expect(error).toBeInstanceOf(SearchUnavailable);
      expect(error.details).toEqual({ reason: "response-too-large", maxBytes: 1_024 });
      expect(error.retryable).toBe(false);
      expect(destroyed()).toBe(true);
    }
    const small = streamingClient({
      statusCode: 200,
      headers: { "content-encoding": "gzip" },
      chunks: [gzipSync(Buffer.from('{"ok":true}'))],
    });
    const client = createSearchClient({
      createClient: () => small.native,
      ownsClient: false,
      requestTimeoutMs: 1_000,
      maxResponseBytes: 1_024,
    });
    expect((await getSearchRequester(client).send({ method: "GET", path: "/" })).body).toEqual({
      ok: true,
    });
  });

  it("기본 상한은 16 MiB이고 요청마다 낮출 수만 있다", async () => {
    // The declared length decides, so no real body is needed.
    const declared = (bytes: number) =>
      streamingClient({
        statusCode: 200,
        headers: { "content-length": String(bytes) },
        chunks: [Buffer.from("{}")],
      });
    const over = declared(DEFAULT_MAX_RESPONSE_BYTES + 1);
    const byDefault = createSearchClient({
      createClient: () => over.native,
      ownsClient: false,
      requestTimeoutMs: 1_000,
    });
    expect(
      (await searchErrorOf(getSearchRequester(byDefault).send({ method: "GET", path: "/" })))
        .details,
    ).toEqual({ reason: "response-too-large", maxBytes: DEFAULT_MAX_RESPONSE_BYTES });

    const body = Buffer.from(JSON.stringify({ data: "x".repeat(2_000) }));
    const reply = () =>
      streamingClient({
        statusCode: 200,
        headers: { "content-length": String(body.length) },
        chunks: [body],
      });
    const make = (native: OpenSearchClient, maxResponseBytes: number) =>
      getSearchRequester(
        createSearchClient({
          createClient: () => native,
          ownsClient: false,
          requestTimeoutMs: 1_000,
          maxResponseBytes,
        }),
      );
    const lowered = await searchErrorOf(
      make(reply().native, 10_000).send({ method: "GET", path: "/" }, { maxResponseBytes: 1_000 }),
    );
    expect(lowered.details).toEqual({ reason: "response-too-large", maxBytes: 1_000 });
    // A per-request limit above the handle's cannot raise it.
    const capped = await searchErrorOf(
      make(reply().native, 1_000).send({ method: "GET", path: "/" }, { maxResponseBytes: 100_000 }),
    );
    expect(capped.details).toEqual({ reason: "response-too-large", maxBytes: 1_000 });
    expect(
      (await make(reply().native, 10_000).send({ method: "GET", path: "/" })).body,
    ).toMatchObject({ data: "x".repeat(2_000) });
  });

  it("조각 경계에서 갈라진 멀티바이트 문자도 그대로 디코딩한다", async () => {
    const encoded = Buffer.from(JSON.stringify({ text: "가나다라마바사".repeat(50) }), "utf8");
    // One-byte chunks split every three-byte character.
    const chunks = Array.from({ length: encoded.length }, (_, index) =>
      encoded.subarray(index, index + 1),
    );
    const { native } = streamingClient({ statusCode: 200, headers: {}, chunks });
    const client = createSearchClient({
      createClient: () => native,
      ownsClient: false,
      requestTimeoutMs: 1_000,
    });
    const response = await getSearchRequester(client).send({ method: "GET", path: "/" });
    expect(response.body).toEqual({ text: "가나다라마바사".repeat(50) });
  });

  it("JSON이 아닌 응답은 재시도할 수 없는 SearchUnavailable이다", async () => {
    const { native } = streamingClient({
      statusCode: 200,
      headers: {},
      chunks: [Buffer.from("<html>")],
    });
    const client = createSearchClient({
      createClient: () => native,
      ownsClient: false,
      requestTimeoutMs: 1_000,
    });
    const error = await searchErrorOf(
      getSearchRequester(client).send({ method: "GET", path: "/" }),
    );
    expect(error.details).toEqual({ reason: "invalid-json" });
    expect(error.retryable).toBe(false);
  });

  it("본문을 읽는 도중 멈춘 압축/비압축 응답은 제한 시간에 SearchTimeout이고 close도 끝난다", async () => {
    // Found against a real engine: a stalled gzip body used to end only the source, leaving the decoder open.
    const compressed = gzipSync(Buffer.from(JSON.stringify({ data: "x".repeat(10_000) })));
    const cases = [
      { headers: { "content-encoding": "gzip" }, head: compressed.subarray(0, 32) },
      { headers: {}, head: Buffer.from('{"data":"xxxx') },
    ];
    for (const testCase of cases) {
      let stream: Readable | undefined;
      const surface = {
        transport: {
          request: () =>
            Object.assign(
              Promise.resolve().then(() => {
                // Sends a prefix and never ends.
                stream = new Readable({ read: () => undefined });
                stream.push(testCase.head);
                return { statusCode: 200, headers: testCase.headers, body: stream };
              }),
              { abort: () => undefined },
            ),
        },
        close: async () => undefined,
      };
      if (!hasClientSurface(surface)) throw new TypeError("surface");
      const client = createSearchClient({
        createClient: () => surface,
        ownsClient: false,
        requestTimeoutMs: 50,
      });
      const error = await searchErrorOf(
        getSearchRequester(client).send({ method: "GET", path: "/" }),
      );
      expect(error).toBeInstanceOf(SearchTimeout);
      expect(error.details).toEqual({ reason: "request-timeout" });
      expect(stream?.destroyed).toBe(true);
      await client.close();
    }
  });

  it("요청별 제한 시간(설정값보다 짧은 쪽)이 지나면 SearchTimeout이다", async () => {
    const fake = createFakeOpenSearch();
    fake.scriptRequest(() => ({ kind: "hang" }));
    const requester = getSearchRequester(clientFor(fake));
    const error = await searchErrorOf(
      requester.send({ method: "GET", path: "/" }, { timeoutMs: 30 }),
    );
    expect(error).toBeInstanceOf(SearchTimeout);
    expect(error.details).toEqual({ reason: "request-timeout" });
    expect(
      await searchErrorOf(requester.send({ method: "GET", path: "/" }, { timeoutMs: 0 })),
    ).toBeInstanceOf(SearchTimeout);
  });

  it("호출자 signal로 요청을 중단하면 signal.reason으로 실패한다", async () => {
    const fake = createFakeOpenSearch();
    fake.scriptRequest(() => ({ kind: "hang" }));
    const requester = getSearchRequester(clientFor(fake));
    const controller = new AbortController();
    const reason = new SearchQueryInvalid();
    const pending = requester.send({ method: "GET", path: "/" }, { signal: controller.signal });
    setTimeout(() => controller.abort(reason), 5);
    await expect(pending).rejects.toBe(reason);
  });

  it("close는 진행 중인 요청을 기다리고, 소유한 클라이언트만 닫으며, 이후 연산은 SearchStopping이다", async () => {
    const owned = createFakeOpenSearch();
    const closeOwned = vi.spyOn(owned.client, "close");
    const client = createSearchClient({
      createClient: () => owned.client,
      ownsClient: true,
      requestTimeoutMs: 1_000,
    });
    const inFlight = getSearchRequester(client).send({ method: "GET", path: "/" });
    const closing = client.close();
    expect(client.close()).toBe(closing);
    await expect(inFlight).resolves.toMatchObject({ status: 200 });
    await closing;
    expect(closeOwned).toHaveBeenCalledTimes(1);
    expect(
      await searchErrorOf(getSearchRequester(client).send({ method: "GET", path: "/" })),
    ).toBeInstanceOf(SearchStopping);
    expect(await searchErrorOf(client.withNativeClient(async () => 1))).toBeInstanceOf(
      SearchStopping,
    );
    await expect(client.checkConnection()).rejects.toBeInstanceOf(SearchStopping);

    const borrowed = createFakeOpenSearch();
    const closeBorrowed = vi.spyOn(borrowed.client, "close");
    const borrowing = clientFor(borrowed);
    await borrowing.checkConnection();
    await borrowing.close();
    expect(closeBorrowed).not.toHaveBeenCalled();
  });

  it("소유한 클라이언트를 닫다가 실패하면 메시지를 싣지 않은 SearchUnavailable이다", async () => {
    const fake = createFakeOpenSearch();
    vi.spyOn(fake.client, "close").mockRejectedValue(new Error("socket hang up secret"));
    const client = createSearchClient({
      createClient: () => fake.client,
      ownsClient: true,
      requestTimeoutMs: 1_000,
    });
    await client.checkConnection();
    const error = await searchErrorOf(client.close());
    expect(error.details).toEqual({ reason: "close-failed" });
    expect(error.message).not.toContain("secret");
  });

  it("createSearchClient로 만들지 않은 객체의 요청 경로는 없다", () => {
    const error = thrownSearchError(() =>
      getSearchRequester({
        checkConnection: async () => ({ ok: true, latencyMs: 0 }),
        withNativeClient: async () => Promise.reject(new Error("x")),
        close: async () => undefined,
      }),
    );
    expect(error.details).toEqual({ reason: "foreign-search-client" });
  });

  it("NDJSON 본문은 바꾸지 않은 문자열 bulkBody로 보내고, 센 바이트가 보낸 바이트와 같다", async () => {
    const fake = createFakeOpenSearch();
    const spy = vi.spyOn(fake.client.transport, "request");
    const client = clientFor(fake);
    const ndjson =
      JSON.stringify({ index: { _id: "한글-1", version: 3, version_type: "external" } }) +
      "\n" +
      JSON.stringify({ sonamu_meta: { deleted: true, revision: 3 }, note: "日本語 ✓" }) +
      "\n";
    const response = await getSearchRequester(client).send({
      method: "POST",
      path: "/idx/_bulk",
      ndjson,
      querystring: { require_alias: "true" },
    });
    expect(response.status).toBe(200);
    const params = spy.mock.calls[0]?.[0];
    expect(params?.bulkBody).toBe(ndjson);
    expect(params?.body).toBeUndefined();
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ maxRetries: 0, asStream: true });
    expect(fake.requests().at(-1)?.bytes).toBe(Buffer.byteLength(ndjson, "utf8"));
  });

  it("JSON 본문과 NDJSON 본문을 함께 주면 아무것도 보내지 않고 SearchConfigurationError다", async () => {
    const fake = createFakeOpenSearch();
    const client = clientFor(fake);
    const error = await searchErrorOf(
      getSearchRequester(client).send({
        method: "POST",
        path: "/x/_bulk",
        body: {},
        ndjson: "{}\n",
      }),
    );
    expect(error).toBeInstanceOf(SearchConfigurationError);
    expect(error.details).toEqual({ reason: "conflicting-request-body" });
    expect(fake.requests()).toEqual([]);
  });
});
