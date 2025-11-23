/** biome-ignore-all lint/suspicious/noExplicitAny: Puri.types.ts는 다양한 타입을 사용하고 있습니다. */

import type { DatabaseSchemaExtend } from "../types/types";
import type { Puri } from "./puri";
import type { PuriWrapper } from "./puri-wrapper";

// 메타데이터 컬럼 유틸
type MetadataColumns = "__fulltext__" | "__virtual__";

// virtual 컬럼 타입 추출
type VirtualKeys<T> = T extends { __virtual__: readonly (infer V)[] } ? V & string : never;

// virtual 컬럼 제거
type StripVirtual<T> = Omit<T, VirtualKeys<T>>;

// 메타데이터 필드 제외한 실제 엔티티 컬럼
export type ColumnKeys<T> = Exclude<keyof StripVirtual<T>, MetadataColumns> & string;

// virtual 컬럼 제거 후 __fulltext__ 메타데이터 유지
export type PuriTable<T> = Omit<StripVirtual<T>, "__virtual__">;

// 메타데이터 컬럼 제외 타입 정의
export type OmitMetadataColumns<T> = Omit<T, MetadataColumns>;

// TTables의 모든 테이블에서 사용 가능한 컬럼 경로
export type AvailableColumns<TTables extends Record<string, any>> =
  | {
      [TAlias in keyof TTables]: `${TAlias & string}.${ColumnKeys<TTables[TAlias]>}`;
    }[keyof TTables]
  | (IsSingleKey<TTables> extends true
      ? ColumnKeys<TTables[keyof TTables]> // 단일 테이블이면 컬럼명만도 허용
      : never);

// Group By, Order By, Having 등에서 선택 가능한 컬럼
export type ResultAvailableColumns<TTables extends Record<string, any>, TResult = any> =
  | AvailableColumns<TTables>
  | `${keyof TResult & string}`;

// Select 값 타입 확장
export type SelectValue<TTables extends Record<string, any>> =
  | AvailableColumns<TTables>
  | SqlExpression<"string" | "number" | "boolean" | "date">;

// Select 객체 타입 (현재는 컬럼 경로만 지원)
export type SelectObject<TTables extends Record<string, any>> = Record<
  string,
  SelectValue<TTables> // AvailableColumns 대신
>;

// Select 결과 타입 추론
export type ParseSelectObject<
  TTables extends Record<string, any>,
  TSelect extends SelectObject<TTables>,
> = {
  [K in keyof TSelect]: TSelect[K] extends SqlExpression<infer R>
    ? R extends "string"
      ? string
      : R extends "number"
        ? number
        : R extends "boolean"
          ? boolean
          : R extends "date"
            ? Date
            : never
    : ExtractColumnType<TTables, TSelect[K] & string>;
};

// 컬럼 경로에서 타입 추출
export type ExtractColumnType<
  TTables extends Record<string, any>,
  Path extends string,
> = Path extends `${infer TAlias}.${infer TColumn}`
  ? TAlias extends keyof TTables
    ? TColumn extends keyof TTables[TAlias]
      ? TTables[TAlias][TColumn]
      : never
    : never
  : IsSingleKey<TTables> extends true // 추가
    ? Path extends keyof TTables[keyof TTables]
      ? TTables[keyof TTables][Path]
      : never
    : never;
// Where 조건 객체 타입
// 예: { "u.id": 1, "u.status": "active" }
export type WhereCondition<TTables extends Record<string, any>> = {
  [key in AvailableColumns<TTables>]?: ExtractColumnType<TTables, key & string>;
};

// Fulltext index 컬럼 추출 타입
export type FulltextColumns<TTables extends Record<string, any>> = {
  [TAlias in keyof TTables]: TTables[TAlias] extends {
    __fulltext__: readonly (infer Col)[];
  }
    ? Col extends string
      ? `${TAlias & string}.${Col}`
      : never
    : never;
}[keyof TTables];

// 비교 연산자
export type ComparisonOperator = "=" | ">" | ">=" | "<" | "<=" | "<>" | "!=";

// SQL Expression 타입 정의
export type SqlExpression<T extends "string" | "number" | "boolean" | "date"> = {
  _type: "sql_expression"; // 또는 "computed_value"
  _return: T;
  _sql: string;
};

// 결과 타입 가독성을 위한 타입 확장
export type Expand<T> = T extends any[]
  ? { [K in keyof T[0]]: T[0][K] }[] // 배열이면 첫 번째 요소를 Expand하고 배열로 감쌈
  : T extends object
    ? { [K in keyof T]: T[K] }
    : T;

type IsSingleKey<TTables extends Record<string, any>> = keyof TTables extends infer K
  ? K extends keyof TTables
    ? keyof TTables extends K // 역방향 체크로 단일 키 확인
      ? true
      : false
    : false
  : false;

export type SingleTableValue<TTables extends Record<string, any>> =
  IsSingleKey<TTables> extends true ? TTables[keyof TTables] : never;

// Nullable을 Optional로 변환
type NullableToOptional<T> = {
  [K in keyof T as T[K] extends null | undefined ? K : never]?: Exclude<T[K], null | undefined>;
} & Partial<{
  [K in keyof T as T[K] extends null | undefined ? never : K]: T[K];
}>;

// Insert 타입: id, created_at 제외
export type InsertData<T> = NullableToOptional<
  Omit<PuriTable<T>, "id" | "created_at" | MetadataColumns>
>;

// SubsetQuery를 위한 타입 유틸리티
type ExtractTTables<T extends Puri<any, any, any>> = T extends Puri<any, infer TTables, any>
  ? TTables
  : never;
export type UnionExtractedTTables<
  SubsetKey extends string,
  SubsetQueries extends Record<
    SubsetKey,
    (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => Puri<any, any, any>
  >,
> = {
  [K in SubsetKey]: ExtractTTables<ReturnType<SubsetQueries[K]>>;
}[SubsetKey];

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
  readonly qb: PuriLoaderQbFn;
};

// The collection of loaders for a model. Renamed from PuriLoaderQuery
export type PuriLoaderQueries<TSubsetKey extends string> = Record<
  TSubsetKey,
  readonly GenericPuriLoader[]
>;

// Builds an object type from an array of loaders
export type LoadersResult<TLoaders extends readonly GenericPuriLoader[]> = {
  [L in TLoaders[number] as L["as"]]: ExtractLoaderResult<L["qb"]>[];
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
  // 기본 쿼리 결과 Hydration + Expand
  Expand<Hydrate<ExtractPuriResult<ReturnType<TSubsetFn>>>> &
    // 로더 결과 병합
    (TLoaders extends readonly GenericPuriLoader[] ? LoadersResult<TLoaders> : {})
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
