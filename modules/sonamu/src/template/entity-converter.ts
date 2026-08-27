import assert from "assert";

import { z } from "zod";

import { SD } from "../dict/sd";
import { EntityManager } from "../entity/entity-manager";
import { ServiceUnavailableException } from "../exceptions/so-exceptions";
import { type EntityPropNode, type RenderingNode } from "../types/types";
import { propToZodType, zodTypeToRenderingNode } from "./zod-converter";

/**
 * 엔티티의 특정 subset을 RenderingNode로 변환합니다.
 * subset의 필드들을 Zod 타입으로 변환한 후 UI 렌더링용 노드로 만듭니다.
 * object와 array의 경우 적절한 pick 필드를 자동으로 선택합니다.
 */
export async function getColumnsNode(entityId: string, subsetKey: string): Promise<RenderingNode> {
  const entity = EntityManager.get(entityId);
  const subsetDef = entity.subsets[subsetKey];
  if (subsetDef === undefined) {
    throw new ServiceUnavailableException(SD("sonamu.error.subsetNotFound")(subsetKey));
  }
  const propNodes = entity.fieldExprsToPropNodes(subsetDef);
  const rootPropNode: EntityPropNode = {
    nodeType: "object",
    children: propNodes,
  };

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- zod 스키마를 로드할 때 사용하는 타입
  const columnsZodType =
    /* SAFETY: 선행 Zod 종류 분기와 템플릿 입력 계약이 이 값의 타입을 보장한다. */ (await propNodeToZodType(
      rootPropNode,
    )) as z.ZodObject<any>;

  const columnsNode = zodTypeToRenderingNode(columnsZodType);
  assert(columnsNode.children !== undefined, "columnsNode.children is undefined");
  columnsNode.children = columnsNode.children.map((child) => {
    if (child.renderType === "object") {
      assert(child.children !== undefined, "child.children is undefined");
      const pickedCol = child.children.find((cc) => ["title", "name"].includes(cc.name));
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
      const pickedCol = child.element?.children?.find((cc) => ["title", "name"].includes(cc.name));
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

/**
 * EntityPropNode를 Zod 타입으로 변환합니다.
 * plain, array, object 세 가지 nodeType을 재귀적으로 처리합니다.
 */
export async function propNodeToZodType(propNode: EntityPropNode): Promise<z.ZodTypeAny> {
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
    const entries = await Promise.all(
      propNode.children.map(async (childPropNode) => {
        assert(childPropNode.prop?.name !== undefined, "childPropNode.prop.name is undefined");
        return [childPropNode.prop.name, await propNodeToZodType(childPropNode)] as const;
      }),
    );
    const obj = Object.fromEntries(entries);

    if (propNode.prop?.nullable === true) {
      return z.object(obj).nullable();
    } else {
      return z.object(obj);
    }
  } else {
    throw Error;
  }
}
