import z from "zod";
import { EntityManager } from "../entity/entity-manager";
import { ServiceUnavailableException } from "../exceptions/so-exceptions";
import {
  EntityProp,
  EntityPropNode,
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
  RenderingNode,
} from "../types/types";
import path from "path";
import { createImportUrl } from "../utils/esm-utils";
import { Sonamu } from "../api/sonamu";
import inflection from "inflection";
import { getTextTypeLength } from "../api";

export async function getColumnsNode(
  entityId: string,
  subsetKey: string
): Promise<RenderingNode> {
  const entity = EntityManager.get(entityId);
  const subset = entity.subsets[subsetKey];
  if (subset === undefined) {
    throw new ServiceUnavailableException(`Subset ${subsetKey} 가 없습니다.`);
  }
  const propNodes = entity.fieldExprsToPropNodes(subset);
  const rootPropNode: EntityPropNode = {
    nodeType: "object",
    children: propNodes,
  };

  const columnsZodType = (await propNodeToZodType(
    rootPropNode
  )) as z.ZodObject<any>;

  const columnsNode = zodTypeToRenderingNode(columnsZodType);
  columnsNode.children = columnsNode.children!.map((child) => {
    if (child.renderType === "object") {
      const pickedCol = child.children!.find((cc) =>
        ["title", "name"].includes(cc.name)
      );
      if (pickedCol) {
        return {
          ...child,
          renderType: "object-pick",
          config: {
            picked: pickedCol.name,
          },
        };
      } else {
        return child;
      }
    } else if (
      child.renderType === "array" &&
      child.element &&
      child.element.renderType === "object"
    ) {
      const pickedCol = child.element!.children!.find((cc) =>
        ["title", "name"].includes(cc.name)
      );
      if (pickedCol) {
        return {
          ...child,
          element: {
            ...child.element,
            renderType: "object-pick",
            config: {
              picked: pickedCol.name,
            },
          },
        };
      } else {
        return child;
      }
    }
    return child;
  });

  return columnsNode;
}

export async function getZodTypeById(zodTypeId: string): Promise<z.ZodTypeAny> {
  const modulePath = EntityManager.getModulePath(zodTypeId);
  const moduleAbsPath = path.join(
    Sonamu.apiRootPath,
    "dist",
    "application",
    modulePath + ".js"
  );
  const importUrl = createImportUrl(moduleAbsPath);
  const imported = await import(importUrl);

  if (!imported[zodTypeId]) {
    throw new Error(`존재하지 않는 zodTypeId ${zodTypeId}`);
  }
  return imported[zodTypeId].describe(zodTypeId);
}

export function zodTypeToRenderingNode(
  zodType: z.ZodType<any>,
  baseKey: string = "root"
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
    const innerType = (zodType as z.ZodArray<z.ZodType<any>>).def.element;
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
    const optionNodes = (zodType as z.ZodUnion<z.ZodType[]>).def.options.map(
      (opt) => zodTypeToRenderingNode(opt, baseKey)
    );
    // TODO: ZodUnion이 들어있는 경우 핸들링
    return optionNodes[0];
  } else if (zodType instanceof z.ZodOptional) {
    return {
      ...zodTypeToRenderingNode(
        (zodType as z.ZodOptional<z.ZodType>).def.innerType,
        baseKey
      ),
      optional: true,
    };
  } else if (zodType instanceof z.ZodNullable) {
    return {
      ...zodTypeToRenderingNode(
        (zodType as z.ZodNullable<z.ZodType>).def.innerType,
        baseKey
      ),
      nullable: true,
    };
  } else {
    return {
      ...def,
      renderType: resolveRenderType(baseKey, zodType),
    };
  }
}

function resolveRenderType(
  key: string,
  zodType: z.ZodTypeAny
): RenderingNode["renderType"] {
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

export async function propNodeToZodType(
  propNode: EntityPropNode
): Promise<z.ZodTypeAny> {
  if (propNode.nodeType === "plain") {
    return propToZodType(propNode.prop);
  } else if (propNode.nodeType === "array") {
    if (propNode.prop === undefined) {
      throw new Error();
    } else if (propNode.children.length > 0) {
      return (
        await propNodeToZodType({
          ...propNode,
          nodeType: "object",
        })
      ).array();
    } else {
      const innerType = await propToZodType(propNode.prop);
      if (propNode.prop.nullable === true) {
        return z.array(innerType).nullable();
      } else {
        return z.array(innerType);
      }
    }
  } else if (propNode.nodeType === "object") {
    const obj = await propNode.children.reduce(
      async (promise, childPropNode) => {
        const result = await promise;
        result[childPropNode.prop!.name] =
          await propNodeToZodType(childPropNode);
        return result;
      },
      {} as any
    );

    if (propNode.prop?.nullable === true) {
      return z.object(obj).nullable();
    } else {
      return z.object(obj);
    }
  } else {
    throw Error;
  }
}

async function propToZodType(prop: EntityProp): Promise<z.ZodTypeAny> {
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
    if (
      isBelongsToOneRelationProp(prop) ||
      (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
    ) {
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
