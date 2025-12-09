/** biome-ignore-all lint/suspicious/noExplicitAny: Puri의 타입은 개별 모델에서 확정되므로 BaseModel에서는 any를 허용함 */

/**
 * BaseModel 타입 시스템
 *
 * BaseModelClass에서 사용하는 타입 유틸리티들.
 * Enhancer, SubsetQuery 교집합 등 Model 계층에서 필요한 타입 정의.
 */

import type { DatabaseSchemaExtend } from "../types/types";
import type { Puri } from "./puri";
import type { PuriSubsetFn } from "./puri-subset.types";

// ============================================================================
// Puri 테이블 추출 유틸리티
// ============================================================================

/**
 * Puri 인스턴스에서 TTables 타입 추출
 */
export type ExtractPuriTables<T> = T extends Puri<any, infer TTables, any> ? TTables : never;

/**
 * SubsetQueries에서 모든 TTables의 유니온 추출
 * getSubsetQueries의 qb 타입 정의에 사용
 */
export type UnionExtractedTTables<
  TSubsetKey extends string,
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn>,
> = ExtractPuriTables<ReturnType<TSubsetQueries[TSubsetKey]>>;

// ============================================================================
// Subset 교집합 계산 (onSubset 메서드용)
// ============================================================================

/**
 * 두 Puri의 테이블 교집합을 가진 새로운 Puri 생성
 */
type MergePuriTables<A, B, TA = ExtractPuriTables<A>, TB = ExtractPuriTables<B>> = Puri<
  DatabaseSchemaExtend,
  Pick<TA, Extract<keyof TA, keyof TB>>,
  any
>;

/**
 * 서브셋 키 배열을 순회하며 테이블 교집합 Puri 계산
 *
 * onSubset(['A', 'P'])와 같이 여러 subset을 지정했을 때,
 * 공통으로 사용 가능한 테이블만 포함된 Puri 타입 반환
 */
export type ResolveSubsetIntersection<
  Keys extends readonly string[],
  Queries extends Record<string, (...args: any) => any>,
> = Keys extends [infer Head extends string, ...infer Tail extends string[]]
  ? Tail extends []
    ? ReturnType<Queries[Head]>
    : MergePuriTables<ReturnType<Queries[Head]>, ResolveSubsetIntersection<Tail, Queries>>
  : never;

// ============================================================================
// Enhancer
// ============================================================================

/**
 * 단일 Enhancer 함수 타입
 * computed 결과를 받아 최종 mapping 타입으로 변환
 */
export type EnhancerFn<TComputed, TMapping> = (row: TComputed) => TMapping | Promise<TMapping>;

/**
 * Enhancer가 필수인 SubsetKey 추출
 *
 * ComputedResults[K]가 SubsetMapping[K]에 할당 불가능하면 해당 K는 필수
 * (즉, virtual 필드 등 추가 변환이 필요한 경우)
 */
export type RequiredEnhancerKeys<
  TSubsetKey extends string,
  TComputedResults extends Record<TSubsetKey, any>,
  TSubsetMapping extends Record<TSubsetKey, any>,
> = {
  [K in TSubsetKey]: TComputedResults[K] extends TSubsetMapping[K] ? never : K;
}[TSubsetKey];

/**
 * Enhancer 객체 타입 정의
 *
 * - ComputedResults[K]가 SubsetMapping[K]에 assignable하면 → enhancer 선택적
 * - 그렇지 않으면 → enhancer 필수
 *
 * @example
 * // virtual 필드 employee_count가 있는 경우
 * type Computed = { id: number; name: string }
 * type Mapping = { id: number; name: string; employee_count: number }
 * // → Enhancer 필수 (employee_count 계산 필요)
 */
export type EnhancerMap<
  TSubsetKey extends string,
  TComputedResults extends Record<TSubsetKey, any>,
  TSubsetMapping extends Record<TSubsetKey, any>,
> = {
  // Computed가 Mapping에 호환되면 선택적
  [K in TSubsetKey as TComputedResults[K] extends TSubsetMapping[K] ? K : never]?: EnhancerFn<
    TComputedResults[K],
    TSubsetMapping[K]
  >;
} & {
  // 호환되지 않으면 필수
  [K in TSubsetKey as TComputedResults[K] extends TSubsetMapping[K] ? never : K]: EnhancerFn<
    TComputedResults[K],
    TSubsetMapping[K]
  >;
};

// ============================================================================
// executeSubsetQuery
// ============================================================================

/**
 * executeSubsetQuery 기본 파라미터
 */
export type ExecuteSubsetQueryBaseParams<TSubsetKey extends string> = {
  subset: TSubsetKey;
  qb: Puri<any, any, any>;
  params: {
    num?: number;
    page?: number;
    queryMode?: "list" | "count" | "both";
  };
  debug?: boolean;
  optimizeCountQuery?: boolean;
};

/**
 * executeSubsetQuery 파라미터 (Enhancer 포함)
 *
 * RequiredEnhancerKeys가 없으면 enhancers 선택적, 있으면 필수
 */
export type ExecuteSubsetQueryParams<
  TSubsetKey extends string,
  TComputedResults extends Record<TSubsetKey, any>,
  TSubsetMapping extends Record<TSubsetKey, any>,
  T extends TSubsetKey,
> = ExecuteSubsetQueryBaseParams<T> &
  ([RequiredEnhancerKeys<TSubsetKey, TComputedResults, TSubsetMapping>] extends [never]
    ? { enhancers?: EnhancerMap<TSubsetKey, TComputedResults, TSubsetMapping> }
    : { enhancers: EnhancerMap<TSubsetKey, TComputedResults, TSubsetMapping> });

/**
 * executeSubsetQuery 반환 타입
 */
export type ExecuteSubsetQueryResult<
  TSubsetMapping extends Record<string, any>,
  T extends string,
> = {
  rows: TSubsetMapping[T][];
  total: number;
};
