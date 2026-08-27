/* oxlint-disable @typescript-eslint/no-explicit-any */ // Puri.types.ts는 다양한 타입을 사용하고 있습니다.

import { type Knex } from "knex";
import { type QueryResult } from "pg";

import { type DatabaseForeignKeys, type DatabaseSchemaExtend } from "../types/types";
import { type Puri } from "./puri";
import { type PuriSubsetFn } from "./puri-subset.types";

// ============================================
// 내부 타입 키 (메타데이터)
// ============================================
type FulltextKey = "__fulltext__";
type VirtualKey = "__virtual__";
type LeftJoinedKey = "__leftJoined__";
type HasDefault = "__hasDefault__";
type GeneratedKey = "__generated__";
type VectorKey = "__vector__";
type JsonKey = "__json__";
type VirtualQueryKey = "__virtual_query__";

type InternalTypeKeys =
  | FulltextKey
  | VirtualKey
  | LeftJoinedKey
  | HasDefault
  | GeneratedKey
  | VectorKey
  | JsonKey
  | VirtualQueryKey;

// ============================================
// 타입 유틸리티
// ============================================

// __vector__ 메타데이터에서 벡터 컬럼 추출
type VectorColumnKeys<T> = T extends { [K in VectorKey]: readonly (infer V)[] }
  ? V & string
  : never;

export type VectorColumns<TTables extends object> =
  | {
      [TAlias in keyof TTables]: `${TAlias & string}.${VectorColumnKeys<TTables[TAlias]>}`;
    }[keyof TTables]
  | (IsSingleKey<TTables> extends true ? VectorColumnKeys<TTables[keyof TTables]> : never);

// __json__ 메타데이터에서 JSON 컬럼 추출
type JsonColumnKeys<T> = T extends { [K in JsonKey]: readonly (infer J)[] } ? J & string : never;

export type JsonColumns<TTables extends object> =
  | {
      [TAlias in keyof TTables]: `${TAlias & string}.${JsonColumnKeys<TTables[TAlias]>}`;
    }[keyof TTables]
  | (IsSingleKey<TTables> extends true ? JsonColumnKeys<TTables[keyof TTables]> : never);

type JsonSupersetNestedValue<T> = T extends readonly (infer Element)[]
  ? JsonSupersetNestedValue<Element>[]
  : T extends object
    ? { [K in keyof T]?: JsonSupersetNestedValue<T[K]> }
    : T;

export type JsonSupersetValue<T> = JsonSupersetNestedValue<NonNullable<T>>;

// 테이블명 타입
export type TableName<TSchema> = keyof TSchema & string;

// 테이블의 id(PK) 타입을 추출
export type IdType<TSchema, TTable extends keyof TSchema> = TSchema[TTable] extends { id: infer I }
  ? I
  : number;

// virtual 컬럼 타입 추출
type VirtualKeys<T> = T extends { [K in VirtualKey]: readonly (infer V)[] } ? V & string : never;

// virtual 컬럼 제거
type StripVirtual<T> = Omit<T, VirtualKeys<T>>;

// LEFT JOIN 마커 - nullable FK로 조인된 테이블
// 이 마커는 nullable FK + leftJoin 조합에서만 붙습니다.
// join + FK nullable -> 안 붙음
// join + FK non-nullable -> 안 붙음
// leftJoin + FK non-nullable -> 안 붙음
// leftJoin + FK nullable -> 붙음!
export type LeftJoinedMarker = { [K in LeftJoinedKey]: true };

// 메타데이터 필드 제외한 실제 엔티티 컬럼
export type ColumnKeys<T> = Exclude<keyof StripVirtual<T>, InternalTypeKeys> & string;

// virtual 컬럼 제거 후 __fulltext__ 유지
export type PuriTable<T> = Omit<StripVirtual<T>, VirtualKey>;

// 내부 타입 키 제외 (실제 컬럼만 남김)
export type OmitInternalTypeKeys<T> = Omit<T, InternalTypeKeys>;

// TTables의 모든 테이블에서 사용 가능한 컬럼 경로
export type AvailableColumns<TTables extends object> = (
  | {
      [TAlias in keyof TTables]: `${TAlias & string}.${ColumnKeys<TTables[TAlias]>}`;
    }[keyof TTables]
  | (IsSingleKey<TTables> extends true
      ? ColumnKeys<TTables[keyof TTables]> // 단일 테이블이면 컬럼명만도 허용
      : never)
) &
  string;

// 숫자 타입 컬럼만 추출하는 유틸리티 타입
type NumericColumnKeys<T> = {
  [K in keyof T]: T[K] extends number | bigint | null | undefined ? K : never;
}[keyof T] &
  string;

// TTables의 모든 테이블에서 숫자 타입 컬럼만 추출
export type NumericColumns<TTables extends object> =
  | {
      [TAlias in keyof TTables]: `${TAlias & string}.${NumericColumnKeys<TTables[TAlias]>}`;
    }[keyof TTables]
  | (IsSingleKey<TTables> extends true
      ? NumericColumnKeys<TTables[keyof TTables]> // 단일 테이블이면 컬럼명만도 허용
      : never);

// Group By, Order By, Having 등에서 선택 가능한 컬럼
export type ResultAvailableColumns<TTables extends object, TResult = any> =
  | AvailableColumns<TTables>
  | `${keyof TResult & string}`;

// Select 값 타입 확장 (단일 컬럼 또는 SQL 표현식)
export type SelectValue<TTables extends object> =
  | AvailableColumns<TTables>
  | SqlExpression<"string" | "number" | "boolean" | "date" | "string[]">;

// 중첩 Select 객체 타입 (재귀적)
// 예: { parent: { id: "parent.id", name: "parent.name" } }
export type NestedSelectObject<TTables extends object> = {
  [key: string]: SelectValue<TTables> | NestedSelectObject<TTables>;
};

// Select 객체 타입 (flat 또는 중첩 허용)
export type SelectObject<TTables extends object> = NestedSelectObject<TTables>;

// 값이 중첩 객체인지 판별하는 헬퍼 타입
type IsNestedObject<T> = T extends string
  ? false
  : T extends SqlExpression<any>
    ? false
    : T extends object
      ? true
      : false;

// 컬럼이 nullable인지 확인 (스키마에서 직접 추출)
// 예: IsNullableColumn<TTables, "employees.department_id"> → department_id가 number | null이면 true
export type IsNullableColumn<
  TTables,
  Path extends string,
> = Path extends `${infer TAlias}.${infer TColumn}`
  ? TAlias extends keyof TTables
    ? TColumn extends keyof TTables[TAlias]
      ? null extends TTables[TAlias][TColumn]
        ? true
        : false
      : false
    : false
  : false;

// FK nullable 여부에 따른 마커 타입 결정
// nullable FK로 leftJoin → LeftJoinedMarker (객체 자체가 null일 수 있음)
// non-null FK로 leftJoin → 마커 없음 (부모가 있으면 자식도 반드시 있음)
export type LeftJoinMarkerFor<TTables, Path extends string> =
  IsNullableColumn<TTables, Path> extends true ? LeftJoinedMarker : {};

// 주어진 테이블이 FK nullable로 leftJoin 된 테이블인지 확인합니다.
// 사실 LeftJoinMarker가 붙었는지 확인하는게 다입니다.
// 이 마커는 FK nullable + leftJoin 조합에서만 붙습니다.
type IsNullableJoinedTable<TTables, TableKey> = TableKey extends keyof TTables
  ? TTables[TableKey] extends LeftJoinedMarker
    ? true // LeftJoinedMarker가 있으면 nullable
    : false
  : false;

// 경로 조합 헬퍼 (prefix가 없으면 key만, 있으면 prefix__key)
type JoinPath<Prefix extends string, Key extends string> = Prefix extends ""
  ? Key
  : `${Prefix}__${Key}`;

// Select 결과 타입을 추론해주는 친구입니다.
// 이 타입은 Puri의 select, appendSelect에서 TResult로 사용됩니다.
//
// Schema를 읽어서 FK의 nullability에 따라 join된 객체의 타입을 추론해주는 기능이 있습니다.
// 이게 무슨 소리냐? FK가 nullable인데 leftJoin되었다면, 해당 객체는 nullable 해야 함을 타입 추론으로 반영해준다는 것입니다.
// 반면 FK가 non-nullable이거나 그냥 join으로 이어졌다면 해당 객체는 non-nullable할 겁니다.
// 물론 객체 내부의 nullability는 또 별개로 추론됩니다.
//
// 아래에도 ParseSelectObjectWithPath를 비롯해 ExtractColumnType, ExtractColumnTypeRaw 등의 타입이 있습니다.
// 이들의 역할은 다음과 같습니다:
// - Parse*: 객체 레벨에서 중첩 구조를 순회하며 객체에 | null을 붙일지 결정합니다.
// - Extract*: 필드 레벨에서 "table.column" 경로로부터 실제 타입을 추출합니다.
//
// 예시:
// .select({
//   id: "users.id",           // ← ExtractColumnType의 결과는 number입니다.
//   department: {             // ← ParseSelectObjectInner에 의해 nullable 객체로 추론됩니다.
//     id: "department.id",    // ← ExtractColumnTypeRaw의 결과는 number입니다.
//     name: "department.name" // ← ExtractColumnTypeRaw의 결과는 string입니다.
//   }
// })
export type ParseSelectObject<
  TTables extends object,
  TSelect extends SelectObject<TTables>,
> = ParseSelectObjectWithPath<TTables, TSelect, "">;

// 경로를 추적하면서 Select 결과 타입을 추론합니다.
type ParseSelectObjectWithPath<
  TTables extends object,
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
            : R extends "string[]"
              ? string[]
              : never
    : IsNestedObject<TSelect[K]> extends true
      ? TSelect[K] extends NestedSelectObject<TTables>
        ? IsNullableJoinedTable<TTables, JoinPath<Prefix, K & string>> extends true // 주어진 테이블이 FK nullable에 leftJoin되었는지 여부에 따라 select 결과 객체의 타입이 달라집니다.
          ? Expand<ParseSelectObjectInner<TTables, TSelect[K], JoinPath<Prefix, K & string>>> | null // 만약 해당한다면 해당 객체 자체는 nullable 하며,
          : Expand<ParseSelectObjectInner<TTables, TSelect[K], JoinPath<Prefix, K & string>>> // 그렇지 않다면 non-nullable 합니다.
        : never
      : ExtractColumnType<TTables, TSelect[K] & string>;
}>;

// 중첩 객체 내부용 - leftJoin nullable을 객체 레벨에서 이미 처리했으므로 필드는 원본 타입을 사용합니다.
// ParseSelectObjectWithPath와 거의 동일하나, 마지막에 ExtractColumnType 대신 ExtractColumnTypeRaw를 사용하여
// 필드 레벨에서 중복으로 | null이 추가되는 것을 방지합니다.
type ParseSelectObjectInner<
  TTables extends object,
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
            : R extends "string[]"
              ? string[]
              : never
    : IsNestedObject<TSelect[K]> extends true
      ? TSelect[K] extends NestedSelectObject<TTables>
        ? IsNullableJoinedTable<TTables, JoinPath<Prefix, K & string>> extends true
          ? Expand<ParseSelectObjectInner<TTables, TSelect[K], JoinPath<Prefix, K & string>>> | null
          : Expand<ParseSelectObjectInner<TTables, TSelect[K], JoinPath<Prefix, K & string>>>
        : never
      : ExtractColumnTypeRaw<TTables, TSelect[K] & string>; // leftJoin nullable 무시
}>;

// 컬럼 경로에서 타입을 추출합니다. LeftJoinedMarker가 있으면 | null을 추가합니다.
// 최상위 select 필드에서 사용됩니다.
export type ExtractColumnType<
  TTables extends object,
  Path extends string,
> = Path extends `${infer TAlias}.${infer TColumn}`
  ? TAlias extends keyof TTables
    ? TColumn extends keyof TTables[TAlias]
      ? TTables[TAlias] extends LeftJoinedMarker
        ? TTables[TAlias][TColumn] | null // LEFT JOIN (nullable FK) → nullable
        : TTables[TAlias][TColumn] // INNER JOIN 또는 non-null FK leftJoin → non-nullable
      : never
    : never
  : IsSingleKey<TTables> extends true
    ? Path extends keyof TTables[keyof TTables]
      ? TTables[keyof TTables][Path]
      : never
    : never;

// 컬럼 경로에서 타입을 추출합니다. leftJoin 여부와 관계없이 원본 타입을 반환합니다.
// 중첩 객체 내부 필드에서 사용됩니다. (객체 레벨에서 이미 | null 처리가 완료되었으므로)
type ExtractColumnTypeRaw<
  TTables extends object,
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
export type WhereCondition<TTables extends object> = {
  [key in AvailableColumns<TTables>]?: ExtractColumnType<TTables, key & string>;
};

// Fulltext index 컬럼 추출 타입
export type FulltextColumns<TTables extends object> = {
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
export type WhereOperator = ComparisonOperator | "like" | "not like" | "ilike" | "not ilike";
export const FUZZY_OPERATORS = ["<%", "%", "<<%"] as const;
export type FuzzyOperator = (typeof FUZZY_OPERATORS)[number];

// SQL Expression 타입 정의
export type SqlExpression<
  T extends "string" | "number" | "boolean" | "date" | "string[]" | "tsvector",
> = {
  _type: "sql_expression"; // 또는 "computed_value"
  _return: T;
  _sql: string;
  _params: Knex.RawBinding[];
};

// 결과 타입 가독성을 위한 타입 확장
export type Expand<T> = T extends any[]
  ? { [K in keyof T[0]]: T[0][K] }[] // 배열이면 첫 번째 요소를 Expand하고 배열로 감쌈
  : T extends object
    ? { [K in keyof T]: T[K] }
    : T;

type IsSingleKey<TTables extends object> = keyof TTables extends infer K
  ? K extends keyof TTables
    ? keyof TTables extends K // 역방향 체크로 단일 키 확인
      ? true
      : false
    : false
  : false;

export type SingleTableValue<TTables extends object> =
  IsSingleKey<TTables> extends true ? TTables[keyof TTables] : never;

// __hasDefault__에 포함된 키들을 PuriTable<T>의 키로 제한
type HasDefaultKeys<T> = T extends { __hasDefault__: readonly (infer K)[] }
  ? Extract<K, keyof PuriTable<T>>
  : never;

// __generated__에 포함된 키들 (INSERT 시 제외해야 함)
type GeneratedKeys<T> = T extends { __generated__: readonly (infer K)[] }
  ? Extract<K, keyof PuriTable<T>>
  : never;

// __virtual_query__에 포함된 키들 (INSERT 시 제외해야 함)
type VirtualQueryKeys<T> = T extends { __virtual_query__: readonly (infer K)[] }
  ? Extract<K, keyof PuriTable<T>>
  : never;

// Insert 타입: 메타데이터 제거 후, __hasDefault__ 컬럼들만 optional로 처리, generated/virtualQuery 컬럼은 완전히 제외
export type InsertData<T> = Omit<
  PuriTable<T>,
  InternalTypeKeys | HasDefaultKeys<T> | GeneratedKeys<T> | VirtualQueryKeys<T>
> & {
  [K in HasDefaultKeys<T>]?: PuriTable<T>[K];
};

// Insert Result 타입
export type InsertResult = Pick<QueryResult, "command" | "rowCount" | "rows" | "oid">;

// SubsetQuery를 위한 타입 유틸리티
export type ExtractTTables<T extends Puri<any, any, any>> =
  T extends Puri<any, infer TTables, any> ? TTables : never;
export type UnionExtractedTTables<
  SubsetKey extends string,
  SubsetQueries extends Record<SubsetKey, PuriSubsetFn>,
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
export type OnConflictAction<TTables extends object> =
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
export type SelectAllResult<TTables extends object> = UnionToIntersection<
  {
    [K in keyof TTables]: TTables[K] extends infer T
      ? T extends LeftJoinedMarker
        ? Partial<OmitInternalTypeKeys<T>> // LEFT JOIN은 nullable, 메타데이터 제거
        : OmitInternalTypeKeys<T> // INNER JOIN은 non-nullable, 메타데이터 제거
      : never;
  }[keyof TTables]
>;

// FTS 타입
type TsQueryParser = "to_tsquery" | "plainto_tsquery" | "phraseto_tsquery" | "websearch_to_tsquery";
export type TsQueryConfig = "simple" | "english";
export type TsQueryOptions = {
  parser?: TsQueryParser;
  config?: TsQueryConfig;
};

export type TsHighlightOptions = {
  /** 쿼리 변환 함수 (기본값: "websearch_to_tsquery") */
  parser?: TsQueryParser;
  /** 텍스트 검색 설정 (기본값: "simple") */
  config?: TsQueryConfig;
  /** 최대 단어 수 (기본값: 35) */
  maxWords?: number;
  /** 최소 단어 수 (기본값: 15) */
  minWords?: number;
  /** 헤드라인 시작/끝에서 제거할 짧은 단어 길이 (기본값: 3) */
  shortWord?: number;
  /** true면 전체 문서를 헤드라인으로 사용 (기본값: false) */
  highlightAll?: boolean;
  /** 표시할 최대 텍스트 조각 수 (기본값: 0, 조각 미사용) */
  maxFragments?: number;
  /** 쿼리 단어 시작 구분자 (기본값: "<b>") */
  startSel?: string;
  /** 쿼리 단어 끝 구분자 (기본값: "</b>") */
  stopSel?: string;
  /** 조각 구분자 (기본값: " ... ") */
  fragmentDelimiter?: string;
};

export type TsRankOptions = {
  parser?: TsQueryParser;
  config?: TsQueryConfig;
  /** 가중치 배열 [D, C, B, A] (기본값: [0.1, 0.2, 0.4, 1.0]) */
  weights?: [number, number, number, number];
  /**
   * 정규화 옵션
   * 0: 문서 길이 무시 (기본값)
   * 1: 1 + log(문서 길이)로 나눔
   * 2: 문서 길이로 나눔
   * 4: 평균 조화 거리로 나눔 (ts_rank_cd만)
   * 8: 고유 단어 수로 나눔
   * 16: 1 + log(고유 단어 수)로 나눔
   * 32: rank/(rank+1) -> 0~1 사이의 값으로 스케일링
   *
   * 비트마스크를 사용하여 옵션을 조합할 수 있음
   * 예: 8 | 32 -> 고유 단어 수로 나누고 0~1 스케일링
   */
  normalization?: number;
};
