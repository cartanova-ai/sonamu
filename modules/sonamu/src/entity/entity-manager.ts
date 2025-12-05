import assert from "assert";
import chalk from "chalk";
import { glob, readFile } from "fs/promises";
import inflection from "inflection";
import path from "path";
import { prettifyError } from "zod";
import { Sonamu } from "../api/sonamu";
import { type EntityJson, EntityJsonSchema } from "../types/types";
import { isTest } from "../utils/controller";
import type { AbsolutePath } from "../utils/path-utils";
import { Entity } from "./entity";

export type EntityNamesRecord = Record<
  "fs" | "fsPlural" | "camel" | "camelPlural" | "capital" | "capitalPlural" | "upper" | "constant",
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
  async autoload(_: boolean = false) {
    if (this.isAutoloaded) {
      return;
    }
    const pathPattern = path.join(Sonamu.apiRootPath, "/src/application/**/*.entity.json");

    for await (const file of glob(path.resolve(pathPattern))) {
      const json = JSON.parse((await readFile(file)).toString());

      // entity.json 스키마 검증
      const error = this.schemaValidate(json);
      if (error) {
        const relativePath = path.relative(Sonamu.apiRootPath, file);
        const errorMessage = prettifyError(error);
        !isTest() &&
          console.error(
            chalk.red(`Invalid entity.json schema: ${relativePath}\n${chalk.yellow(errorMessage)}`),
          );
      }

      await this.register(json);
    }
    // !doSilent &&
    //   console.log(
    //     chalk.gray(
    //       `[Loading] Loaded entity definitions from "*.entity.json" files: ${count} files.`
    //     )
    //   );

    this.isAutoloaded = true;
  }

  schemaValidate(json: unknown) {
    const result = EntityJsonSchema.safeParse(json);
    return result.success ? null : result.error;
  }

  async reload(doSilent: boolean = false) {
    this.entities.clear();
    this.modulePaths.clear();
    this.tableSpecs.clear();
    this.isAutoloaded = false;

    return await this.autoload(doSilent);
  }

  async register(json: EntityJson): Promise<void> {
    const entity = new Entity(json);
    await entity.registerModulePaths();
    entity.registerTableSpecs();
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
      fsPlural: inflection.dasherize(inflection.underscore(pluralized)).toLowerCase(),
      camel: inflection.camelize(entityId, true),
      camelPlural: inflection.camelize(pluralized, true),
      capital: entityId,
      capitalPlural: pluralized,
      upper: entityId.toUpperCase(),
      constant: inflection.underscore(entityId).toUpperCase(),
    };
  }

  /**
   * EntityId는 Model을 제외한 PascalCase 이름입니다. (ex. "User")
   * @param filePath
   * @returns
   */
  getEntityIdFromPath(filePath: AbsolutePath): string {
    const matched = filePath.match(/application\/(.+)\//);
    assert(matched?.[1]);
    return inflection.camelize(matched[1].replace(/-/g, "_"));
  }
}

export const EntityManager = new EntityManagerClass();
