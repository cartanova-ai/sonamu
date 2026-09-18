import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type ExtendedApi } from "../../api/decorators";
import { Template__generated_http } from "../implementations/generated_http.template";

function createApi(parameters: ExtendedApi["parameters"]): ExtendedApi {
  return {
    modelName: "SearchModel",
    methodName: "findMany",
    path: "/search/findMany",
    options: { httpMethod: "GET" },
    typeParameters: [],
    parameters,
    returnType: "unknown",
  };
}

interface EmailPatternHandle {
  originalPattern: RegExp;
  replace(pattern: RegExp): void;
  restore(): void;
}

/* oxlint-disable anti-slop/no-reflect-get, anti-slop/no-runtime-typeof -- 이 회귀 테스트는 비공개 타입을 단언하지 않고 지원되는 두 가지 Zod 정의 형태를 의도적으로 검사합니다. */
function getEmailPattern(schema: z.ZodType): EmailPatternHandle {
  const directPattern = Reflect.get(schema.def, "pattern");
  if (directPattern instanceof RegExp) {
    return {
      originalPattern: directPattern,
      replace(pattern) {
        Reflect.set(schema.def, "pattern", pattern);
      },
      restore() {
        Reflect.set(schema.def, "pattern", directPattern);
      },
    };
  }

  const checks = Reflect.get(schema.def, "checks");
  if (Array.isArray(checks)) {
    for (const check of checks) {
      if (typeof check !== "object" || check === null) {
        continue;
      }
      const definition = Reflect.get(check, "def");
      if (typeof definition !== "object" || definition === null) {
        continue;
      }
      const pattern = Reflect.get(definition, "pattern");
      if (pattern instanceof RegExp) {
        return {
          originalPattern: pattern,
          replace(replacement) {
            Reflect.set(definition, "pattern", replacement);
          },
          restore() {
            Reflect.set(definition, "pattern", pattern);
          },
        };
      }
    }
  }

  throw new Error("email pattern not found");
}
/* oxlint-enable anti-slop/no-reflect-get, anti-slop/no-runtime-typeof */

describe("Template__generated_http GET 쿼리 변환", () => {
  const template = new Template__generated_http();

  it("대괄호 키는 보존하고 값만 RFC3986로 인코딩한다", () => {
    const value = "&=?#% 한글\n끝";

    expect(
      template.stringifyQueryParams({
        rawParams: { num: value },
        ids: [value],
      }),
    ).toBe(
      "rawParams[num]=%26%3D%3F%23%25%20%ED%95%9C%EA%B8%80%0A%EB%81%9D\n" +
        "\t&ids[0]=%26%3D%3F%23%25%20%ED%95%9C%EA%B8%80%0A%EB%81%9D",
    );
  });
});

describe("Template__generated_http 요청 기본값 변환", () => {
  const template = new Template__generated_http();

  it("숫자 스키마의 기본값 대신 기존 숫자 예시 값 0을 사용한다", () => {
    expect(template.zodTypeToReqDefault(z.number().default(20), "limit")).toBe(0);
  });

  it("날짜 스키마의 기본값 대신 기존 날짜 예시 값을 사용한다", () => {
    const defaultDate = new Date("2024-01-02T03:04:05.000Z");

    expect(template.zodTypeToReqDefault(z.date().default(defaultDate), "created_at")).toBe(
      "2000-01-01",
    );
  });

  it("팩토리 기본값을 호출하지 않고 기존 문자열 예시 값을 사용한다", () => {
    let calls = 0;
    const schema = z.string().default(() => {
      calls += 1;
      return "실행된 기본값";
    });

    const result = template.zodTypeToReqDefault(schema, "keyword");

    expect(calls).toBe(0);
    expect(result).toBe("KEYWORD");
  });

  it("기본값이 없는 숫자 스키마는 기존 예시 값 0을 유지한다", () => {
    expect(template.zodTypeToReqDefault(z.number(), "limit")).toBe(0);
  });

  it("API 매개변수 메타데이터의 숫자 기본값을 요청 기본값으로 반영한다", () => {
    const api = {
      modelName: "SearchModel",
      methodName: "findMany",
      path: "/search/findMany",
      options: { httpMethod: "GET" },
      typeParameters: [],
      parameters: [
        { name: "key", type: "string", optional: false },
        { name: "limit", type: "number", optional: true, defaultDef: "20" },
      ],
      returnType: "unknown",
    } satisfies ExtendedApi;

    expect(template.resolveApiParams(api, {})).toEqual({ key: "KEY", limit: 20 });
  });

  it("이스케이프된 작은따옴표 문자열 기본값을 조리된 값으로 반영한다", () => {
    const api = {
      modelName: "SearchModel",
      methodName: "findMany",
      path: "/search/findMany",
      options: { httpMethod: "GET" },
      typeParameters: [],
      parameters: [
        {
          name: "keyword",
          type: "string",
          optional: true,
          defaultDef: "'can\\'t\\nstop'",
        },
      ],
      returnType: "unknown",
    } satisfies ExtendedApi;

    expect(template.resolveApiParams(api, {})).toEqual({ keyword: "can't\nstop" });
  });

  it("API 문자열 기본값의 치환 없는 템플릿 리터럴을 요청 기본값으로 반영한다", () => {
    const api = {
      modelName: "SearchModel",
      methodName: "findMany",
      path: "/search/findMany",
      options: { httpMethod: "GET" },
      typeParameters: [],
      parameters: [{ name: "keyword", type: "string", optional: true, defaultDef: "`default`" }],
      returnType: "unknown",
    } satisfies ExtendedApi;

    expect(template.resolveApiParams(api, {})).toEqual({ keyword: "default" });
  });

  it("부호가 있는 숫자 구분자 기본값을 숫자로 반영한다", () => {
    const api = {
      modelName: "SearchModel",
      methodName: "findMany",
      path: "/search/findMany",
      options: { httpMethod: "GET" },
      typeParameters: [],
      parameters: [
        { name: "minimum", type: "number", optional: true, defaultDef: "-1_000" },
        { name: "maximum", type: "number", optional: true, defaultDef: "+42" },
      ],
      returnType: "unknown",
    } satisfies ExtendedApi;

    expect(template.resolveApiParams(api, {})).toEqual({ minimum: -1000, maximum: 42 });
  });

  it("잘못된 숫자 구분자 기본값은 숫자 타입 예시 값으로 대체한다", () => {
    const api = {
      modelName: "SearchModel",
      methodName: "findMany",
      path: "/search/findMany",
      options: { httpMethod: "GET" },
      typeParameters: [],
      parameters: [{ name: "limit", type: "number", optional: true, defaultDef: "1__0" }],
      returnType: "unknown",
    } satisfies ExtendedApi;

    expect(template.resolveApiParams(api, {})).toEqual({ limit: 0 });
  });

  it("문장이 삽입된 문자열 기본값을 실행하지 않고 문자열 타입 예시 값으로 대체한다", () => {
    let calls = 0;
    const previousFactory = Object.getOwnPropertyDescriptor(globalThis, "factory");
    Object.defineProperty(globalThis, "factory", {
      configurable: true,
      value: () => {
        calls += 1;
      },
    });
    const api = {
      modelName: "SearchModel",
      methodName: "findMany",
      path: "/search/findMany",
      options: { httpMethod: "GET" },
      typeParameters: [],
      parameters: [
        {
          name: "keyword",
          type: "string",
          optional: true,
          defaultDef: "'safe'; factory()",
        },
      ],
      returnType: "unknown",
    } satisfies ExtendedApi;

    try {
      expect(template.resolveApiParams(api, {})).toEqual({ keyword: "KEYWORD" });
      expect(calls).toBe(0);
    } finally {
      if (previousFactory === undefined) {
        Reflect.deleteProperty(globalThis, "factory");
      } else {
        Object.defineProperty(globalThis, "factory", previousFactory);
      }
    }
  });

  it("기존 JSON 불리언과 null 리터럴 기본값을 계속 반영한다", () => {
    const api = {
      modelName: "SearchModel",
      methodName: "findMany",
      path: "/search/findMany",
      options: { httpMethod: "GET" },
      typeParameters: [],
      parameters: [
        { name: "enabled", type: "boolean", optional: true, defaultDef: "true" },
        {
          name: "keyword",
          type: { t: "union", types: ["string", "null"] },
          optional: true,
          defaultDef: "null",
        },
      ],
      returnType: "unknown",
    } satisfies ExtendedApi;

    expect(template.resolveApiParams(api, {})).toEqual({ enabled: true, keyword: null });
  });

  it("실행 가능한 기본값 표현식을 실행하지 않고 타입 기반 예시 값으로 대체한다", () => {
    let calls = 0;
    const previousFactory = Object.getOwnPropertyDescriptor(globalThis, "factory");
    Object.defineProperty(globalThis, "factory", {
      configurable: true,
      value: () => {
        calls += 1;
        return "실행된 기본값";
      },
    });
    const api = {
      modelName: "SearchModel",
      methodName: "findMany",
      path: "/search/findMany",
      options: { httpMethod: "GET" },
      typeParameters: [],
      parameters: [
        { name: "executable", type: "string", optional: true, defaultDef: "factory()" },
        {
          name: "interpolated",
          type: "string",
          optional: true,
          defaultDef: "`prefix-${factory()}`",
        },
      ],
      returnType: "unknown",
    } satisfies ExtendedApi;

    try {
      expect(template.resolveApiParams(api, {})).toEqual({
        executable: "EXECUTABLE",
        interpolated: "INTERPOLATED",
      });
      expect(calls).toBe(0);
    } finally {
      if (previousFactory === undefined) {
        Reflect.deleteProperty(globalThis, "factory");
      } else {
        Object.defineProperty(globalThis, "factory", previousFactory);
      }
    }
  });

  it("API 객체 기본값을 검사할 때 중첩 기본값 팩토리를 실행하지 않는다", () => {
    let calls = 0;
    const optionsSchema = z.object({
      nonce: z.string().default(() => {
        calls += 1;
        return `실행된-기본값-${calls}`;
      }),
    });
    const api = {
      modelName: "SearchModel",
      methodName: "findMany",
      path: "/search/findMany",
      options: { httpMethod: "GET" },
      typeParameters: [],
      parameters: [
        {
          name: "options",
          type: { t: "ref", id: "SearchOptions" },
          optional: true,
          defaultDef: "{}",
        },
      ],
      returnType: "unknown",
    } satisfies ExtendedApi;

    const firstResult = template.resolveApiParams(api, { SearchOptions: optionsSchema });
    const secondResult = template.resolveApiParams(api, { SearchOptions: optionsSchema });

    expect(firstResult).toEqual({ options: { nonce: "NONCE" } });
    expect(secondResult).toEqual(firstResult);
    expect(calls).toBe(0);
  });

  it("API 문자열 기본값을 검사할 때 참조 스키마의 변환을 실행하지 않는다", () => {
    let calls = 0;
    const keywordSchema = z.string().transform((value) => {
      calls += 1;
      return value.toUpperCase();
    });
    const api = {
      modelName: "SearchModel",
      methodName: "findMany",
      path: "/search/findMany",
      options: { httpMethod: "GET" },
      typeParameters: [],
      parameters: [
        {
          name: "keyword",
          type: { t: "ref", id: "SearchKeyword" },
          optional: false,
          defaultDef: '"metadata-default"',
        },
      ],
      returnType: "unknown",
    } satisfies ExtendedApi;

    const firstResult = template.resolveApiParams(api, { SearchKeyword: keywordSchema });
    const secondResult = template.resolveApiParams(api, { SearchKeyword: keywordSchema });

    expect(firstResult).toEqual({ keyword: "unknown-pipe" });
    expect(secondResult).toEqual(firstResult);
    expect(calls).toBe(0);
  });
});

describe("Template__generated_http 직접 타입 기본값", () => {
  const template = new Template__generated_http();

  it("요청에서 제외된 선택적 내부 매개변수는 기본값 메타데이터로 다시 추가하지 않는다", () => {
    const api = createApi([
      { name: "visible", type: "string", optional: false },
      {
        name: "_internal",
        type: "string",
        optional: true,
        defaultDef: '"internal-default"',
      },
    ]);

    expect(template.resolveApiParams(api, {})).toEqual({ visible: "VISIBLE" });
  });

  it("직접 원시·리터럴·재귀 유니온 타입에 비 null 기본값을 반영한다", () => {
    const api = createApi([
      { name: "keyword", type: "string", optional: false, defaultDef: '"metadata-keyword"' },
      { name: "count", type: "number", optional: false, defaultDef: "7" },
      { name: "enabled", type: "boolean", optional: false, defaultDef: "true" },
      {
        name: "kind",
        type: { t: "string-literal", value: "fixed" },
        optional: false,
        defaultDef: '"fixed"',
      },
      {
        name: "level",
        type: { t: "numeric-literal", value: 2 },
        optional: false,
        defaultDef: "2",
      },
      {
        name: "nested",
        type: {
          t: "union",
          types: [
            "boolean",
            {
              t: "union",
              types: ["number", { t: "string-literal", value: "recursive" }],
            },
          ],
        },
        optional: false,
        defaultDef: '"recursive"',
      },
    ]);

    expect(template.resolveApiParams(api, {})).toEqual({
      keyword: "metadata-keyword",
      count: 7,
      enabled: true,
      kind: "fixed",
      level: 2,
      nested: "recursive",
    });
  });

  it("nullable 재귀 유니온은 비 null 기본값을 반영하고 null 기본값은 기존 예시를 유지한다", () => {
    const api = createApi([
      {
        name: "keyword",
        type: { t: "union", types: ["string", "null"] },
        optional: true,
        defaultDef: '"declared-string"',
      },
      {
        name: "nested",
        type: {
          t: "union",
          types: ["number", { t: "union", types: ["null", "string"] }],
        },
        optional: true,
        defaultDef: '"declared-nested"',
      },
      {
        name: "baselineNull",
        type: { t: "union", types: ["string", "null"] },
        optional: true,
        defaultDef: "null",
      },
    ]);

    expect(template.resolveApiParams(api, {})).toEqual({
      keyword: "declared-string",
      nested: "declared-nested",
      baselineNull: null,
    });
  });

  it("잘못된 직접 원시 기본값은 예시로 대체하고 전역 오류 콜백을 추가 호출하지 않는다", () => {
    const config = z.config();
    const originalCustomErrorDescriptor = Object.getOwnPropertyDescriptor(config, "customError");
    const originalOwnKeys = Reflect.ownKeys(config);
    let calls = 0;
    const baselineApi = createApi([{ name: "count", type: "number", optional: false }]);
    const metadataApi = createApi([
      { name: "count", type: "number", optional: false, defaultDef: '"not-a-number"' },
    ]);

    z.config({
      customError: () => {
        calls += 1;
        return "전역 오류 콜백이 실행됨";
      },
    });

    try {
      template.resolveApiParams(baselineApi, {});
      const baselineCalls = calls;
      calls = 0;

      expect(template.resolveApiParams(metadataApi, {})).toEqual({ count: 0 });
      expect(calls).toBe(baselineCalls);
    } finally {
      // 전역 Zod 설정을 수정 전의 own-property 형태 그대로 복원한다.
      if (originalCustomErrorDescriptor === undefined) {
        Reflect.deleteProperty(config, "customError");
      } else {
        Object.defineProperty(config, "customError", originalCustomErrorDescriptor);
      }
    }

    expect(Reflect.ownKeys(config)).toEqual(originalOwnKeys);
  });
});

describe("Template__generated_http 참조 스키마 기본값", () => {
  const template = new Template__generated_http();

  it("원시 참조는 같은 타입의 메타데이터 기본값을 반영하고 다른 타입은 예시를 유지한다", () => {
    const api = createApi([
      {
        name: "validString",
        type: { t: "ref", id: "StringValue" },
        optional: false,
        defaultDef: '"metadata-string"',
      },
      {
        name: "invalidString",
        type: { t: "ref", id: "StringValue" },
        optional: false,
        defaultDef: "1",
      },
      {
        name: "validNumber",
        type: { t: "ref", id: "NumberValue" },
        optional: false,
        defaultDef: "7",
      },
      {
        name: "invalidNumber",
        type: { t: "ref", id: "NumberValue" },
        optional: false,
        defaultDef: "true",
      },
      {
        name: "validBoolean",
        type: { t: "ref", id: "BooleanValue" },
        optional: false,
        defaultDef: "true",
      },
      {
        name: "invalidBoolean",
        type: { t: "ref", id: "BooleanValue" },
        optional: false,
        defaultDef: '"true"',
      },
    ]);

    expect(
      template.resolveApiParams(api, {
        StringValue: z.string(),
        NumberValue: z.number(),
        BooleanValue: z.boolean(),
      }),
    ).toEqual({
      validString: "metadata-string",
      invalidString: "INVALIDSTRING",
      validNumber: 7,
      invalidNumber: 0,
      validBoolean: true,
      invalidBoolean: false,
    });
  });

  it("안전한 문자열 래퍼는 비 null 메타데이터 기본값을 반영하고 null은 기존 예시를 유지한다", () => {
    let defaultFactoryCalls = 0;
    const api = createApi([
      {
        name: "defaulted",
        type: { t: "ref", id: "Defaulted" },
        optional: false,
        defaultDef: '"metadata-default"',
      },
      {
        name: "optional",
        type: { t: "ref", id: "Optional" },
        optional: true,
        defaultDef: '"metadata-optional"',
      },
      {
        name: "nullable",
        type: { t: "ref", id: "Nullable" },
        optional: true,
        defaultDef: '"metadata-nullable"',
      },
      {
        name: "nullBaseline",
        type: { t: "ref", id: "Nullable" },
        optional: true,
        defaultDef: "null",
      },
    ]);

    expect(
      template.resolveApiParams(api, {
        Defaulted: z.string().default(() => {
          defaultFactoryCalls += 1;
          return "factory-default";
        }),
        Optional: z.string().optional(),
        Nullable: z.string().nullable(),
      }),
    ).toEqual({
      defaulted: "metadata-default",
      optional: "metadata-optional",
      nullable: "metadata-nullable",
      nullBaseline: null,
    });
    expect(defaultFactoryCalls).toBe(0);
  });

  it("refine 검사가 있는 enum·literal은 안전 복제를 거부하고 콜백 없이 기존 예시를 유지한다", () => {
    const calls = { enum: 0, literal: 0 };
    const api = createApi([
      {
        name: "status",
        type: { t: "ref", id: "Status" },
        optional: false,
        defaultDef: '"inactive"',
      },
      {
        name: "fixed",
        type: { t: "ref", id: "Fixed" },
        optional: false,
        defaultDef: '"fixed"',
      },
    ]);

    expect(
      template.resolveApiParams(api, {
        Status: z.enum(["active", "inactive"]).refine(() => {
          calls.enum += 1;
          return true;
        }),
        Fixed: z.literal("fixed").refine(() => {
          calls.literal += 1;
          return true;
        }),
      }),
    ).toEqual({ status: "active", fixed: "fixed" });
    expect(calls).toEqual({ enum: 0, literal: 0 });
  });

  it("안전한 enum은 유효한 기본값을 반영하고 잘못된 기본값은 첫 번째 예시로 대체한다", () => {
    const api = createApi([
      {
        name: "validStatus",
        type: { t: "ref", id: "Status" },
        optional: false,
        defaultDef: '"inactive"',
      },
      {
        name: "invalidStatus",
        type: { t: "ref", id: "Status" },
        optional: false,
        defaultDef: '"paused"',
      },
    ]);

    expect(template.resolveApiParams(api, { Status: z.enum(["active", "inactive"]) })).toEqual({
      validStatus: "inactive",
      invalidStatus: "active",
    });
  });

  it("안전한 literal은 일치하거나 불일치하는 기본값에도 고정 예시를 유지한다", () => {
    const api = createApi([
      {
        name: "matching",
        type: { t: "ref", id: "Fixed" },
        optional: false,
        defaultDef: '"fixed"',
      },
      {
        name: "mismatching",
        type: { t: "ref", id: "Fixed" },
        optional: false,
        defaultDef: '"other"',
      },
    ]);

    expect(template.resolveApiParams(api, { Fixed: z.literal("fixed") })).toEqual({
      matching: "fixed",
      mismatching: "fixed",
    });
  });

  it("z.email()과 z.string().email()은 유효한 기본값만 반영하고 원본 패턴을 실행하지 않는다", () => {
    const standaloneEmail = z.email();
    const stringEmail = z.string().email();
    const standalonePattern = getEmailPattern(standaloneEmail);
    const stringPattern = getEmailPattern(stringEmail);
    const standalonePatternClone = new RegExp(
      standalonePattern.originalPattern.source,
      standalonePattern.originalPattern.flags,
    );
    const stringPatternClone = new RegExp(
      stringPattern.originalPattern.source,
      stringPattern.originalPattern.flags,
    );
    const calls = { standalone: 0, string: 0 };

    standalonePatternClone.test = () => {
      calls.standalone += 1;
      return true;
    };
    stringPatternClone.test = () => {
      calls.string += 1;
      return true;
    };

    const api = createApi([
      {
        name: "validStandalone",
        type: { t: "ref", id: "StandaloneEmail" },
        optional: false,
        defaultDef: '"valid@example.com"',
      },
      {
        name: "invalidStandalone",
        type: { t: "ref", id: "StandaloneEmail" },
        optional: false,
        defaultDef: '"not-an-email"',
      },
      {
        name: "validStringEmail",
        type: { t: "ref", id: "StringEmail" },
        optional: false,
        defaultDef: '"valid@example.com"',
      },
      {
        name: "invalidStringEmail",
        type: { t: "ref", id: "StringEmail" },
        optional: false,
        defaultDef: '"not-an-email"',
      },
    ]);

    try {
      standalonePattern.replace(standalonePatternClone);
      stringPattern.replace(stringPatternClone);

      expect(
        template.resolveApiParams(api, {
          StandaloneEmail: standaloneEmail,
          StringEmail: stringEmail,
        }),
      ).toEqual({
        validStandalone: "valid@example.com",
        invalidStandalone: "INVALIDSTANDALONE",
        validStringEmail: "valid@example.com",
        invalidStringEmail: "INVALIDSTRINGEMAIL",
      });
      expect(calls).toEqual({ standalone: 0, string: 0 });
    } finally {
      standalonePattern.restore();
      stringPattern.restore();
    }

    expect(getEmailPattern(standaloneEmail).originalPattern).toBe(
      standalonePattern.originalPattern,
    );
    expect(getEmailPattern(stringEmail).originalPattern).toBe(stringPattern.originalPattern);
    expect(z.email().safeParse("not-an-email").success).toBe(false);
    expect(z.string().email().safeParse("not-an-email").success).toBe(false);
  });

  it("z.string().min(3).max(5)는 길이 범위 안의 기본값만 반영한다", () => {
    const api = createApi([
      {
        name: "validLength",
        type: { t: "ref", id: "BoundedString" },
        optional: false,
        defaultDef: '"four"',
      },
      {
        name: "belowMinimum",
        type: { t: "ref", id: "BoundedString" },
        optional: false,
        defaultDef: '"no"',
      },
      {
        name: "aboveMaximum",
        type: { t: "ref", id: "BoundedString" },
        optional: false,
        defaultDef: '"lengthy"',
      },
    ]);

    expect(template.resolveApiParams(api, { BoundedString: z.string().min(3).max(5) })).toEqual({
      validLength: "four",
      belowMinimum: "BELOWMINIMUM",
      aboveMaximum: "ABOVEMAXIMUM",
    });
  });

  it("z.number().int().min(1).max(5)는 범위 안의 정수 기본값만 반영한다", () => {
    const api = createApi([
      {
        name: "validInteger",
        type: { t: "ref", id: "BoundedInteger" },
        optional: false,
        defaultDef: "3",
      },
      {
        name: "fractional",
        type: { t: "ref", id: "BoundedInteger" },
        optional: false,
        defaultDef: "1.5",
      },
      {
        name: "belowMinimum",
        type: { t: "ref", id: "BoundedInteger" },
        optional: false,
        defaultDef: "0",
      },
      {
        name: "aboveMaximum",
        type: { t: "ref", id: "BoundedInteger" },
        optional: false,
        defaultDef: "6",
      },
    ]);

    expect(
      template.resolveApiParams(api, { BoundedInteger: z.number().int().min(1).max(5) }),
    ).toEqual({
      validInteger: 3,
      fractional: 1,
      belowMinimum: 1,
      aboveMaximum: 1,
    });
  });

  it("참조 스키마 콜백을 실행하거나 메타데이터 기본값으로 예시를 덮어쓰지 않는다", () => {
    const calls = { refine: 0, custom: 0, transform: 0 };
    const api = createApi([
      {
        name: "refined",
        type: { t: "ref", id: "Refined" },
        optional: false,
        defaultDef: '"invalid"',
      },
      {
        name: "custom",
        type: { t: "ref", id: "Custom" },
        optional: false,
        defaultDef: '"metadata-custom"',
      },
      {
        name: "transformed",
        type: { t: "ref", id: "Transformed" },
        optional: false,
        defaultDef: '"metadata-transform"',
      },
    ]);

    expect(
      template.resolveApiParams(api, {
        Refined: z.string().refine((value) => {
          calls.refine += 1;
          return value === "allowed";
        }),
        Custom: z.stringFormat("custom-predicate", () => {
          calls.custom += 1;
          return true;
        }),
        Transformed: z.string().transform((value) => {
          calls.transform += 1;
          return value.toUpperCase();
        }),
      }),
    ).toEqual({
      refined: "REFINED",
      custom: "CUSTOM",
      transformed: "unknown-pipe",
    });
    expect(calls).toEqual({ refine: 0, custom: 0, transform: 0 });
  });
});
