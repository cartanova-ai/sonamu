import { describe, expect, it } from "vitest";

import { SearchQueryInvalid } from "../../src/errors";
import { prepareSearchBody, type SourcePolicy } from "../../src/query/body-allowlist";
import { thrownSearchError } from "./query-fixtures";

const NO_SOURCE: SourcePolicy = { allowTrackTotalHits: false, sourceIncludes: [] };
const POLICY: SourcePolicy = { allowTrackTotalHits: true, sourceIncludes: ["body", "author"] };

interface CyclicNode {
  self?: CyclicNode;
}

interface SharedNode {
  a?: SharedNode;
  b?: SharedNode;
}

function prepare<Body>(body: Body, policy: SourcePolicy = NO_SOURCE) {
  return prepareSearchBody(body, { maxPageSize: 50, policy });
}

describe("검색 본문 허용 목록", () => {
  it.each(["aggs", "index"])("허용 목록 밖의 최상위 키 %s는 거부한다", (key) => {
    const error = thrownSearchError(() => prepare({ query: { match_all: {} }, [key]: {} }));
    expect(error).toBeInstanceOf(SearchQueryInvalid);
    expect(error.messageKey).toBe("query.unsupportedBodyKey");
    expect(error.details).toEqual({ reason: "unsupported-body-key", key });
  });

  it("쿼리를 bool.must로 감싸고 삭제 표시를 filter로 제외한다", () => {
    const prepared = prepare({ query: { match: { "doc.body": "hello" } } });
    expect(prepared.base.query).toEqual({
      bool: {
        must: [{ match: { "doc.body": "hello" } }],
        filter: [{ term: { "sonamu_meta.deleted": false } }],
      },
    });
    expect(prepare({}).base.query).toEqual({
      bool: { must: [{ match_all: {} }], filter: [{ term: { "sonamu_meta.deleted": false } }] },
    });
  });

  it("size는 maxPageSize로 줄이고, 생략하면 10이며, 0은 그대로 둔다", () => {
    expect(prepare({ size: 500 }).size).toBe(50);
    expect(prepare({}).size).toBe(10);
    expect(prepare({ size: 0 }).size).toBe(0);
    for (const size of [-1, 1.5, "10", null]) {
      const error = thrownSearchError(() => prepare({ size }));
      expect(error.details).toEqual({ reason: "invalid-body-value", key: "size" });
    }
  });

  it("_source는 패키지가 정한다: 기본은 revision만, 요청하고 정책이 허용한 doc 필드만 더한다", () => {
    expect(prepare({}).base._source).toEqual({ includes: ["sonamu_meta.revision"] });
    expect(prepare({ _source: true }).base._source).toEqual({ includes: ["sonamu_meta.revision"] });
    expect(prepare({ _source: true }, POLICY).base._source).toEqual({
      includes: ["sonamu_meta.revision", "doc.body", "doc.author"],
    });
    const nested = prepare({ _source: ["author.name", "body", "body"] }, POLICY);
    expect(nested.base._source).toEqual({
      includes: ["sonamu_meta.revision", "doc.author.name", "doc.body"],
    });
    expect(nested.sourceFields).toEqual(["author.name", "body"]);
    expect(prepare({ _source: false }, POLICY).sourceFields).toEqual([]);
  });

  it("정책 밖의 필드, 와일드카드, envelope 경로, 객체 형식 _source는 거부한다", () => {
    for (const source of [
      "secret",
      "bodyx",
      "*",
      "doc.*",
      "sonamu_meta.deleted",
      "../x",
      { includes: ["body"] },
    ]) {
      const error = thrownSearchError(() => prepare({ _source: source }, POLICY));
      expect(error).toBeInstanceOf(SearchQueryInvalid);
    }
    expect(thrownSearchError(() => prepare({ _source: "secret" }, POLICY)).details).toEqual({
      reason: "source-field-not-allowed",
      field: "secret",
    });
  });

  it("track_total_hits는 정책이 허용하지 않으면 false로 고정한다", () => {
    expect(prepare({ track_total_hits: true }).base.track_total_hits).toBe(false);
    expect(prepare({ track_total_hits: 1000 }, POLICY).base.track_total_hits).toBe(1000);
    expect(prepare({}, POLICY).base.track_total_hits).toBe(false);
  });

  it("JSON 객체가 아닌 본문은 bodyNotObject, JSON이 아닌 값을 담은 본문은 invalidBody다", () => {
    for (const body of [[], "query", null, 1, undefined]) {
      expect(thrownSearchError(() => prepare(body)).messageKey).toBe("query.bodyNotObject");
    }
    const cyclic: CyclicNode = {};
    cyclic.self = cyclic;
    expect(thrownSearchError(() => prepare({ query: cyclic })).details).toEqual({
      reason: "cycle",
      path: "/query/self",
    });
    const withGetter = Object.defineProperty({}, "query", { enumerable: true, get: () => ({}) });
    expect(thrownSearchError(() => prepare(withGetter)).details?.reason).toBe("accessor_property");
    expect(thrownSearchError(() => prepare({ query: { a: 1n } })).details?.reason).toBe("bigint");
  });

  it("값의 모양이 맞지 않는 허용 키는 거부한다", () => {
    for (const [key, value] of [
      ["query", []],
      ["query", "match_all"],
      ["sort", 1],
      ["sort", []],
      ["search_after", []],
      ["search_after", [{}]],
      ["highlight", []],
      ["track_total_hits", -1],
    ] as const) {
      const error = thrownSearchError(() => prepare({ [key]: value }));
      expect(error.details).toEqual({ reason: "invalid-body-value", key });
    }
  });

  it("쿼리 해시는 size와 search_after에 무관하고 키 순서와 무관하며, 쿼리가 바뀌면 달라진다", () => {
    const base = prepare({ query: { term: { a: 1 } }, sort: ["_id"], size: 5 });
    expect(
      prepare({ size: 20, sort: ["_id"], query: { term: { a: 1 } }, search_after: ["x"] })
        .queryHash,
    ).toBe(base.queryHash);
    expect(prepare({ query: { term: { a: 2 } }, sort: ["_id"] }).queryHash).not.toBe(
      base.queryHash,
    );
    expect(base.queryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("호출자의 본문 객체를 바꾸지 않는다", () => {
    const body = { query: { match_all: {} }, size: 500, track_total_hits: true };
    const snapshot = structuredClone(body);
    prepare(body);
    expect(body).toEqual(snapshot);
  });

  it("JSON 크기가 maxBodyBytes를 넘으면 복사하기 전에 body-too-large로 거부한다", () => {
    const body = {
      query: { terms: { "doc.id": Array.from({ length: 2_000 }, (_, i) => `id-${i}`) } },
    };
    const error = thrownSearchError(() =>
      prepareSearchBody(body, { maxPageSize: 50, policy: NO_SOURCE, maxBodyBytes: 1_000 }),
    );
    expect(error).toBeInstanceOf(SearchQueryInvalid);
    expect(error.details).toEqual({ reason: "body-too-large", maxBytes: 1_000 });
    // Within the default 1 MiB limit.
    expect(prepare(body).base.query).toBeDefined();
  });

  it("공유된 하위 객체는 JSON처럼 펼친 크기로 센다: 작은 그래프가 큰 JSON이 되는 본문도 거부한다", () => {
    // 40 objects that expand to 2^40 leaves as JSON.
    let node: SharedNode = {};
    for (let depth = 0; depth < 40; depth += 1) node = { a: node, b: node };
    const error = thrownSearchError(() => prepare({ query: { bool: node } }));
    expect(error.details).toEqual({ reason: "body-too-large", maxBytes: 1_048_576 });
  });
});
