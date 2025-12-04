import { describe, expect, test } from "vitest";
import { wrapIf } from "../../../../../modules/sonamu/dist/utils/lodash-able";

describe("lodash-able", () => {
  describe("wrapIf", () => {
    describe("기본 동작", () => {
      test("조건이 true일 때 래핑된 문자열을 반환함", () => {
        const source = "test";
        const result = wrapIf(source, (str) => [true, `wrapped-${str}`]);

        // predicate가 [true, "wrapped-test"]를 반환하므로 래핑된 문자열 반환
        expect(result).toBe("wrapped-test");
      });

      test("조건이 false일 때 원본 문자열을 반환함", () => {
        const source = "test";
        const result = wrapIf(source, (str) => [false, `wrapped-${str}`]);

        // predicate가 [false, ...]를 반환하므로 원본 문자열 반환
        expect(result).toBe("test");
      });
    });

    describe("실제 사용 패턴: 상대 경로 정규화", () => {
      test(".으로 시작하지 않는 경로에 ./ 접두사를 추가함", () => {
        const path = "utils/helper";
        const result = wrapIf(path, (p) => [p.startsWith(".") === false, `./${p}`]);

        // 조건이 true이므로 ./ 접두사가 추가됨
        expect(result).toBe("./utils/helper");
      });

      test("이미 ./로 시작하는 경로는 변경하지 않음", () => {
        const path = "./utils/helper";
        const result = wrapIf(path, (p) => [p.startsWith(".") === false, `./${p}`]);

        // 조건이 false이므로 원본 그대로 반환됨
        expect(result).toBe("./utils/helper");
      });

      test("../로 시작하는 경로는 변경하지 않음", () => {
        const path = "../utils/helper";
        const result = wrapIf(path, (p) => [p.startsWith(".") === false, `./${p}`]);

        // 조건이 false이므로 원본 그대로 반환됨
        expect(result).toBe("../utils/helper");
      });

      test("빈 문자열은 ./ 접두사를 추가함", () => {
        const path = "";
        const result = wrapIf(path, (p) => [p.startsWith(".") === false, `./${p}`]);

        // 조건이 true이므로 ./ 접두사가 추가됨
        expect(result).toBe("./");
      });

      test("단일 파일명에 ./ 접두사를 추가함", () => {
        const path = "helper";
        const result = wrapIf(path, (p) => [p.startsWith(".") === false, `./${p}`]);

        // 조건이 true이므로 ./ 접두사가 추가됨
        expect(result).toBe("./helper");
      });
    });
  });
});
