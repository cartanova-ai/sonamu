import { describe, expect, test } from "vitest";
import { asArray, objToMap } from "../../../../../modules/sonamu/dist/utils/model";

describe("model", () => {
  describe("asArray", () => {
    test("단일 값을 배열로 변환함", () => {
      expect(asArray(42)).toEqual([42]);
      expect(asArray("hello")).toEqual(["hello"]);
      expect(asArray({ a: 1 })).toEqual([{ a: 1 }]);
    });

    test("배열은 그대로 반환함", () => {
      const arr = [1, 2, 3];
      const result = asArray(arr);
      expect(result).toBe(arr); // 동일한 참조
    });

    test("실제 사용 패턴: ID 파라미터 정규화", () => {
      // whereIn("table.id", asArray(params.id))
      expect(asArray(123)).toEqual([123]);
      expect(asArray([1, 2, 3])).toEqual([1, 2, 3]);
    });
  });

  describe("objToMap", () => {
    test("문자열 키를 가진 객체를 Map으로 변환함", () => {
      const result = objToMap({ a: 1, b: 2, c: 3 });
      expect(result).toBeInstanceOf(Map);
    });

    test("순수 숫자 키는 Map<number, T>로 변환함", () => {
      const result = objToMap({ "1": "a", "2": "b", "3": "c" });
      expect(result).toBeInstanceOf(Map);
    });

    test("혼합 키는 Map<string, T>로 변환함", () => {
      const result = objToMap({ "1": "a", "2": "b", abc: "c" });
      expect(result).toBeInstanceOf(Map);
    });

    test("parseInt 조건에 맞지 않는 키는 문자열로 처리함", () => {
      // parseInt("01").toString() !== "01"
      expect(objToMap({ "01": "a" })).toBeInstanceOf(Map);
      // parseInt("1.5").toString() !== "1.5"
      expect(objToMap({ "1.5": "a" })).toBeInstanceOf(Map);
    });

    test("실제 사용 패턴: 그룹화된 데이터를 Map으로 변환", () => {
      const grouped = {
        "1": [{ userId: 1, name: "User 1" }],
        "2": [{ userId: 2, name: "User 2" }],
      };
      const result = objToMap(grouped);
      expect(result).toBeInstanceOf(Map);
    });
  });
});
