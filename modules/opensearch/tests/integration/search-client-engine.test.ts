import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, request as httpRequest } from "node:http";
import { createRequire } from "node:module";

import { Client } from "@opensearch-project/opensearch";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { type NativeQuery } from "../../src/client/sdk-types";
import {
  createSearchClient,
  getSearchRequester,
  type SearchClient,
  type SearchClientOptions,
} from "../../src/client/search-client";
import { HASH_VERSION, type JsonObject } from "../../src/definition/canonical-json";
import { buildSearchEnvelope, composeIndexMappings } from "../../src/definition/envelope";
import { buildPhysicalIndexName } from "../../src/definition/names";
import {
  SearchCursorExpired,
  SearchError,
  SearchQueryInvalid,
  SearchTargetUnavailable,
  SearchTimeout,
  SearchUnavailable,
} from "../../src/errors";
import { getSearchLocale } from "../../src/i18n";
import { type ReadLifetimeLimits, type ReadTarget } from "../../src/query/catalog";
import {
  createSearchQueries,
  type SearchCandidates,
  type SearchQueries,
} from "../../src/query/search-queries";
import {
  createFakeCatalog,
  createTestReadHead,
  createTestReadTarget,
  type FakeCatalog,
  TEST_READ_LIFETIMES,
} from "../../src/testing";
import { BULK_QUERYSTRING, bulkPath, packBulkRequests } from "../../src/worker/bulk";
import { versionFromImageTag } from "../helpers/env";
import { useIntegrationHarness } from "../helpers/harness";
import { closedPortUrl, startTcpProxy } from "../helpers/tcp-proxy";

/**
 * createSearchClient and createSearchQueries against the real SDK and engine; only the catalog is an in-memory fake.
 * CI reruns it with SONAMU_OPENSEARCH_TEST_IMAGE=opensearchproject/opensearch:3.9.0.
 */

const harness = useIntegrationHarness({ sampleDomain: false });
const requireFromHere = createRequire(import.meta.url);

const LOGICAL_KEY = "chat";
const FINGERPRINT = "c".repeat(64);
const SIGNING_KEY = { id: "k1", secret: new Uint8Array(32).fill(3) };
const MISSING_INDEX = "snm-missing-index-x";

interface Message extends JsonObject {
  body: string;
  room: string;
  seq: number;
  secret: string;
}

interface Fixture {
  target: ReadTarget;
  catalog: FakeCatalog;
}

interface SeedDocument {
  id: string;
  revision: number;
  doc?: Message;
}

const nativeClients: Client[] = [];
const searchClients: SearchClient[] = [];

function nativeClient(node: string, suggestCompression = false): Client {
  const client = new Client({ node, maxRetries: 0, suggestCompression });
  nativeClients.push(client);
  return client;
}

interface ClientOptions {
  suggestCompression?: boolean;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}

function searchClient(node: string, options: ClientOptions = {}): SearchClient {
  const native = nativeClient(node, options.suggestCompression ?? false);
  const clientOptions: SearchClientOptions = {
    createClient: () => native,
    ownsClient: false,
    requestTimeoutMs: options.requestTimeoutMs ?? 10_000,
  };
  if (options.maxResponseBytes !== undefined) {
    clientOptions.maxResponseBytes = options.maxResponseBytes;
  }
  const client = createSearchClient(clientOptions);
  searchClients.push(client);
  return client;
}

function engineUrl(): string {
  const endpoint = harness.env.opensearch;
  if (endpoint === null) throw new Error("OpenSearch 접속 정보가 없습니다.");
  return endpoint.url;
}

/** Creates an envelope-mapped index named by the package rules and a fake catalog pointing at it. */
async function createFixture(
  createIndex = true,
  lifetimes: Partial<ReadLifetimeLimits> = {},
): Promise<Fixture> {
  const targetId = randomUUID();
  const target = createTestReadTarget({
    namespace: harness.namespace,
    logicalKey: LOGICAL_KEY,
    targetId,
    fingerprint: FINGERPRINT,
  });
  expect(target.physicalIndex).toBe(
    buildPhysicalIndexName(harness.namespace, LOGICAL_KEY, targetId),
  );
  if (createIndex) {
    await harness.opensearch.indices.create({
      index: target.physicalIndex,
      body: {
        settings: { number_of_shards: 1, number_of_replicas: 0 },
        mappings: composeIndexMappings({
          targetId,
          namespace: harness.namespace,
          logicalKey: LOGICAL_KEY,
          fingerprint: FINGERPRINT,
          hashVersion: HASH_VERSION,
          mappings: {
            properties: {
              body: { type: "text" },
              room: { type: "keyword" },
              seq: { type: "long" },
              secret: { type: "keyword" },
            },
          },
        }),
      },
    });
  }
  const catalog = createFakeCatalog([
    createTestReadHead({ logicalKey: LOGICAL_KEY, target, lifetimes }),
  ]);
  return { target, catalog };
}

function message(seq: number, body = "message number " + String(seq)): Message {
  return { body, room: seq % 2 === 0 ? "even" : "odd", seq, secret: "secret-" + String(seq) };
}

const bulkResultSchema = z.looseObject({ errors: z.boolean() });

/** Writes envelope documents with external versions; a document without doc is a tombstone. */
async function writeDocuments(index: string, documents: readonly SeedDocument[]): Promise<void> {
  const lines = documents.flatMap((document) => [
    JSON.stringify({
      index: { _id: document.id, version: document.revision, version_type: "external" },
    }),
    JSON.stringify(
      buildSearchEnvelope(
        document.doc === undefined
          ? { state: "deleted" }
          : { state: "present", document: document.doc },
        document.revision,
      ),
    ),
  ]);
  const response = await harness.opensearch.transport.request({
    method: "POST",
    path: "/" + encodeURIComponent(index) + "/_bulk",
    bulkBody: lines.join("\n") + "\n",
    querystring: { refresh: "true" },
  });
  expect(bulkResultSchema.parse(response.body).errors).toBe(false);
}

function documentId(seq: number): string {
  return "m" + String(seq).padStart(4, "0");
}

function seqDocuments(from: number, to: number): SeedDocument[] {
  const documents: SeedDocument[] = [];
  for (let seq = from; seq < to; seq += 1) {
    documents.push({ id: documentId(seq), revision: 1, doc: message(seq) });
  }
  return documents;
}

function queriesFor(
  client: SearchClient,
  fixture: Fixture,
  lifetimes: Partial<ReadLifetimeLimits> = {},
): SearchQueries<Message> {
  return createSearchQueries<Message>({
    client,
    catalog: fixture.catalog,
    logicalKey: LOGICAL_KEY,
    supportedFingerprints: [FINGERPRINT],
    limits: { ...TEST_READ_LIFETIMES, ...lifetimes, maxPageSize: 100, timeoutMs: 10_000 },
    cursor: { signingKeys: [SIGNING_KEY] },
    policy: { allowTrackTotalHits: true, sourceIncludes: ["body", "seq", "room"] },
  });
}

async function rejectionOf<T>(promise: Promise<T>): Promise<SearchError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SearchError) return error;
    throw new Error("패키지 오류가 아닌 값으로 실패했습니다.", { cause: error });
  }
  throw new Error("실패해야 했지만 성공했습니다.");
}

/** Own properties a SearchError may have; SDK properties such as meta, body, statusCode or cause must not leak. */
const ALLOWED_OWN_PROPERTIES = new Set([
  "stack",
  "message",
  "name",
  "code",
  "retryable",
  "details",
  "messageKey",
  "messageParams",
]);

/**
 * The message must be the package catalogue rendering, with no engine, SDK or connection text, and no SDK cause or
 * meta may leak into the error.
 */
function expectNoLeak(error: SearchError, forbidden: readonly string[] = []): void {
  expect(error.cause).toBeUndefined();
  expect(
    Object.getOwnPropertyNames(error).filter((name) => !ALLOWED_OWN_PROPERTIES.has(name)),
  ).toEqual([]);
  expect(error.message).toBe(error.localize(getSearchLocale()));
  const exposed = [
    error.message,
    JSON.stringify(error.details ?? {}),
    JSON.stringify(error.messageParams ?? {}),
  ].join("\n");
  const always = [
    "Response Error",
    "Request timed out",
    "Request aborted",
    "ECONNREFUSED",
    "ResponseError",
    "ConnectionError",
    "TimeoutError",
    "RequestAbortedError",
    "127.0.0.1",
    "localhost",
    "root_cause",
    harness.indexPrefix,
  ];
  for (const text of [...always, ...forbidden]) expect(exposed).not.toContain(text);
}

interface ExpectedError {
  type: abstract new (...args: never[]) => SearchError;
  code: string;
  reason: string;
  retryable: boolean;
}

function expectError(error: SearchError, expected: ExpectedError): void {
  expect(error).toBeInstanceOf(expected.type);
  expect(error.code).toBe(expected.code);
  expect(error.details?.reason).toBe(expected.reason);
  expect(error.retryable).toBe(expected.retryable);
}

const pitListSchema = z.looseObject({ pits: z.array(z.looseObject({ pit_id: z.string() })) });

async function openPitIds(): Promise<string[]> {
  const response = await harness.opensearch.transport.request({
    method: "GET",
    path: "/_search/point_in_time/_all",
  });
  return pitListSchema.parse(response.body).pits.map((pit) => pit.pit_id);
}

const cursorPitSchema = z.looseObject({ pit: z.string().optional() });

/** Reads the PIT id from a signed cursor's payload without verifying it. */
function pitOfCursor(cursor: string | undefined): string | undefined {
  const [encoded] = (cursor ?? "").split(".");
  const decoded: unknown = JSON.parse(Buffer.from(encoded ?? "", "base64url").toString("utf8"));
  return cursorPitSchema.parse(decoded).pit;
}

async function eventually(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const started = performance.now();
  while (!(await check())) {
    if (performance.now() - started > timeoutMs) {
      throw new Error("조건이 제한 시간 안에 참이 되지 않았습니다.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function putTransientSetting(name: string, value: string | null): Promise<void> {
  await harness.opensearch.cluster.putSettings({ body: { transient: { [name]: value } } });
}

/** Lowers the PIT keep_alive limit to 1 s; the engine requires the default keep_alive below it, so lower that first. */
async function lowerPitKeepAliveLimit(): Promise<void> {
  await putTransientSetting("search.default_keep_alive", "500ms");
  await putTransientSetting("point_in_time.max_keep_alive", "1s");
}

async function restorePitKeepAliveLimit(): Promise<void> {
  await putTransientSetting("point_in_time.max_keep_alive", null);
  await putTransientSetting("search.default_keep_alive", null);
}

const COMPRESSION_MODES = [
  { name: "압축 없음", suggestCompression: false },
  { name: "gzip 협상", suggestCompression: true },
] as const;

const [PLAIN, GZIP] = COMPRESSION_MODES;

const SORT_BY_SEQ = [{ "doc.seq": "asc" as const }];

afterAll(async () => {
  await Promise.allSettled(searchClients.map((client) => client.close()));
  await Promise.allSettled(nativeClients.map((client) => client.close()));
});

describe("실제 엔진에서의 검색 클라이언트와 쿼리 API", () => {
  it("설치된 SDK는 asStream 요청의 4xx를 던지지 않고 상태와 본문 스트림으로 돌려준다", async () => {
    const sdkVersion = z
      .looseObject({ version: z.string() })
      .parse(
        JSON.parse(
          readFileSync(
            requireFromHere.resolve("@opensearch-project/opensearch/package.json"),
            "utf8",
          ),
        ),
      ).version;
    expect(sdkVersion).toMatch(/^3\.\d+\.\d+$/);
    const responseSchema = z.looseObject({
      statusCode: z.number(),
      headers: z.looseObject({ "content-encoding": z.string().optional() }),
      body: z.custom<AsyncIterable<Buffer>>(
        (value) => z.looseObject({ pipe: z.instanceof(Function) }).safeParse(value).success,
      ),
    });
    for (const mode of COMPRESSION_MODES) {
      const native = nativeClient(engineUrl(), mode.suggestCompression);
      const cases = [
        { path: "/" + MISSING_INDEX + "/_search", body: {}, status: 404 },
        { path: "/_search", body: { query: { no_such_query: {} } }, status: 400 },
      ];
      for (const request of cases) {
        const response = responseSchema.parse(
          await native.transport.request(
            { method: "POST", path: request.path, body: request.body },
            { asStream: true, maxRetries: 0 },
          ),
        );
        expect(response.statusCode, mode.name).toBe(request.status);
        expect(response.headers["content-encoding"], mode.name).toBe(
          mode.suggestCompression ? "gzip" : undefined,
        );
        let bytes = 0;
        for await (const chunk of response.body) bytes += chunk.byteLength;
        expect(bytes).toBeGreaterThan(0);
      }
      // Without asStream the SDK throws ResponseError for the same request.
      await expect(
        native.transport.request(
          { method: "POST", path: "/" + MISSING_INDEX + "/_search", body: {} },
          { maxRetries: 0 },
        ),
      ).rejects.toMatchObject({ name: "ResponseError", statusCode: 404 });
    }
  });

  describe("검색 성공", () => {
    // The plain response path runs in every other read test; this one also covers gzip.
    it.each([GZIP])(
      "envelope 인덱스에서 hits, total, 허용된 _source만 돌려주고 tombstone은 뺀다 ($name)",
      async (mode) => {
        const fixture = await createFixture();
        await writeDocuments(fixture.target.physicalIndex, [
          { id: "a", revision: 3, doc: message(1, "hello alpha") },
          { id: "b", revision: 7, doc: message(2, "hello beta") },
          { id: "c", revision: 2, doc: message(3, "goodbye gamma") },
          { id: "gone", revision: 9 },
        ]);
        const queries = queriesFor(
          searchClient(engineUrl(), { suggestCompression: mode.suggestCompression }),
          fixture,
        );

        const all = await queries.search({ body: { sort: SORT_BY_SEQ, track_total_hits: true } });
        expect(all.target).toEqual({
          targetId: fixture.target.targetId,
          fingerprint: FINGERPRINT,
          readGeneration: 1,
        });
        expect(all.timedOut).toBe(false);
        expect(all.total).toEqual({ value: 3, relation: "eq" });
        expect(all.hits.map((hit) => [hit.id, hit.revision, hit.sort, hit.score])).toEqual([
          ["a", 3, [1], null],
          ["b", 7, [2], null],
          ["c", 2, [3], null],
        ]);
        // Without _source a candidate carries only id and revision.
        expect(all.hits.every((hit) => hit.source === undefined)).toBe(true);
        expect(all.nextCursor).toBeUndefined();

        const matched = await queries.search({
          body: {
            query: { match: { "doc.body": "hello" } },
            _source: ["body"],
            highlight: { fields: { "doc.body": {} } },
          },
        });
        expect(matched.total).toBeUndefined();
        expect(matched.hits.map((hit) => hit.id).toSorted()).toEqual(["a", "b"]);
        for (const hit of matched.hits) {
          expect(Object.keys(hit.source ?? {})).toEqual(["body"]);
          expect(hit.score).toBeGreaterThan(0);
          expect(hit.highlight?.["doc.body"]?.[0]).toContain("<em>hello</em>");
        }

        const everything = await queries.search({
          body: { query: { ids: { values: ["a"] } }, _source: true },
        });
        // secret is outside the policy, so even _source: true omits it.
        expect(everything.hits[0]?.source).toEqual({ body: "hello alpha", room: "odd", seq: 1 });

        const tombstone = await queries.search({
          body: { query: { ids: { values: ["gone"] } }, track_total_hits: true },
        });
        expect(tombstone.hits).toEqual([]);
        expect(tombstone.total).toEqual({ value: 0, relation: "eq" });

        const denied = await rejectionOf(queries.search({ body: { _source: ["secret"] } }));
        expectError(denied, {
          type: SearchQueryInvalid,
          code: "SEARCH_QUERY_INVALID",
          reason: "source-field-not-allowed",
          retryable: false,
        });
      },
    );

    it("checkConnection은 실제 엔진의 클러스터 이름과 버전을 보고한다", async () => {
      const report = await searchClient(engineUrl()).checkConnection();
      expect(report.ok).toBe(true);
      expect(report.clusterName).toEqual(expect.any(String));
      expect(report.version?.distribution).toBe("opensearch");
      expect(report.version?.number).toMatch(/^3\.\d+\.\d+$/);
      const tagged = versionFromImageTag(harness.env.opensearch?.image ?? "");
      if (tagged !== null) expect(report.version?.number).toBe(tagged);
    });
  });

  describe("point-in-time 페이지 넘기기", () => {
    it("동시에 색인되는 동안에도 중복과 누락 없이 끝까지 읽고, 마지막 페이지에서 PIT을 닫는다", async () => {
      const fixture = await createFixture();
      const initial = seqDocuments(0, 47);
      await writeDocuments(fixture.target.physicalIndex, initial);
      const queries = queriesFor(searchClient(engineUrl()), fixture);
      const body = { sort: SORT_BY_SEQ, size: 5, _source: ["seq"] };

      // Writes (sorting both before and after existing documents) start only after the first page created the PIT;
      // earlier writes would land in the PIT snapshot.
      const stopWriting = new AbortController();
      let nextSeq = 1_000;
      let written = 0;
      const writeBatch = async (): Promise<void> => {
        await writeDocuments(fixture.target.physicalIndex, [
          ...seqDocuments(nextSeq, nextSeq + 2),
          { id: "early-" + String(nextSeq), revision: 1, doc: message(-nextSeq) },
        ]);
        nextSeq += 2;
        written += 3;
      };
      let writer: Promise<void> = Promise.resolve();

      const seen: string[] = [];
      const pits = new Set<string>();
      let pages = 0;
      try {
        let page: SearchCandidates<Message> = await queries.search({
          body,
          paginate: { pit: true },
        });
        // Await the first batch so a write outside the PIT really happened before continuing.
        await writeBatch();
        writer = (async () => {
          while (!stopWriting.signal.aborted) await writeBatch();
        })();
        for (;;) {
          pages += 1;
          seen.push(...page.hits.map((hit) => hit.id));
          if (pages === 1) {
            // Tombstoning a document already read and one not yet read must not change the PIT view.
            await writeDocuments(fixture.target.physicalIndex, [
              { id: documentId(1), revision: 2 },
              { id: documentId(40), revision: 2 },
            ]);
          }
          if (page.nextCursor === undefined) break;
          const pit = pitOfCursor(page.nextCursor);
          expect(pit).toBeDefined();
          if (pit !== undefined) pits.add(pit);
          expect(pages).toBeLessThan(20);
          page = await queries.search({ body, cursor: page.nextCursor });
        }
      } finally {
        stopWriting.abort();
        await writer;
      }
      expect(written).toBeGreaterThan(0);
      // 47 by 5: nine full pages and a last page of two.
      expect(pages).toBe(10);
      expect(seen).toEqual(initial.map((document) => document.id));
      expect(pits.size).toBeGreaterThan(0);
      // The package closes the PIT after the last page without awaiting the response, so poll for it.
      await eventually(async () => {
        const open = await openPitIds();
        return [...pits].every((pit) => !open.includes(pit));
      });
    });

    it("페이지 크기의 배수에서 끝나면 빈 마지막 페이지가 커서 없이 오고 PIT이 닫힌다", async () => {
      const fixture = await createFixture();
      await writeDocuments(fixture.target.physicalIndex, seqDocuments(0, 10));
      const queries = queriesFor(searchClient(engineUrl()), fixture);
      const body = { sort: SORT_BY_SEQ, size: 5 };
      const first = await queries.search({ body, paginate: { pit: true } });
      const second = await queries.search({ body, cursor: first.nextCursor ?? "" });
      expect(second.hits).toHaveLength(5);
      const pit = pitOfCursor(second.nextCursor) ?? "";
      expect(await openPitIds()).toContain(pit);
      const last = await queries.search({ body, cursor: second.nextCursor ?? "" });
      expect(last.hits).toEqual([]);
      expect(last.nextCursor).toBeUndefined();
      await eventually(async () => !(await openPitIds()).includes(pit));
    });

    it("closeCursor는 PIT을 닫고, 이미 닫힌 PIT에 다시 불러도 성공하며, 그 커서로 이어 읽으면 pit-closed다", async () => {
      const fixture = await createFixture();
      await writeDocuments(fixture.target.physicalIndex, seqDocuments(0, 20));
      const queries = queriesFor(searchClient(engineUrl()), fixture);
      const body = { sort: SORT_BY_SEQ, size: 5 };
      const first = await queries.search({ body, paginate: { pit: true } });
      const cursor = first.nextCursor ?? "";
      const pit = pitOfCursor(cursor) ?? "";
      expect(await openPitIds()).toContain(pit);

      await queries.closeCursor(cursor);
      expect(await openPitIds()).not.toContain(pit);
      // The engine answers 200 with successful: true for an already closed PIT; the fake transport mirrors this.
      const again = await harness.opensearch.transport.request({
        method: "DELETE",
        path: "/_search/point_in_time",
        body: { pit_id: [pit] },
      });
      expect(again.statusCode).toBe(200);
      expect(again.body).toEqual({ pits: [{ pit_id: pit, successful: true }] });
      await queries.closeCursor(cursor);

      const error = await rejectionOf(queries.search({ body, cursor }));
      expectError(error, {
        type: SearchCursorExpired,
        code: "SEARCH_CURSOR_EXPIRED",
        reason: "pit-closed",
        retryable: false,
      });
      expect(error.details).toMatchObject({
        status: 404,
        type: "search_phase_execution_exception",
      });
      expectNoLeak(error, ["No search context found", "all shards failed", pit]);
    });

    it(
      "keep_alive가 지나 엔진이 치운 PIT으로 이어 읽으면 pit-closed다",
      { timeout: 120_000 },
      async () => {
        const fixture = await createFixture();
        await writeDocuments(fixture.target.physicalIndex, seqDocuments(0, 10));
        const queries = queriesFor(searchClient(engineUrl()), fixture, { maxPitKeepAliveMs: 500 });
        const body = { sort: SORT_BY_SEQ, size: 5 };
        const first = await queries.search({ body, paginate: { pit: true } });
        const cursor = first.nextCursor ?? "";
        const pit = pitOfCursor(cursor) ?? "";
        // The engine keeps serving an expired PIT until its reaper runs (search.keep_alive_interval, 1 min by default and
        // not dynamic), so wait until it leaves the list.
        await eventually(async () => !(await openPitIds()).includes(pit), 100_000);
        const error = await rejectionOf(queries.search({ body, cursor }));
        expectError(error, {
          type: SearchCursorExpired,
          code: "SEARCH_CURSOR_EXPIRED",
          reason: "pit-closed",
          retryable: false,
        });
        expectNoLeak(error, ["No search context found", pit]);
      },
    );

    it("PIT keep_alive가 엔진 기본 상한(1일)을 넘으면 PIT 생성이 400 pit-request-rejected다", async () => {
      // The package allows keep_alive above one day; the engine's default point_in_time.max_keep_alive is one day.
      const lifetimes = { maxPitKeepAliveMs: 90_000_000, maxCursorLifetimeMs: 90_000_000 };
      const fixture = await createFixture(true, lifetimes);
      await writeDocuments(fixture.target.physicalIndex, seqDocuments(0, 10));
      const queries = queriesFor(searchClient(engineUrl()), fixture, lifetimes);
      const before = await openPitIds();
      const error = await rejectionOf(
        queries.search({ body: { sort: SORT_BY_SEQ, size: 5 }, paginate: { pit: true } }),
      );
      expectError(error, {
        type: SearchQueryInvalid,
        code: "SEARCH_QUERY_INVALID",
        reason: "pit-request-rejected",
        retryable: false,
      });
      expect(error.details).toEqual({
        reason: "pit-request-rejected",
        status: 400,
        type: "illegal_argument_exception",
      });
      expectNoLeak(error, ["Keep alive", "max_keep_alive"]);
      expect(await openPitIds()).toEqual(before);
    });

    it("엔진이 PIT 이어 읽기의 keep_alive를 거부하면 400 engine-rejected SearchQueryInvalid다", async () => {
      const fixture = await createFixture();
      await writeDocuments(fixture.target.physicalIndex, seqDocuments(0, 10));
      const queries = queriesFor(searchClient(engineUrl()), fixture);
      const body = { sort: SORT_BY_SEQ, size: 5 };
      const first = await queries.search({ body, paginate: { pit: true } });
      const pit = pitOfCursor(first.nextCursor) ?? "";
      // Lowering the limit after the PIT was opened makes the engine refuse the continuation's keep_alive. The 400
      // search_phase_execution_exception looks like a query that failed on a shard, so it is engine-rejected.
      await lowerPitKeepAliveLimit();
      try {
        const error = await rejectionOf(queries.search({ body, cursor: first.nextCursor ?? "" }));
        expectError(error, {
          type: SearchQueryInvalid,
          code: "SEARCH_QUERY_INVALID",
          reason: "engine-rejected",
          retryable: false,
        });
        expect(error.details).toEqual({
          reason: "engine-rejected",
          status: 400,
          type: "search_phase_execution_exception",
        });
        expectNoLeak(error, ["Keep alive", "max_keep_alive", pit]);
      } finally {
        await restorePitKeepAliveLimit();
      }
      // The caller still holds the cursor, so closeCursor can close the PIT.
      await queries.closeCursor(first.nextCursor ?? "");
      expect(await openPitIds()).not.toContain(pit);
    });
  });

  describe("실제 응답의 오류 정규화", () => {
    it.each([GZIP])(
      "잘못된 쿼리 본문은 400 engine-rejected SearchQueryInvalid다 ($name)",
      async (mode) => {
        const fixture = await createFixture();
        await writeDocuments(fixture.target.physicalIndex, seqDocuments(0, 3));
        const queries = queriesFor(
          searchClient(engineUrl(), { suggestCompression: mode.suggestCompression }),
          fixture,
        );
        // Rejected while parsing (unknown query name) and on the shard (a string term on a long field).
        const unknownQuery = z
          .custom<NativeQuery>(() => true)
          .parse({ no_such_query: { field: 1 } });
        const cases = [
          { query: unknownQuery, type: "x_content_parse_exception" },
          {
            query: { term: { "doc.seq": "not-a-number" } },
            type: "search_phase_execution_exception",
          },
        ];
        for (const testCase of cases) {
          const error = await rejectionOf(queries.search({ body: { query: testCase.query } }));
          expectError(error, {
            type: SearchQueryInvalid,
            code: "SEARCH_QUERY_INVALID",
            reason: "engine-rejected",
            retryable: false,
          });
          expect(error.details).toEqual({
            reason: "engine-rejected",
            status: 400,
            type: testCase.type,
          });
          expectNoLeak(error, [
            "no_such_query",
            "unknown query",
            "failed to parse",
            "not-a-number",
          ]);
        }
      },
    );

    it.each([PLAIN])(
      "없는 인덱스는 PIT 여부와 무관하게 404 index-not-found SearchTargetUnavailable이다 ($name)",
      async (mode) => {
        const fixture = await createFixture(false);
        const queries = queriesFor(
          searchClient(engineUrl(), { suggestCompression: mode.suggestCompression }),
          fixture,
        );
        for (const input of [
          { body: {} },
          { body: { sort: SORT_BY_SEQ }, paginate: { pit: true } },
        ]) {
          const error = await rejectionOf(queries.search(input));
          expectError(error, {
            type: SearchTargetUnavailable,
            code: "SEARCH_TARGET_UNAVAILABLE",
            reason: "index-not-found",
            retryable: false,
          });
          expect(error.details).toMatchObject({ status: 404, type: "index_not_found_exception" });
          expectNoLeak(error, ["no such index", fixture.target.physicalIndex]);
        }
      },
    );

    it("연결이 거부되면 재시도 가능한 connection SearchUnavailable이다", async () => {
      const url = await closedPortUrl();
      const fixture = await createFixture(false);
      const client = searchClient(url);
      const queries = queriesFor(client, fixture);
      // The SDK marks the connection dead after the first failure, so check a second request too.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const error = await rejectionOf(queries.search({ body: {} }));
        expectError(error, {
          type: SearchUnavailable,
          code: "SEARCH_UNAVAILABLE",
          reason: "connection",
          retryable: true,
        });
        expectNoLeak(error, [new URL(url).port]);
      }
      const report = await client.checkConnection();
      expect(report.ok).toBe(false);
      expect(report.error?.details?.reason).toBe("connection");
    });

    it("응답하지 않는 포트에서는 제한 시간 안에 SearchTimeout이다", async () => {
      const blackhole = await startTcpProxy(engineUrl());
      try {
        blackhole.setMode({ kind: "blackhole" });
        const fixture = await createFixture(false);
        const queries = queriesFor(searchClient(blackhole.url, { requestTimeoutMs: 300 }), fixture);
        const started = performance.now();
        const error = await rejectionOf(queries.search({ body: {} }));
        expect(performance.now() - started).toBeLessThan(5_000);
        expectError(error, {
          type: SearchTimeout,
          code: "SEARCH_TIMEOUT",
          reason: "request-timeout",
          retryable: true,
        });
        expectNoLeak(error);
        expect(blackhole.connections).toBeGreaterThan(0);

        // A search deadline closer than the request timeout fails as the deadline.
        const deadlineQueries = queriesFor(searchClient(blackhole.url), fixture);
        const deadlineStarted = performance.now();
        const deadline = await rejectionOf(deadlineQueries.search({ body: {}, timeoutMs: 300 }));
        expect(performance.now() - deadlineStarted).toBeLessThan(5_000);
        expectError(deadline, {
          type: SearchTimeout,
          code: "SEARCH_TIMEOUT",
          reason: "search-deadline",
          retryable: true,
        });
        expectNoLeak(deadline);
      } finally {
        await blackhole.close();
      }
    });

    // A stalled gzip body must time out as well; the plain variant is unit-tested.
    it.each([GZIP])(
      "본문을 읽는 도중 멈춘 응답은 제한 시간 안에 request-timeout SearchTimeout이다 ($name)",
      async (mode) => {
        const fixture = await createFixture();
        await writeDocuments(fixture.target.physicalIndex, seqDocuments(0, 40));
        const stalled = await startTcpProxy(engineUrl());
        try {
          stalled.setMode({ kind: "stall-body", stallAfterBodyBytes: 32 });
          const queries = queriesFor(
            searchClient(stalled.url, {
              requestTimeoutMs: 500,
              suggestCompression: mode.suggestCompression,
            }),
            fixture,
          );
          const started = performance.now();
          const error = await rejectionOf(queries.search({ body: { size: 40, _source: true } }));
          expect(performance.now() - started).toBeLessThan(5_000);
          expectError(error, {
            type: SearchTimeout,
            code: "SEARCH_TIMEOUT",
            reason: "request-timeout",
            retryable: true,
          });
          expectNoLeak(error);
        } finally {
          await stalled.close();
        }
      },
    );

    it.each([GZIP])(
      "실제 응답이 maxResponseBytes를 넘으면 response-too-large SearchUnavailable이다 ($name)",
      async (mode) => {
        const fixture = await createFixture();
        await writeDocuments(fixture.target.physicalIndex, seqDocuments(0, 40));
        const queries = queriesFor(
          searchClient(engineUrl(), {
            maxResponseBytes: 4_096,
            suggestCompression: mode.suggestCompression,
          }),
          fixture,
        );
        expect((await queries.search({ body: { size: 1 } })).hits).toHaveLength(1);
        const error = await rejectionOf(queries.search({ body: { size: 40, _source: true } }));
        expectError(error, {
          type: SearchUnavailable,
          code: "SEARCH_UNAVAILABLE",
          reason: "response-too-large",
          retryable: false,
        });
        expect(error.details).toMatchObject({ maxBytes: 4_096 });
        expectNoLeak(error, ["message number"]);
        // The client keeps working after a stream was cut for size.
        expect((await queries.search({ body: { size: 1 } })).hits).toHaveLength(1);
      },
    );
  });
});

describe("NDJSON 본문의 바이트", () => {
  it("워커가 센 NDJSON 바이트가 엔진으로 실제로 나간 본문과 바이트 단위로 같다", async () => {
    const { target } = await createFixture();
    const alias = target.physicalIndex + "-w";
    await harness.opensearch.indices.updateAliases({
      body: { actions: [{ add: { index: target.physicalIndex, alias, is_write_index: true } }] },
    });
    // An HTTP proxy that records requests verbatim and forwards them to the engine.
    const recorded: { method: string; url: string; headers: IncomingHttpHeaders; body: Buffer }[] =
      [];
    const upstream = new URL(engineUrl());
    const server = createServer((incoming, outgoing) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        const body = Buffer.concat(chunks);
        recorded.push({
          method: incoming.method ?? "",
          url: incoming.url ?? "",
          headers: incoming.headers,
          body,
        });
        const forward = httpRequest(
          {
            host: upstream.hostname,
            port: upstream.port,
            method: incoming.method,
            path: incoming.url,
            headers: { ...incoming.headers, host: upstream.host },
          },
          (response) => {
            outgoing.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(outgoing);
          },
        );
        forward.end(body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = z.looseObject({ port: z.number() }).parse(server.address());
    try {
      const client = searchClient("http://127.0.0.1:" + String(address.port));
      const packed = packBulkRequests(
        ["가나다-1", "日本語-2", "emoji-✓-3"].map((id, index) => ({
          documentId: id,
          envelope: buildSearchEnvelope(
            { state: "present", document: message(index, "본문 " + id + " — ünïcödé ✓") },
            index + 1,
          ),
        })),
        { maxBulkBytes: 1_000_000, maxDocuments: 10 },
      );
      expect(packed.requests).toHaveLength(1);
      const request = packed.requests[0];
      if (request === undefined) throw new Error("요청이 없습니다.");
      const response = await getSearchRequester(client).send({
        method: "POST",
        path: bulkPath(alias),
        ndjson: request.body,
        querystring: BULK_QUERYSTRING,
      });
      expect(response.status).toBe(200);
      expect(z.looseObject({ errors: z.boolean() }).parse(response.body).errors).toBe(false);

      const sent = recorded.filter((entry) => entry.url.startsWith(bulkPath(alias)));
      expect(sent).toHaveLength(1);
      const wire = sent[0];
      expect(wire?.body.equals(Buffer.from(request.body, "utf8"))).toBe(true);
      expect(wire?.body.byteLength).toBe(request.bytes);
      expect(wire?.headers["content-length"]).toBe(String(request.bytes));
      expect(wire?.headers["content-type"]).toContain("x-ndjson");
      // Multibyte content, so character and byte counts differ.
      expect(request.body.length).toBeLessThan(request.bytes);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
