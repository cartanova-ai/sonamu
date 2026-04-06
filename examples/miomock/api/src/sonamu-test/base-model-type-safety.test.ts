import type { EnhancerMap, RequiredEnhancerKeys } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expectTypeOf, vi } from "vitest";

import type {
  ProjectSubsetA,
  ProjectSubsetKey,
  ProjectSubsetMapping,
  ProjectSubsetP,
} from "../application/sonamu.generated";
import type { projectSubsetQueries } from "../application/sonamu.generated.sso";

bootstrap(vi);

/**
 * EnhancerMap 관련 타입 안전성 테스트
 */
describe("EnhancerMap Type Safety", () => {
  describe("EnhancerMap 타입 추론", () => {
    test("Enhancer 함수의 row 파라미터에 virtualQuery 키 포함", async () => {
      type MockComputedResults = {
        A: Omit<ProjectSubsetA, "virtual_test" | "virtual_query_test">;
        P: ProjectSubsetP;
      };

      type TestEnhancerMap = EnhancerMap<
        ProjectSubsetKey,
        MockComputedResults,
        ProjectSubsetMapping,
        typeof projectSubsetQueries
      >;

      // virtualQuery 키(virtual_query_test)는 appendSelect로 추가되므로
      // Enhancer의 row 파라미터에 포함되어야 함
      expectTypeOf<Parameters<TestEnhancerMap["A"]>[0]>().toHaveProperty("virtual_query_test");
      expectTypeOf<Parameters<TestEnhancerMap["A"]>[0]>().not.toHaveProperty("virtual_test");
    });

    test("Virtual Code가 존재하는 경우, Enhancer 필수", async () => {
      type MockComputedResults = {
        A: Omit<ProjectSubsetA, "virtual_test">;
        P: ProjectSubsetP;
      };

      type TestEnhancerMap = EnhancerMap<
        ProjectSubsetKey,
        MockComputedResults,
        ProjectSubsetMapping,
        typeof projectSubsetQueries
      >;

      type IsRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;

      expectTypeOf<IsRequired<TestEnhancerMap, "A">>().toEqualTypeOf(true);
      expectTypeOf<IsRequired<TestEnhancerMap, "P">>().toEqualTypeOf(false);
    });

    test("Virtual Query만 존재하는 경우, Enhancer 선택적", async () => {
      type MockComputedResults = {
        A: Omit<ProjectSubsetA, "virtual_query_test">;
        P: ProjectSubsetP;
      };

      type TestEnhancerMap = EnhancerMap<
        ProjectSubsetKey,
        MockComputedResults,
        ProjectSubsetMapping,
        typeof projectSubsetQueries
      >;

      type IsRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;

      expectTypeOf<IsRequired<TestEnhancerMap, "A">>().toEqualTypeOf(false);
      expectTypeOf<IsRequired<TestEnhancerMap, "P">>().toEqualTypeOf(false);
    });

    test("Virtual Code와 Virtual Query가 모두 존재하는 경우, Enhancer 필수", async () => {
      type MockComputedResults = {
        A: Omit<ProjectSubsetA, "virtual_test" | "virtual_query_test">;
        P: ProjectSubsetP;
      };

      type TestEnhancerMap = EnhancerMap<
        ProjectSubsetKey,
        MockComputedResults,
        ProjectSubsetMapping,
        typeof projectSubsetQueries
      >;

      type IsRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;

      expectTypeOf<IsRequired<TestEnhancerMap, "A">>().toEqualTypeOf(true);
      expectTypeOf<IsRequired<TestEnhancerMap, "P">>().toEqualTypeOf(false);
    });
  });

  describe("RequiredEnhancerKeys 타입 추론", () => {
    test("virtual 필드가 있는 subset은 Enhancer 필수", async () => {
      // ProjectSubsetA는 virtual_test 필드가 있어서 Enhancer 필수
      // ComputedResults에서 virtual_test가 없으면 RequiredKeys에 "A" 포함

      type MockComputedResults = {
        A: Omit<ProjectSubsetA, "virtual_test">; // virtual_test는 DB에서 안 옴
        P: ProjectSubsetP; // P는 모든 필드가 DB에서 옴
      };

      type RequiredKeys = RequiredEnhancerKeys<
        ProjectSubsetKey,
        MockComputedResults,
        ProjectSubsetMapping,
        typeof projectSubsetQueries
      >;

      // RequiredKeys가 "A"를 포함하는지 타입 레벨에서 검증
      // "A" extends RequiredKeys가 true면 "A"가 필수
      type AisRequired = "A" extends RequiredKeys ? true : false;
      expectTypeOf<AisRequired>().toEqualTypeOf(true);
    });

    test("모든 필드가 호환되면 Enhancer 선택적", async () => {
      // ComputedResults가 SubsetMapping과 완전히 동일한 경우
      type FullyCompatibleComputedResults = {
        A: ProjectSubsetA;
        P: ProjectSubsetP;
      };

      type RequiredKeys = RequiredEnhancerKeys<
        ProjectSubsetKey,
        FullyCompatibleComputedResults,
        ProjectSubsetMapping,
        typeof projectSubsetQueries
      >;

      // 모든 필드가 호환되므로 RequiredKeys는 never
      type IsNever = [RequiredKeys] extends [never] ? true : false;
      expectTypeOf<IsNever>().toEqualTypeOf(true);
    });
  });
});
