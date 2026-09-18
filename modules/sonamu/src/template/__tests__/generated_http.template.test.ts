import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type ExtendedApi } from "../../api/decorators";
import { Template__generated_http } from "../implementations/generated_http.template";

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
