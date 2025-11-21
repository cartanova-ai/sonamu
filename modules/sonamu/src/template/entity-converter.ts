import z from "zod";
import { EntityManager } from "../entity/entity-manager";
import { ServiceUnavailableException } from "../exceptions/so-exceptions";
import { EntityPropNode, RenderingNode } from "../types/types";
import { zodTypeToRenderingNode, propToZodType } from "./zod-converter";

/**
 * 엔티티의 특정 subset을 RenderingNode로 변환합니다.
 * subset의 필드들을 Zod 타입으로 변환한 후 UI 렌더링용 노드로 만듭니다.
 * object와 array의 경우 적절한 pick 필드를 자동으로 선택합니다.
 */
export async function getColumnsNode(entityId: string, subsetKey: string): Promise<RenderingNode> {
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

  const columnsZodType = (await propNodeToZodType(rootPropNode)) as z.ZodObject<any>;

  const columnsNode = zodTypeToRenderingNode(columnsZodType);
  columnsNode.children = columnsNode.children!.map((child) => {
    if (child.renderType === "object") {
      const pickedCol = child.children!.find((cc) => ["title", "name"].includes(cc.name));
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
      const pickedCol = child.element!.children!.find((cc) => ["title", "name"].includes(cc.name));
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
    const obj = await propNode.children.reduce(async (promise, childPropNode) => {
      const result = await promise;
      result[childPropNode.prop!.name] = await propNodeToZodType(childPropNode);
      return result;
    }, {} as any);

    if (propNode.prop?.nullable === true) {
      return z.object(obj).nullable();
    } else {
      return z.object(obj);
    }
  } else {
    throw Error;
  }
}
