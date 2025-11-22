import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ApiDecoratorOptions, AuthContext, Context } from "../api";
import type { GuardKey } from "./../api/decorators";

/*
  Enums
*/
export type EnumsLabel<T extends string, L extends "ko" | "en"> = {
  [key in T]: { [lang in L]: string };
};
export type EnumsLabelKo<T extends string> = EnumsLabel<T, "ko">;

/*
  Custom Scalars
*/
export const SQLDateTimeString = z
  .string()
  .regex(/([0-9]{4}-[0-9]{2}-[0-9]{2}( [0-9]{2}:[0-9]{2}:[0-9]{2})*)$/, {
    message: "잘못된 SQLDate 타입",
  })
  .min(10)
  .max(19)
  .describe("SQLDateTimeString");
export type SQLDateTimeString = z.infer<typeof SQLDateTimeString>;

/*
  Utility Types
*/
export function zArrayable<T extends z.ZodTypeAny>(shape: T): z.ZodUnion<[T, z.ZodArray<T>]> {
  return z.union([shape, shape.array()]);
}
// biome-ignore lint/suspicious/noExplicitAny: any is used to make the type distributive
export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

/*
  Model-Defintion
*/
export type CommonProp = {
  name: string;
  nullable?: boolean;
  toFilter?: true;
  desc?: string;
  dbDefault?: string;
};
export type IntegerProp = CommonProp & {
  type: "integer";
  unsigned?: true;
};
export type BigIntegerProp = CommonProp & {
  type: "bigInteger";
  unsigned?: true;
};
export type TextProp = CommonProp & {
  type: "text";
  textType: "text" | "mediumtext" | "longtext";
};
export type StringProp = CommonProp & {
  type: "string";
  length: number;
};
export type EnumProp = CommonProp & {
  type: "enum";
  length: number;
  id: string;
};
export type FloatProp = CommonProp & {
  type: "float";
  unsigned?: true;
  precision: number;
  scale: number;
};
export type DoubleProp = CommonProp & {
  type: "double";
  unsigned?: true;
  precision: number;
  scale: number;
};
export type DecimalProp = CommonProp & {
  type: "decimal";
  unsigned?: true;
  precision: number;
  scale: number;
};
export type BooleanProp = CommonProp & {
  type: "boolean";
};
export type DateProp = CommonProp & {
  type: "date";
};
export type DateTimeProp = CommonProp & {
  type: "datetime";
};
export type TimeProp = CommonProp & {
  type: "time";
};
export type TimestampProp = CommonProp & {
  type: "timestamp";
};
export type JsonProp = CommonProp & {
  type: "json";
  id: string;
};
export type UuidProp = CommonProp & {
  type: "uuid";
};
export type VirtualProp = CommonProp & {
  type: "virtual";
  id: string;
};

export type RelationType = "HasMany" | "BelongsToOne" | "ManyToMany" | "OneToOne";
export type RelationOn = "CASCADE" | "SET NULL" | "NO ACTION" | "SET DEFAULT" | "RESTRICT";
type _RelationProp = {
  type: "relation";
  name: string;
  with: string;
  nullable?: boolean; // DEFAULT: false
  toFilter?: true; // DEFAULT: false
  desc?: string;
};
export type OneToOneRelationProp = _RelationProp & {
  relationType: "OneToOne";
  customJoinClause?: string;
} & (
    | {
        hasJoinColumn: true;
        useConstraint?: boolean; // DEFAULT: true
        onUpdate?: RelationOn; // DEFAULT: RESTRICT
        onDelete?: RelationOn; // DEFAULT: RESTRICT
      }
    | {
        hasJoinColumn: false;
      }
  );
export type BelongsToOneRelationProp = _RelationProp & {
  relationType: "BelongsToOne";
  customJoinClause?: string;
  useConstraint?: boolean; // DEFAULT: true
  onUpdate?: RelationOn; // DEFAULT: RESTRICT
  onDelete?: RelationOn; // DEFAULT: RESTRICT
};
export type HasManyRelationProp = _RelationProp & {
  relationType: "HasMany";
  joinColumn: string;
  fromColumn?: string;
};
export type ManyToManyRelationProp = _RelationProp & {
  relationType: "ManyToMany";
  joinTable: `${string}__${string}`;
  onUpdate: RelationOn;
  onDelete: RelationOn;
};
export type RelationProp =
  | OneToOneRelationProp
  | BelongsToOneRelationProp
  | HasManyRelationProp
  | ManyToManyRelationProp;

export type EntityProp =
  | IntegerProp
  | BigIntegerProp
  | TextProp
  | StringProp
  | FloatProp
  | DoubleProp
  | DecimalProp
  | BooleanProp
  | DateProp
  | DateTimeProp
  | TimeProp
  | TimestampProp
  | JsonProp
  | UuidProp
  | EnumProp
  | VirtualProp
  | RelationProp;

export type EntityIndex = {
  type: "index" | "unique" | "fulltext";
  columns: string[];
  name?: string;
  parser?: "built-in" | "ngram";
};
export type EntityJson = {
  id: string;
  parentId?: string;
  table: string;
  title?: string;
  props: EntityProp[];
  indexes: EntityIndex[];
  subsets: {
    [subset: string]: string[];
  };
  enums: {
    [enumId: string]: {
      [key: string]: string;
    };
  };
};
export type EntitySubsetRow = {
  field: string;
  has: {
    [key: string]: boolean;
  };
  children: EntitySubsetRow[];
  prefixes: string[];
  relationEntity?: string;
  isOpen?: boolean;
};
export type FlattenSubsetRow = Omit<EntitySubsetRow, "children">;

// SMD Legacy
export type SMDInput<T extends string> = {
  id: string;
  parentId?: string;
  table?: string;
  title?: string;
  props?: EntityProp[];
  indexes?: EntityIndex[];
  subsets?: {
    [subset: string]: T[];
  };
};

/*
  PropNode
*/

/**
 * 엔티티의 필드 구조를 트리 형태로 표현하는 중간 노드입니다.
 *
 * **목적**: Entity의 subset 필드 표현식(예: "id", "user.name", "tags[]")을
 * 재귀적인 트리 구조로 파싱하여 Zod 스키마 생성의 중간 단계로 사용합니다.
 *
 * **변환 흐름**:
 * Entity subset → EntityPropNode (트리 구조) → Zod 스키마 → RenderingNode (UI용)
 *
 * **nodeType**:
 * - "plain": 단일 필드 (예: "id", "name")
 * - "object": 중첩 객체 (예: "user.name" → user 객체)
 * - "array": 배열 (예: "tags[]" → tags 배열)
 *
 * **사용 위치**: entity-converter.ts의 propNodeToZodType()
 */
export type EntityPropNode =
  | {
      nodeType: "plain";
      prop: EntityProp;
    }
  | {
      nodeType: "object" | "array";
      prop?: EntityProp;
      children: EntityPropNode[];
    };

/*
  Prop Type Guards
*/
export function isIntegerProp(p: unknown): p is IntegerProp {
  return (p as IntegerProp)?.type === "integer";
}
export function isBigIntegerProp(p: unknown): p is BigIntegerProp {
  return (p as BigIntegerProp)?.type === "bigInteger";
}
export function isTextProp(p: unknown): p is TextProp {
  return (p as TextProp)?.type === "text";
}
export function isStringProp(p: unknown): p is StringProp {
  return (p as StringProp)?.type === "string";
}
export function isEnumProp(p: unknown): p is EnumProp {
  return (p as EnumProp)?.type === "enum";
}
export function isFloatProp(p: unknown): p is FloatProp {
  return (p as FloatProp)?.type === "float";
}
export function isDoubleProp(p: unknown): p is DoubleProp {
  return (p as DoubleProp)?.type === "double";
}
export function isDecimalProp(p: unknown): p is DecimalProp {
  return (p as DecimalProp)?.type === "decimal";
}
export function isBooleanProp(p: unknown): p is BooleanProp {
  return (p as BooleanProp)?.type === "boolean";
}
export function isDateProp(p: unknown): p is DateProp {
  return (p as DateProp)?.type === "date";
}
export function isDateTimeProp(p: unknown): p is DateTimeProp {
  return (p as DateTimeProp)?.type === "datetime";
}
export function isTimeProp(p: unknown): p is TimeProp {
  return (p as TimeProp)?.type === "time";
}
export function isTimestampProp(p: unknown): p is TimestampProp {
  return (p as TimestampProp)?.type === "timestamp";
}
export function isJsonProp(p: unknown): p is JsonProp {
  return (p as JsonProp)?.type === "json";
}
export function isUuidProp(p: unknown): p is UuidProp {
  return (p as UuidProp)?.type === "uuid";
}
export function isVirtualProp(p: unknown): p is VirtualProp {
  return (p as VirtualProp)?.type === "virtual";
}
export function isRelationProp(p: unknown): p is RelationProp {
  return (p as RelationProp)?.type === "relation";
}
export function isOneToOneRelationProp(p: unknown): p is OneToOneRelationProp {
  return (p as OneToOneRelationProp)?.relationType === "OneToOne";
}
export function isBelongsToOneRelationProp(p: unknown): p is BelongsToOneRelationProp {
  return (p as BelongsToOneRelationProp)?.relationType === "BelongsToOne";
}
export function isHasManyRelationProp(p: unknown): p is HasManyRelationProp {
  return (p as HasManyRelationProp)?.relationType === "HasMany";
}
export function isManyToManyRelationProp(p: unknown): p is ManyToManyRelationProp {
  return (p as ManyToManyRelationProp)?.relationType === "ManyToMany";
}

type JoinClause =
  | {
      from: string;
      to: string;
    }
  | {
      custom: string;
    };
export function isCustomJoinClause(p: unknown): p is { custom: string } {
  return !!(p as { custom: string })?.custom;
}

/* 서브셋 */
// type SubsetLoader = {
//   as: string;
//   table: string;
//   manyJoin: {
//     fromTable: string;
//     fromCol: string;
//     idField: string;
//     toTable: string;
//     toCol: string;
//     through?: {
//       table: string;
//       fromCol: string;
//       toCol: string;
//     };
//   };
//   oneJoins: ({
//     as: string;
//     join: "inner" | "outer";
//     table: string;
//   } & JoinClause)[];
//   select: (string | Knex.Raw)[];
//   loaders?: SubsetLoader[];
// };
// export type SubsetQuery = {
//   select: (string | Knex.Raw)[];
//   virtual: string[];
//   joins: ({
//     as: string;
//     join: "inner" | "outer";
//     table: string;
//   } & JoinClause)[];
//   loaders: SubsetLoader[];
// };

type SubsetLoader = {
  as: string;
  table: string;
  manyJoin: {
    fromTable: string;
    fromCol: string;
    idField: string;
    toTable: string;
    toCol: string;
    through?: {
      table: string;
      fromCol: string;
      toCol: string;
    };
  };
  oneJoins: ({
    as: string;
    join: "inner" | "outer";
    table: string;
  } & JoinClause)[];
  select: string[];
  loaders?: SubsetLoader[];
};

export type SubsetQuery = {
  select: string[];
  virtual: string[];
  joins: ({
    as: string;
    join: "inner" | "outer";
    table: string;
  } & JoinClause)[];
  loaders: SubsetLoader[];
};

/* BaseModel */
export const SonamuQueryMode = z.enum(["both", "list", "count"]);
export type SonamuQueryMode = z.infer<typeof SonamuQueryMode>;

/* Knex Migration */
export type KnexError = {
  code: string;
  errno: number;
  sql: string;
  sqlMessage: string;
  sqlState: string;
};
export function isKnexError(e: unknown): e is KnexError {
  return !!(e as KnexError)?.code && !!(e as KnexError)?.sqlMessage && !!(e as KnexError)?.sqlState;
}

export type KnexColumnType =
  | "string"
  | "text"
  | "smalltext"
  | "mediumtext"
  | "longtext"
  | "integer"
  | "bigInteger"
  | "decimal"
  | "timestamp"
  | "boolean"
  | "foreign"
  | "uuid"
  | "json"
  | "float"
  | "date"
  | "time"
  | "datetime";
export type MigrationColumn = {
  name: string;
  type: KnexColumnType;
  nullable: boolean;
  unsigned?: boolean;
  length?: number;
  defaultTo?: string;
  precision?: number;
  scale?: number;
};
export type MigrationIndex = {
  columns: string[];
  type: "unique" | "index" | "fulltext";
  parser?: "built-in" | "ngram";
};
export type MigrationForeign = {
  columns: string[];
  to: string;
  onUpdate: RelationOn;
  onDelete: RelationOn;
};
export type MigrationJoinTable = {
  table: string;
  indexes: MigrationIndex[];
  columns: MigrationColumn[];
  foreigns: MigrationForeign[];
};
export type MigrationSet = {
  table: string;
  columns: MigrationColumn[];
  indexes: MigrationIndex[];
  foreigns: MigrationForeign[];
};
export type MigrationSetAndJoinTable = MigrationSet & {
  joinTables: MigrationJoinTable[];
};
export type GenMigrationCode = {
  title: string;
  table: string;
  type: "normal" | "foreign";
  formatted: string | null;
};

/* Api */
export type ApiParam = {
  name: string;
  type: ApiParamType;
  optional: boolean;
  defaultDef?: string;
};
export namespace ApiParamType {
  export type Object = {
    t: "object";
    props: ApiParam[];
  };
  export type Union = {
    t: "union";
    types: ApiParamType[];
  };
  export type Intersection = {
    t: "intersection";
    types: ApiParamType[];
  };
  export type StringLiteral = {
    t: "string-literal";
    value: string;
  };
  export type NumericLiteral = {
    t: "numeric-literal";
    value: number;
  };
  export type Array = {
    t: "array";
    elementsType: ApiParamType;
  };
  export type Ref = {
    t: "ref";
    id: string;
    args?: ApiParamType[];
  };
  export type IndexedAccess = {
    t: "indexed-access";
    object: ApiParamType;
    index: ApiParamType;
  };
  export type TupleType = {
    t: "tuple-type";
    elements: ApiParamType[];
  };
  export type Pick = Ref & {
    t: "ref";
    id: "Pick";
  };
  export type Omit = Ref & {
    t: "ref";
    id: "Omit";
  };
  export type Partial = Ref & {
    t: "ref";
    id: "Partial";
  };
  export type Promise = Ref & {
    t: "ref";
    id: "Promise";
  };
  export type Context = Ref & {
    t: "ref";
    id: "Context";
  };
  export type TypeParam = {
    t: "type-param";
    id: string;
    constraint?: ApiParamType;
  };

  export function isObject(v: unknown): v is ApiParamType.Object {
    return (v as ApiParamType.Object)?.t === "object";
  }
  export function isUnion(v: unknown): v is ApiParamType.Union {
    return (v as ApiParamType.Union)?.t === "union";
  }
  export function isIntersection(v: unknown): v is ApiParamType.Intersection {
    return (v as ApiParamType.Intersection)?.t === "intersection";
  }
  export function isStringLiteral(v: unknown): v is ApiParamType.StringLiteral {
    return (v as ApiParamType.StringLiteral)?.t === "string-literal";
  }
  export function isNumericLiteral(v: unknown): v is ApiParamType.NumericLiteral {
    return (v as ApiParamType.NumericLiteral)?.t === "numeric-literal";
  }
  export function isArray(v: unknown): v is ApiParamType.Array {
    return (v as ApiParamType.Array)?.t === "array";
  }
  export function isRef(v: unknown): v is ApiParamType.Ref {
    return typeof v === "object" && v !== null && (v as { t?: unknown }).t === "ref";
  }
  export function isIndexedAccess(v: unknown): v is ApiParamType.IndexedAccess {
    return typeof v === "object" && v !== null && (v as { t?: unknown }).t === "indexed-access";
  }
  export function isTupleType(v: unknown): v is ApiParamType.TupleType {
    return typeof v === "object" && v !== null && (v as { t?: unknown }).t === "tuple-type";
  }
  export function isPick(v: unknown): v is ApiParamType.Pick {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Pick"
    );
  }
  export function isOmit(v: unknown): v is ApiParamType.Omit {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Omit"
    );
  }
  export function isPartial(v: unknown): v is ApiParamType.Partial {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Partial"
    );
  }
  export function isPromise(v: unknown): v is ApiParamType.Promise {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Promise"
    );
  }
  export function isContext(v: unknown): v is ApiParamType.Context {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Context"
    );
  }
  export function isRefKnex(v: unknown): v is ApiParamType.Ref {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Knex"
    );
  }
  export function isTypeParam(v: unknown): v is ApiParamType.TypeParam {
    return typeof v === "object" && v !== null && (v as { t?: unknown }).t === "type-param";
  }
}
export type ApiParamType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "void"
  | "any"
  | "unknown"
  | "true"
  | "false"
  | ApiParamType.StringLiteral
  | ApiParamType.NumericLiteral
  | ApiParamType.Object
  | ApiParamType.Union
  | ApiParamType.Intersection
  | ApiParamType.Array
  | ApiParamType.Ref
  | ApiParamType.IndexedAccess
  | ApiParamType.TypeParam
  | ApiParamType.TupleType;

/* Template */
/**
 * UI 컴포넌트 렌더링을 위한 메타데이터 노드입니다.
 *
 * **목적**: Zod 스키마로부터 프론트엔드 UI 컴포넌트를 자동 생성하기 위한
 * 렌더링 정보를 담은 트리 구조입니다. 각 필드가 어떤 UI 컴포넌트로
 * 표현되어야 하는지(텍스트, 이미지, 날짜, Enum 선택 등)를 명시합니다.
 *
 * **변환 흐름**:
 * Entity subset → EntityPropNode → Zod 스키마 → RenderingNode (UI용) → React 컴포넌트 코드 생성
 *
 * **주요 필드**:
 * - `renderType`: UI 컴포넌트 유형 (string-plain, number-fk_id, enums, array 등)
 * - `zodType`: 원본 Zod 스키마 (validation 용)
 * - `children`: 중첩된 객체 필드들 (object일 때)
 * - `element`: 배열 요소 타입 (array일 때)
 *
 * **사용 위치**:
 * - zod-converter.ts의 zodTypeToRenderingNode()에서 생성
 * - view_form.template.ts, view_list.template.ts 등에서 React 컴포넌트 코드 생성에 사용
 */
// 셀프 참조 타입이므로 Zod 생략하고 직접 정의
export const RenderingNode = z.any();
export type RenderingNode = {
  name: string;
  label: string;
  renderType:
    | "string-plain"
    | "string-image"
    | "string-datetime"
    | "string-date"
    | "datetime"
    | "number-plain"
    | "number-id"
    | "number-fk_id"
    | "boolean"
    | "enums"
    | "array"
    | "array-images"
    | "object"
    | "object-pick"
    | "record";
  zodType: z.ZodTypeAny;
  element?: RenderingNode;
  children?: RenderingNode[];
  config?: {
    picked: string;
  };
  optional?: boolean;
  nullable?: boolean;
};

export const TemplateOptions = z.object({
  entity: z.object({
    entityId: z.string(),
    parentId: z.string().optional(),
    title: z.string(),
    table: z.string().optional(),
    props: z.array(z.object({})).optional(),
    indexes: z.array(z.object({})).optional(),
    subsets: z.object({}).optional(),
    enums: z.object({}).optional(),
  }),
  init_types: z.object({
    entityId: z.string(),
  }),
  generated: z.object({}),
  generated_sso: z.object({}),
  generated_http: z.object({
    entityId: z.string(),
  }),
  model: z.object({
    entityId: z.string(),
    defaultSearchField: z.string().optional(),
    defaultOrderBy: z.string().optional(),
  }),
  model_test: z.object({
    entityId: z.string(),
  }),
  bridge: z.object({
    entityId: z.string(),
  }),
  service: z.object({
    namesRecord: z.object({
      fs: z.string(),
      fsPlural: z.string(),
      camel: z.string(),
      camelPlural: z.string(),
      capital: z.string(),
      capitalPlural: z.string(),
      upper: z.string(),
      constant: z.string(),
    }),
    modelTsPath: z.string(),
  }),
  view_list: z.object({
    entityId: z.string(),
    extra: z.unknown(),
  }),
  view_list_columns: z.object({
    entityId: z.string(),
    columns: z
      .object({
        name: z.string(),
        label: z.string(),
        tc: z.string(),
      })
      .array(),
    columnImports: z.string(),
  }),
  view_search_input: z.object({
    entityId: z.string(),
  }),
  view_form: z.object({
    entityId: z.string(),
  }),
  view_id_all_select: z.object({
    entityId: z.string(),
  }),
  view_id_async_select: z.object({
    entityId: z.string(),
    textField: z.string(),
  }),
  view_enums_select: z.object({
    entityId: z.string(),
    enumId: z.string(),
  }),
  view_enums_dropdown: z.object({
    entityId: z.string(),
    enumId: z.string(),
  }),
  view_enums_buttonset: z.object({
    entityId: z.string(),
    enumId: z.string(),
  }),
});
export type TemplateOptions = z.infer<typeof TemplateOptions>;

export const TemplateKey = z.enum([
  "entity",
  "init_types",
  "generated",
  "generated_sso",
  "generated_http",
  "model",
  "model_test",
  "bridge",
  "service",
  "view_list",
  "view_list_columns",
  "view_search_input",
  "view_form",
  "view_id_all_select",
  "view_id_async_select",
  "view_enums_select",
  "view_enums_dropdown",
  "view_enums_buttonset",
]);
export type TemplateKey = z.infer<typeof TemplateKey>;

export const GenerateOptions = z.object({
  overwrite: z.boolean().optional(),
});
export type GenerateOptions = z.infer<typeof GenerateOptions>;

export const PathAndCode = z.object({
  path: z.string(),
  code: z.string(),
});
export type PathAndCode = z.infer<typeof PathAndCode>;

export type FixtureSearchOptions = {
  entityId: string;
  field: string;
  value: string;
  searchType: "equals" | "like";
};

type ColumnValue = string | number | boolean | Date | null;
export type FixtureRecord = {
  fixtureId: string;
  entityId: string;
  id: number;
  columns: {
    [key: string]: {
      prop: EntityProp;
      value: ColumnValue | ColumnValue[];
    };
  };
  fetchedRecords: string[];
  belongsRecords: string[];
  target?: FixtureRecord; // Import 대상 DB 레코드(id가 같은)
  unique?: FixtureRecord; // Import 대상 DB 레코드(unique key가 같은)
  override?: boolean;
};

export type FixtureImportResult = {
  entityId: string;
  data: {
    [key: string]: ColumnValue;
  };
};

export type RelationNode = {
  fixtureId: string;
  entityId: string;
  related: Set<string>;
};

// biome-ignore lint/suspicious/noEmptyInterface: sonamu.generated.sso 에서 확장을 위해 준비된 빈 인터페이스
export interface DatabaseSchemaExtend {}
export type ManyToManyBaseSchema<FromIdKey extends string, ToIdKey extends string> = {
  id: number;
} & {
  [K in `${FromIdKey}_id`]: number;
} & {
  [K in `${ToIdKey}_id`]: number;
};

export type SonamuFastifyConfig = {
  contextProvider: (
    defaultContext: Pick<Context, "request" | "reply" | "headers" | "createSSE" | "naiteStore"> &
      AuthContext,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Context | Promise<Context>;
  guardHandler: (
    guard: GuardKey,
    request: FastifyRequest,
    api: {
      typeParameters: ApiParamType.TypeParam[];
      parameters: ApiParam[];
      returnType: ApiParamType;
      modelName: string;
      methodName: string;
      path: string;
      options: ApiDecoratorOptions;
    },
  ) => void;
  cache?: {
    get: (key: string) => Promise<unknown | null>;
    put: (key: string, value: unknown, ttl?: number) => Promise<void>;
    resolveKey: (
      path: string,
      reqBody: {
        [key: string]: unknown;
      },
    ) =>
      | {
          cache: false;
        }
      | {
          cache: true;
          key: string;
          ttl?: number;
        };
  };
};
