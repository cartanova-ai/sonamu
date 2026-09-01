import assert from "assert";
import { glob, readFile } from "fs/promises";
import path from "path";

import chalk from "chalk";
import inflection from "inflection";
import { prettifyError, z } from "zod";

import { Sonamu } from "../api/sonamu";
import {
  EntityJsonSchema,
  isSearchTextJsonSourceZodType,
  isSearchTextProp,
  SonamuFileArraySchema,
  SonamuFileSchema,
} from "../types/types";
import { type EntityIndex, type EntityJson } from "../types/types";
import { globAsync } from "../utils/async-utils";
import { importMembers } from "../utils/esm-utils";
import { type AbsolutePath } from "../utils/path-utils";
import { runtimePath } from "../utils/path-utils";
import { type Entity } from "./entity";

export type EntityNamesRecord = Record<
  "fs" | "fsPlural" | "camel" | "camelPlural" | "capital" | "capitalPlural" | "upper" | "constant",
  string
>;
export type TableSpec = {
  name: string;
  uniqueIndexes: EntityIndex[];
  jsonColumns: string[];
};

function parseEntityJson(source: string) {
  try {
    return JSON.parse(source);
  } catch (cause) {
    // JSON 파서 계약 밖의 오류는 구문 오류로 정규화하고 원인을 보존합니다.
    if (!(cause instanceof SyntaxError)) {
      throw new SyntaxError("entity.json 파싱 중 예기치 않은 오류가 발생했습니다.", { cause });
    }
    throw cause;
  }
}

class EntityManagerClass {
  private entities: Map<string, Entity> = new Map();
  public modulePaths: Map<string, string> = new Map();
  private tableSpecs: Map<string, TableSpec> = new Map();
  public isAutoloaded: boolean = false;
  // reload()가 Sonamu 초기화 없이도 같은 루트를 다시 읽도록 명시적 api root를 보존합니다.
  private explicitApiRootPath: string | undefined;

  // 경로 전달받아 모든 entity.json 파일 로드
  async autoload(doSilent: boolean = false, explicitApiRootPath?: string) {
    if (this.isAutoloaded) {
      return;
    }
    this.explicitApiRootPath = explicitApiRootPath;
    const apiRootPath = explicitApiRootPath ?? Sonamu.apiRootPath;
    const pathPattern = path.join(apiRootPath, "/src/application/**/*.entity.json");

    for await (const file of glob(path.resolve(pathPattern))) {
      const json = parseEntityJson((await readFile(file)).toString());

      // entity.json 스키마 검증
      const error = this.schemaValidate(json);
      if (error) {
        const relativePath = path.relative(apiRootPath, file);
        const errorMessage = prettifyError(error);
        if (!doSilent) {
          console.error(
            chalk.red(`Invalid entity.json schema: ${relativePath}\n${chalk.yellow(errorMessage)}`),
          );
        }
      }

      await this.register(json, {
        deferSearchTextJsonSourceValidation: true,
        apiRootPath,
      });
    }

    await this.registerNonEntityTypeModulePaths(apiRootPath);
    await this.validateAllRegisteredSearchTextJsonSources(apiRootPath);

    this.isAutoloaded = true;
  }

  schemaValidate<Value>(json: Value) {
    const result = EntityJsonSchema.safeParse(json);
    return result.success ? null : result.error;
  }

  async reload(doSilent: boolean = false, explicitApiRootPath?: string) {
    this.entities.clear();
    this.modulePaths.clear();
    this.tableSpecs.clear();
    this.isAutoloaded = false;

    return await this.autoload(doSilent, explicitApiRootPath ?? this.explicitApiRootPath);
  }

  async register(
    json: EntityJson,
    options: { deferSearchTextJsonSourceValidation?: boolean; apiRootPath?: string } = {},
  ): Promise<void> {
    const { Entity } = await import("./entity");
    const entity = new Entity(json);
    await entity.registerModulePaths(options.apiRootPath);
    if (!options.deferSearchTextJsonSourceValidation) {
      await this.validateSearchTextJsonSources(entity, options.apiRootPath);
    }
    entity.registerTableSpecs();
    this.entities.set(json.id, entity);
  }

  async validateAllRegisteredSearchTextJsonSources(apiRootPath?: string): Promise<void> {
    for (const entity of this.entities.values()) {
      await this.validateSearchTextJsonSources(entity, apiRootPath);
    }
  }

  private async validateSearchTextJsonSources(entity: Entity, apiRootPath?: string): Promise<void> {
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

        const zodType = await this.resolveSearchTextJsonSourceType(
          entity,
          sourceProp.id,
          apiRootPath,
        );
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
    explicitApiRootPath?: string,
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
      explicitApiRootPath ?? Sonamu.apiRootPath,
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
    const entity = Array.from(this.entities.values()).find(
      (candidate) => candidate.table === table,
    );
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
    return Array.from(EntityManager.entities.keys()).toSorted();
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

  getNamesFromId(entityId: string) {
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
    } satisfies EntityNamesRecord;
  }

  /**
   * EntityId는 Model을 제외한 PascalCase 이름입니다. (ex. "User")
   * @param filePath
   * @returns
   */
  getEntityIdFromPath(filePath: AbsolutePath): string {
    const fileName = path.basename(filePath);
    const supportedSuffixes = [".model.ts", ".model.js", ".entity.json", ".frame.ts", ".frame.js"];
    const matchedSuffix = supportedSuffixes.find((suffix) => fileName.endsWith(suffix));

    assert(matchedSuffix, `지원하지 않는 entity 경로입니다: ${filePath}`);

    const entityBaseName = fileName.slice(0, -matchedSuffix.length);
    assert(entityBaseName.length > 0, `EntityId를 계산할 수 없는 경로입니다: ${filePath}`);

    return inflection.camelize(entityBaseName.replace(/-/g, "_"));
  }

  private async registerNonEntityTypeModulePaths(apiRootPath: string): Promise<void> {
    const typePathsPatterns = [
      path.join(apiRootPath, runtimePath("src/application/**/*.types.ts")),
      path.join(apiRootPath, runtimePath("src/application/**/*.generated.ts")),
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
