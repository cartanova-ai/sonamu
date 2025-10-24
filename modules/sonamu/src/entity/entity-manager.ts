import chalk from "chalk";
import { glob } from "fs/promises";
import inflection from "inflection";
import _ from "lodash";
import path from "path";
import { Entity } from "./entity";
import { EntityJson } from "../types/types";
import { Sonamu } from "../api/sonamu";
import fs from "fs";

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
>;
type TableSpec = {
  name: string;
  uniqueIndexes: { name?: string; columns: string[] }[];
};
class EntityManagerClass {
  private entities: Map<string, Entity> = new Map();
  public modulePaths: Map<string, string> = new Map();
  private tableSpecs: Map<string, TableSpec> = new Map();
  public isAutoloaded: boolean = false;

  // 경로 전달받아 모든 entity.json 파일 로드
  async autoload(doSilent: boolean = false) {
    if (this.isAutoloaded) {
      return;
    }
    const pathPattern = path.join(
      Sonamu.apiRootPath,
      "/src/application/**/*.entity.json"
    );
    !doSilent && console.log(chalk.yellow(`autoload ${pathPattern}`));

    for await (const file of glob(path.resolve(pathPattern!))) {
      await this.register(JSON.parse(fs.readFileSync(file).toString()));
    }
    this.isAutoloaded = true;
  }

  async reload(doSilent: boolean = false) {
    console.log("reload");
    this.entities.clear();
    this.modulePaths.clear();
    this.tableSpecs.clear();
    this.isAutoloaded = false;

    const sonamuPath = path.join(
      Sonamu.apiRootPath,
      `dist/application/sonamu.generated.js`
    );
    // CJS
    if (require?.cache && require.cache[sonamuPath]) {
      delete require.cache[sonamuPath];
    }

    return await this.autoload(doSilent);
  }

  async register(json: EntityJson): Promise<void> {
    const entity = new Entity(json);
    await entity.registerModulePaths();
    entity.registerTableSpecs();
    this.entities.set(json.id, entity);
    // console.debug(chalk.cyan(`register :: ${entity.id}`));
  }

  get(entityId: string): Entity {
    const entity = this.entities.get(entityId);
    if (entity === undefined) {
      throw new Error(`존재하지 않는 Entity 요청 ${entityId}`);
    }

    return entity;
  }

  exists(entityId: string): boolean {
    const entity = this.entities.get(entityId);
    return entity !== undefined;
  }

  getAllIds(): string[] {
    return Array.from(EntityManager.entities.keys()).sort();
  }

  getAllParentIds(): string[] {
    return this.getAllIds().filter((entityId) => {
      const entity = this.get(entityId);
      return entity.parentId === undefined;
    });
  }

  getChildrenIds(parentId: string): string[] {
    return this.getAllIds().filter((entityId) => {
      const entity = this.get(entityId);
      return entity.parentId === parentId;
    });
  }

  setModulePath(key: string, modulePath: string): void {
    // console.debug(chalk.cyan(`setModulePath :: ${key} :: ${modulePath}`));
    this.modulePaths.set(key, modulePath);
  }

  getModulePath(key: string): string {
    const modulePath = this.modulePaths.get(key);
    if (modulePath === undefined) {
      throw new Error(`존재하지 않는 모듈 패스 요청 ${key}`);
    }

    return modulePath;
  }

  setTableSpec(tableSpec: TableSpec) {
    this.tableSpecs.set(tableSpec.name, tableSpec);
  }

  getTableSpec(key: string): TableSpec {
    const tableSpec = this.tableSpecs.get(key);
    if (tableSpec === undefined) {
      throw new Error(`존재하지 않는 테이블 스펙 요청 ${key}`);
    }

    return tableSpec;
  }

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
}

export const EntityManager = new EntityManagerClass();
