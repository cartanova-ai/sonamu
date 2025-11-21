import inflection from "inflection";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { isEnumProp, isRelationProp, RelationProp } from "../types/types";

/**
 * Enum의 표시용 라벨을 가져옵니다.
 * OrderBy, SearchField 등 특수한 경우와 일반 Enum을 구분하여 처리합니다.
 */
export function getLabel(entityId: string, enumId: string): string {
  if (enumId.endsWith("OrderBy")) {
    return "정렬";
  } else if (enumId.endsWith("SearchField")) {
    return "검색";
  } else {
    const enumProp = EntityManager.get(entityId).props.find(
      (prop) => `${entityId}${inflection.camelize(prop.name)}` === enumId,
    );
    if (enumProp && enumProp.desc) {
      return enumProp.desc;
    }
    return enumId;
  }
}

/**
 * 컬럼 이름으로부터 Enum 정보를 추출합니다.
 * Entity의 prop 중 enum 타입인 것을 찾아 관련 정보를 반환합니다.
 */
export function getEnumInfoFromColName(
  entityId: string,
  colName: string,
): {
  id: string;
  targetEntityNames: EntityNamesRecord;
  targetEntityId: string;
  title: string;
} {
  const baseEntity = EntityManager.get(entityId);
  const prop = baseEntity.props.find((p) => p.name === colName);
  if (prop && isEnumProp(prop)) {
    return {
      id: prop.id,
      targetEntityId: entityId,
      targetEntityNames: EntityManager.getNamesFromId(entityId),
      title: prop.desc ?? prop.id,
    };
  } else {
    const idCandidate = inflection.camelize(
      inflection.underscore(entityId) + "_" + inflection.underscore(colName),
      false,
    );
    try {
      const targetEntityNames = EntityManager.getNamesFromId(entityId);
      return {
        id: idCandidate,
        targetEntityId: entityId,
        targetEntityNames: targetEntityNames,
        title: idCandidate,
      };
    } catch {}
    throw new Error(`찾을 수 없는 EnumProp ${colName}`);
  }
}

/**
 * 컬럼 이름으로부터 Relation prop 정보를 가져옵니다.
 * 관계형 prop이 아닌 경우 에러를 발생시킵니다.
 */
export function getRelationPropFromColName(entityId: string, colName: string): RelationProp {
  const baseEntity = EntityManager.get(entityId);
  const relProp = baseEntity.props.find((prop) => prop.name === colName);
  if (isRelationProp(relProp)) {
    const relEntity = EntityManager.get(relProp.with);
    if (relEntity.parentId !== undefined) {
      throw new Error("Only parent entities can be used as relation props");
    }
    return relProp;
  } else {
    throw new Error(`찾을 수 없는 Relation ${colName}`);
  }
}
