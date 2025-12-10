import { z } from "zod";

export namespace EntityPropZodSchema {
  export const CommonProp = z.object({
    name: z.string().nonempty(),
    nullable: z.boolean().optional(),
    toFilter: z.boolean().optional(),
    desc: z.string().optional(),
    dbDefault: z
      .union([
        z.string(),
        z.number(),
        z.object({
          raw: z.string(),
        }),
      ])
      .optional(),
  });
  export const IntegerProp = CommonProp.extend({
    type: z.literal("integer"),
    unsigned: z.boolean().optional(),
  });
  export const BigIntegerProp = CommonProp.extend({
    type: z.literal("bigInteger"),
    unsigned: z.boolean().optional(),
  });
  export const StringProp = CommonProp.extend({
    type: z.literal("string"),
    length: z.number().optional(),
  });
  export const EnumProp = CommonProp.extend({
    type: z.literal("enum"),
    id: z.string(),
  });
  export const NumberProp = CommonProp.extend({
    type: z.literal("number"),
    precision: z.number().optional(),
    scale: z.number().optional(),
    numberType: z.enum(["real", "double precision", "numeric"]).optional(),
  });
  export const NumericProp = CommonProp.extend({
    type: z.literal("numeric"),
    precision: z.number().optional(),
    scale: z.number().optional(),
  });
  export const BooleanProp = CommonProp.extend({
    type: z.literal("boolean"),
  });
  export const DateProp = CommonProp.extend({
    type: z.literal("date"),
  });
  export const JsonProp = CommonProp.extend({
    type: z.literal("json"),
    id: z.string(),
  });
  export const UuidProp = CommonProp.extend({
    type: z.literal("uuid"),
  });
  export const VectorProp = CommonProp.extend({
    type: z.literal("vector"),
    dimensions: z.number(),
  });
  export const VectorArrayProp = CommonProp.extend({
    type: z.literal("vector[]"),
    dimensions: z.number(),
  });
  export const VirtualProp = CommonProp.extend({
    type: z.literal("virtual"),
    id: z.string(),
  });
  export const RelationOn = z.enum(["CASCADE", "SET NULL", "NO ACTION", "SET DEFAULT", "RESTRICT"]);
  export const _RelationProp = z.object({
    type: z.literal("relation"),
    name: z.string(),
    with: z.string(),
    nullable: z.boolean().optional(),
    toFilter: z.boolean().optional(),
    desc: z.string().optional(),
  });
  export const OneToOneRelationCommon = _RelationProp.extend({
    relationType: z.literal("OneToOne"),
    customJoinClause: z.string().optional(),
  });
  export const OneToOneRelationProp = z.union([
    OneToOneRelationCommon.extend({
      hasJoinColumn: z.literal(false).optional(),
    }),
    OneToOneRelationCommon.extend({
      hasJoinColumn: z.literal(true).optional(),
      onUpdate: RelationOn,
      onDelete: RelationOn,
    }),
  ]);
  export const BelongsToOneRelationProp = _RelationProp.extend({
    relationType: z.literal("BelongsToOne"),
    customJoinClause: z.string().optional(),
    onUpdate: RelationOn,
    onDelete: RelationOn,
  });
  export const HasManyRelationProp = _RelationProp.extend({
    relationType: z.literal("HasMany"),
    joinColumn: z.string(),
    fromColumn: z.string().optional(),
  });
  export const ManyToManyRelationProp = _RelationProp.extend({
    relationType: z.literal("ManyToMany"),
    joinTable: z.string(),
    onUpdate: RelationOn,
    onDelete: RelationOn,
  });

  export function safeParse(form: {
    type: string;
    relationType?: string;
    length?: number;
    // biome-ignore lint/suspicious/noExplicitAny: 파싱 결과이므로 any 허용
  }): z.ZodSafeParseSuccess<any> | z.ZodSafeParseError<any> {
    const zodSchema = (() => {
      switch (form.type) {
        case "string":
          return EntityPropZodSchema.StringProp;
        case "enum":
          return EntityPropZodSchema.EnumProp;
        case "integer":
          return EntityPropZodSchema.IntegerProp;
        case "bigInteger":
          return EntityPropZodSchema.BigIntegerProp;
        case "number":
          return EntityPropZodSchema.NumberProp;
        case "numeric":
          return EntityPropZodSchema.NumericProp;
        case "date":
          return EntityPropZodSchema.DateProp;
        case "json":
          return EntityPropZodSchema.JsonProp;
        case "boolean":
          return EntityPropZodSchema.BooleanProp;
        case "uuid":
          return EntityPropZodSchema.UuidProp;
        case "vector":
          return EntityPropZodSchema.VectorProp;
        case "vector[]":
          return EntityPropZodSchema.VectorArrayProp;
        case "virtual":
          return EntityPropZodSchema.VirtualProp;
        case "relation":
          switch (form.relationType) {
            case "OneToOne":
              return EntityPropZodSchema.OneToOneRelationProp;
            case "BelongsToOne":
              return EntityPropZodSchema.BelongsToOneRelationProp;
            case "HasMany":
              return EntityPropZodSchema.HasManyRelationProp;
            case "ManyToMany":
              return EntityPropZodSchema.ManyToManyRelationProp;
            case undefined:
              return z.object({
                name: z.string().nonempty(),
                relationType: z.enum(["OneToOne", "BelongsToOne", "HasMany", "ManyToMany"]),
              });
          }
          break;
      }
      return z.any();
    })();
    if (form.type === "string" && form.length === null) {
      delete form.length;
    }
    const result = zodSchema.safeParse(form);

    if (result.success) {
      if (
        result.data.type === "number" &&
        result.data.numberType !== "numeric" &&
        (result.data.precision || result.data.scale)
      ) {
        delete result.data.precision;
        delete result.data.scale;
      }
    }
    return result;
  }
}
