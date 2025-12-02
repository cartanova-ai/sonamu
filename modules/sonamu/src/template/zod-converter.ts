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
import { getTextTypeLength } from "../api";
import { Sonamu } from "../api/sonamu";
import { EntityManager } from "../entity/entity-manager";
import {
  type EntityProp,
  type EntityPropNode,
  isBelongsToOneRelationProp,
  isBigIntegerProp,
  isBooleanProp,
  isDateProp,
  isDateTimeProp,
  isDecimalProp,
  isDoubleProp,
  isEnumProp,
  isFloatProp,
  isIntegerProp,
  isJsonProp,
  isOneToOneRelationProp,
  isRelationProp,
  isStringProp,
  isTextProp,
  isTimeProp,
  isTimestampProp,
  isUuidProp,
  isVirtualProp,
  type RenderingNode,
} from "../types/types";
import { createImportUrl } from "../utils/esm-utils";

// <any>를 자제하고, Zod에서 제약하는 기본적인 Generic Type Parameter를 사용함.
type AnyZodRecord = z.ZodRecord<z.ZodString | z.ZodNumber | z.ZodSymbol, z.ZodType>;
type AnyZodObject = z.ZodObject<$ZodLooseShape>;
type AnyZodNullable = z.ZodNullable<z.ZodType>;
type AnyZodDefault = z.ZodDefault<z.ZodType>;
type AnyZodUnion = z.ZodUnion<z.ZodType[]>;
type AnyZodArray = z.ZodArray<z.ZodType>;
type AnyZodOptional = z.ZodOptional<z.ZodType>;

/**
 * Zod 타입 ID로부터 동적으로 Zod 스키마를 로드합니다.
 * dist 디렉토리에서 ESM으로 import하여 가져옵니다.
 */
export async function getZodTypeById(zodTypeId: string): Promise<z.ZodTypeAny> {
  const modulePath = EntityManager.getModulePath(zodTypeId);
  const moduleAbsPath = path.join(Sonamu.apiRootPath, "dist", "application", `${modulePath}.js`);
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
  if (isIntegerProp(prop)) {
    zodType = z.number().int();
  } else if (isBigIntegerProp(prop)) {
    zodType = z.bigint();
  } else if (isTextProp(prop)) {
    zodType = z.string().max(getTextTypeLength(prop.textType));
  } else if (isEnumProp(prop)) {
    zodType = await getZodTypeById(prop.id);
  } else if (isStringProp(prop)) {
    zodType = z.string().max(prop.length);
  } else if (isFloatProp(prop) || isDoubleProp(prop)) {
    zodType = z.number();
  } else if (isDecimalProp(prop)) {
    zodType = z.string();
  } else if (isBooleanProp(prop)) {
    zodType = z.boolean();
  } else if (isDateProp(prop)) {
    zodType = z.string().length(10);
  } else if (isTimeProp(prop)) {
    zodType = z.string().length(8);
  } else if (isDateTimeProp(prop)) {
    zodType = z.date();
  } else if (isTimestampProp(prop)) {
    zodType = z.date();
  } else if (isJsonProp(prop)) {
    zodType = await getZodTypeById(prop.id);
  } else if (isUuidProp(prop)) {
    zodType = z.uuid();
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
  if (isIntegerProp(prop)) {
    stmt = `${prop.name}: z.int()`;
  } else if (isBigIntegerProp(prop)) {
    stmt = `${prop.name}: z.bigint()`;
  } else if (isTextProp(prop)) {
    stmt = `${prop.name}: z.string().max(${getTextTypeLength(prop.textType)})`;
  } else if (isEnumProp(prop)) {
    stmt = `${prop.name}: ${prop.id}`;
    injectImportKeys.push(prop.id);
  } else if (isStringProp(prop)) {
    stmt = `${prop.name}: z.string().max(${prop.length})`;
  } else if (isDecimalProp(prop)) {
    stmt = `${prop.name}: z.string()`;
  } else if (isFloatProp(prop) || isDoubleProp(prop)) {
    stmt = `${prop.name}: z.number()`;
  } else if (isBooleanProp(prop)) {
    stmt = `${prop.name}: z.boolean()`;
  } else if (isDateProp(prop)) {
    stmt = `${prop.name}: z.string().length(10)`;
  } else if (isTimeProp(prop)) {
    stmt = `${prop.name}: z.string().length(8)`;
  } else if (isDateTimeProp(prop)) {
    stmt = `${prop.name}: z.date()`;
  } else if (isTimestampProp(prop)) {
    stmt = `${prop.name}: z.date()`;
  } else if (isJsonProp(prop)) {
    stmt = `${prop.name}: ${prop.id}`;
    injectImportKeys.push(prop.id);
  } else if (isUuidProp(prop)) {
    stmt = `${prop.name}: z.uuid()`;
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

// TODO(Haze, 251031): "template_literal", "file"에 대한 지원이 필요함.
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
    default:
      throw new Error(`처리되지 않은 ZodType ${zt.def.type}`);
  }
}

// TODO(Haze, 251031): "template_literal", "file"에 대한 지원이 필요함.
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
    if (innerType instanceof z.ZodString && baseKey.includes("images")) {
      return {
        ...def,
        renderType: "array-images",
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
    if (key.includes("img") || key.includes("image")) {
      return "string-image";
    } else if (zodType.description === "SQLDateTimeString") {
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
  } else {
    throw new Error(`타입 파싱 불가 ${key} ${zodType.def.type}`);
  }
}
