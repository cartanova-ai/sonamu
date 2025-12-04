import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ApiDecoratorOptions, AuthContext, Context } from "../api";
import type { GuardKey } from "./../api/decorators";

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
}; // PG: integer / TS: number / JSON: number
export type BigIntegerProp = CommonProp & {
  type: "bigInteger";
}; // PG: bigint / TS: bigint / JSON: bigint
export type StringProp = CommonProp & {
  type: "string";
  length?: number; // PG: varchar(n), text / TS: string / JSON: string
}; // PG: text / TS: string / JSON: string
export type EnumProp = CommonProp & {
  type: "enum";
  id: string;
}; // PG: text / TS: string / JSON: string
export type NumberProp = CommonProp & {
  type: "number";
  precision?: number; // PG: numeric(p, s) / TS: number / JSON: number
  scale?: number; // PG: numeric(p, s) / TS: number / JSON: number
  numberType?: "real" | "double precision" | "numeric"; // 기본값: numeric
}; // PG: numeric(p, s) / TS: number / JSON: number
export type NumericProp = CommonProp & {
  type: "numeric";
  precision?: number;
  scale?: number;
}; // PG: numeric(p, s) / TS: string / JSON: string
export type BooleanProp = CommonProp & {
  type: "boolean";
}; // PG: boolean / TS: boolean / JSON: boolean
export type DateProp = CommonProp & {
  type: "date";
}; // PG: timestampz / TS: Date / JSON: string(ISOString)
export type JsonProp = CommonProp & {
  type: "json";
  id: string;
}; // PG: json / TS: any(id) / JSON: any
export type UuidProp = CommonProp & {
  type: "uuid";
}; // PG: uuid / TS: string / JSON: string
export type VirtualProp = CommonProp & {
  type: "virtual";
  id: string;
}; // PG: none / TS: any(id) / JSON: any

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
  | StringProp
  | NumberProp
  | NumericProp
  | BooleanProp
  | DateProp
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
export function isStringProp(p: unknown): p is StringProp {
  return (p as StringProp)?.type === "string";
}
export function isEnumProp(p: unknown): p is EnumProp {
  return (p as EnumProp)?.type === "enum";
}
export function isNumberProp(p: unknown): p is NumberProp {
  return (p as NumberProp)?.type === "number";
}
export function isNumericProp(p: unknown): p is NumericProp {
  return (p as NumericProp)?.type === "numeric";
}
export function isBooleanProp(p: unknown): p is BooleanProp {
  return (p as BooleanProp)?.type === "boolean";
}
export function isDateProp(p: unknown): p is DateProp {
  return (p as DateProp)?.type === "date";
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
export type MigrationColumnType =
  | "string"
  | "integer"
  | "bigInteger"
  | "numberOrNumeric"
  | "boolean"
  | "date"
  | "uuid"
  | "json";
export type MigrationColumn = {
  name: string;
  type: MigrationColumnType;
  nullable: boolean;
  numberType?: "real" | "double precision" | "numeric";
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

const basePropFields = {
  name: z.string(),
  desc: z.string().optional(),
  nullable: z.boolean().optional(),
  toFilter: z.literal(true).optional(),
  dbDefault: z.union([z.string(), z.number(), z.boolean()]).optional(),
};

// 부가 필드가 필요없는 prop
const basePropFieldsWithoutAdditional = z.object({
  ...basePropFields,
  type: z.union([
    z.literal("boolean"),
    z.literal("date"),
    z.literal("datetime"),
    z.literal("time"),
    z.literal("timestamp"),
    z.literal("uuid"),
  ]),
});

// 숫자 타입 공통 (unsigned)
const numericFields = {
  unsigned: z.boolean().optional(),
};

// precision/scale 필드
const precisionScaleFields = {
  precision: z.number(),
  scale: z.number(),
};

// 각 타입별 스키마 정의
const integerPropSchema = z.object({
  ...basePropFields,
  type: z.literal("integer"),
  ...numericFields,
});

const bigIntegerPropSchema = z.object({
  ...basePropFields,
  type: z.literal("bigInteger"),
  ...numericFields,
});

const stringPropSchema = z.object({
  ...basePropFields,
  type: z.literal("string"),
  length: z.number(),
});

const textPropSchema = z.object({
  ...basePropFields,
  type: z.literal("text"),
  textType: z.enum(["text", "mediumtext", "longtext"]),
});

const enumPropSchema = z.object({
  ...basePropFields,
  type: z.literal("enum"),
  id: z.string(),
  length: z.number(),
});

const floatPropSchema = z.object({
  ...basePropFields,
  type: z.literal("float"),
  ...numericFields,
  ...precisionScaleFields,
});

const doublePropSchema = z.object({
  ...basePropFields,
  type: z.literal("double"),
  ...numericFields,
  ...precisionScaleFields,
});

const decimalPropSchema = z.object({
  ...basePropFields,
  type: z.literal("decimal"),
  ...numericFields,
  ...precisionScaleFields,
});

const jsonPropSchema = z.object({
  ...basePropFields,
  type: z.literal("json"),
  id: z.string(),
});

const virtualPropSchema = z.object({
  ...basePropFields,
  type: z.literal("virtual"),
  id: z.string(),
});

// Relation 타입은 relationType에 따라 세분화
const baseRelationFields = {
  ...basePropFields,
  type: z.literal("relation"),
  with: z.string(),
};

// RelationOn 타입
const relationOnSchema = z.enum(["CASCADE", "SET NULL", "NO ACTION", "SET DEFAULT", "RESTRICT"]);

const belongsToOneRelationPropSchema = z.object({
  ...baseRelationFields,
  relationType: z.literal("BelongsToOne"),
  customJoinClause: z.string().optional(),
  useConstraint: z.boolean().optional(),
  onUpdate: relationOnSchema.optional(),
  onDelete: relationOnSchema.optional(),
});

const hasManyRelationPropSchema = z.object({
  ...baseRelationFields,
  relationType: z.literal("HasMany"),
  joinColumn: z.string(),
  fromColumn: z.string().optional(),
});

const manyToManyRelationPropSchema = z.object({
  ...baseRelationFields,
  relationType: z.literal("ManyToMany"),
  joinTable: z.string(),
  onUpdate: relationOnSchema,
  onDelete: relationOnSchema,
});

const oneToOneRelationPropSchema = z
  .object({
    ...baseRelationFields,
    relationType: z.literal("OneToOne"),
    customJoinClause: z.string().optional(),
    hasJoinColumn: z.literal(true),
    useConstraint: z.boolean().optional(),
    onUpdate: relationOnSchema.optional(),
    onDelete: relationOnSchema.optional(),
  })
  .or(
    z.object({
      ...baseRelationFields,
      relationType: z.literal("OneToOne"),
      customJoinClause: z.string().optional(),
      hasJoinColumn: z.literal(false),
    }),
  );

const relationPropSchema = z.union([
  belongsToOneRelationPropSchema,
  hasManyRelationPropSchema,
  manyToManyRelationPropSchema,
  oneToOneRelationPropSchema,
]);

// discriminatedUnion으로 합치기
const entityPropSchema = z
  .discriminatedUnion("type", [
    basePropFieldsWithoutAdditional,
    integerPropSchema,
    bigIntegerPropSchema,
    stringPropSchema,
    textPropSchema,
    enumPropSchema,
    floatPropSchema,
    doublePropSchema,
    decimalPropSchema,
    jsonPropSchema,
    virtualPropSchema,
    // relation은 discriminatedUnion이 아닌 union이므로 별도 처리 필요
  ])
  .or(relationPropSchema);

// EntityIndex 스키마 정의
const entityIndexSchema = z.object({
  type: z.enum(["index", "unique", "fulltext"]),
  columns: z.array(z.string()),
  name: z.string().optional(),
  parser: z.enum(["built-in", "ngram"]).optional(),
});

export const TemplateOptions = z.object({
  entity: z.object({
    id: z.string().describe("PascalCase로 된 Entity ID"),
    title: z.string().describe("Entity 이름"),
    table: z.string().describe("snake_case로 된 테이블명").optional(),
    parentId: z.string().optional().describe("부모 Entity ID"),
    props: z.array(entityPropSchema).optional(),
    indexes: z.array(entityIndexSchema).optional(),
    subsets: z.record(z.string(), z.array(z.string())).optional(),
    enums: z.record(z.string(), z.record(z.string(), z.string())).optional(),
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
