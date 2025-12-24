import inflection from "inflection";
import { EntityJson, EntityProp, EntityPropNode } from "../types/types";

export type EntityNamesRecord = Record<
  | "fs"
  | "fsPlural"
  | "camel"
  | "camelPlural"
  | "capital"
  | "capitalPlural"
  | "upper"
  | "constant",
  string
> & {
  parentFs?: string;
};

type TableSpec = {
  name: string;
  uniqueIndexes: { name?: string; columns: string[] }[];
};

/**
 * Entity 클래스 (간소화 버전)
 */
export class Entity {
  id: string;
  parentId?: string;
  table: string;
  title?: string;
  props: EntityProp[];
  indexes: EntityJson["indexes"];
  subsets: EntityJson["subsets"];
  enums: EntityJson["enums"];
  names: EntityNamesRecord;

  constructor(json: EntityJson) {
    this.id = json.id;
    this.parentId = json.parentId;
    this.table = json.table;
    this.title = json.title;
    this.props = json.props;
    this.indexes = json.indexes;
    this.subsets = json.subsets;
    this.enums = json.enums;
    this.names = EntityManager.getNamesFromId(json.id);

    if (json.parentId) {
      this.names.parentFs = inflection
        .dasherize(inflection.underscore(json.parentId))
        .toLowerCase();
    }
  }

  /**
   * 필드 표현식을 PropNode로 변환
   */
  fieldExprsToPropNodes(fieldExprs: string[]): EntityPropNode[] {
    return fieldExprs.flatMap((fieldExpr) => {
      const prop = this.props.find((p) => p.name === fieldExpr);
      if (!prop) return [];
      return [{
        nodeType: "plain" as const,
        prop,
      }];
    });
  }

  async registerModulePaths(): Promise<void> {
    // 타입들의 모듈 경로 등록
    const modulePath = this.names.fs + "/" + this.names.fs + ".types";

    // Enums 등록
    Object.keys(this.enums).forEach((enumId) => {
      EntityManager.setModulePath(enumId, modulePath);
      EntityManager.setModulePath(`${enumId}Label`, modulePath);
    });

    // Subsets 등록
    Object.keys(this.subsets).forEach((subsetKey) => {
      EntityManager.setModulePath(
        `${this.id}Subset${subsetKey}`,
        modulePath
      );
    });

    // 기본 타입들 등록
    EntityManager.setModulePath(`${this.id}ListParams`, modulePath);
    EntityManager.setModulePath(`${this.id}SaveParams`, modulePath);
  }

  registerTableSpecs(): void {
    const uniqueIndexes = this.indexes
      .filter((idx) => idx.type === "unique")
      .map((idx) => ({
        name: idx.name,
        columns: idx.columns,
      }));

    EntityManager.setTableSpec({
      name: this.table,
      uniqueIndexes,
    });
  }
}

/**
 * EntityManager 클래스
 */
class EntityManagerClass {
  private entities: Map<string, Entity> = new Map();
  public modulePaths: Map<string, string> = new Map();
  private tableSpecs: Map<string, TableSpec> = new Map();
  public isAutoloaded: boolean = false;

  /**
   * Entity JSON으로 등록
   */
  async register(json: EntityJson): Promise<void> {
    const entity = new Entity(json);
    await entity.registerModulePaths();
    entity.registerTableSpecs();
    this.entities.set(json.id, entity);
  }

  /**
   * entityId로 Entity 가져오기
   */
  get(entityId: string): Entity {
    const entity = this.entities.get(entityId);
    if (entity === undefined) {
      throw new Error(`존재하지 않는 Entity 요청 ${entityId}`);
    }
    return entity;
  }

  /**
   * Entity 존재 여부 확인
   */
  exists(entityId: string): boolean {
    const entity = this.entities.get(entityId);
    return entity !== undefined;
  }

  /**
   * 모든 Entity ID 가져오기
   */
  getAllIds(): string[] {
    return Array.from(this.entities.keys());
  }

  /**
   * 모든 부모 Entity ID 가져오기
   */
  getAllParentIds(): string[] {
    return this.getAllIds().filter((entityId) => {
      const entity = this.get(entityId);
      return entity.parentId === undefined;
    });
  }

  /**
   * 자식 Entity ID 가져오기
   */
  getChildrenIds(parentId: string): string[] {
    return this.getAllIds().filter((entityId) => {
      const entity = this.get(entityId);
      return entity.parentId === parentId;
    });
  }

  /**
   * 모듈 경로 설정
   */
  setModulePath(key: string, modulePath: string): void {
    this.modulePaths.set(key, modulePath);
  }

  /**
   * 모듈 경로 가져오기
   */
  getModulePath(key: string): string {
    const modulePath = this.modulePaths.get(key);
    if (modulePath === undefined) {
      throw new Error(`존재하지 않는 모듈 패스 요청 ${key}`);
    }
    return modulePath;
  }

  /**
   * 테이블 스펙 설정
   */
  setTableSpec(tableSpec: TableSpec): void {
    this.tableSpecs.set(tableSpec.name, tableSpec);
  }

  /**
   * 테이블 스펙 가져오기
   */
  getTableSpec(key: string): TableSpec {
    const tableSpec = this.tableSpecs.get(key);
    if (tableSpec === undefined) {
      throw new Error(`존재하지 않는 테이블 스펙 요청 ${key}`);
    }
    return tableSpec;
  }

  /**
   * entityId로부터 다양한 이름 형식 생성
   */
  getNamesFromId(entityId: string): EntityNamesRecord {
    // entityId가 단복수 동형 단어인 경우 List 붙여서 생성
    const pluralized =
      inflection.pluralize(entityId) === entityId
        ? `${entityId}List`
        : inflection.pluralize(entityId);

    return {
      fs: inflection.dasherize(inflection.underscore(entityId)).toLowerCase(),
      fsPlural: inflection
        .dasherize(inflection.underscore(pluralized))
        .toLowerCase(),
      camel: inflection.camelize(entityId, true),
      camelPlural: inflection.camelize(pluralized, true),
      capital: entityId,
      capitalPlural: pluralized,
      upper: entityId.toUpperCase(),
      constant: inflection.underscore(entityId).toUpperCase(),
    };
  }

  /**
   * Entity 목록 초기화
   */
  clear(): void {
    this.entities.clear();
    this.modulePaths.clear();
    this.tableSpecs.clear();
    this.isAutoloaded = false;
  }
}

export const EntityManager = new EntityManagerClass();

