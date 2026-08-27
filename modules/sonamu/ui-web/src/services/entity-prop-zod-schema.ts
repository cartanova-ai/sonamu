import { z } from "zod";

export namespace EntityPropZodSchema {
  /**
   * Zod 4 String Format 타입
   * entity.json에서 string 타입의 prop에 zodFormat 옵션을 지정하여
   * BaseSchema 생성 시 Zod의 string format validation을 적용합니다.
   */
  export const ZodStringFormat = z.enum([
    // 기본 포맷
    "email",
    "uuid",
    "url",
    "httpUrl",
    "hostname",
    "emoji",
    "base64",
    "base64url",
    "hex",
    "jwt",
    "nanoid",
    "cuid",
    "cuid2",
    "ulid",
    "ipv4",
    "ipv6",
    "mac",
    "cidrv4",
    "cidrv6",
    // hash 포맷 (알고리즘별)
    "hashMd5",
    "hashSha1",
    "hashSha256",
    "hashSha384",
    "hashSha512",
    // ISO 포맷
    "isoDate",
    "isoTime",
    "isoDatetime",
    "isoDuration",
  ]);
  // Generated Column 스키마
  export const GeneratedColumn = z.object({
    type: z.enum(["STORED", "VIRTUAL"]),
    expression: z.string().min(1, "Generation expression은 필수입니다"),
  });

  // VIRTUAL Generated Column에서 사용 불가능한 타입들
  export const VirtualGeneratedDisallowedTypes = [
    "json",
    "vector",
    "vector[]",
    "string[]",
    "integer[]",
    "bigInteger[]",
    "boolean[]",
    "date[]",
    "uuid[]",
    "number[]",
    "numeric[]",
    "enum[]",
  ] as const;

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
    generated: GeneratedColumn.optional(),
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
    zodFormat: ZodStringFormat.optional(),
  });
  export const StringArrayProp = CommonProp.extend({
    type: z.literal("string[]"),
    length: z.number().optional(),
    zodFormat: ZodStringFormat.optional(),
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
    virtualType: z.enum(["code", "query"]).optional(),
  });
  export const RelationOn = z.enum(["CASCADE", "SET NULL", "NO ACTION", "SET DEFAULT", "RESTRICT"]);
  export const RelationPropBase = z.object({
    type: z.literal("relation"),
    name: z.string(),
    with: z.string(),
    nullable: z.boolean().optional(),
    toFilter: z.boolean().optional(),
    desc: z.string().optional(),
  });
  export const OneToOneRelationCommon = RelationPropBase.extend({
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
  export const BelongsToOneRelationProp = RelationPropBase.extend({
    relationType: z.literal("BelongsToOne"),
    customJoinClause: z.string().optional(),
    onUpdate: RelationOn,
    onDelete: RelationOn,
  });
  export const HasManyRelationProp = RelationPropBase.extend({
    relationType: z.literal("HasMany"),
    joinColumn: z.string(),
    fromColumn: z.string().optional(),
  });
  export const ManyToManyRelationProp = RelationPropBase.extend({
    relationType: z.literal("ManyToMany"),
    joinTable: z.string(),
    onUpdate: RelationOn,
    onDelete: RelationOn,
  });

  export function safeParse(form: {
    type: string;
    relationType?: string;
    length?: number;
    dbDefault?: unknown;
    generated?: { type: string; expression: string };
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 파싱 결과이므로 any 허용
  }): z.ZodSafeParseSuccess<any> | z.ZodSafeParseError<any> {
    const zodSchema = (() => {
      switch (form.type) {
        case "string":
          return EntityPropZodSchema.StringProp;
        case "string[]":
          return EntityPropZodSchema.StringArrayProp;
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

      // Generated Column 검증
      if (result.data.generated) {
        // dbDefault와 generated 동시 사용 불가
        if (result.data.dbDefault !== undefined) {
          return {
            success: false,
            error: new z.ZodError([
              {
                code: "custom",
                message: "dbDefault와 generated는 함께 사용할 수 없습니다",
                path: ["generated"],
              },
            ]),
          };
        }

        // virtual 타입은 generated 불가
        if (result.data.type === "virtual") {
          return {
            success: false,
            error: new z.ZodError([
              {
                code: "custom",
                message: "virtual 타입은 generated column을 지원하지 않습니다",
                path: ["generated"],
              },
            ]),
          };
        }

        // relation 타입은 generated 불가
        if (result.data.type === "relation") {
          return {
            success: false,
            error: new z.ZodError([
              {
                code: "custom",
                message: "relation 타입은 generated column을 지원하지 않습니다",
                path: ["generated"],
              },
            ]),
          };
        }

        // VIRTUAL Generated Column 타입 제한 검증
        if (result.data.generated.type === "VIRTUAL") {
          if (VirtualGeneratedDisallowedTypes.includes(result.data.type)) {
            return {
              success: false,
              error: new z.ZodError([
                {
                  code: "custom",
                  message: `VIRTUAL generated column은 ${result.data.type} 타입을 지원하지 않습니다. STORED를 사용하세요.`,
                  path: ["generated", "type"],
                },
              ]),
            };
          }
        }
      }
    }
    return result;
  }
}
