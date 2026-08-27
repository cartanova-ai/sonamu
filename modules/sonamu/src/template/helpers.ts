import inflection from "inflection";

import { EntityManager } from "../entity/entity-manager";
import { type EntityNamesRecord } from "../entity/entity-manager";
import { isEnumProp, isRelationProp } from "../types/types";
import { type RelationProp } from "../types/types";

interface EnumColumnInfo {
  id: string;
  targetEntityNames: EntityNamesRecord;
  targetEntityId: string;
  title: string;
}

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
    if (enumProp?.desc) {
      return enumProp.desc;
    }
    return enumId;
  }
}

/**
 * 컬럼 이름으로부터 Enum 정보를 추출합니다.
 * Entity의 prop 중 enum 타입인 것을 찾아 관련 정보를 반환합니다.
 */
export function getEnumInfoFromColName(entityId: string, colName: string): EnumColumnInfo {
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
      `${inflection.underscore(entityId)}_${inflection.underscore(colName)}`,
      false,
    );
    const targetEntityNames = EntityManager.getNamesFromId(entityId);
    return {
      id: idCandidate,
      targetEntityId: entityId,
      targetEntityNames: targetEntityNames,
      title: idCandidate,
    };
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

/**
 * FK 컬럼명에서 실제 relation 이름을 추출합니다.
 * BelongsToOne/OneToOne relation은 subset에서 FK 컬럼명(user_id)으로 생성되므로 변환이 필요하고,
 * ManyToMany relation은 subset에서 relation명(employee)으로 생성되므로 변환이 불필요합니다.
 *
 * @example
 * getRelationNameFromColumnName("Employee", "user_id") // "user"
 * getRelationNameFromColumnName("Project", "tag_ids") // "tags"
 */
export function getRelationNameFromColumnName(entityId: string, colName: string): string {
  // _ids (복수) 처리
  if (colName.endsWith("_ids")) {
    const baseName = colName.replace(/_ids$/, "");
    // 먼저 base name으로 찾기
    try {
      const relProp = getRelationPropFromColName(entityId, baseName);
      return relProp.name;
    } catch {
      // pluralize해서 찾기
      try {
        const pluralName = inflection.pluralize(baseName);
        const relProp = getRelationPropFromColName(entityId, pluralName);
        return relProp.name;
      } catch {
        return colName;
      }
    }
  }
  // _id (단수) 처리
  if (colName.endsWith("_id") && colName !== "id") {
    const baseName = colName.replace(/_id$/, "");
    // 먼저 base name으로 찾기
    try {
      const relProp = getRelationPropFromColName(entityId, baseName);
      return relProp.name;
    } catch {
      // singularize해서 찾기
      try {
        const singularName = inflection.singularize(baseName);
        const relProp = getRelationPropFromColName(entityId, singularName);
        return relProp.name;
      } catch {
        return colName;
      }
    }
  }
  return colName;
}

/**
 * 소스 코드에서 객체 선언을 추출합니다.
 * 중괄호 카운팅 방식으로 중첩된 객체도 정확히 파싱합니다.
 */
export function extractObjectDeclaration(sourceCode: string, varName: string): string {
  // "export const varName = {" 패턴 찾기
  const pattern = new RegExp(`export const ${varName}\\s*=\\s*\\{`);
  const match = pattern.exec(sourceCode);

  if (!match) {
    return "";
  }

  // 시작 위치
  const startIdx = match.index;
  const openBraceIdx = sourceCode.indexOf("{", startIdx);

  // 중괄호 카운팅
  let braceCount = 0;
  let inString = false;
  let inTemplate = false;
  let stringChar = "";
  let endIdx = openBraceIdx;

  for (let i = openBraceIdx; i < sourceCode.length; i++) {
    const char = sourceCode[i];
    const prevChar = i > 0 ? sourceCode[i - 1] : "";

    // 이스케이프된 문자는 무시
    if (prevChar === "\\" && (inString || inTemplate)) {
      continue;
    }

    // 문자열 시작/종료
    if ((char === '"' || char === "'") && !inTemplate) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    // 템플릿 리터럴 시작/종료
    if (char === "`" && !inString) {
      inTemplate = !inTemplate;
      continue;
    }

    // 문자열/템플릿 내부는 중괄호 카운팅 안 함
    if (inString || inTemplate) {
      continue;
    }

    // 중괄호 카운팅
    if (char === "{") {
      braceCount++;
    } else if (char === "}") {
      braceCount--;
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }
  }

  // 선언문 끝까지 찾기 (};)
  let finalEndIdx = endIdx;
  for (let i = endIdx + 1; i < sourceCode.length; i++) {
    if (sourceCode[i] === ";") {
      finalEndIdx = i;
      break;
    }
  }

  return sourceCode.substring(startIdx, finalEndIdx + 1);
}
