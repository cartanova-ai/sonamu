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
  export const TextProp = CommonProp.extend({
    type: z.literal("text"),
    textType: z.enum(["text", "mediumtext", "longtext"]),
  });
  export const StringProp = CommonProp.extend({
    type: z.literal("string"),
    length: z.number(),
  });
  export const EnumProp = CommonProp.extend({
    type: z.literal("enum"),
    length: z.number(),
    id: z.string(),
  });
  export const FloatProp = CommonProp.extend({
    type: z.literal("float"),
    unsigned: z.boolean().optional(),
    precision: z.number(),
    scale: z.number(),
  });
  export const DoubleProp = CommonProp.extend({
    type: z.literal("double"),
    unsigned: z.boolean().optional(),
  });
  export const DecimalProp = CommonProp.extend({
    type: z.literal("decimal"),
    unsigned: z.boolean().optional(),
    precision: z.number(),
    scale: z.number(),
  });
  export const BooleanProp = CommonProp.extend({
    type: z.literal("boolean"),
  });
  export const DateProp = CommonProp.extend({
    type: z.literal("date"),
  });
  export const DateTimeProp = CommonProp.extend({
    type: z.literal("dateTime"),
  });
  export const TimeProp = CommonProp.extend({
    type: z.literal("time"),
  });
  export const TimestampProp = CommonProp.extend({
    type: z.literal("timestamp"),
  });
  export const JsonProp = CommonProp.extend({
    type: z.literal("json"),
    id: z.string(),
  });
  export const UuidProp = CommonProp.extend({
    type: z.literal("uuid"),
  });
  export const VirtualProp = CommonProp.extend({
    type: z.literal("virtual"),
    id: z.string(),
  });
  export const RelationOn = z.enum([
    "CASCADE",
    "SET NULL",
    "NO ACTION",
    "SET DEFAULT",
    "RESTRICT",
  ]);
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
  }): z.SafeParseSuccess<any> | z.SafeParseError<any> {
    const zodSchema = (() => {
      switch (form.type) {
        case "string":
          return EntityPropZodSchema.StringProp;
        case "enum":
          return EntityPropZodSchema.EnumProp;
        case "text":
          return EntityPropZodSchema.TextProp;
        case "integer":
          return EntityPropZodSchema.IntegerProp;
        case "bigInteger":
          return EntityPropZodSchema.BigIntegerProp;
        case "float":
          return EntityPropZodSchema.FloatProp;
        case "double":
          return EntityPropZodSchema.DoubleProp;
        case "decimal":
          return EntityPropZodSchema.DecimalProp;
        case "date":
          return EntityPropZodSchema.DateProp;
        case "time":
          return EntityPropZodSchema.TimeProp;
        case "datetime":
          return EntityPropZodSchema.DateTimeProp;
        case "timestamp":
          return EntityPropZodSchema.TimestampProp;
        case "json":
          return EntityPropZodSchema.JsonProp;
        case "virtual":
          return EntityPropZodSchema.VirtualProp;
        case "relation":
          switch (form.relationType) {
            case "OneToOne":
              return EntityPropZodSchema.OneToOneRelationProp;
            case "BelongsToOne":
              return EntityPropZodSchema.BelongsToOneRelationProp.partial();
            case "HasMany":
              return EntityPropZodSchema.HasManyRelationProp.partial();
            case "ManyToMany":
              return EntityPropZodSchema.ManyToManyRelationProp.partial();
          }
          break;
      }
      return z.any();
    })();
    const result = zodSchema.safeParse(form);
    return result;
  }
}
