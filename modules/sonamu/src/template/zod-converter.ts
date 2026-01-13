/**
 * zod-converter 구성
 * 1. 유틸리티
 *  - getZodTypeById
 *
 * 2. Zod 타입 변환 (EntityProp -> ZodType)
 *  - propToZodType
 *
 * 3. EntityProp/Node -> Zod 코드 문자열
 *  - propToZodTypeDef
 *  - propNodeToZodTypeDef
 *
 * 4. Zod 타입 인스턴스를 해당하는 Zod 코드 문자열로 변환 (ZodType -> ZodCode)
 *  - zodTypeToZodCode
 *
 * 5. Zod 타입을 UI 렌더링에 사용할 수 있는 RenderingNode로 변환 (ZodType -> RenderingNode)
 *  - zodTypeToRenderingNode
 *  - resolveRenderType
 */

import inflection from "inflection";
import path from "path";
import { z } from "zod";
import type { $ZodLooseShape } from "zod/v4/core";
import { Sonamu } from "../api/sonamu";
import { EntityManager } from "../entity/entity-manager";
import {
  BUILT_IN_TYPE_IDS,
  type EntityProp,
  type EntityPropNode,
  isBelongsToOneRelationProp,
  isBigIntegerArrayProp,
  isBigIntegerSingleProp,
  isBooleanArrayProp,
  isBooleanSingleProp,
  isDateArrayProp,
  isDateSingleProp,
  isEnumArrayProp,
  isEnumSingleProp,
  isIntegerArrayProp,
  isIntegerSingleProp,
  isJsonProp,
  isNumberArrayProp,
  isNumberSingleProp,
  isNumericArrayProp,
  isNumericSingleProp,
  isOneToOneRelationProp,
  isRelationProp,
  isStringArrayProp,
  isStringSingleProp,
  isTsVectorProp,
  isUuidArrayProp,
  isUuidSingleProp,
  isVectorArrayProp,
  isVectorSingleProp,
  isVirtualProp,
  type RenderingNode,
  SonamuFileArraySchema,
  SonamuFileSchema,
} from "../types/types";
import { createImportUrl } from "../utils/esm-utils";
import { runtimePath } from "../utils/path-utils";

// <any>를 자제하고, Zod에서 제약하는 기본적인 Generic Type Parameter를 사용함.
type AnyZodRecord = z.ZodRecord<z.ZodString | z.ZodNumber | z.ZodSymbol, z.ZodType>;
type AnyZodObject = z.ZodObject<$ZodLooseShape>;
type AnyZodNullable = z.ZodNullable<z.ZodType>;
type AnyZodDefault = z.ZodDefault<z.ZodType>;
type AnyZodUnion = z.ZodUnion<z.ZodType[]>;
type AnyZodArray = z.ZodArray<z.ZodType>;
type AnyZodOptional = z.ZodOptional<z.ZodType>;
type AnyZodTemplateLiteral = z.ZodTemplateLiteral<string>;

/**
 * 내장 타입 정의 (Zod 스키마 + UI 렌더링 타입)
 */
export const BUILT_IN_TYPES = {
  SonamuFile: {
    schema: SonamuFileSchema,
    renderType: "json-sonamufile",
    schemaName: "SonamuFileSchema",
  },
  "SonamuFile[]": {
    schema: SonamuFileArraySchema,
    renderType: "json-sonamufile-array",
    schemaName: "SonamuFileArraySchema",
  },
} as const;

/**
 * Zod 타입 ID로부터 동적으로 Zod 스키마를 로드합니다.
 * 내장 타입(BUILT_IN_TYPE_IDS)은 바로 반환하고,
 * 그 외는 dist 디렉토리에서 ESM으로 import하여 가져옵니다.
 */
export async function getZodTypeById(zodTypeId: string): Promise<z.ZodTypeAny> {
  // 내장 타입 처리
  if ((BUILT_IN_TYPE_IDS as readonly string[]).includes(zodTypeId)) {
    const builtInType = BUILT_IN_TYPES[zodTypeId as keyof typeof BUILT_IN_TYPES];
    if (!builtInType) {
      throw new Error(`내장 타입 ${zodTypeId}의 스키마가 정의되지 않았습니다`);
    }
    return builtInType.schema.describe(zodTypeId);
  }

  // 프로젝트에서 정의한 타입 동적 로드
  const modulePath = EntityManager.getModulePath(zodTypeId);
  const moduleAbsPath = path.join(
    Sonamu.apiRootPath,
    runtimePath(`dist/application/${modulePath}.js`),
  );
  const importUrl = createImportUrl(moduleAbsPath);
  const imported = await import(importUrl);

  if (!imported[zodTypeId]) {
    throw new Error(`존재하지 않는 zodTypeId ${zodTypeId}`);
  }
  return imported[zodTypeId].describe(zodTypeId);
}

/**
 * EntityProp을 Zod 타입으로 변환합니다.
 * 각 prop의 타입에 따라 적절한 Zod validator를 생성합니다.
 */
export async function propToZodType(prop: EntityProp): Promise<z.ZodTypeAny> {
  let zodType: z.ZodTypeAny = z.unknown();
  if (isIntegerSingleProp(prop)) {
    zodType = z.number().int();
  } else if (isIntegerArrayProp(prop)) {
    zodType = z.number().int().array();
  } else if (isBigIntegerSingleProp(prop)) {
    zodType = z.bigint();
  } else if (isBigIntegerArrayProp(prop)) {
    zodType = z.bigint().array();
  } else if (isEnumSingleProp(prop)) {
    zodType = await getZodTypeById(prop.id);
  } else if (isEnumArrayProp(prop)) {
    zodType = (await getZodTypeById(prop.id)).array();
  } else if (isStringSingleProp(prop)) {
    if (prop.length) {
      zodType = z.string().max(prop.length);
    } else {
      zodType = z.string();
    }
  } else if (isStringArrayProp(prop)) {
    if (prop.length) {
      zodType = z.string().max(prop.length).array();
    } else {
      zodType = z.string().array();
    }
  } else if (isNumberSingleProp(prop)) {
    zodType = z.number();
  } else if (isNumberArrayProp(prop)) {
    zodType = z.number().array();
  } else if (isNumericSingleProp(prop)) {
    zodType = z.string();
  } else if (isNumericArrayProp(prop)) {
    zodType = z.string().array();
  } else if (isBooleanSingleProp(prop)) {
    zodType = z.boolean();
  } else if (isBooleanArrayProp(prop)) {
    zodType = z.boolean().array();
  } else if (isDateSingleProp(prop)) {
    zodType = z.date();
  } else if (isDateArrayProp(prop)) {
    zodType = z.date().array();
  } else if (isUuidSingleProp(prop)) {
    zodType = z.uuid();
  } else if (isUuidArrayProp(prop)) {
    zodType = z.uuid().array();
  } else if (isJsonProp(prop)) {
    zodType = await getZodTypeById(prop.id);
  } else if (isVectorSingleProp(prop)) {
    zodType = z.array(z.number());
  } else if (isVectorArrayProp(prop)) {
    zodType = z.array(z.array(z.number()));
  } else if (isVirtualProp(prop)) {
    zodType = await getZodTypeById(prop.id);
  } else if (isRelationProp(prop)) {
    if (isBelongsToOneRelationProp(prop) || (isOneToOneRelationProp(prop) && prop.hasJoinColumn)) {
      zodType = z.number().int();
    }
  } else {
    throw new Error(`prop을 zodType으로 변환하는데 실패 ${prop}}`);
  }

  if ((prop as { unsigned?: boolean }).unsigned) {
    zodType = (zodType as z.ZodNumber).nonnegative();
  }
  if (prop.nullable) {
    zodType = zodType.nullable();
  }

  return zodType;
}

/**
 * EntityProp을 Zod 타입 정의 코드 문자열로 변환합니다.
 */
export function propToZodTypeDef(prop: EntityProp, injectImportKeys: string[]): string {
  let stmt: string;
  if (isIntegerSingleProp(prop)) {
    stmt = `${prop.name}: z.int()`;
  } else if (isIntegerArrayProp(prop)) {
    stmt = `${prop.name}: z.int().array()`;
  } else if (isBigIntegerSingleProp(prop)) {
    stmt = `${prop.name}: z.bigint()`;
  } else if (isBigIntegerArrayProp(prop)) {
    stmt = `${prop.name}: z.bigint().array()`;
  } else if (isEnumSingleProp(prop)) {
    stmt = `${prop.name}: ${prop.id}`;
    injectImportKeys.push(prop.id);
  } else if (isEnumArrayProp(prop)) {
    stmt = `${prop.name}: ${prop.id}.array()`;
    injectImportKeys.push(prop.id);
  } else if (isStringSingleProp(prop)) {
    if (prop.length) {
      stmt = `${prop.name}: z.string().max(${prop.length})`;
    } else {
      stmt = `${prop.name}: z.string()`;
    }
  } else if (isStringArrayProp(prop)) {
    if (prop.length) {
      stmt = `${prop.name}: z.string().max(${prop.length}).array()`;
    } else {
      stmt = `${prop.name}: z.string().array()`;
    }
  } else if (isNumberSingleProp(prop)) {
    stmt = `${prop.name}: z.number()`;
  } else if (isNumberArrayProp(prop)) {
    stmt = `${prop.name}: z.number().array()`;
  } else if (isNumericSingleProp(prop)) {
    stmt = `${prop.name}: z.string()`;
  } else if (isNumericArrayProp(prop)) {
    stmt = `${prop.name}: z.string().array()`;
  } else if (isDateSingleProp(prop)) {
    stmt = `${prop.name}: z.date()`;
  } else if (isDateArrayProp(prop)) {
    stmt = `${prop.name}: z.date().array()`;
  } else if (isBooleanSingleProp(prop)) {
    stmt = `${prop.name}: z.boolean()`;
  } else if (isBooleanArrayProp(prop)) {
    stmt = `${prop.name}: z.boolean().array()`;
  } else if (isUuidSingleProp(prop)) {
    stmt = `${prop.name}: z.uuid()`;
  } else if (isUuidArrayProp(prop)) {
    stmt = `${prop.name}: z.uuid().array()`;
  } else if (isJsonProp(prop)) {
    // 내장 타입인 경우 스키마 이름으로 변환
    if ((BUILT_IN_TYPE_IDS as readonly string[]).includes(prop.id)) {
      const schemaName = prop.id === "SonamuFile" ? "SonamuFileSchema" : "SonamuFileArraySchema";
      stmt = `${prop.name}: ${schemaName}`;
      injectImportKeys.push(schemaName);
    } else {
      stmt = `${prop.name}: ${prop.id}`;
      injectImportKeys.push(prop.id);
    }
  } else if (isVectorSingleProp(prop)) {
    stmt = `${prop.name}: z.array(z.number())`;
  } else if (isVectorArrayProp(prop)) {
    stmt = `${prop.name}: z.array(z.array(z.number()))`;
  } else if (isTsVectorProp(prop)) {
    stmt = `${prop.name}: z.string()`;
  } else if (isVirtualProp(prop)) {
    stmt = `${prop.name}: ${prop.id}`;
    injectImportKeys.push(prop.id);
  } else if (isRelationProp(prop)) {
    if (isBelongsToOneRelationProp(prop) || (isOneToOneRelationProp(prop) && prop.hasJoinColumn)) {
      stmt = `${prop.name}_id: z.int()`;
    } else {
      // 그외 relation 케이스 제외
      return `// ${prop.name}: ${prop.relationType} ${prop.with}`;
    }
  } else {
    return "// unable to resolve";
  }

  if ((prop as { unsigned?: boolean }).unsigned) {
    stmt += ".nonnegative()";
  }
  if (prop.nullable) {
    stmt += ".nullable()";
  }

  return `${stmt},`;
}

/**
 * EntityPropNode를 Zod 타입 정의 코드 문자열로 변환합니다.
 * plain, array, object 노드 타입을 재귀적으로 처리하여 중첩 구조를 지원합니다.
 */
export function propNodeToZodTypeDef(propNode: EntityPropNode, injectImportKeys: string[]): string {
  if (propNode.nodeType === "plain") {
    return propToZodTypeDef(propNode.prop, injectImportKeys);
  } else if (propNode.nodeType === "array") {
    return [
      propNode.prop ? `${propNode.prop.name}: ` : "",
      "z.array(z.object({",
      propNode.children
        .map((childPropNode) => propNodeToZodTypeDef(childPropNode, injectImportKeys))
        .join("\n"),
      "",
      "})),",
    ].join("\n");
  } else if (propNode.nodeType === "object") {
    return [
      propNode.prop ? `${propNode.prop.name}: ` : "",
      "z.object({",
      propNode.children
        .map((childPropNode) => propNodeToZodTypeDef(childPropNode, injectImportKeys))
        .join("\n"),
      "",
      `})${propNode.prop?.nullable ? ".nullable()" : ""},`,
    ].join("\n");
  } else {
    throw Error;
  }
}

export function zodTypeToTsTypeDef(zt: z.ZodType): string {
  switch (zt.def.type) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
    case "date":
    case "null":
    case "undefined":
    case "any":
    case "unknown":
    case "never":
      return zt.def.type;
    case "nullable":
      return `${zodTypeToTsTypeDef((zt as AnyZodNullable).def.innerType)} | null`;
    case "default":
      return zodTypeToTsTypeDef((zt as AnyZodDefault).def.innerType);
    case "record": {
      const recordType = zt as AnyZodRecord;
      return `{ [ key: ${zodTypeToTsTypeDef(recordType.def.keyType)} ]: ${zodTypeToTsTypeDef(recordType.def.valueType)}}`;
    }
    case "literal":
      return Array.from((zt as z.ZodLiteral).values)
        .map((value) => {
          if (typeof value === "string") {
            return `"${value}"`;
          }

          if (value === null) {
            return `null`;
          }

          if (value === undefined) {
            return `undefined`;
          }

          return `${value}`;
        })
        .join(" | ");
    case "union":
      return `${(zt as AnyZodUnion).options
        .map((option) => zodTypeToTsTypeDef(option))
        .join(" | ")}`;
    case "enum":
      return `${(zt as z.ZodEnum).options.map((val) => `"${val}"`).join(" | ")}`;
    case "array":
      return `${zodTypeToTsTypeDef((zt as AnyZodArray).element)}[]`;
    case "object": {
      const shape = (zt as AnyZodObject).shape;
      return [
        "{",
        ...Object.keys(shape).map((key) => {
          if (shape[key].def.type === "optional") {
            return `${key}?: ${zodTypeToTsTypeDef(shape[key].def.innerType)},`;
          } else {
            return `${key}: ${zodTypeToTsTypeDef(shape[key])},`;
          }
        }),
        "}",
      ].join("\n");
    }
    case "optional":
      return `${zodTypeToTsTypeDef((zt as AnyZodOptional).def.innerType)} | undefined`;
    case "template_literal": {
      const def = (zt as AnyZodTemplateLiteral).def;

      // 빈 template literal은 string으로 폴백
      if (!def.parts || def.parts.length === 0) {
        return "string";
      }

      // 각 part를 TypeScript 타입 문자열로 변환
      const parts = def.parts.map((part: unknown) => {
        // 리터럴 값 (string, number, boolean, null, undefined)
        if (typeof part === "string") {
          return `${part}`;
        }

        // ZodType - 재귀적으로 변환
        if (part && typeof part === "object" && (part as z.ZodType)._zod) {
          const innerType = zodTypeToTsTypeDef(part as z.ZodType);
          return `$\{${innerType}}`;
        }

        // 폴백
        return `\${string}`;
      });

      return `\`${parts.join("")}\``;
    }
    case "file":
      return "File";
    default:
      throw new Error(`처리되지 않은 ZodType ${zt.def.type}`);
  }
}

/**
 * Zod 타입 인스턴스를 해당하는 Zod 코드 문자열로 변환합니다.
 */
export function zodTypeToZodCode(zt: z.ZodType): string {
  switch (zt.def.type) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "bigint":
      return "z.bigint()";
    case "boolean":
      return "z.boolean()";
    case "date":
      return "z.date()";
    case "null":
      return "z.null()";
    case "undefined":
      return "z.undefined()";
    case "any":
      return "z.any()";
    case "unknown":
      return "z.unknown()";
    case "never":
      return "z.never()";
    case "nullable":
      return `${zodTypeToZodCode((zt as AnyZodNullable).def.innerType)}.nullable()`;
    case "default": {
      const zDefaultDef = (zt as AnyZodDefault).def;
      return `${zodTypeToZodCode(zDefaultDef.innerType)}.default(${zDefaultDef.defaultValue})`;
    }
    case "record": {
      const zRecordDef = (zt as AnyZodRecord).def;
      return `z.record(${zodTypeToZodCode(zRecordDef.keyType)}, ${zodTypeToZodCode(
        zRecordDef.valueType,
      )})`;
    }
    case "literal": {
      const items = Array.from((zt as z.ZodLiteral<string | number>).values).map((value) => {
        if (typeof value === "string") {
          return `"${value}"`;
        }

        if (value === null) {
          return `null`;
        }

        if (value === undefined) {
          return `undefined`;
        }

        return `${value}`;
      });

      if (items.length === 1) {
        return `z.literal(${items[0]})`;
      }
      return `z.literal([${items.join(", ")}])`;
    }
    case "union":
      return `z.union([${(zt as AnyZodUnion).def.options
        .map((option: z.ZodType) => zodTypeToZodCode(option))
        .join(",")}])`;
    case "enum":
      // NOTE: z.enum(["A", "B"])도 z.enum({ A: "A", B: "B" })로 처리됨.
      return `z.enum({${Object.entries((zt as z.ZodEnum).def.entries)
        .map(([key, val]) => (typeof val === "string" ? `${key}: "${val}"` : `${key}: ${val}`))
        .join(", ")}})`;
    case "array":
      return `z.array(${zodTypeToZodCode((zt as z.ZodArray<z.ZodType>).def.element)})`;
    case "object": {
      const shape = (zt as AnyZodObject).shape;
      return [
        "z.object({",
        ...Object.keys(shape).map((key) => `${key}: ${zodTypeToZodCode(shape[key])},`),
        "})",
      ].join("\n");
    }
    case "optional":
      return `${zodTypeToZodCode((zt as z.ZodOptional<z.ZodType>).def.innerType)}.optional()`;
    case "file":
      return `z.file()`;
    case "template_literal": {
      const def = (zt as AnyZodTemplateLiteral).def;

      // 빈 template literal
      if (!def.parts || def.parts.length === 0) {
        return "z.templateLiteral([])";
      }

      // 각 part를 Zod 코드 문자열로 변환
      const parts = def.parts.map((part: unknown) => {
        // 문자열 리터럴
        if (typeof part === "string") {
          return `"${part}"`;
        }
        // ZodType - 재귀적으로 변환
        if (part && typeof part === "object" && (part as z.ZodType)._zod) {
          return zodTypeToZodCode(part as z.ZodType);
        }

        // 폴백
        return "z.string()";
      });

      return `z.templateLiteral([${parts.join(", ")}])`;
    }
    case "intersection": {
      const zIntersectionDef = (zt as z.ZodIntersection<z.ZodType, z.ZodType>).def;
      return `z.intersection(${zodTypeToZodCode(zIntersectionDef.left)}, ${zodTypeToZodCode(zIntersectionDef.right)})`;
    }
    default:
      throw new Error(`처리되지 않은 ZodType ${zt.def.type}`);
  }
}

/**
 * Zod 타입을 UI 렌더링에 사용할 수 있는 RenderingNode로 변환합니다.
 * 재귀적으로 중첩된 타입들을 처리합니다.
 */
export function zodTypeToRenderingNode(
  zodType: z.ZodTypeAny,
  baseKey: string = "root",
): RenderingNode {
  const def = {
    name: baseKey,
    label: inflection.camelize(baseKey, false),
    zodType,
  };

  /**
   * 케이스 처리 순서
   *
   * 1. 특수 케이스 (description 기반)
   *    - SonamuFile/SonamuFile[] : z.object/z.array이지만 파일 업로드용 내장 타입
   *
   * 2. 일반 케이스 (instanceof 기반)
   *    - z.ZodObject : 일반 객체
   *    - z.ZodArray : 일반 배열
   *      - vector : z.array(z.number)이지만 네이밍 기반으로 벡터 임베딩
   *      - 일반 배열 : 그 외
   *    - z.ZodUnion, z.ZodOptional, z.ZodNullable : 유틸리티 타입
   *    - 기타 : resolveRenderType()으로 처리
   */

  // 특수 케이스: SonamuFile[] 타입 감지
  if (zodType.description === "SonamuFile[]") {
    return { ...def, renderType: "json-sonamufile-array" };
  }

  // 특수 케이스: SonamuFile 단일 타입 감지
  if (zodType.description === "SonamuFile") {
    return { ...def, renderType: "json-sonamufile" };
  }

  // 일반 케이스: ZodObject 체크
  if (zodType instanceof z.ZodObject) {
    const columnKeys = Object.keys(zodType.shape);
    const children = columnKeys.map((key) => {
      const innerType = zodType.shape[key];
      return zodTypeToRenderingNode(innerType, key);
    });
    return {
      ...def,
      renderType: "object",
      children,
    };
  } else if (zodType instanceof z.ZodArray) {
    const innerType = (zodType as z.ZodArray<z.ZodTypeAny>).def.element;
    // vector 타입 판별: number 배열이면서 embedding, vector 등의 이름을 가진 경우
    if (
      innerType instanceof z.ZodNumber &&
      (baseKey.includes("embedding") || baseKey.includes("vector"))
    ) {
      return {
        ...def,
        renderType: "vector",
      };
    }
    return {
      ...def,
      renderType: "array",
      element: zodTypeToRenderingNode(innerType, baseKey),
    };
  } else if (zodType instanceof z.ZodUnion) {
    const optionNodes = (zodType as z.ZodUnion<z.ZodType[]>).def.options.map((opt) =>
      zodTypeToRenderingNode(opt, baseKey),
    );
    // TODO: ZodUnion이 들어있는 경우 핸들링
    return optionNodes[0];
  } else if (zodType instanceof z.ZodOptional) {
    return {
      ...zodTypeToRenderingNode((zodType as z.ZodOptional<z.ZodType>).def.innerType, baseKey),
      optional: true,
    };
  } else if (zodType instanceof z.ZodNullable) {
    return {
      ...zodTypeToRenderingNode((zodType as z.ZodNullable<z.ZodType>).def.innerType, baseKey),
      nullable: true,
    };
  } else {
    return {
      ...def,
      renderType: resolveRenderType(baseKey, zodType),
    };
  }
}

/**
 * Zod 타입과 키 이름으로부터 적절한 RenderType을 결정합니다.
 */
function resolveRenderType(key: string, zodType: z.ZodTypeAny): RenderingNode["renderType"] {
  if (zodType instanceof z.ZodDate) {
    return "datetime";
  } else if (zodType instanceof z.ZodString) {
    if (zodType.description === "SQLDateTimeString") {
      return "string-datetime";
    } else if (key.endsWith("date")) {
      return "string-date";
    } else {
      return "string-plain";
    }
  } else if (zodType instanceof z.ZodNumber) {
    if (key === "id") {
      return "number-id";
    } else if (key.endsWith("_id")) {
      return "number-fk_id";
    } else {
      return "number-plain";
    }
  } else if (zodType instanceof z.ZodBoolean) {
    return "boolean";
  } else if (zodType instanceof z.ZodEnum) {
    return "enums";
  } else if (zodType instanceof z.ZodRecord) {
    return "record";
  } else if (zodType instanceof z.ZodAny || zodType instanceof z.ZodUnknown) {
    return "string-plain";
  } else if (zodType instanceof z.ZodUnion) {
    return "string-plain";
  } else if (zodType instanceof z.ZodLiteral) {
    return "string-plain";
  } else if (zodType instanceof z.ZodTemplateLiteral) {
    return "string-plain";
  } else {
    throw new Error(`타입 파싱 불가 ${key} ${zodType.def.type}`);
  }
}
