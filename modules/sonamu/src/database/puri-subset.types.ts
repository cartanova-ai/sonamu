import type { DatabaseSchemaExtend } from "../types/types";
import type { Puri } from "./puri";
import type { Expand } from "./puri.types";
import type { PuriWrapper } from "./puri-wrapper";

export type PuriSubsetFn = (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => Puri<any, any, any>;

// Extracts the TResult from a Puri instance
export type ExtractPuriResult<T> = T extends Puri<any, any, infer R> ? R : never;

// A generic loader's function type
export type PuriLoaderQbFn = (
  qbWrapper: PuriWrapper<DatabaseSchemaExtend>,
  fromIds: number[],
) => Puri<any, any, any>;

// A generic loader object
export type GenericPuriLoader = {
  readonly as: string;
  readonly refId: string;
  readonly qb: PuriLoaderQbFn;
  readonly loaders?: readonly GenericPuriLoader[];
};

// The collection of loaders for a model. Renamed from PuriLoaderQuery
export type PuriLoaderQueries<TSubsetKey extends string> = Record<
  TSubsetKey,
  readonly GenericPuriLoader[]
>;

// Builds an object type from an array of loaders (재귀적으로 중첩 loader 처리)
export type LoadersResult<TLoaders extends readonly GenericPuriLoader[]> = {
  [L in TLoaders[number] as L["as"]]: Expand<
    ExtractLoaderResult<L["qb"]> &
      (L["loaders"] extends readonly GenericPuriLoader[] ? LoadersResult<L["loaders"]> : {})
  >[];
};

// Combines the base result with the loaders result
export type FinalRow<
  TBaseResult,
  TLoaders extends readonly GenericPuriLoader[] | undefined,
> = TLoaders extends readonly GenericPuriLoader[]
  ? TBaseResult & LoadersResult<TLoaders>
  : TBaseResult;

/**
 * 전체 SubsetQueries + LoaderQueries 객체를 받아 전체 결과 맵 생성
 * @template TSubsetMap - Subset 함수들의 모음 객체
 * @template TLoaderMap - Loader 배열들의 모음 객체
 */
export type InferAllSubsets<
  TSubsetMap extends Record<string, (...args: any) => any>,
  TLoaderMap extends Partial<Record<string, readonly GenericPuriLoader[]>>,
> = {
  [K in keyof TSubsetMap]: InferSubsetWithLoaders<
    TSubsetMap[K],
    K extends keyof TLoaderMap ? TLoaderMap[K] : undefined
  >;
};

// 구분자(__) 앞부분 추출 (Head)
type ExtractHead<K extends string> = K extends `${infer Head}__${string}` ? Head : never;

// 구분자(__) 뒷부분 추출 (Tail)
type ExtractTail<K extends string, Head extends string> = K extends `${Head}__${infer Tail}`
  ? Tail
  : never;

/**
 * 런타임 hydrate 함수의 동작을 타입 레벨에서 구현
 */
export type Hydrate<T> =
  // 1. __ 가 없는 일반 필드 유지
  {
    [K in keyof T as K extends `${string}__${string}` ? never : K]: T[K];
  } & {
    // 2. __ 가 있는 필드들을 Head로 묶어서 중첩 객체 생성 (재귀 호출)
    [K in ExtractHead<keyof T & string>]: Hydrate<{
      [P in keyof T as P extends `${K}__${string}` ? ExtractTail<P & string, K> : never]: T[P];
    }>;
  };

// Hydrate 결과를 Expand로 감싸서 가독성 확보
export type ExtractLoaderResult<TLoaderQb> = TLoaderQb extends PuriLoaderQbFn
  ? Expand<Hydrate<Omit<ExtractPuriResult<ReturnType<TLoaderQb>>, "refId">>>
  : never;

// Hydrate 결과를 Expand로 감싸서 가독성 확보
export type InferSubsetWithLoaders<
  TSubsetFn extends (...args: any) => Puri<any, any, any>,
  TLoaders extends readonly GenericPuriLoader[] | undefined = undefined,
> = Expand<
  Hydrate<
    // 기본 쿼리 결과
    ExtractPuriResult<ReturnType<TSubsetFn>> &
      // 로더 결과 병합
      (TLoaders extends readonly GenericPuriLoader[] ? LoadersResult<TLoaders> : {})
  >
>;

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
