/** biome-ignore-all lint/suspicious/noExplicitAny: Puri Subset 타입 시스템에서 any를 허용함 */

/**
 * Puri Subset 타입 시스템
 *
 * SubsetQuery와 LoaderQuery를 기반으로 최종 결과 타입을 추론하는 타입 유틸리티들.
 * 핵심 개념:
 * - SubsetQuery: 기본 쿼리 (join, select)
 * - LoaderQuery: 1:N, N:M 관계 데이터 로딩
 * - Hydrate: flat한 결과를 중첩 객체로 변환 (예: user__name → { user: { name } })
 */

import type { DatabaseSchemaExtend } from "../types/types";
import type { Puri } from "./puri";
import type { Expand } from "./puri.types";
import type { PuriWrapper } from "./puri-wrapper";

// ============================================================================
// 기본 타입 정의
// ============================================================================

/**
 * SubsetQuery 함수 시그니처
 * PuriWrapper를 받아 Puri 쿼리 빌더를 반환
 */
export type PuriSubsetFn = (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => Puri<any, any, any>;

/**
 * Puri 인스턴스에서 TResult 타입 추출
 */
export type ExtractPuriResult<T> = T extends Puri<any, any, infer R> ? R : never;

// ============================================================================
// Loader 관련 타입
// ============================================================================

/**
 * Loader 쿼리 빌더 함수 시그니처
 * @param qbWrapper - Puri 래퍼
 * @param fromIds - 부모 레코드 ID 배열
 */
export type PuriLoaderQbFn = (
  qbWrapper: PuriWrapper<DatabaseSchemaExtend>,
  fromIds: number[],
) => Puri<any, any, any>;

/**
 * 단일 Loader 정의
 * 1:N 또는 N:M 관계 데이터를 로드하는 설정
 */
export type GenericPuriLoader = {
  /** 결과 객체에서 사용할 필드명 */
  as: string;
  /** 부모 레코드와 연결할 참조 필드명 */
  refId: string;
  /** 데이터 로딩 쿼리 빌더 */
  qb: PuriLoaderQbFn;
  /** 중첩 로더 (재귀적 로딩 지원) */
  loaders?: GenericPuriLoader[];
};

/**
 * 모델별 Loader 쿼리 컬렉션
 * 각 SubsetKey에 대해 Loader 배열을 정의
 */
export type PuriLoaderQueries<TSubsetKey extends string> = Record<TSubsetKey, GenericPuriLoader[]>;

// ============================================================================
// Hydrate 타입 시스템
// ============================================================================

/**
 * 구분자(__) 앞부분 추출
 * @example ExtractHead<"user__name"> = "user"
 */
type ExtractHead<K extends string> = K extends `${infer Head}__${string}` ? Head : never;

/**
 * 구분자(__) 뒷부분 추출
 * @example ExtractTail<"user__profile__name", "user"> = "profile__name"
 */
type ExtractTail<K extends string, Head extends string> = K extends `${Head}__${infer Tail}`
  ? Tail
  : never;

/**
 * Flat 객체를 중첩 객체로 변환
 *
 * 런타임 hydrate 함수와 동일한 동작을 타입 레벨에서 구현.
 * `__`로 구분된 키를 중첩 객체 구조로 변환.
 *
 * @example
 * type Input = { id: number; user__name: string; user__profile__bio: string }
 * type Output = Hydrate<Input>
 * // { id: number; user: { name: string; profile: { bio: string } } }
 */
export type Hydrate<T> = Expand<HydrateInner<T>>;
type HydrateInner<T> = {
  [K in keyof T as K extends `${string}__${string}` ? never : K]: T[K];
} & {
  [K in ExtractHead<keyof T & string>]: Expand<
    HydrateInner<{
      [P in keyof T as P extends `${K}__${string}` ? ExtractTail<P & string, K> : never]: T[P];
    }>
  >;
};

// ============================================================================
// Loader 결과 타입 추론
// ============================================================================

/**
 * Loader 쿼리 함수에서 결과 타입 추출 (refId 제외, Hydrate 적용)
 */
type ExtractLoaderResult<TLoaderQb> = TLoaderQb extends PuriLoaderQbFn
  ? Expand<Hydrate<Omit<ExtractPuriResult<ReturnType<TLoaderQb>>, "refId">>>
  : never;

/**
 * Loader 배열에서 결과 객체 타입 빌드 (재귀적으로 중첩 loader 처리)
 *
 * @example
 * type Loaders = [
 *   { as: "employees"; refId: "id"; qb: ...; loaders: [{ as: "projects"; ... }] }
 * ]
 * type Result = LoadersResult<Loaders>
 * // { employees: Array<{ ...employee fields; projects: Array<...> }> }
 */
export type LoadersResult<TLoaders extends GenericPuriLoader[]> = Expand<{
  [L in TLoaders[number] as L["as"]]: WithLoaders<ExtractLoaderResult<L["qb"]>, L["loaders"]>[];
}>;

/**
 * 기본 결과와 Loader 결과 병합
 */
type WithLoaders<TBase, TLoaders> = TLoaders extends GenericPuriLoader[]
  ? Expand<TBase & LoadersResult<TLoaders>>
  : TBase;

// ============================================================================
// Subset 결과 타입 추론
// ============================================================================

/**
 * 단일 Subset 함수 + Loader에서 최종 결과 타입 추론
 */
type InferSubsetWithLoaders<
  TSubsetFn extends (...args: any) => Puri<any, any, any>,
  TLoaders extends GenericPuriLoader[] | undefined = undefined,
> = Expand<Hydrate<WithLoaders<ExtractPuriResult<ReturnType<TSubsetFn>>, TLoaders>>>;

/**
 * 전체 SubsetQueries + LoaderQueries 객체에서 전체 결과 맵 생성
 *
 * @template TSubsetMap - Subset 함수들의 모음 객체
 * @template TLoaderMap - Loader 배열들의 모음 객체
 *
 * @example
 * type Result = InferAllSubsets<
 *   { A: () => Puri<...>, P: () => Puri<...> },
 *   { A: [...loaders], P: [] }
 * >
 * // { A: InferredTypeA; P: InferredTypeP }
 */
export type InferAllSubsets<
  TSubsetMap extends Record<string, (...args: any) => any>,
  TLoaderMap extends Partial<Record<string, GenericPuriLoader[]>>,
> = {
  [K in keyof TSubsetMap]: InferSubsetWithLoaders<
    TSubsetMap[K],
    K extends keyof TLoaderMap ? TLoaderMap[K] : undefined
  >;
};

// ============================================================================
// Clear 문
// ============================================================================

/**
 * Knex QueryBuilder에서 clear 가능한 statement 목록
 */
export type ClearStatements =
  | "with"
  | "select"
  | "columns"
  | "hintComments"
  | "where"
  | "union"
  | "using"
  | "join"
  | "group"
  | "order"
  | "having"
  | "limit"
  | "offset"
  | "counter"
  | "counters";
