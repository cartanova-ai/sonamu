import { describe, expect, it } from "vitest";
import { z } from "zod";

import { compareMeta } from "../../src/admin/remote-create";
import { type NativeTypeMapping, type SearchDocumentMappings } from "../../src/client/sdk-types";
import {
  HASH_VERSION,
  type HashVersion,
  type JsonObject,
} from "../../src/definition/canonical-json";
import { defineSearch, type Projection } from "../../src/definition/define-search";
import {
  parseDocumentMappings,
  assertRevision,
  buildSearchEnvelope,
  composeIndexMappings,
  isReservedDocumentField,
  readSearchIndexMeta,
  type SearchEnvelope,
  type SearchIndexIdentity,
} from "../../src/definition/envelope";
import {
  SearchConfigurationError,
  SearchError,
  SearchProjectionError,
  SearchRevisionOverflow,
} from "../../src/errors";

// Same fixed vectors as canonical-json.test.ts.
const DELETED_HASH = "50e166111d425bc3b0a8fb4e70806455adc6496d919088edab23997809ab0e77";
const PRESENT_HASH = "daac4e1037ce67c307ad0fa3afae46c65baa1edf4d31f3cdbe163d3abd8d9e56";
const FINGERPRINT = "fae8a6a8f43d0936e660d7e1dbbc0c0fb7cba41fc7cda3995bbedbbe54d54020";
const TARGET_ID = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";

function forgeProjection<Value>(value: Value): Projection<JsonObject> {
  // SAFETY: deliberate forgery to test runtime rejection.
  return value as Projection<JsonObject>;
}

function forgeMappings<Value>(value: Value): SearchDocumentMappings {
  // SAFETY: deliberate forgery to test runtime rejection.
  return value as SearchDocumentMappings;
}

function forgeTypeMapping<Value>(value: Value): NativeTypeMapping {
  // SAFETY: deliberate forgery to test runtime rejection.
  return value as NativeTypeMapping;
}

function captureSearchError(run: () => void): SearchError {
  try {
    run();
  } catch (error) {
    if (error instanceof SearchError) return error;
    throw error;
  }
  throw new Error("오류가 발생하지 않았습니다.");
}

function identity(): SearchIndexIdentity {
  return {
    targetId: TARGET_ID,
    namespace: "medpath-prod",
    logicalKey: "chat-messages",
    fingerprint: FINGERPRINT,
    hashVersion: HASH_VERSION,
  };
}

describe("envelope 문서", () => {
  it("present envelope는 sonamu_meta와 검증한 doc을 담고 직렬화 결과가 고정돼 있다", () => {
    const document: JsonObject = { title: "안녕", tags: ["b", "a"], count: 2 };
    const envelope = buildSearchEnvelope({ state: "present", document }, 7);
    expect(envelope).toEqual({
      sonamu_meta: {
        deleted: false,
        revision: 7,
        hash_version: "sonamu-c14n-v1",
        projection_hash: PRESENT_HASH,
      },
      doc: { title: "안녕", tags: ["b", "a"], count: 2 },
    });
    // doc keeps input key order; the hash comes from the order-independent canonical form.
    expect(JSON.stringify(envelope)).toBe(
      '{"sonamu_meta":{"deleted":false,"revision":7,"hash_version":"sonamu-c14n-v1",' +
        `"projection_hash":"${PRESENT_HASH}"},"doc":{"title":"안녕","tags":["b","a"],"count":2}}`,
    );
  });

  it("열거되지 않는 속성과 배열의 인덱스 밖 속성은 해시와 doc 모두에서 빠진다", () => {
    const hidden = Object.defineProperty({ a: 1 }, "secret", { value: 2, enumerable: false });
    const list = Object.assign([1, 2], { extra: 3 });
    const envelope = buildSearchEnvelope({ state: "present", document: { hidden, list } }, 1);
    expect(JSON.stringify("doc" in envelope && envelope.doc)).toBe(
      '{"hidden":{"a":1},"list":[1,2]}',
    );
    expect(envelope.sonamu_meta.projection_hash).toBe(
      buildSearchEnvelope({ state: "present", document: { hidden: { a: 1 }, list: [1, 2] } }, 1)
        .sonamu_meta.projection_hash,
    );
  });

  it("doc은 원래 문서와 다른 객체라 나중에 원래 문서를 바꿔도 해시와 본문이 어긋나지 않는다", () => {
    const document: JsonObject = { title: "안녕", tags: ["b", "a"], count: 2 };
    const envelope = buildSearchEnvelope({ state: "present", document }, 1);
    document.title = "바뀜";
    expect("doc" in envelope && envelope.doc.title).toBe("안녕");
    expect(envelope.sonamu_meta.projection_hash).toBe(PRESENT_HASH);
  });

  it("-0은 해시와 같은 정규 값 0으로 보낸다", () => {
    const envelope = buildSearchEnvelope({ state: "present", document: { n: -0 } }, 1);
    expect(JSON.stringify(envelope)).toContain('"doc":{"n":0}');
    expect(envelope.sonamu_meta.projection_hash).toBe(
      buildSearchEnvelope({ state: "present", document: { n: 0 } }, 1).sonamu_meta.projection_hash,
    );
  });

  it("tombstone은 doc 키 없이 메타데이터만 담는다", () => {
    const envelope: SearchEnvelope = buildSearchEnvelope({ state: "deleted" }, 12);
    expect(Object.keys(envelope)).toEqual(["sonamu_meta"]);
    expect(JSON.stringify(envelope)).toBe(
      `{"sonamu_meta":{"deleted":true,"revision":12,"hash_version":"sonamu-c14n-v1","projection_hash":"${DELETED_HASH}"}}`,
    );
  });

  it.each(["sonamu_meta", "_id"])(
    "문서 최상위의 예약 필드 %s는 SearchProjectionError(reserved_field)",
    (field) => {
      const error = captureSearchError(() =>
        buildSearchEnvelope({ state: "present", document: { ok: 1, [field]: 1 } }, 1),
      );
      expect(error).toBeInstanceOf(SearchProjectionError);
      expect(error.details).toEqual({ reason: "reserved_field", field });
    },
  );

  it("예약 이름은 최상위에만 적용된다: 중첩 필드와 doc이라는 이름은 받는다", () => {
    const document: JsonObject = { doc: 1, meta: { _private: 1, sonamu_meta: 2 }, name_: "x" };
    const envelope = buildSearchEnvelope({ state: "present", document }, 1);
    expect("doc" in envelope && envelope.doc).toEqual(document);
    expect(isReservedDocumentField("sonamu_meta")).toBe(true);
    expect(isReservedDocumentField("_x")).toBe(true);
    expect(isReservedDocumentField("x_")).toBe(false);
  });

  it("값이 undefined인 선택 필드는 버리지 않고 거부한다", () => {
    const parsed = z.object({ body: z.string().optional() }).parse({ body: undefined });
    expect(Object.keys(parsed)).toEqual(["body"]);
    const error = captureSearchError(() =>
      buildSearchEnvelope({ state: "present", document: forgeProjection(parsed) }, 1),
    );
    expect(error).toBeInstanceOf(SearchProjectionError);
    expect(error.details).toEqual({ reason: "undefined", path: "/document/body" });
  });

  it("리비전은 1부터 Number.MAX_SAFE_INTEGER까지 받는다", () => {
    expect(assertRevision(1)).toBe(1);
    expect(assertRevision(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(
      buildSearchEnvelope({ state: "deleted" }, Number.MAX_SAFE_INTEGER).sonamu_meta.revision,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("안전 범위를 넘는 리비전은 SearchRevisionOverflow", () => {
    for (const revision of [Number.MAX_SAFE_INTEGER + 1, 2 ** 63]) {
      expect(() => buildSearchEnvelope({ state: "deleted" }, revision)).toThrow(
        SearchRevisionOverflow,
      );
    }
  });

  it.each([0, 1.5])("잘못된 리비전 %s는 SearchConfigurationError", (revision) => {
    expect(() => buildSearchEnvelope({ state: "deleted" }, revision)).toThrow(
      SearchConfigurationError,
    );
  });
});

describe("매핑 제약", () => {
  it.each(["_source", "dynamic_templates"])(
    "최상위 매핑 키 %s는 SearchConfigurationError",
    (key) => {
      const mappings = forgeMappings({ properties: {}, [key]: {} });
      const error = captureSearchError(() => parseDocumentMappings(mappings));
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details).toEqual({ reason: "unsupported_mapping_key", key });
    },
  );

  it("defineSearch와 composeIndexMappings도 같은 제약을 적용한다", () => {
    const mappings = forgeMappings({ properties: {}, _source: { enabled: false } });
    const definition = {
      key: "chat-messages",
      projectionVersion: "1",
      schema: z.object({ body: z.string() }),
      settings: {},
      mappings,
      requiredPlugins: [],
      materialize: async () => new Map(),
      captureScanBoundary: async () => "0",
      scanSourceIds: async () => ({ ids: [] }),
    };
    expect(captureSearchError(() => defineSearch(definition)).details?.reason).toBe(
      "unsupported_mapping_key",
    );
    expect(
      captureSearchError(() => composeIndexMappings({ ...identity(), mappings })).details?.reason,
    ).toBe("unsupported_mapping_key");
  });

  it.each<[string, SearchDocumentMappings, string]>([
    ["properties 없음", forgeMappings({ dynamic: "strict" }), "properties_not_object"],
    ["배열 mappings", forgeMappings([]), "mappings_not_object"],
    [
      "예약 속성 sonamu_meta",
      { properties: { sonamu_meta: { type: "keyword" } } },
      "reserved_property",
    ],
    ["알 수 없는 dynamic 값", forgeMappings({ properties: {}, dynamic: "yes" }), "invalid_dynamic"],
  ])("%s는 거부한다", (_label, mappings, reason) => {
    const error = captureSearchError(() => parseDocumentMappings(mappings));
    expect(error).toBeInstanceOf(SearchConfigurationError);
    expect(error.details?.reason).toBe(reason);
  });

  it("properties와 SDK의 모든 dynamic 값은 받는다", () => {
    for (const dynamic of [
      true,
      false,
      "true",
      "false",
      "strict",
      "strict_allow_templates",
    ] as const) {
      expect(parseDocumentMappings({ properties: {}, dynamic })).toEqual({
        properties: {},
        dynamic,
      });
    }
    expect(parseDocumentMappings({ properties: {}, dynamic: undefined })).toEqual({
      properties: {},
    });
  });
});

describe("인덱스 매핑 조립과 _meta", () => {
  const mappings: SearchDocumentMappings = {
    properties: { body: { type: "text", analyzer: "ko" }, room_id: { type: "keyword" } },
  };

  it("_meta, strict sonamu_meta, doc 아래의 정의 매핑으로 인덱스 매핑을 만든다", () => {
    expect(composeIndexMappings({ ...identity(), mappings })).toEqual({
      dynamic: "strict",
      _meta: {
        sonamu: {
          target_id: TARGET_ID,
          namespace: "medpath-prod",
          logical_key: "chat-messages",
          fingerprint: FINGERPRINT,
          hash_version: "sonamu-c14n-v1",
          envelope: 1,
        },
      },
      properties: {
        sonamu_meta: {
          type: "object",
          dynamic: "strict",
          properties: {
            deleted: { type: "boolean" },
            revision: { type: "long" },
            hash_version: { type: "keyword" },
            projection_hash: { type: "keyword" },
          },
        },
        doc: {
          type: "object",
          dynamic: "strict",
          properties: { body: { type: "text", analyzer: "ko" }, room_id: { type: "keyword" } },
        },
      },
    });
  });

  it("doc의 dynamic은 정의 값을 따르고 생략하면 strict다", () => {
    const composed = composeIndexMappings({
      ...identity(),
      mappings: { ...mappings, dynamic: false },
    });
    expect(composed.properties?.doc).toMatchObject({ dynamic: false });
    expect(composed.dynamic).toBe("strict");
  });

  it("조립 결과를 바꿔도 정의의 매핑은 바뀌지 않는다", () => {
    const composed = composeIndexMappings({ ...identity(), mappings });
    const doc = composed.properties?.doc;
    if (doc !== undefined && "properties" in doc && doc.properties !== undefined) {
      doc.properties.injected = { type: "keyword" };
    }
    expect(mappings.properties.injected).toBeUndefined();
    expect(composed.properties?.sonamu_meta).not.toBe(
      composeIndexMappings({ ...identity(), mappings }).properties?.sonamu_meta,
    );
  });

  it.each<[string, Partial<SearchIndexIdentity>, string]>([
    ["대문자 대상 ID", { targetId: TARGET_ID.toUpperCase() }, ""],
    ["잘못된 namespace", { namespace: "Medpath" }, ""],
    ["잘못된 logical key", { logicalKey: "chat_messages" }, ""],
    ["fingerprint 형식", { fingerprint: FINGERPRINT.toUpperCase() }, "invalid_fingerprint"],
    [
      "다른 hash_version",
      { hashVersion: forgeHashVersion("sonamu-c14n-v2") },
      "unsupported_hash_version",
    ],
  ])("%s는 SearchConfigurationError", (_label, change, reason) => {
    const error = captureSearchError(() =>
      composeIndexMappings({ ...identity(), ...change, mappings }),
    );
    expect(error).toBeInstanceOf(SearchConfigurationError);
    if (reason !== "") expect(error.details?.reason).toBe(reason);
  });

  it("조립한 매핑의 _meta를 JSON 왕복 뒤에도 그대로 읽는다", () => {
    const composed = composeIndexMappings({ ...identity(), mappings });
    const roundTripped = forgeTypeMapping(JSON.parse(JSON.stringify(composed)));
    expect(readSearchIndexMeta(roundTripped)).toEqual({
      target_id: TARGET_ID,
      namespace: "medpath-prod",
      logical_key: "chat-messages",
      fingerprint: FINGERPRINT,
      hash_version: "sonamu-c14n-v1",
      envelope: 1,
    });
  });

  it("다른 hash_version 문자열은 그대로 돌려줘 호출자가 불일치를 판단하게 한다", () => {
    const composed = composeIndexMappings({ ...identity(), mappings });
    const { _meta: composedMeta } = composed;
    const meta = { ...composedMeta?.sonamu, hash_version: "sonamu-c14n-v2" };
    expect(readSearchIndexMeta(forgeTypeMapping({ _meta: { sonamu: meta } }))?.hash_version).toBe(
      "sonamu-c14n-v2",
    );
  });

  it("storeId를 주면 _meta.sonamu.store_id로 찍고 왕복 뒤에도 읽으며, 소문자 UUID가 아니면 거부한다", () => {
    const composed = composeIndexMappings({
      ...identity(),
      storeId: "2d1b0e3a-3e4f-4a71-8c1d-2e3f4a5b6c7d",
      mappings,
    });
    const roundTripped = forgeTypeMapping(JSON.parse(JSON.stringify(composed)));
    expect(readSearchIndexMeta(roundTripped)?.store_id).toBe(
      "2d1b0e3a-3e4f-4a71-8c1d-2e3f4a5b6c7d",
    );
    for (const storeId of ["2D1B0E3A-3E4F-4A71-8C1D-2E3F4A5B6C7D", "store", ""]) {
      const error = captureSearchError(() =>
        composeIndexMappings({ ...identity(), storeId, mappings }),
      );
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details?.reason).toBe("invalid_store_id");
    }
    // An index stamped with an invalid store_id is treated as not owned.
    expect(
      readSearchIndexMeta(
        forgeTypeMapping({ _meta: { sonamu: { ...validMeta(), store_id: "x" } } }),
      ),
    ).toBeUndefined();
  });

  it.each([
    ["store_id 없음 (버전 2 이전 인덱스)", undefined, {}, "match"],
    ["같은 store_id", "2d1b0e3a-3e4f-4a71-8c1d-2e3f4a5b6c7d", {}, "match"],
    ["다른 store_id", "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", {}, "store-mismatch"],
    [
      "다른 대상 ID가 먼저",
      "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
      { targetId: "1c0a9d2f-2d3e-4f60-9b0c-1d2e3f4a5b6c" },
      "meta-mismatch",
    ],
  ] as const)("compareMeta: %s ⇒ %s", (_label, remoteStoreId, override, expected) => {
    const meta = readSearchIndexMeta(
      composeIndexMappings({ ...identity(), mappings, storeId: remoteStoreId }),
    );
    const local = {
      targetId: TARGET_ID,
      namespace: "medpath-prod",
      logicalKey: "chat-messages",
      fingerprint: FINGERPRINT,
      hashVersion: "sonamu-c14n-v1",
      storeId: "2d1b0e3a-3e4f-4a71-8c1d-2e3f4a5b6c7d",
      ...override,
    };
    expect(compareMeta(meta, local)).toBe(expected);
  });

  it.each<[string, NativeTypeMapping]>([
    ["_meta 없음", { properties: {} }],
    ["sonamu 키 없음", { _meta: { other: {} } }],
    ["추가 키", forgeTypeMapping({ _meta: { sonamu: { ...validMeta(), extra: 1 } } })],
    [
      "다른 envelope 버전",
      forgeTypeMapping({ _meta: { sonamu: { ...validMeta(), envelope: 2 } } }),
    ],
  ])("%s이면 소유하지 않은 인덱스로 본다(undefined)", (_label, mapping) => {
    expect(readSearchIndexMeta(mapping)).toBeUndefined();
  });
});

function validMeta(): JsonObject {
  return {
    target_id: TARGET_ID,
    namespace: "medpath-prod",
    logical_key: "chat-messages",
    fingerprint: FINGERPRINT,
    hash_version: "sonamu-c14n-v1",
    envelope: 1,
  };
}

function forgeHashVersion(value: string): HashVersion {
  // SAFETY: deliberate forgery to test runtime rejection.
  return value as HashVersion;
}
