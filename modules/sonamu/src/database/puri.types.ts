import { DatabaseSchemaExtend } from "../types/types";
import { Puri } from "./puri";
import { PuriWrapper } from "./puri-wrapper";

// 메타데이터 컬럼 제외
type MetadataColumns = "__fulltext__" | "__virtual__";
export type ExcludeMetadataColumns<T> = Exclude<T, MetadataColumns>;
export type OmitMetadataColumns<T> = Omit<T, MetadataColumns>;

// TTables의 모든 테이블에서 사용 가능한 컬럼 경로
export type AvailableColumns<TTables extends Record<string, any>> =
  | {
      [TAlias in keyof TTables]: `${TAlias & string}.${ExcludeMetadataColumns<keyof TTables[TAlias]> & string}`;
    }[keyof TTables]
  | (IsSingleKey<TTables> extends true
      ? ExcludeMetadataColumns<keyof TTables[keyof TTables]> // 단일 테이블이면 컬럼명만도 허용
      : never);
// Group By, Order By, Having 등에서 선택 가능한 컬럼
export type ResultAvailableColumns<
  TTables extends Record<string, any>,
  TResult = any,
> = AvailableColumns<TTables> | `${keyof TResult & string}`;

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
export type SqlExpression<T extends "string" | "number" | "boolean" | "date"> =
  {
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

type IsSingleKey<TTables extends Record<string, any>> =
  keyof TTables extends infer K
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
  [K in keyof T as T[K] extends null | undefined ? K : never]?: Exclude<
    T[K],
    null | undefined
  >;
} & Partial<{
  [K in keyof T as T[K] extends null | undefined ? never : K]: T[K];
}>;

// Insert 타입: id, created_at 제외
export type InsertData<T> = NullableToOptional<
  Omit<T, "id" | "created_at" | "__fulltext__">
>;

// SubsetQuery를 위한 타입 유틸리티
type ExtractTTables<T extends Puri<any, any, any>> =
  T extends Puri<any, infer TTables, any> ? TTables : never;
export type UnionExtractedTTables<
  SubsetKey extends string,
  SubsetQueries extends Record<
    SubsetKey,
    (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => Puri<any, any, any>
  >,
> = {
  [K in SubsetKey]: ExtractTTables<ReturnType<SubsetQueries[K]>>;
}[SubsetKey];
