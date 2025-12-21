/** biome-ignore-all lint/suspicious/noExplicitAny: Puri의 타입은 개별 모델에서 확정되므로 BaseModel에서는 any를 허용함 */

/**
 * BaseModel 타입 시스템
 *
 * BaseModelClass에서 사용하는 타입 유틸리티들.
 * Enhancer, SubsetQuery 교집합 등 Model 계층에서 필요한 타입 정의.
 */

import type { ListResult } from "..";
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
 * SubsetQueries의 Puri 반환 타입에서 TTables를 추출하고,
 * TTables의 키 중 DatabaseSchemaExtend의 키와 일치하는 것이 메인 테이블.
 * 해당 테이블의 BaseSchema에서 __virtual_query__ 키를 추출.
 */
type ExtractMainTable<TSubsetQueries extends Record<string, PuriSubsetFn>> = Extract<
  keyof ExtractPuriTables<ReturnType<TSubsetQueries[keyof TSubsetQueries]>>,
  keyof DatabaseSchemaExtend
>;

type ExtractVirtualQueryKeys<TSubsetQueries extends Record<string, PuriSubsetFn>> =
  ExtractMainTable<TSubsetQueries> extends infer TTable extends keyof DatabaseSchemaExtend
    ? DatabaseSchemaExtend[TTable] extends { __virtual_query__: readonly (infer K)[] }
      ? K
      : never
    : never;

/**
 * TSubsetMapping에서 virtualQuery 키를 optional로 만든 타입
 * Enhancer 필수 여부 판단 시 사용
 */
type OmitVirtualQueryFromMapping<TMapping, TVirtualQueryKeys> = Omit<
  TMapping,
  TVirtualQueryKeys & keyof TMapping
> &
  Partial<Pick<TMapping, TVirtualQueryKeys & keyof TMapping>>;

/**
 * Computed가 Mapping에 호환되는지 판단 (virtualQuery 키 제외)
 */
type IsEnhancerOptional<
  TSubsetKey extends string,
  TComputedResults extends Record<TSubsetKey, any>,
  TSubsetMapping extends Record<TSubsetKey, any>,
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn>,
  K extends TSubsetKey,
> = TComputedResults[K] extends OmitVirtualQueryFromMapping<
  TSubsetMapping[K],
  ExtractVirtualQueryKeys<TSubsetQueries>
>
  ? true
  : false;

/**
 * TComputed에 query virtual props 추가
 * appendSelect로 추가된 필드들이 row에 포함됨을 타입에 반영
 */
type WithVirtualQueryProps<TComputed, TMapping, TVirtualQueryKeys> = TComputed &
  Pick<TMapping, TVirtualQueryKeys & keyof TMapping>;

/**
 * 단일 Enhancer 함수 타입
 * computed 결과 + virtualQuery props를 받아 최종 mapping 타입으로 변환
 */
type EnhancerFnWithVirtualQuery<TComputed, TMapping, TVirtualQueryKeys> = (
  row: WithVirtualQueryProps<TComputed, TMapping, TVirtualQueryKeys>,
) => TMapping | Promise<TMapping>;

/**
 * 특정 subset의 Enhancer 함수 타입
 */
type EnhancerFnFor<
  TSubsetKey extends string,
  TComputedResults extends Record<TSubsetKey, any>,
  TSubsetMapping extends Record<TSubsetKey, any>,
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn>,
  K extends TSubsetKey,
> = EnhancerFnWithVirtualQuery<
  TComputedResults[K],
  TSubsetMapping[K],
  ExtractVirtualQueryKeys<TSubsetQueries>
>;

/**
 * Enhancer가 필수인 SubsetKey 추출
 *
 * ComputedResults[K]가 SubsetMapping[K]에 할당 불가능하면 해당 K는 필수
 * (즉, virtual 필드 등 추가 변환이 필요한 경우)
 * 단, virtualQuery 키는 무시 (사용자가 appendSelect로 직접 추가)
 */
export type RequiredEnhancerKeys<
  TSubsetKey extends string,
  TComputedResults extends Record<TSubsetKey, any>,
  TSubsetMapping extends Record<TSubsetKey, any>,
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn>,
> = {
  [K in TSubsetKey]: IsEnhancerOptional<
    TSubsetKey,
    TComputedResults,
    TSubsetMapping,
    TSubsetQueries,
    K
  > extends true
    ? never
    : K;
}[TSubsetKey];

/**
 * Enhancer 객체 타입 정의
 *
 * - ComputedResults[K]가 SubsetMapping[K]에 assignable하면 → enhancer 선택적
 * - 그렇지 않으면 → enhancer 필수
 * - 단, virtualQuery 키는 무시 (사용자가 appendSelect로 직접 추가)
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
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn>,
  TRequiredKeys extends TSubsetKey = RequiredEnhancerKeys<
    TSubsetKey,
    TComputedResults,
    TSubsetMapping,
    TSubsetQueries
  >,
> = {
  [K in Exclude<TSubsetKey, TRequiredKeys>]?: EnhancerFnFor<
    TSubsetKey,
    TComputedResults,
    TSubsetMapping,
    TSubsetQueries,
    K
  >;
} & {
  [K in TRequiredKeys]: EnhancerFnFor<
    TSubsetKey,
    TComputedResults,
    TSubsetMapping,
    TSubsetQueries,
    K
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
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn>,
  T extends TSubsetKey,
> = ExecuteSubsetQueryBaseParams<T> &
  ([RequiredEnhancerKeys<TSubsetKey, TComputedResults, TSubsetMapping, TSubsetQueries>] extends [
    never,
  ]
    ? { enhancers?: EnhancerMap<TSubsetKey, TComputedResults, TSubsetMapping, TSubsetQueries> }
    : { enhancers: EnhancerMap<TSubsetKey, TComputedResults, TSubsetMapping, TSubsetQueries> });

/**
 * executeSubsetQuery 반환 타입
 */
export type ExecuteSubsetQueryResult<
  TSubsetMapping extends Record<string, any>,
  T extends string,
  LP extends { queryMode?: "list" | "count" | "both" },
> = ListResult<LP, TSubsetMapping[T]>;
