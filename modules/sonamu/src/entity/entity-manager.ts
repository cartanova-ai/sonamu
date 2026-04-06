import assert from "assert";
import { glob, readFile } from "fs/promises";
import path from "path";

import chalk from "chalk";
import inflection from "inflection";
import { prettifyError, z } from "zod";

import { Sonamu } from "../api/sonamu";
import {
  type EntityIndex,
  type EntityJson,
  EntityJsonSchema,
  isSearchTextJsonSourceZodType,
  isSearchTextProp,
  SonamuFileArraySchema,
  SonamuFileSchema,
} from "../types/types";
import { globAsync } from "../utils/async-utils";
import { importMembers } from "../utils/esm-utils";
import type { AbsolutePath } from "../utils/path-utils";
import { runtimePath } from "../utils/path-utils";
import { Entity } from "./entity";

export type EntityNamesRecord = Record<
  "fs" | "fsPlural" | "camel" | "camelPlural" | "capital" | "capitalPlural" | "upper" | "constant",
  string
>;
export type TableSpec = {
  name: string;
  uniqueIndexes: EntityIndex[];
  jsonColumns: string[];
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
        console.error(
          chalk.red(`Invalid entity.json schema: ${relativePath}\n${chalk.yellow(errorMessage)}`),
        );
      }

      await this.register(json, { deferSearchTextJsonSourceValidation: true });
    }

    await this.registerNonEntityTypeModulePaths();
    await this.validateAllRegisteredSearchTextJsonSources();

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

  async register(
    json: EntityJson,
    options: { deferSearchTextJsonSourceValidation?: boolean } = {},
  ): Promise<void> {
    const entity = new Entity(json);
    await entity.registerModulePaths();
    if (!options.deferSearchTextJsonSourceValidation) {
      await this.validateSearchTextJsonSources(entity);
    }
    entity.registerTableSpecs();
    this.entities.set(json.id, entity);
  }

  async validateAllRegisteredSearchTextJsonSources(): Promise<void> {
    for (const entity of this.entities.values()) {
      await this.validateSearchTextJsonSources(entity);
    }
  }

  private async validateSearchTextJsonSources(entity: Entity): Promise<void> {
    const propsByName = new Map(entity.props.map((prop) => [prop.name, prop]));

    for (const prop of entity.props) {
      if (!isSearchTextProp(prop)) {
        continue;
      }

      for (const source of prop.sourceColumns) {
        const sourceProp = propsByName.get(source.name);
        if (!sourceProp || sourceProp.type !== "json") {
          continue;
        }

        const zodType = await this.resolveSearchTextJsonSourceType(entity, sourceProp.id);
        if (!zodType) {
          throw new Error(
            `searchText source "${source.name}"의 json 타입 "${sourceProp.id}"을(를) 로드할 수 없습니다.`,
          );
        }

        if (!isSearchTextJsonSourceZodType(zodType)) {
          throw new Error(
            `searchText source "${source.name}"의 json 타입 "${sourceProp.id}"은(는) unwrap 후 z.array(z.string()) 이어야 합니다.`,
          );
        }
      }
    }
  }

  private async resolveSearchTextJsonSourceType(
    entity: Entity,
    typeId: string,
  ): Promise<z.ZodTypeAny | null> {
    const localType = entity.types[typeId];
    if (localType instanceof z.ZodType) {
      return localType;
    }

    for (const registeredEntity of this.entities.values()) {
      const registeredType = registeredEntity.types[typeId];
      if (registeredType instanceof z.ZodType) {
        return registeredType;
      }
    }

    if (typeId === "SonamuFile") {
      return SonamuFileSchema;
    }
    if (typeId === "SonamuFile[]") {
      return SonamuFileArraySchema;
    }

    const modulePath = this.modulePaths.get(typeId);
    if (!modulePath) {
      return null;
    }

    const moduleFilePath = path.join(
      Sonamu.apiRootPath,
      runtimePath(`dist/application/${modulePath}.js`),
    );
    const importedMembers = await importMembers<unknown>(moduleFilePath);
    const matched = importedMembers.find(({ name }) => name === typeId);
    if (!matched || !(matched.value instanceof z.ZodType)) {
      return null;
    }

    return matched.value;
  }

  get(entityId: string): Entity {
    const entity = this.entities.get(entityId);
    if (entity === undefined) {
      throw new Error(`존재하지 않는 Entity 요청 ${entityId}`);
    }

    return entity;
  }

  getByTable(table: string): Entity {
    const entity = Array.from(this.entities.values()).find((entity) => entity.table === table);
    if (entity === undefined) {
      throw new Error(`존재하지 않는 Entity 요청 ${table}`);
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

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
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

  private async registerNonEntityTypeModulePaths(): Promise<void> {
    const typePathsPatterns = [
      path.join(Sonamu.apiRootPath, runtimePath("src/application/**/*.types.ts")),
      path.join(Sonamu.apiRootPath, runtimePath("src/application/**/*.generated.ts")),
    ];
    const typePaths = (
      await Promise.all(typePathsPatterns.map((pattern) => globAsync(pattern)))
    ).flat();

    for (const filePath of typePaths) {
      const modulePath = this.getModulePathFromTypeFilePath(filePath);
      const importedMembers = await importMembers<unknown>(filePath);
      for (const { name, value } of importedMembers) {
        if (value instanceof z.ZodType) {
          this.setModulePath(name, modulePath);
        }
      }
    }
  }

  private getModulePathFromTypeFilePath(filePath: string): string {
    const normalizedPath = filePath.replaceAll("\\", "/");
    const matched = normalizedPath.match(/\/(?:src|dist)\/application\/(.+)\.(?:ts|js)$/);

    if (!matched?.[1]) {
      throw new Error(`타입 파일의 모듈 경로를 계산할 수 없습니다: ${filePath}`);
    }

    return matched[1];
  }
}

export const EntityManager = new EntityManagerClass();
