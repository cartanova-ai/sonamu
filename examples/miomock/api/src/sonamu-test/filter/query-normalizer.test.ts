import { normalizeFilterQuery } from "sonamu/filter";
import { describe, expect, test } from "vitest";

describe("Query Normalizer", () => {
  test("단일 필터 정규화 - 직접 값", () => {
    const result = normalizeFilterQuery({ status: "active" });
    expect(result).toEqual({ status: "active" });
  });

  test("단일 필터 정규화 - 연산자", () => {
    const result = normalizeFilterQuery({ budget: { gt: "10000" } });
    expect(result).toEqual({ budget: { gt: 10000 } });
  });

  test("여러 필터 정규화", () => {
    const result = normalizeFilterQuery({ status: "active", budget: { gt: "10000" } });
    expect(result).toEqual({ status: "active", budget: { gt: 10000 } });
  });

  test("배열 연산자 - in", () => {
    const result = normalizeFilterQuery({ status: { in: ["active", "pending", "completed"] } });
    expect(result).toEqual({ status: { in: ["active", "pending", "completed"] } });
  });

  test("between 연산자", () => {
    const result = normalizeFilterQuery({ budget: { between: ["1000", "5000"] } });
    expect(result).toEqual({ budget: { between: [1000, 5000] } });
  });

  test("타입 자동 변환 - number", () => {
    const result = normalizeFilterQuery({ id: { eq: "123" } });
    expect(result.id).toEqual({ eq: 123 });
  });

  test("타입 자동 변환 - boolean", () => {
    const result = normalizeFilterQuery({ active: { eq: "true" } });
    expect(result.active).toEqual({ eq: true });
  });

  test("NULL 처리", () => {
    const result = normalizeFilterQuery({ value: { eq: "null" } });
    expect(result.value).toEqual({ eq: null });
  });

  test("빈 객체 처리", () => {
    const result = normalizeFilterQuery({});
    expect(result).toEqual({});
  });

  test("undefined/null 필드 제외", () => {
    const result = normalizeFilterQuery({ status: "active", budget: undefined, name: null });
    expect(result).toEqual({ status: "active" });
  });
});
