import { describe, expect, it } from "vitest";

import {
  assertDocumentId,
  assertLogicalKey,
  assertNamespace,
  assertPhysicalIndexName,
  assertSchemaName,
  assertTargetId,
  assertWriteAliasName,
  buildPhysicalIndexName,
  buildWriteAliasName,
  DEFAULT_SEARCH_SCHEMA,
  MAX_DOCUMENT_ID_BYTES,
  utf8ByteLength,
} from "../../src/definition/names";
import { SearchConfigurationError, SearchInvalidDocumentId } from "../../src/errors";

const TARGET_ID = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";
const COMPACT_TARGET_ID = "0f1e2d3c4b5a49688776a5b4c3d2e1f0";
const NAME_63 = `a${"b".repeat(62)}`;

describe("스키마 이름", () => {
  it("기본 스키마와 소문자 식별자를 받는다", () => {
    expect(assertSchemaName(DEFAULT_SEARCH_SCHEMA)).toBe("sonamu_search");
    expect(assertSchemaName("_search")).toBe("_search");
    expect(assertSchemaName(`s${"x".repeat(62)}`)).toHaveLength(63);
  });

  it.each([
    ["빈 문자열", ""],
    ["대문자", "Search"],
    ["숫자로 시작", "1search"],
    ["따옴표", 'a"b'],
    ["63바이트 초과", `s${"x".repeat(63)}`],
  ])("%s는 SearchConfigurationError로 거부한다", (_label, schema) => {
    expect(() => assertSchemaName(schema)).toThrow(SearchConfigurationError);
  });

  it.each(["public", "pg_search"])("예약 스키마 %s는 거부한다", (schema) => {
    let caught: SearchConfigurationError | undefined;
    try {
      assertSchemaName(schema);
    } catch (error) {
      if (error instanceof SearchConfigurationError) caught = error;
    }
    expect(caught?.messageKey).toBe("names.reservedSchema");
    expect(caught?.messageParams).toEqual({ name: schema });
  });
});

describe("namespace와 logical key", () => {
  it("소문자, 숫자, 하이픈으로 된 63자 이하 이름을 받는다", () => {
    for (const assert of [assertNamespace, assertLogicalKey]) {
      expect(assert("medpath-production")).toBe("medpath-production");
      expect(assert("0")).toBe("0");
      expect(assert(NAME_63)).toBe(NAME_63);
    }
  });

  it.each([
    ["빈 문자열", ""],
    ["하이픈으로 시작", "-chat"],
    ["대문자", "Chat"],
    ["64자", `${NAME_63}c`],
    ["와일드카드", "chat*"],
  ])("%s는 거부한다", (_label, value) => {
    expect(() => assertNamespace(value)).toThrow(SearchConfigurationError);
    expect(() => assertLogicalKey(value)).toThrow(SearchConfigurationError);
  });

  it("오류 메시지에 긴 이름을 그대로 다 싣지 않는다", () => {
    const long = "X".repeat(5_000);
    let caught: SearchConfigurationError | undefined;
    try {
      assertNamespace(long);
    } catch (error) {
      if (error instanceof SearchConfigurationError) caught = error;
    }
    expect(caught?.messageKey).toBe("names.invalidNamespace");
    expect(caught?.messageParams).toEqual({ name: `${"X".repeat(80)}…` });
    expect(caught?.message.length).toBeLessThan(300);
    expect(caught?.localize("ko").length).toBeLessThan(300);
  });
});

describe("대상 ID", () => {
  it("소문자 표준 UUID만 받는다", () => {
    expect(assertTargetId(TARGET_ID)).toBe(TARGET_ID);
    expect(() => assertTargetId(TARGET_ID.toUpperCase())).toThrow(SearchConfigurationError);
    expect(() => assertTargetId(COMPACT_TARGET_ID)).toThrow(SearchConfigurationError);
    expect(() => assertTargetId(`{${TARGET_ID}}`)).toThrow(SearchConfigurationError);
  });
});

describe("물리 인덱스와 쓰기 alias", () => {
  it("namespace, logical key, 대상 UUID에서 이름을 만든다", () => {
    const physical = buildPhysicalIndexName("medpath-prod", "chat-messages", TARGET_ID);
    expect(physical).toBe(`snm-medpath-prod-chat-messages-${COMPACT_TARGET_ID}`);
    expect(buildWriteAliasName(physical)).toBe(`${physical}-w`);
  });

  it("가장 긴 이름도 OpenSearch의 255바이트 상한 안에 들어간다", () => {
    const physical = buildPhysicalIndexName(NAME_63, NAME_63, TARGET_ID);
    const alias = buildWriteAliasName(physical);
    expect(utf8ByteLength(physical)).toBe(4 + 63 + 1 + 63 + 1 + 32);
    expect(utf8ByteLength(alias)).toBe(166);
    expect(utf8ByteLength(alias)).toBeLessThanOrEqual(255);
  });

  it("잘못된 구성 요소로는 이름을 만들지 않는다", () => {
    expect(() => buildPhysicalIndexName("Prod", "chat", TARGET_ID)).toThrow(
      SearchConfigurationError,
    );
    expect(() => buildPhysicalIndexName("prod", "chat_messages", TARGET_ID)).toThrow(
      SearchConfigurationError,
    );
    expect(() => buildPhysicalIndexName("prod", "chat", "not-a-uuid")).toThrow(
      SearchConfigurationError,
    );
  });

  it("물리 인덱스 이름과 alias 이름은 서로의 형식에 맞지 않는다", () => {
    const physical = buildPhysicalIndexName("prod", "chat", TARGET_ID);
    const alias = buildWriteAliasName(physical);
    expect(assertPhysicalIndexName(physical)).toBe(physical);
    expect(assertWriteAliasName(alias)).toBe(alias);
    expect(() => assertPhysicalIndexName(alias)).toThrow(SearchConfigurationError);
    expect(() => assertWriteAliasName(physical)).toThrow(SearchConfigurationError);
    expect(() => buildWriteAliasName(alias)).toThrow(SearchConfigurationError);
  });

  it.each([
    ["접두사 없음", `prod-chat-${COMPACT_TARGET_ID}`],
    ["짧은 UUID", "snm-prod-chat-0f1e2d3c"],
    ["대문자 UUID", `snm-prod-chat-${COMPACT_TARGET_ID.toUpperCase()}`],
    ["와일드카드", "snm-*"],
    ["255바이트 초과", `snm-${"a".repeat(300)}-chat-${COMPACT_TARGET_ID}`],
  ])("%s인 물리 인덱스 이름은 거부한다", (_label, name) => {
    expect(() => assertPhysicalIndexName(name)).toThrow(SearchConfigurationError);
  });
});

describe("문서 ID", () => {
  it("UTF-8 512바이트까지 받는다", () => {
    expect(assertDocumentId("a".repeat(MAX_DOCUMENT_ID_BYTES))).toHaveLength(512);
    expect(utf8ByteLength("가".repeat(170))).toBe(510);
    expect(assertDocumentId("가".repeat(170))).toHaveLength(170);
    expect(assertDocumentId("😀".repeat(128))).toHaveLength(256);
  });

  it("문자 수가 아니라 UTF-8 바이트 수로 상한을 잰다", () => {
    expect(() => assertDocumentId("a".repeat(513))).toThrow(SearchInvalidDocumentId);
    expect(() => assertDocumentId("가".repeat(171))).toThrow(SearchInvalidDocumentId);
    expect(() => assertDocumentId("😀".repeat(129))).toThrow(SearchInvalidDocumentId);
  });

  it("빈 ID, NUL, 짝이 맞지 않는 서로게이트는 거부한다", () => {
    expect(() => assertDocumentId("")).toThrow(SearchInvalidDocumentId);
    expect(() => assertDocumentId("a\u0000b")).toThrow(SearchInvalidDocumentId);
    expect(() => assertDocumentId("a\ud800b")).toThrow(SearchInvalidDocumentId);
    expect(() => assertDocumentId("\udc00")).toThrow(SearchInvalidDocumentId);
  });

  it("오류 메시지와 details에 ID 값을 싣지 않는다", () => {
    const secret = `환자-${"x".repeat(600)}`;
    let caught: SearchInvalidDocumentId | undefined;
    try {
      assertDocumentId(secret);
    } catch (error) {
      if (error instanceof SearchInvalidDocumentId) caught = error;
    }
    expect(caught?.code).toBe("SEARCH_INVALID_DOCUMENT_ID");
    expect(caught?.retryable).toBe(false);
    expect(caught?.messageKey).toBe("documentId.tooLong");
    expect(caught?.messageParams).toEqual({ bytes: utf8ByteLength(secret), maxBytes: 512 });
    expect(caught?.message).not.toContain("환자");
    expect(caught?.localize("ko")).not.toContain("환자");
    expect(caught?.details).toEqual({ bytes: utf8ByteLength(secret), maxBytes: 512 });
  });
});
