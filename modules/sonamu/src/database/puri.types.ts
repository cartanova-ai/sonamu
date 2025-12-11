/** biome-ignore-all lint/suspicious/noExplicitAny: Puri.types.ts는 다양한 타입을 사용하고 있습니다. */

import type { QueryResult } from "pg";
import type { DatabaseForeignKeys, DatabaseSchemaExtend } from "../types/types";
import type { Puri } from "./puri";
import type { PuriWrapper } from "./puri-wrapper";

// ============================================
// 내부 타입 키 (메타데이터)
// ============================================
type FulltextKey = "__fulltext__";
type VirtualKey = "__virtual__";
type LeftJoinedKey = "__leftJoined__";
type InheritedLeftJoinedKey = "__inheritedLeftJoined__";
type HasDefault = "__hasDefault__";

type InternalTypeKeys = FulltextKey | VirtualKey | LeftJoinedKey | HasDefault | InheritedLeftJoinedKey;

// ============================================
// 타입 유틸리티
// ============================================

// 테이블명 타입
export type TableName<TSchema> = keyof TSchema & string;

// virtual 컬럼 타입 추출
type VirtualKeys<T> = T extends { [K in VirtualKey]: readonly (infer V)[] } ? V & string : never;

// virtual 컬럼 제거
type StripVirtual<T> = Omit<T, VirtualKeys<T>>;

// LEFT JOIN 마커 - 자체적으로 nullable인 관계
export type LeftJoinedMarker = { [K in LeftJoinedKey]: true };

// Inherited LEFT JOIN 마커 - 부모가 leftJoin이라서 따라서 leftJoin된 것 (자체는 non-nullable)
export type InheritedLeftJoinedMarker = { [K in InheritedLeftJoinedKey]: true };

// 메타데이터 필드 제외한 실제 엔티티 컬럼
export type ColumnKeys<T> = Exclude<keyof StripVirtual<T>, InternalTypeKeys> & string;

// virtual 컬럼 제거 후 __fulltext__ 유지
export type PuriTable<T> = Omit<StripVirtual<T>, VirtualKey>;

// 내부 타입 키 제외 (실제 컬럼만 남김)
export type OmitInternalTypeKeys<T> = Omit<T, InternalTypeKeys>;

// TTables의 모든 테이블에서 사용 가능한 컬럼 경로
export type AvailableColumns<TTables extends Record<string, any>> =
  | {
      [TAlias in keyof TTables]: `${TAlias & string}.${ColumnKeys<TTables[TAlias]>}`;
    }[keyof TTables]
  | (IsSingleKey<TTables> extends true
      ? ColumnKeys<TTables[keyof TTables]> // 단일 테이블이면 컬럼명만도 허용
      : never);

// 숫자 타입 컬럼만 추출하는 유틸리티 타입
type NumericColumnKeys<T> = {
  [K in keyof T]: T[K] extends number | bigint | null | undefined ? K : never;
}[keyof T] &
  string;

// TTables의 모든 테이블에서 숫자 타입 컬럼만 추출
export type NumericColumns<TTables extends Record<string, any>> =
  | {
      [TAlias in keyof TTables]: `${TAlias & string}.${NumericColumnKeys<TTables[TAlias]>}`;
    }[keyof TTables]
  | (IsSingleKey<TTables> extends true
      ? NumericColumnKeys<TTables[keyof TTables]> // 단일 테이블이면 컬럼명만도 허용
      : never);

// Group By, Order By, Having 등에서 선택 가능한 컬럼
export type ResultAvailableColumns<TTables extends Record<string, any>, TResult = any> =
  | AvailableColumns<TTables>
  | `${keyof TResult & string}`;

// Select 값 타입 확장 (단일 컬럼 또는 SQL 표현식)
export type SelectValue<TTables extends Record<string, any>> =
  | AvailableColumns<TTables>
  | SqlExpression<"string" | "number" | "boolean" | "date">;

// 중첩 Select 객체 타입 (재귀적)
// 예: { parent: { id: "parent.id", name: "parent.name" } }
export type NestedSelectObject<TTables extends Record<string, any>> = {
  [key: string]: SelectValue<TTables> | NestedSelectObject<TTables>;
};

// Select 객체 타입 (flat 또는 중첩 허용)
export type SelectObject<TTables extends Record<string, any>> = NestedSelectObject<TTables>;

// 값이 중첩 객체인지 판별하는 헬퍼 타입
type IsNestedObject<T> = T extends string
  ? false
  : T extends SqlExpression<any>
    ? false
    : T extends Record<string, any>
      ? true
      : false;

// 중첩 객체 키가 "자체적으로" leftJoin 테이블인지 확인 (경로 기반)
// InheritedLeftJoinedMarker는 제외 - 부모가 이미 nullable로 처리됨
// TableKey는 TTables에서 찾을 키 (예: "user__employee__department")
type IsLeftJoinedTable<TTables, TableKey> = TableKey extends keyof TTables
  ? TTables[TableKey] extends LeftJoinedMarker
    ? TTables[TableKey] extends InheritedLeftJoinedMarker
      ? false // Inherited는 자체 nullable이 아님
      : true // 자체 nullable
    : false
  : false;

// 경로 조합 헬퍼 (prefix가 없으면 key만, 있으면 prefix__key)
type JoinPath<Prefix extends string, Key extends string> = Prefix extends ""
  ? Key
  : `${Prefix}__${Key}`;

// Select 결과 타입 추론 (leftJoin 중첩 객체만 T | null로 추론)
export type ParseSelectObject<
  TTables extends Record<string, any>,
  TSelect extends SelectObject<TTables>,
> = ParseSelectObjectWithPath<TTables, TSelect, "">;

// 경로를 추적하면서 Select 결과 타입 추론
type ParseSelectObjectWithPath<
  TTables extends Record<string, any>,
  TSelect extends SelectObject<TTables>,
  Prefix extends string,
> = Expand<{
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
    : IsNestedObject<TSelect[K]> extends true
      ? TSelect[K] extends NestedSelectObject<TTables>
        ? IsLeftJoinedTable<TTables, JoinPath<Prefix, K & string>> extends true
          ? Expand<ParseSelectObjectInner<TTables, TSelect[K], JoinPath<Prefix, K & string>>> | null
          : Expand<ParseSelectObjectInner<TTables, TSelect[K], JoinPath<Prefix, K & string>>>
        : never
      : ExtractColumnType<TTables, TSelect[K] & string>;
}>;

// 중첩 객체 내부용 - leftJoin nullable을 객체 레벨에서 이미 처리했으므로 필드는 원본 타입 사용
type ParseSelectObjectInner<
  TTables extends Record<string, any>,
  TSelect extends SelectObject<TTables>,
  Prefix extends string,
> = Expand<{
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
    : IsNestedObject<TSelect[K]> extends true
      ? TSelect[K] extends NestedSelectObject<TTables>
        ? IsLeftJoinedTable<TTables, JoinPath<Prefix, K & string>> extends true
          ? Expand<ParseSelectObjectInner<TTables, TSelect[K], JoinPath<Prefix, K & string>>> | null
          : Expand<ParseSelectObjectInner<TTables, TSelect[K], JoinPath<Prefix, K & string>>>
        : never
      : ExtractColumnTypeRaw<TTables, TSelect[K] & string>; // leftJoin nullable 무시
}>;

// 컬럼 경로에서 타입 추출 (자체 leftJoin 시만 nullable 추가, inherited는 제외)
export type ExtractColumnType<
  TTables extends Record<string, any>,
  Path extends string,
> = Path extends `${infer TAlias}.${infer TColumn}`
  ? TAlias extends keyof TTables
    ? TColumn extends keyof TTables[TAlias]
      ? TTables[TAlias] extends LeftJoinedMarker
        ? TTables[TAlias] extends InheritedLeftJoinedMarker
          ? TTables[TAlias][TColumn] // Inherited LEFT JOIN → non-nullable (부모가 처리)
          : TTables[TAlias][TColumn] | null // 자체 LEFT JOIN → nullable
        : TTables[TAlias][TColumn] // INNER JOIN → non-nullable
      : never
    : never
  : IsSingleKey<TTables> extends true
    ? Path extends keyof TTables[keyof TTables]
      ? TTables[keyof TTables][Path]
      : never
    : never;

// 컬럼 경로에서 타입 추출 (leftJoin nullable 무시 - 객체 레벨에서 이미 처리된 경우)
type ExtractColumnTypeRaw<
  TTables extends Record<string, any>,
  Path extends string,
> = Path extends `${infer TAlias}.${infer TColumn}`
  ? TAlias extends keyof TTables
    ? TColumn extends keyof TTables[TAlias]
      ? TTables[TAlias][TColumn] // leftJoin 여부와 관계없이 원본 타입
      : never
    : never
  : IsSingleKey<TTables> extends true
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
    [K in FulltextKey]: readonly (infer Col)[];
  }
    ? Col extends string
      ? `${TAlias & string}.${Col}`
      : never
    : never;
}[keyof TTables];

// 비교 연산자
export type ComparisonOperator = "=" | ">" | ">=" | "<" | "<=" | "<>" | "!=";
// 조건 연산자: 비교 연산자 + 패턴 매칭 연산자
export type WhereOperator = ComparisonOperator | "like" | "not like";

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

// __hasDefault__에 포함된 키들을 PuriTable<T>의 키로 제한
type HasDefaultKeys<T> = T extends { __hasDefault__: readonly (infer K)[] }
  ? Extract<K, keyof PuriTable<T>>
  : never;

// Insert 타입: 메타데이터 제거 후, __hasDefault__ 컬럼들만 optional로 처리
export type InsertData<T> = Omit<PuriTable<T>, InternalTypeKeys | HasDefaultKeys<T>> & {
  [K in HasDefaultKeys<T>]?: PuriTable<T>[K];
};

// Insert Result 타입
export type InsertResult = Pick<QueryResult<any>, "command" | "rowCount" | "rows" | "oid">;

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

// ON CONFLICT 대상 타입
// - 단일 컬럼: "email"
// - 복수 컬럼: ["user_id", "product_id"]
export type OnConflictTarget = string | string[];

// ON CONFLICT 액션 타입
// - "nothing": DO NOTHING
// - { update: [...] }: DO UPDATE
export type OnConflictAction<TTables extends Record<string, unknown>> =
  | "nothing"
  | {
      update:
        | AvailableColumns<TTables>[] // 배열 형태 - ["name", "email"]
        | WhereCondition<TTables>; // 객체 형태 - { name: "John", count: Puri.rawNumber(...) }
    };

// FK 컬럼명 추출 유틸리티 타입 - DatabaseForeignKeys 활용
export type ForeignKeyColumns<TTable extends TableName<DatabaseSchemaExtend>> =
  TTable extends keyof DatabaseForeignKeys ? DatabaseForeignKeys[TTable] : never;

// Union을 Intersection으로 변환하는 유틸리티
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

// SelectAll 시 모든 조인된 테이블의 컬럼 포함
export type SelectAllResult<TTables extends Record<string, any>> = UnionToIntersection<
  {
    [K in keyof TTables]: TTables[K] extends infer T
      ? T extends LeftJoinedMarker
        ? Partial<OmitInternalTypeKeys<T>> // LEFT JOIN은 nullable, 메타데이터 제거
        : OmitInternalTypeKeys<T> // INNER JOIN은 non-nullable, 메타데이터 제거
      : never;
  }[keyof TTables]
>;
