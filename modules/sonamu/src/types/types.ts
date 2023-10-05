import { z } from "zod";

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
export function zArrayable<T extends z.ZodTypeAny>(
  shape: T
): z.ZodUnion<[T, z.ZodArray<T, "many">]> {
  return z.union([shape, shape.array()]);
}
export type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

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
  type: "dateTime";
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

export type RelationType =
  | "HasMany"
  | "BelongsToOne"
  | "ManyToMany"
  | "OneToOne";
export type RelationOn =
  | "CASCADE"
  | "SET NULL"
  | "NO ACTION"
  | "SET DEFAULT"
  | "RESTRICT";
type _RelationProp = {
  type: "relation";
  name: string;
  with: string;
  nullable?: boolean;
  toFilter?: true;
  desc?: string;
};
export type OneToOneRelationProp = _RelationProp & {
  relationType: "OneToOne";
  customJoinClause?: string;
} & (
    | {
        hasJoinColumn: true;
        onUpdate: RelationOn;
        onDelete: RelationOn;
      }
    | {
        hasJoinColumn: false;
      }
  );
export type BelongsToOneRelationProp = _RelationProp & {
  relationType: "BelongsToOne";
  customJoinClause?: string;
  onUpdate: RelationOn;
  onDelete: RelationOn;
};
export type HasManyRelationProp = _RelationProp & {
  relationType: "HasMany";
  joinColumn: string;
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
  type: "index" | "unique";
  columns: string[];
  name?: string;
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
export function isIntegerProp(p: any): p is IntegerProp {
  return p?.type === "integer";
}
export function isBigIntegerProp(p: any): p is BigIntegerProp {
  return p?.type === "bigInteger";
}
export function isTextProp(p: any): p is TextProp {
  return p?.type === "text";
}
export function isStringProp(p: any): p is StringProp {
  return p?.type === "string";
}
export function isEnumProp(p: any): p is EnumProp {
  return p?.type === "enum";
}
export function isFloatProp(p: any): p is FloatProp {
  return p?.type === "float";
}
export function isDoubleProp(p: any): p is DoubleProp {
  return p?.type === "double";
}
export function isDecimalProp(p: any): p is DecimalProp {
  return p?.type === "decimal";
}
export function isBooleanProp(p: any): p is BooleanProp {
  return p?.type === "boolean";
}
export function isDateProp(p: any): p is DateProp {
  return p?.type === "date";
}
export function isDateTimeProp(p: any): p is DateTimeProp {
  return p?.type === "dateTime";
}
export function isTimeProp(p: any): p is TimeProp {
  return p?.type === "time";
}
export function isTimestampProp(p: any): p is TimestampProp {
  return p?.type === "timestamp";
}
export function isJsonProp(p: any): p is JsonProp {
  return p?.type === "json";
}
export function isUuidProp(p: any): p is UuidProp {
  return p?.type === "uuid";
}
export function isVirtualProp(p: any): p is VirtualProp {
  return p?.type === "virtual";
}
export function isRelationProp(p: any): p is RelationProp {
  return p?.type === "relation";
}
export function isOneToOneRelationProp(p: any): p is OneToOneRelationProp {
  return p?.relationType === "OneToOne";
}
export function isBelongsToOneRelationProp(
  p: any
): p is BelongsToOneRelationProp {
  return p?.relationType === "BelongsToOne";
}
export function isHasManyRelationProp(p: any): p is HasManyRelationProp {
  return p?.relationType === "HasMany";
}
export function isManyToManyRelationProp(p: any): p is ManyToManyRelationProp {
  return p?.relationType === "ManyToMany";
}

type JoinClause =
  | {
      from: string;
      to: string;
    }
  | {
      custom: string;
    };
export function isCustomJoinClause(p: any): p is { custom: string } {
  return p?.custom;
}

/* 서브셋 */
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

/* Knex Migration */
export type KnexError = {
  code: string;
  errno: number;
  sql: string;
  sqlMessage: string;
  sqlState: string;
};
export function isKnexError(e: any): e is KnexError {
  return e.code && e.sqlMessage && e.sqlState;
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
  | "dateTime";
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
  type: "unique" | "index";
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

  export function isObject(v: any): v is ApiParamType.Object {
    return v?.t === "object";
  }
  export function isUnion(v: any): v is ApiParamType.Union {
    return v?.t === "union";
  }
  export function isIntersection(v: any): v is ApiParamType.Intersection {
    return v?.t === "intersection";
  }
  export function isStringLiteral(v: any): v is ApiParamType.StringLiteral {
    return v?.t === "string-literal";
  }
  export function isNumericLiteral(v: any): v is ApiParamType.NumericLiteral {
    return v?.t === "numeric-literal";
  }
  export function isArray(v: any): v is ApiParamType.Array {
    return v?.t === "array";
  }
  export function isRef(v: any): v is ApiParamType.Ref {
    return v?.t === "ref";
  }
  export function isIndexedAccess(v: any): v is ApiParamType.IndexedAccess {
    return v?.t === "indexed-access";
  }
  export function isTupleType(v: any): v is ApiParamType.TupleType {
    return v?.t === "tuple-type";
  }
  export function isPick(v: any): v is ApiParamType.Pick {
    return v?.t === "ref" && v.id === "Pick";
  }
  export function isOmit(v: any): v is ApiParamType.Omit {
    return v?.t === "ref" && v.id === "Omit";
  }
  export function isPartial(v: any): v is ApiParamType.Partial {
    return v?.t === "ref" && v.id === "Partial";
  }
  export function isPromise(v: any): v is ApiParamType.Promise {
    return v?.t === "ref" && v.id === "Promise";
  }
  export function isContext(v: any): v is ApiParamType.Context {
    return v?.t === "ref" && v.id === "Context";
  }
  export function isTypeParam(v: any): v is ApiParamType.TypeParam {
    return v?.t === "type-param";
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
  }),
  init_types: z.object({
    entityId: z.string(),
  }),
  generated: z.object({
    entityId: z.string(),
  }),
  generated_http: z.object({
    entityId: z.string(),
  }),
  model: z.object({
    entityId: z.string(),
    defaultSearchField: z.string(),
    defaultOrderBy: z.string(),
  }),
  model_test: z.object({
    entityId: z.string(),
  }),
  bridge: z.object({
    entityId: z.string(),
  }),
  service: z.object({
    entityId: z.string(),
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
