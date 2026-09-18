import ts from "@typescript/typescript6";
import qs from "qs";
import { z } from "zod";

import { getZodObjectFromApi } from "../../api/code-converters";
import { type ExtendedApi } from "../../api/decorators";
import { Sonamu } from "../../api/sonamu";
import { ApiParamType } from "../../types/types";
import { Template } from "../template";

type RequestDefaultValue =
  | null
  | undefined
  | bigint
  | boolean
  | number
  | string
  | RequestDefaultValue[]
  | RequestDefaultObject;

interface RequestDefaultObject {
  [key: string]: RequestDefaultValue;
}

type PrimitiveDefault = null | boolean | number | string;

const metadataDefaultParseContext = {
  // 전역 오류 맵 대신 부작용 없는 오류 메시지를 사용한다.
  error: () => "API 메타데이터 기본값이 스키마 제약을 충족하지 않습니다.",
};

const metadataInnerTypeSchema = z.instanceof(z.ZodType);
const metadataEmptyChecksSchema = z.tuple([]).optional();
const metadataCheckFunctionSchema = z.instanceof(Function);

const metadataEmailDefSchema = z.strictObject({
  type: z.literal("string"),
  check: z.literal("string_format"),
  format: z.literal("email"),
  abort: z.literal(false),
  pattern: z.instanceof(RegExp),
});

const metadataStringMinLengthDefSchema = z.strictObject({
  check: z.literal("min_length"),
  minimum: z.number(),
  when: metadataCheckFunctionSchema,
});

const metadataStringMaxLengthDefSchema = z.strictObject({
  check: z.literal("max_length"),
  maximum: z.number(),
  when: metadataCheckFunctionSchema,
});

const metadataStringLengthDefSchema = z.strictObject({
  check: z.literal("length_equals"),
  length: z.number(),
  when: metadataCheckFunctionSchema,
});

const metadataStringCheckSchema = z.union([
  z.instanceof(z.ZodEmail),
  z.instanceof(z.core.$ZodCheckMinLength),
  z.instanceof(z.core.$ZodCheckMaxLength),
  z.instanceof(z.core.$ZodCheckLengthEquals),
]);

const metadataCheckedStringDefSchema = z.strictObject({
  type: z.literal("string"),
  coerce: z.literal(false).optional(),
  checks: z.array(metadataStringCheckSchema),
});

const metadataSafeIntDefSchema = z.strictObject({
  type: z.literal("number"),
  check: z.literal("number_format"),
  abort: z.literal(false),
  format: z.literal("safeint"),
});

const metadataGreaterThanDefSchema = z.strictObject({
  check: z.literal("greater_than"),
  value: z.number(),
  inclusive: z.boolean(),
});

const metadataLessThanDefSchema = z.strictObject({
  check: z.literal("less_than"),
  value: z.number(),
  inclusive: z.boolean(),
});

const metadataNumberCheckSchema = z.union([
  z.instanceof(z.ZodNumberFormat),
  z.instanceof(z.core.$ZodCheckGreaterThan),
  z.instanceof(z.core.$ZodCheckLessThan),
]);

const metadataCheckedNumberDefSchema = z.strictObject({
  type: z.literal("number"),
  coerce: z.literal(false).optional(),
  checks: z.array(metadataNumberCheckSchema),
});

const metadataStringDefSchema = z.strictObject({
  type: z.literal("string"),
  coerce: z.literal(false).optional(),
  checks: metadataEmptyChecksSchema,
});

const metadataNumberDefSchema = z.strictObject({
  type: z.literal("number"),
  coerce: z.literal(false).optional(),
  checks: metadataEmptyChecksSchema,
});

const metadataBooleanDefSchema = z.strictObject({
  type: z.literal("boolean"),
  coerce: z.literal(false).optional(),
  checks: metadataEmptyChecksSchema,
});

const metadataEnumDefSchema = z.strictObject({
  type: z.literal("enum"),
  entries: z.record(z.string(), z.union([z.string(), z.number()])),
});

const metadataLiteralDefSchema = z.strictObject({
  type: z.literal("literal"),
  values: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).min(1),
});

const metadataOptionalDefSchema = z.strictObject({
  type: z.literal("optional"),
  innerType: metadataInnerTypeSchema,
});

const metadataNullableDefSchema = z.strictObject({
  type: z.literal("nullable"),
  innerType: metadataInnerTypeSchema,
});

const metadataDefaultInnerDefSchema = z.strictObject({
  type: z.literal("default"),
  innerType: metadataInnerTypeSchema,
});

function cloneMetadataRegExp(pattern: RegExp): RegExp | undefined {
  const sourceGetter = Object.getOwnPropertyDescriptor(RegExp.prototype, "source")?.get;
  const flagsGetter = Object.getOwnPropertyDescriptor(RegExp.prototype, "flags")?.get;
  if (sourceGetter === undefined || flagsGetter === undefined) {
    return undefined;
  }

  try {
    // SAFETY: 원본의 재정의 가능한 프로퍼티와 test를 호출하지 않는다.
    return new RegExp(sourceGetter.call(pattern), flagsGetter.call(pattern));
  } catch {
    return undefined;
  }
}

function cloneMetadataEmailPattern(definition: z.ZodEmail["def"]): RegExp | undefined {
  const result = metadataEmailDefSchema.safeParse(definition, metadataDefaultParseContext);
  if (!result.success) {
    return undefined;
  }

  return cloneMetadataRegExp(result.data.pattern);
}

function cloneMetadataString(reference: z.ZodString): z.ZodString | undefined {
  const result = metadataCheckedStringDefSchema.safeParse(
    reference.def,
    metadataDefaultParseContext,
  );
  if (!result.success) {
    return undefined;
  }

  let schema = z.string();
  for (const check of result.data.checks) {
    // SAFETY: 원본 검사는 실행하지 않고 엄격히 검증한 원시 메타데이터만 사용한다.
    if (check instanceof z.ZodEmail) {
      const pattern = cloneMetadataEmailPattern(check.def);
      if (pattern === undefined) {
        return undefined;
      }
      schema = schema.regex(pattern);
    } else if (check instanceof z.core.$ZodCheckMinLength) {
      const checkResult = metadataStringMinLengthDefSchema.safeParse(
        check._zod.def,
        metadataDefaultParseContext,
      );
      if (!checkResult.success) {
        return undefined;
      }
      schema = schema.min(checkResult.data.minimum);
    } else if (check instanceof z.core.$ZodCheckMaxLength) {
      const checkResult = metadataStringMaxLengthDefSchema.safeParse(
        check._zod.def,
        metadataDefaultParseContext,
      );
      if (!checkResult.success) {
        return undefined;
      }
      schema = schema.max(checkResult.data.maximum);
    } else {
      const checkResult = metadataStringLengthDefSchema.safeParse(
        check._zod.def,
        metadataDefaultParseContext,
      );
      if (!checkResult.success) {
        return undefined;
      }
      schema = schema.length(checkResult.data.length);
    }
  }

  return schema;
}

function cloneMetadataNumber(reference: z.ZodNumber): z.ZodNumber | undefined {
  const result = metadataCheckedNumberDefSchema.safeParse(
    reference.def,
    metadataDefaultParseContext,
  );
  if (!result.success) {
    return undefined;
  }

  let schema = z.number();
  for (const check of result.data.checks) {
    // SAFETY: 원본 검사는 실행하지 않고 엄격히 검증한 원시 메타데이터만 사용한다.
    if (check instanceof z.ZodNumberFormat) {
      const checkResult = metadataSafeIntDefSchema.safeParse(
        check.def,
        metadataDefaultParseContext,
      );
      if (!checkResult.success) {
        return undefined;
      }
      schema = schema.int();
    } else if (check instanceof z.core.$ZodCheckGreaterThan) {
      const checkResult = metadataGreaterThanDefSchema.safeParse(
        check._zod.def,
        metadataDefaultParseContext,
      );
      if (!checkResult.success) {
        return undefined;
      }
      schema = checkResult.data.inclusive
        ? schema.min(checkResult.data.value)
        : schema.gt(checkResult.data.value);
    } else if (check instanceof z.core.$ZodCheckLessThan) {
      const checkResult = metadataLessThanDefSchema.safeParse(
        check._zod.def,
        metadataDefaultParseContext,
      );
      if (!checkResult.success) {
        return undefined;
      }
      schema = checkResult.data.inclusive
        ? schema.max(checkResult.data.value)
        : schema.lt(checkResult.data.value);
    } else {
      return undefined;
    }
  }

  return schema;
}

function parsePrimitiveDefault(defaultDef: string): PrimitiveDefault | undefined {
  const sourceFile = ts.createSourceFile(
    "api-default.ts",
    `const apiDefault = ${defaultDef};`,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );

  // 문법 오류나 문장 삽입이 있는 표현식은 기본값으로 해석하지 않는다.
  const parseDiagnostics =
    /* SAFETY: createSourceFile 결과에는 파서가 수집한 구문 진단이 포함된다. */ (
      sourceFile as ts.SourceFile & {
        readonly parseDiagnostics: readonly ts.Diagnostic[];
      }
    ).parseDiagnostics;
  if (parseDiagnostics.length > 0 || sourceFile.statements.length !== 1) {
    return undefined;
  }

  const statement = sourceFile.statements[0];
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) {
    return undefined;
  }

  const initializer = statement.declarationList.declarations[0]?.initializer;
  if (initializer === undefined) {
    return undefined;
  }

  if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.text;
  }
  if (ts.isNumericLiteral(initializer)) {
    return Number(initializer.text);
  }
  if (ts.isPrefixUnaryExpression(initializer)) {
    if (!ts.isNumericLiteral(initializer.operand)) {
      return undefined;
    }

    const value = Number(initializer.operand.text);
    if (initializer.operator === ts.SyntaxKind.PlusToken) {
      return value;
    }
    if (initializer.operator === ts.SyntaxKind.MinusToken) {
      return -value;
    }

    return undefined;
  }

  switch (initializer.kind) {
    case ts.SyntaxKind.TrueKeyword:
      return true;
    case ts.SyntaxKind.FalseKeyword:
      return false;
    case ts.SyntaxKind.NullKeyword:
      return null;
    default:
      return undefined;
  }
}

function cloneReferencedMetadataDefaultSchema(
  reference: z.ZodType,
  visited: Set<z.ZodType> = new Set(),
): z.ZodType | undefined {
  if (visited.has(reference)) {
    return undefined;
  }
  visited.add(reference);

  if (reference instanceof z.ZodOptional) {
    const result = metadataOptionalDefSchema.safeParse(reference.def, metadataDefaultParseContext);
    return result.success
      ? cloneReferencedMetadataDefaultSchema(result.data.innerType, visited)
      : undefined;
  }
  if (reference instanceof z.ZodNullable) {
    const result = metadataNullableDefSchema.safeParse(reference.def, metadataDefaultParseContext);
    return result.success
      ? cloneReferencedMetadataDefaultSchema(result.data.innerType, visited)
      : undefined;
  }
  if (reference instanceof z.ZodDefault) {
    const definition = reference.def;

    // defaultValue 접근자는 팩토리를 실행하므로 키만 확인하고 안전한 필드만 복사한다.
    const definitionKeys = Reflect.ownKeys(definition);
    const allowedKeys = ["type", "innerType", "defaultValue"];
    if (
      definitionKeys.length !== allowedKeys.length ||
      !allowedKeys.every((key) => Object.prototype.hasOwnProperty.call(definition, key))
    ) {
      return undefined;
    }
    const result = metadataDefaultInnerDefSchema.safeParse(
      { type: definition.type, innerType: definition.innerType },
      metadataDefaultParseContext,
    );
    return result.success
      ? cloneReferencedMetadataDefaultSchema(result.data.innerType, visited)
      : undefined;
  }

  if (reference instanceof z.ZodEmail) {
    const pattern = cloneMetadataEmailPattern(reference.def);
    return pattern === undefined ? undefined : z.string().regex(pattern);
  }
  if (reference instanceof z.ZodString) {
    const result = metadataStringDefSchema.safeParse(reference.def, metadataDefaultParseContext);
    return result.success ? z.string() : cloneMetadataString(reference);
  }
  if (reference instanceof z.ZodNumber) {
    const result = metadataNumberDefSchema.safeParse(reference.def, metadataDefaultParseContext);
    return result.success ? z.number() : cloneMetadataNumber(reference);
  }
  if (reference instanceof z.ZodBoolean) {
    const result = metadataBooleanDefSchema.safeParse(reference.def, metadataDefaultParseContext);
    return result.success ? z.boolean() : undefined;
  }
  if (reference instanceof z.ZodEnum) {
    const result = metadataEnumDefSchema.safeParse(reference.def, metadataDefaultParseContext);
    return result.success ? z.enum(result.data.entries) : undefined;
  }
  if (reference instanceof z.ZodLiteral) {
    const result = metadataLiteralDefSchema.safeParse(reference.def, metadataDefaultParseContext);
    return result.success ? z.literal(result.data.values) : undefined;
  }

  return undefined;
}

function getMetadataDefaultSchema(
  paramType: ApiParamType,
  references: { [typeName: string]: z.ZodType },
): z.ZodType | undefined {
  if (paramType === "string") {
    return z.string();
  }
  if (paramType === "number") {
    return z.number();
  }
  if (paramType === "boolean") {
    return z.boolean();
  }
  // 직접 true/false/null 리터럴은 GET 쿼리 전송과 Fastify 캐스터가 그대로 보존하지 못해 적용하지 않는다.
  if (ApiParamType.isStringLiteral(paramType) || ApiParamType.isNumericLiteral(paramType)) {
    return z.literal(paramType.value);
  }
  if (ApiParamType.isUnion(paramType) && paramType.types.length > 0) {
    const schemas: z.ZodType[] = [];
    for (const type of paramType.types) {
      if (type === "null") {
        continue;
      }

      const schema = getMetadataDefaultSchema(type, references);
      if (schema === undefined) {
        return undefined;
      }
      schemas.push(schema);
    }

    if (schemas.length === 1) {
      return schemas[0];
    }
    if (schemas.length > 1) {
      return z.union(schemas);
    }
  }

  if (ApiParamType.isRef(paramType)) {
    const reference = references[paramType.id];
    return reference === undefined ? undefined : cloneReferencedMetadataDefaultSchema(reference);
  }

  return undefined;
}

export class Template__generated_http extends Template {
  constructor() {
    super("generated_http");
  }

  getTargetAndPath() {
    const { dir } = Sonamu.config.api;

    return {
      target: `${dir}/src/application`,
      path: `sonamu.generated.http`,
    };
  }

  stringifyQueryParams(params: RequestDefaultObject): string {
    return qs
      .stringify(params, { encodeValuesOnly: true, format: "RFC3986" })
      .split("&")
      .join("\n\t&");
  }

  async render() {
    const {
      syncer: { types, apis },
      config: {
        api: {
          route: { prefix },
        },
      },
    } = Sonamu;

    const lines = await Promise.all(
      apis.map(async (api) => {
        const reqObject = this.resolveApiParams(api, types);

        const dataLines = await (async () => {
          if ((api.options.httpMethod ?? "GET") === "GET") {
            return {
              querystring: [this.stringifyQueryParams(reqObject)],
              body: [],
            };
          } else {
            return {
              querystring: [],
              body: ["", JSON.stringify(reqObject, null, 2)],
            };
          }
        })();

        return [
          [
            `${api.options.httpMethod ?? "GET"} {{baseUrl}}${prefix}${api.path}`,
            ...dataLines.querystring,
          ].join("\n\t?"),
          `Content-Type: ${api.options.contentType ?? "application/json"}`,
          ...dataLines.body,
        ].join("\n");
      }),
    );

    return {
      ...this.getTargetAndPath(),
      body: lines.join("\n\n###\n\n"),
      importKeys: [],
      customHeaders: ["# @generated", "# 직접 수정하지 마세요."],
    };
  }

  zodTypeToReqDefault(zodType: z.ZodType, name: string): RequestDefaultValue {
    if (zodType instanceof z.ZodObject) {
      return Object.fromEntries(
        Object.keys(zodType["shape"]).map((key) => [
          key,
          this.zodTypeToReqDefault(zodType["shape"][key], key),
        ]),
      );
    } else if (zodType instanceof z.ZodArray) {
      return [
        this.zodTypeToReqDefault(
          /* SAFETY: ZodArray 분기이므로 element가 배열 원소 스키마다. */ (
            zodType as z.ZodArray<z.ZodType>
          ).element,
          name,
        ),
      ];
    } else if (zodType instanceof z.core.$ZodString) {
      // NOTE: z.ZodString으로 비교하면 z.url(), z.email() 등의 타입에서 문제가 생기므로 z.core.$ZodString으로 비교함
      if (name.endsWith("_at") || name.endsWith("_date") || name === "range") {
        return "2000-01-01";
      } else {
        return name.toUpperCase();
      }
    } else if (zodType instanceof z.ZodNumber) {
      if (name === "num") {
        return 24;
      }

      const minValue = zodType.minValue ?? 0;
      return minValue > Number.MIN_SAFE_INTEGER ? minValue : 0;
    } else if (zodType instanceof z.ZodBoolean) {
      return false;
    } else if (zodType instanceof z.ZodEnum) {
      return zodType.options[0];
    } else if (zodType instanceof z.ZodOptional) {
      return this.zodTypeToReqDefault(
        /* SAFETY: ZodOptional 분기이므로 innerType이 선택 속성의 스키마다. */ (
          zodType as z.ZodOptional<z.ZodType>
        ).def.innerType,
        name,
      );
    } else if (zodType instanceof z.ZodNullable) {
      return null;
    } else if (zodType instanceof z.ZodUnion) {
      return this.zodTypeToReqDefault(
        /* SAFETY: ZodUnion 분기이므로 options의 첫 항목이 유효한 대안 스키마다. */ (
          zodType as z.ZodUnion<z.ZodType[]>
        ).def.options[0],
        name,
      );
    } else if (zodType instanceof z.ZodUnknown) {
      return "unknown";
    } else if (zodType instanceof z.ZodTuple) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- ZodTuple 타입 사용
      return zodType.def.items.map((item: any) => this.zodTypeToReqDefault(item, name));
    } else if (zodType instanceof z.ZodDate) {
      return "2000-01-01";
    } else if (zodType instanceof z.ZodLiteral) {
      return zodType.value;
    } else if (zodType instanceof z.ZodRecord || zodType instanceof z.ZodMap) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- ZodRecord 타입 사용
      const kvDef = /* SAFETY: ZodRecord/ZodMap 분기이므로 def가 키-값 스키마 정의다. */ (
        zodType as z.ZodRecord<any, z.ZodType> | z.ZodMap<z.ZodType, z.ZodType>
      ).def;
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- ZodIntersection 타입 사용
      const key = String(this.zodTypeToReqDefault(kvDef.keyType, name));
      const value = this.zodTypeToReqDefault(kvDef.valueType, name);
      return { [key]: value };
    } else if (zodType instanceof z.ZodSet) {
      return [
        this.zodTypeToReqDefault(
          /* SAFETY: ZodSet 분기이므로 valueType이 집합 원소 스키마다. */ (
            zodType as z.ZodSet<z.ZodType>
          ).def.valueType,
          name,
        ),
      ];
    } else if (zodType instanceof z.ZodIntersection) {
      return this.zodTypeToReqDefault(
        /* SAFETY: ZodIntersection 분기이므로 right가 교차 타입의 우측 스키마다. */ (
          zodType as z.ZodIntersection<z.ZodType, z.ZodType>
        ).def.right,
        name,
      );
    } else if (zodType instanceof z.ZodDefault) {
      return this.zodTypeToReqDefault(
        /* SAFETY: ZodDefault 분기이므로 innerType이 기본값 적용 전 스키마다. */ (
          zodType as z.ZodDefault<z.ZodType>
        ).def.innerType,
        name,
      );
    } else {
      // console.log(zodType);
      return `unknown-${zodType.type}`;
    }
  }

  resolveApiParams(
    api: ExtendedApi,
    references: { [typeName: string]: z.ZodType },
  ): RequestDefaultObject {
    const reqType = getZodObjectFromApi(api, references);

    try {
      // SAFETY: getZodObjectFromApi는 객체 스키마를 반환하므로 기본값도 객체이다.
      const requestDefaults = this.zodTypeToReqDefault(
        reqType,
        "unknownName",
      ) as RequestDefaultObject;

      for (const param of api.parameters) {
        if (!Object.hasOwn(requestDefaults, param.name) || param.defaultDef === undefined) {
          continue;
        }

        const metadataDefaultSchema = getMetadataDefaultSchema(param.type, references);
        if (metadataDefaultSchema === undefined) {
          continue;
        }

        const parsedDefault = parsePrimitiveDefault(param.defaultDef);
        // 명시적 null 기본값은 GET 쿼리 전송과 Fastify 캐스터가 그대로 보존하지 못해 적용하지 않는다.
        if (parsedDefault === undefined || parsedDefault === null) {
          continue;
        }

        if (metadataDefaultSchema.safeParse(parsedDefault, metadataDefaultParseContext).success) {
          requestDefaults[param.name] = parsedDefault;
        }
      }

      return requestDefaults;
    } catch (error) {
      console.error(error);
      throw new Error(`Invalid zod type detected on ${api.modelName}:${api.methodName}`, {
        cause: error,
      });
    }
  }
}
