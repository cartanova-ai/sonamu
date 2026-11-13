import { describe, expect, it } from "vitest";

import {
  canonicalizeJson,
  canonicalizeProjection,
  type CanonicalJsonViolationReason,
  computeProjectionHash,
  type JsonObject,
  type JsonValue,
  MAX_CANONICAL_DEPTH,
} from "../../src/definition/canonical-json";
import { type Projection } from "../../src/definition/define-search";
import { SearchConfigurationError, SearchError, SearchProjectionError } from "../../src/errors";

// Digests computed independently with `printf '%s' ... | shasum -a 256`. A change invalidates every stored
// projection_hash: bump HASH_VERSION instead of editing these values.
const DELETED_HASH = "50e166111d425bc3b0a8fb4e70806455adc6496d919088edab23997809ab0e77";
const PRESENT_HASH = "daac4e1037ce67c307ad0fa3afae46c65baa1edf4d31f3cdbe163d3abd8d9e56";
const NFC_HASH = "482c7c4856f7578063427cc932975ce3d4c6ff46026c8d30b9bf58c6c2defe16";
const NFD_HASH = "dbf6358638a8ff746c4a7a974142f93070dadcbf0f257c68fe89406f101620ea";

function forgeJson<Value>(value: Value): JsonValue {
  // SAFETY: deliberate forgery to test runtime rejection.
  return value as JsonValue;
}

function forgeProjection<Value>(value: Value): Projection<JsonObject> {
  // SAFETY: deliberate forgery to test runtime rejection.
  return value as Projection<JsonObject>;
}

function captureSearchError(run: () => string): SearchError {
  try {
    run();
  } catch (error) {
    if (error instanceof SearchError) return error;
    throw error;
  }
  throw new Error("오류가 발생하지 않았습니다.");
}

function nestArrays(levels: number): JsonValue {
  let value: JsonValue = [];
  for (let level = 1; level < levels; level += 1) value = [value];
  return value;
}

describe("sonamu-c14n-v1 고정 벡터", () => {
  it.each<[string, JsonValue, string]>([
    ["null", null, "null"],
    ["true", true, "true"],
    [
      "키 정렬과 중첩",
      { b: 1, a: [3, 1, 2], c: { z: null, y: true } },
      '{"a":[3,1,2],"b":1,"c":{"y":true,"z":null}}',
    ],
    [
      "중첩 배열의 순서와 배열 안 객체의 키 정렬",
      [[], [[1, [2]]], {}, [{ b: 2, a: 1 }]],
      '[[],[[1,[2]]],{},[{"a":1,"b":2}]]',
    ],
    [
      "숫자: -0은 0, 정수 표기, 지수 표기, 최소/최대 double",
      [0, -0, 1, -1, 1.5, 0.1 + 0.2, 1e21, 1e-7, 5e-324, 1.7976931348623157e308],
      "[0,0,1,-1,1.5,0.30000000000000004,1e+21,1e-7,5e-324,1.7976931348623157e+308]",
    ],
    [
      "안전 범위를 넘는 정수는 JSON.stringify가 쓰는 가장 짧은 표기",
      [2 ** 53, 2 ** 53 + 1, 2 ** 64, 123456789012345680000],
      "[9007199254740992,9007199254740992,18446744073709552000,123456789012345680000]",
    ],
    [
      "문자열 이스케이프: 제어 문자, 따옴표, 역슬래시는 이스케이프하고 /, DEL, U+2028은 그대로",
      '\u0000\u001f\b\f\n\r\t"\\/\u007f\u2028\u2029',
      '"\\u0000\\u001f\\b\\f\\n\\r\\t\\"\\\\/\u007f\u2028\u2029"',
    ],
    ["비ASCII 문자는 이스케이프하지 않는다", "안녕 😀 é", '"안녕 😀 é"'],
    ["toJSON이라는 이름의 데이터 키는 일반 키다", { toJSON: "x" }, '{"toJSON":"x"}'],
  ])("%s", (_label, value, expected) => {
    expect(canonicalizeJson(value)).toBe(expected);
  });

  it("키는 코드 포인트가 아니라 UTF-16 코드 단위 순서로 정렬한다", () => {
    // Code point order would put U+FF61 before U+1F600; integer-like keys compare as strings.
    const value: JsonObject = { "｡": 1, "😀": 2, é: 3, z: 4, Z: 5, "": 6, "10": 7, "9": 8 };
    expect(canonicalizeJson(value)).toBe('{"":6,"10":7,"9":8,"Z":5,"z":4,"é":3,"😀":2,"｡":1}');
  });

  it("__proto__ 키는 복사본에서 조용히 사라지므로 거부한다", () => {
    const parsed: JsonObject = JSON.parse('{"a":2,"nested":{"__proto__":1}}');
    const error = captureSearchError(() => canonicalizeJson(parsed));
    expect(error.details).toEqual({ reason: "reserved_key", path: "/nested/__proto__" });
  });

  it("constructor처럼 프로토타입 메서드와 같은 이름의 데이터 키는 받는다", () => {
    expect(canonicalizeJson({ constructor: "c", hasOwnProperty: 1 })).toBe(
      '{"constructor":"c","hasOwnProperty":1}',
    );
  });

  it("열거되지 않는 속성과 배열의 인덱스 밖 속성은 JSON 값이 아니므로 읽지 않는다", () => {
    const hidden = Object.defineProperty({ a: 1 }, "h", { value: 2, enumerable: false });
    expect(canonicalizeJson(forgeJson(hidden))).toBe('{"a":1}');
    expect(canonicalizeJson(forgeJson(Object.assign([1], { extra: 2 })))).toBe("[1]");
  });

  it("프로토타입이 null인 객체와 같은 객체를 여러 번 참조하는 값은 받는다", () => {
    const bare: JsonObject = Object.create(null);
    bare.b = 1;
    bare.a = 2;
    const shared: JsonObject = { x: 1 };
    expect(canonicalizeJson({ bare, left: shared, right: [shared] })).toBe(
      '{"bare":{"a":2,"b":1},"left":{"x":1},"right":[{"x":1}]}',
    );
  });

  it("유니코드 정규화를 하지 않는다: NFC와 NFD는 다른 문자열과 해시가 된다", () => {
    const nfc = "\u00e9";
    const nfd = "e\u0301";
    expect(nfc.normalize("NFC")).toBe(nfd.normalize("NFC"));
    expect(canonicalizeJson(nfc)).not.toBe(canonicalizeJson(nfd));
    expect(computeProjectionHash({ state: "present", document: { name: nfc } })).toBe(NFC_HASH);
    expect(computeProjectionHash({ state: "present", document: { name: nfd } })).toBe(NFD_HASH);
  });

  it("입력을 바꾸지 않으며 동결된 입력도 받는다", () => {
    const list: JsonValue[] = [2, 1];
    const value: JsonObject = { b: list, a: 1 };
    Object.freeze(list);
    Object.freeze(value);
    expect(canonicalizeJson(value)).toBe('{"a":1,"b":[2,1]}');
    expect(Object.keys(value)).toEqual(["b", "a"]);
  });

  it(`최대 깊이 ${MAX_CANONICAL_DEPTH}까지는 받고 그보다 깊으면 거부한다`, () => {
    expect(canonicalizeJson(nestArrays(MAX_CANONICAL_DEPTH))).toHaveLength(MAX_CANONICAL_DEPTH * 2);
    const error = captureSearchError(() => canonicalizeJson(nestArrays(MAX_CANONICAL_DEPTH + 1)));
    expect(error.details?.reason).toBe("too_deep");
  });
});

describe("JSON으로 그대로 표현되지 않는 값은 조용히 바꾸지 않고 거부한다", () => {
  class TaggedList extends Array<number> {}
  const cyclic: JsonObject = { name: "a" };
  cyclic.self = cyclic;
  const cyclicArray: JsonValue[] = [1];
  cyclicArray.push({ back: cyclicArray });
  const accessor = Object.defineProperty({}, "a", { get: () => 1, enumerable: true });

  it.each<[string, JsonValue, CanonicalJsonViolationReason, string]>([
    ["최상위 undefined", forgeJson(undefined), "undefined", ""],
    [
      "객체 속성의 undefined (JSON.stringify라면 키를 버림)",
      forgeJson({ a: { b: undefined } }),
      "undefined",
      "/a/b",
    ],
    [
      "배열 원소의 undefined (JSON.stringify라면 null)",
      forgeJson([1, undefined]),
      "undefined",
      "/1",
    ],
    ["NaN", Number.NaN, "non_finite_number", ""],
    ["bigint (JSON.stringify라면 TypeError)", forgeJson({ n: 10n ** 20n }), "bigint", "/n"],
    ["symbol 값", forgeJson(Symbol("s")), "symbol", ""],
    ["함수", forgeJson(() => 1), "function", ""],
    ["toJSON 메서드가 있는 객체", forgeJson({ toJSON: () => "x" }), "function", "/toJSON"],
    [
      "Date (JSON.stringify라면 문자열)",
      forgeJson({ at: new Date(0) }),
      "unsupported_object",
      "/at",
    ],
    ["Array 하위 클래스", forgeJson(TaggedList.from([1])), "unsupported_object", ""],
    ["symbol 키", forgeJson({ a: 1, [Symbol("k")]: 2 }), "symbol_key", ""],
    ["getter 속성", forgeJson(accessor), "accessor_property", "/a"],
    [
      "빈 칸이 있는 배열 (빈 칸은 undefined)",
      forgeJson({ list: sparseArray(2) }),
      "undefined",
      "/list/0",
    ],
    ["짝 없는 high 서로게이트 값", forgeJson({ s: "a\ud800" }), "ill_formed_string", "/s"],
    ["짝 없는 서로게이트 키", forgeJson({ "\ud800": 1 }), "ill_formed_string", "/\ud800"],
    ["순환 참조", cyclic, "cycle", "/self"],
    ["배열을 거치는 순환 참조", cyclicArray, "cycle", "/1/back"],
  ])("%s", (_label, value, reason, path) => {
    const error = captureSearchError(() => canonicalizeJson(value));
    expect(error).toBeInstanceOf(SearchConfigurationError);
    expect(error.details).toEqual({ reason, path });
  });

  it("경로의 / 와 ~ 는 JSON Pointer 규칙으로 이스케이프한다", () => {
    const error = captureSearchError(() =>
      canonicalizeJson(forgeJson({ "a/b": { "c~d": undefined } })),
    );
    expect(error.details?.path).toBe("/a~1b/c~0d");
  });

  it("오류 메시지와 details에 값은 담지 않는다", () => {
    const error = captureSearchError(() =>
      canonicalizeJson(forgeJson({ secret: "비밀번호-1234", broken: Number.NaN })),
    );
    expect(error.message).not.toContain("비밀번호-1234");
    expect(JSON.stringify(error.details)).not.toContain("비밀번호-1234");
  });
});

describe("projection_hash", () => {
  it("tombstone의 해시는 고정 벡터와 같다", () => {
    expect(canonicalizeProjection({ state: "deleted" })).toBe('{"state":"deleted"}');
    expect(computeProjectionHash({ state: "deleted" })).toBe(DELETED_HASH);
  });

  it("present 문서의 해시는 고정 벡터와 같고 키 순서에 영향받지 않는다", () => {
    const document: JsonObject = { title: "안녕", tags: ["b", "a"], count: 2 };
    expect(canonicalizeProjection({ state: "present", document })).toBe(
      '{"document":{"count":2,"tags":["b","a"],"title":"안녕"},"state":"present"}',
    );
    expect(computeProjectionHash({ state: "present", document })).toBe(PRESENT_HASH);
    expect(
      computeProjectionHash({
        document: { count: 2, tags: ["b", "a"], title: "안녕" },
        state: "present",
      }),
    ).toBe(PRESENT_HASH);
  });

  it.each<[string, Projection<JsonObject>, string]>([
    [
      "deleted에 document가 붙은 결과",
      forgeProjection({ state: "deleted", document: {} }),
      "invalid_projection",
    ],
    ["알 수 없는 상태", forgeProjection({ state: "gone" }), "invalid_projection"],
    [
      "present에 다른 키가 붙은 결과",
      forgeProjection({ state: "present", document: {}, extra: 1 }),
      "invalid_projection",
    ],
    ["null 결과", forgeProjection(null), "invalid_projection"],
    ["배열 document", forgeProjection({ state: "present", document: [] }), "document_not_object"],
    [
      "Date document",
      forgeProjection({ state: "present", document: new Date(0) }),
      "document_not_object",
    ],
  ])("%s는 SearchProjectionError", (_label, projection, reason) => {
    const error = captureSearchError(() => computeProjectionHash(projection));
    expect(error).toBeInstanceOf(SearchProjectionError);
    expect(error.details).toEqual({ reason });
  });

  it("문서 안의 JSON이 아닌 값은 경로와 함께 SearchProjectionError", () => {
    const error = captureSearchError(() =>
      computeProjectionHash(forgeProjection({ state: "present", document: { body: undefined } })),
    );
    expect(error).toBeInstanceOf(SearchProjectionError);
    expect(error.details).toEqual({ reason: "undefined", path: "/document/body" });
  });

  it("문서 최상위의 symbol 키는 document_not_object가 아니라 symbol_key로 알림", () => {
    const error = captureSearchError(() =>
      computeProjectionHash(
        forgeProjection({ state: "present", document: { a: 1, [Symbol("k")]: 2 } }),
      ),
    );
    expect(error).toBeInstanceOf(SearchProjectionError);
    expect(error.details).toEqual({ reason: "symbol_key", path: "/document" });
  });
});

function sparseArray(length: number): JsonValue[] {
  const holes: JsonValue[] = [];
  holes.length = length;
  return holes;
}
