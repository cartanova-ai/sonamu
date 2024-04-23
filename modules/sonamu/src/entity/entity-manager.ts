import chalk from "chalk";
import { glob } from "glob";
import { dasherize, underscore, pluralize, camelize } from "inflection";
import _ from "lodash";
import path from "path";
import { Entity } from "./entity";
import { EntityJson } from "../types/types";
import { Sonamu } from "../api/sonamu";
import { readFileSync } from "fs";

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
  uniqueColumns: string[];
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

    return new Promise((resolve) => {
      glob(path.resolve(pathPattern!), (_err, files) => {
        Promise.all(
          files.map(async (file) => {
            this.register(JSON.parse(readFileSync(file).toString()));
          })
        ).then(() => {
          resolve("ok");
          this.isAutoloaded = true;
        });
      });
    });
  }

  async reload(doSilent: boolean = false) {
    console.log("reload");
    this.entities.clear();
    this.modulePaths.clear();
    this.tableSpecs.clear();
    this.isAutoloaded = false;

    const sonamuPath = path.join(
      Sonamu.apiRootPath,
      "dist/application/sonamu.generated.js"
    );
    if (require.cache[sonamuPath]) {
      delete require.cache[sonamuPath];
    }

    return this.autoload(doSilent);
  }

  register(json: EntityJson): void {
    const entity = new Entity(json);
    this.entities.set(json.id, entity);
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
    return Array.from(EntityManager.entities.keys());
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
      pluralize(entityId) === entityId
        ? `${entityId}List`
        : pluralize(entityId);

    return {
      fs: dasherize(underscore(entityId)).toLowerCase(),
      fsPlural: dasherize(underscore(pluralized)).toLowerCase(),
      camel: camelize(entityId, true),
      camelPlural: camelize(pluralized, true),
      capital: entityId,
      capitalPlural: pluralized,
      upper: entityId.toUpperCase(),
      constant: underscore(entityId).toUpperCase(),
    };
  }
}

export const EntityManager = new EntityManagerClass();
