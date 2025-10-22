export type ComparisonOperator = "=" | ">" | ">=" | "<" | "<=" | "<>" | "!=";
export type Expand<T> = T extends any[]
  ? { [K in keyof T[0]]: T[0][K] }[] // 배열이면 첫 번째 요소를 Expand하고 배열로 감쌈
  : T extends object
    ? { [K in keyof T]: T[K] } & {}
    : T;

// 사용 가능한 컬럼 경로 타입 (메인 테이블 + 조인된 테이블들)
export type AvailableColumns<
  TSchema,
  T extends keyof TSchema | string,
  TResult = any,
  TJoined = {},
> = T extends keyof TSchema
  ? // 기존 테이블 케이스
    | keyof TSchema[T]
      | `${T & string}.${keyof TSchema[T] & string}`
      | (TJoined extends Record<string, any>
          ? {
              [K in keyof TJoined]: TJoined[K] extends Record<string, any>
                ? `${string & K}.${keyof TJoined[K] & string}`
                : never;
            }[keyof TJoined]
          : never)
  : // 서브쿼리 케이스 (T는 alias string)
    | keyof TResult
      | `${T & string}.${keyof TResult & string}`
      | (TJoined extends Record<string, any>
          ? {
              [K in keyof TJoined]: TJoined[K] extends Record<string, any>
                ? `${string & K}.${keyof TJoined[K] & string}`
                : never;
            }[keyof TJoined]
          : never);

// 컬럼 경로에서 타입 추출
export type ExtractColumnType<
  TSchema,
  T extends keyof TSchema | string,
  Path extends string,
  TResult = any,
  TJoined = {},
> = T extends keyof TSchema
  ? // 기존 테이블 케이스
    Path extends keyof TSchema[T]
    ? TSchema[T][Path] // 메인 테이블 컬럼
    : Path extends `${T & string}.${infer Column}`
      ? Column extends keyof TSchema[T]
        ? TSchema[T][Column]
        : never
      : Path extends `${infer Table}.${infer Column}`
        ? Table extends keyof TJoined
          ? TJoined[Table] extends Record<string, any>
            ? Column extends keyof TJoined[Table]
              ? TJoined[Table][Column]
              : never
            : never
          : never
        : never
  : // 서브쿼리 케이스 (T는 alias)
    Path extends `${T & string}.${infer Column}`
    ? Column extends keyof TResult
      ? TResult[Column] // 서브쿼리 alias.컬럼
      : never
    : Path extends `${infer Table}.${infer Column}`
      ? Table extends keyof TJoined
        ? TJoined[Table] extends Record<string, any>
          ? Column extends keyof TJoined[Table]
            ? TJoined[Table][Column]
            : never
          : never
        : never
      : Path extends keyof TResult
        ? TResult[Path] // 서브쿼리 컬럼 직접 접근 (가장 마지막에)
        : never;

// SQL 함수 타입 정의
export type SqlFunction<T extends "string" | "number" | "boolean" | "date"> = {
  _type: "sql_function";
  _return: T;
  _sql: string;
};

// SQL 함수 결과에서 타입 추출
type ExtractSqlType<T> =
  T extends SqlFunction<infer R>
    ? R extends "string"
      ? string
      : R extends "number"
        ? number
        : R extends "boolean"
          ? boolean
          : R extends "date"
            ? Date
            : never
    : never;

// Select 값 타입 확장
export type SelectValue<
  TSchema,
  T extends keyof TSchema | string,
  TResult = any,
  TJoined = {},
> =
  | AvailableColumns<TSchema, T, TResult, TJoined> // 기존 컬럼
  | SqlFunction<"string" | "number" | "boolean" | "date">; // SQL 함수

// Select 객체 타입 정의
export type SelectObject<
  TSchema,
  T extends keyof TSchema | string,
  TResult = any,
  TJoined = {},
> = Record<string, SelectValue<TSchema, T, TResult, TJoined>>;

// Select 결과 타입 추론
export type ParseSelectObject<
  TSchema,
  T extends keyof TSchema | string,
  S extends SelectObject<TSchema, T, TResult, TJoined>,
  TResult = any,
  TJoined = {},
> = {
  [K in keyof S]: S[K] extends SqlFunction<any>
    ? ExtractSqlType<S[K]> // SQL 함수면 타입 추출
    : ExtractColumnType<TSchema, T, S[K] & string, TResult, TJoined>;
};

// Where 조건 타입 (조인된 테이블 컬럼도 포함)
export type WhereCondition<
  TSchema,
  T extends keyof TSchema | string,
  TResult = any,
  TJoined = {},
> =
  // 메인 테이블/서브쿼리 조건들
  (T extends keyof TSchema
    ? {
        [K in keyof TSchema[T]]?: TSchema[T][K] | TSchema[T][K][];
      }
    : {
        [K in keyof TResult]?: TResult[K] | TResult[K][];
      }) &
    // 조인된 테이블들의 조건들
    (TJoined extends Record<string, any>
      ? {
          [K in keyof TJoined as TJoined[K] extends Record<string, any>
            ? keyof TJoined[K] & string
            : never]?: TJoined[K] extends Record<string, any>
            ?
                | TJoined[K][K extends keyof TJoined[K] ? K : never]
                | TJoined[K][K extends keyof TJoined[K] ? K : never][]
            : never;
        }
      : {});

// Fulltext index 컬럼 추출 타입 (메인 테이블 + 조인된 테이블)
export type FulltextColumns<
  TSchema,
  T extends keyof TSchema | string,
  TResult = any,
  TJoined = {},
> = T extends keyof TSchema
  ? // 기존 테이블 케이스
    | (TSchema[T] extends { __fulltext__: readonly (infer Col)[] }
        ? Col & string
        : never)
      | (TSchema[T] extends { __fulltext__: readonly (infer Col)[] }
          ? `${T & string}.${Col & string}`
          : never)
      | (TJoined extends Record<string, any>
          ? {
              [K in keyof TJoined]: TJoined[K] extends {
                __fulltext__: readonly (infer Col)[];
              }
                ?
                    | (Col & string)
                    | `${string & K}.${Col & string}`
                : never;
            }[keyof TJoined]
          : never)
  : // 서브쿼리 케이스 (T는 alias)
    | (TResult extends { __fulltext__: readonly (infer Col)[] }
        ? Col & string
        : never)
      | (TResult extends { __fulltext__: readonly (infer Col)[] }
          ? `${T & string}.${Col & string}`
          : never)
      | (TJoined extends Record<string, any>
          ? {
              [K in keyof TJoined]: TJoined[K] extends {
                __fulltext__: readonly (infer Col)[];
              }
                ?
                    | (Col & string)
                    | `${string & K}.${Col & string}`
                : never;
            }[keyof TJoined]
          : never);
