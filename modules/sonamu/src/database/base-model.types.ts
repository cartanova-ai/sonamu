/* oxlint-disable @typescript-eslint/no-explicit-any */ // Puri의 타입은 개별 모델에서 확정되므로 BaseModel에서는 any를 허용함

/**
 * BaseModel 타입 시스템
 *
 * BaseModelClass에서 사용하는 타입 유틸리티들.
 * Enhancer, SubsetQuery 교집합 등 Model 계층에서 필요한 타입 정의.
 */

import { type DatabaseSchemaExtend } from "../types/types";
import { type Puri } from "./puri";
import { type PuriSubsetFn } from "./puri-subset.types";
import { type ExtractTTables } from "./puri.types";

// ============================================================================
// Subset 교집합 계산 (onSubset 메서드용)
// ============================================================================

/**
 * 두 Puri의 테이블 교집합을 가진 새로운 Puri 생성
 */
type MergePuriTables<
  A extends Puri<any, any, any>,
  B extends Puri<any, any, any>,
  TA = ExtractTTables<A>,
  TB = ExtractTTables<B>,
> = Puri<DatabaseSchemaExtend, Pick<TA, Extract<keyof TA, keyof TB>>, any>;

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
  keyof ExtractTTables<ReturnType<TSubsetQueries[keyof TSubsetQueries]>>,
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
  TComputedResults extends { [K in TSubsetKey]: TComputedResults[K] },
  TSubsetMapping extends { [K in TSubsetKey]: TSubsetMapping[K] },
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn>,
  K extends TSubsetKey,
> =
  TComputedResults[K] extends OmitVirtualQueryFromMapping<
    TSubsetMapping[K],
    ExtractVirtualQueryKeys<TSubsetQueries>
  >
    ? true
    : false;

/**
 * 단일 Enhancer 함수 타입
 * computed 결과 + virtualQuery props를 받아 최종 mapping 타입으로 변환
 */
type EnhancerFnWithVirtualQuery<TComputed, TMapping, TVirtualQueryKeys> = (
  row: TComputed & Pick<TMapping, TVirtualQueryKeys & keyof TMapping>,
) => TMapping | Promise<TMapping>;

/**
 * Enhancer가 필수인 SubsetKey 추출
 *
 * ComputedResults[K]가 SubsetMapping[K]에 할당 불가능하면 해당 K는 필수
 * (즉, virtual 필드 등 추가 변환이 필요한 경우)
 * 단, virtualQuery 키는 무시 (사용자가 appendSelect로 직접 추가)
 */
export type RequiredEnhancerKeys<
  TSubsetKey extends string,
  TComputedResults extends { [K in TSubsetKey]: TComputedResults[K] },
  TSubsetMapping extends { [K in TSubsetKey]: TSubsetMapping[K] },
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
  TComputedResults extends { [K in TSubsetKey]: TComputedResults[K] },
  TSubsetMapping extends { [K in TSubsetKey]: TSubsetMapping[K] },
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn>,
  TRequiredKeys extends TSubsetKey = RequiredEnhancerKeys<
    TSubsetKey,
    TComputedResults,
    TSubsetMapping,
    TSubsetQueries
  >,
> = {
  [K in Exclude<TSubsetKey, TRequiredKeys>]?: EnhancerFnWithVirtualQuery<
    TComputedResults[K],
    TSubsetMapping[K],
    ExtractVirtualQueryKeys<TSubsetQueries>
  >;
} & {
  [K in TRequiredKeys]: EnhancerFnWithVirtualQuery<
    TComputedResults[K],
    TSubsetMapping[K],
    ExtractVirtualQueryKeys<TSubsetQueries>
  >;
};
