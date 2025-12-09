import assert from "assert";
import inflection from "inflection";
import { unique } from "radashi";
import { Sonamu } from "../../api";
import type { Entity } from "../../entity/entity";
import { EntityManager } from "../../entity/entity-manager";
import {
  isBelongsToOneRelationProp,
  isManyToManyRelationProp,
  isOneToOneRelationProp,
} from "../../types/types";
import { Template } from "../template";
import type { SourceCode } from "./generated.template";

export class Template__generated_sso extends Template {
  constructor() {
    super("generated_sso");
  }

  getTargetAndPath() {
    const { dir } = Sonamu.config.api;

    return {
      target: `${dir}/src/application`,
      path: `sonamu.generated.sso.ts`,
    };
  }

  render() {
    const entityIds = EntityManager.getAllIds();
    const entities = entityIds.map((id) => EntityManager.get(id));

    // SubsetQueries 생성 대상: 부모 엔티티가 없고 서브셋이 존재
    const targetEntities = entities.filter(
      (entity) => entity.parentId === undefined && Object.keys(entity.subsets).length > 0,
    );

    // SubsetQueries 생성
    const sourceCodes: SourceCode[] = targetEntities.flatMap((entity) => {
      const subsetKeys = Object.keys(entity.subsets);

      const subsetKeyTypeName = `${entity.names.module}SubsetKey`;
      const entityCamelName = inflection.camelize(entity.id, true);

      // Puri 기반 SubsetQuery
      const puriSubsetQuery: SourceCode = {
        label: `SubsetQuery: ${entity.id}`,
        lines: [
          `export const ${entityCamelName}SubsetQueries = {`,
          ...subsetKeys.map(
            (subsetKey) => `${subsetKey}: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
            ${entity.getPuriSubsetQuery(subsetKey)};
          },`,
          ),
          `};`,
          "",
        ],
        importKeys: [],
      };

      // Puri 기반 SubsetLoadersQuery
      const puriLoaderQuery: SourceCode = {
        label: `LoaderQuery: ${entity.id}`,
        lines: [
          `export const ${entityCamelName}LoaderQueries = {`,
          ...subsetKeys.map((subsetKey) => {
            return `${subsetKey}: ${entity.getPuriLoaderQuery(subsetKey)},`;
          }),
          `} as const satisfies PuriLoaderQueries<${subsetKeyTypeName}>;`,
          "",
        ],
        importKeys: [subsetKeyTypeName],
      };

      return [puriSubsetQuery, puriLoaderQuery];
    });

    // ForeignKey 타입 생성
    const fkTypeSourceCode = this.getForeignKeyTypeSourceCode(entities);
    if (fkTypeSourceCode) {
      sourceCodes.push(fkTypeSourceCode);
    }

    // DatabaseSchema 생성
    const dbSchemaSourceCode = this.getDatabaseSchemaSourceCode(entities);
    if (dbSchemaSourceCode) {
      sourceCodes.push(dbSchemaSourceCode);
    }

    const sourceCode = sourceCodes.reduce(
      (result, ts) => {
        if (ts === null) {
          return result;
        }
        assert(result);
        return {
          lines: [...result.lines, `// ${ts.label}`, ...ts.lines, ""],
          importKeys: unique([...result.importKeys, ...ts.importKeys]),
        };
      },
      {
        lines: [],
        importKeys: [],
      } as Omit<SourceCode, "label">,
    );

    const body = sourceCode.lines.join("\n");
    const isUsingManyToManyBaseSchema = body.includes("ManyToManyBaseSchema");

    const sonamuImports = [
      "PuriWrapper",
      "DatabaseSchemaExtend",
      "PuriLoaderQueries",
      isUsingManyToManyBaseSchema ? "ManyToManyBaseSchema" : "",
    ]
      .filter(Boolean)
      .join(", ");

    return {
      ...this.getTargetAndPath(),
      body: sourceCode.lines.join("\n"),
      importKeys: sourceCode.importKeys,
      customHeaders: [`import { ${sonamuImports} } from "sonamu";`],
    };
  }

  //===============================================
  // private Helper Methods
  //===============================================
  private getDatabaseSchemaSourceCode(entities: Entity[]): SourceCode | null {
    if (entities.length === 0) {
      return null;
    }

    // DatabaseSchemaExtend - 테이블 스키마 타입 정의
    const entitySchemaLines = entities.map((entity) => `${entity.table}: ${entity.id}BaseSchema;`);

    const joinTables = unique(
      entities.flatMap((entity) =>
        entity.props.filter(isManyToManyRelationProp).map((prop) => {
          const fromTableKey = inflection.singularize(entity.table);
          const toTableKey = inflection.singularize(EntityManager.get(prop.with).table);
          return { table: prop.joinTable, fromTableKey, toTableKey };
        }),
      ),
      (joinTable) => joinTable.table,
    );

    // DatabaseForeignKeys - FK 컬럼을 가진 테이블만 정의
    const entitiesWithFk = entities.filter(
      (entity) => this.getForeignKeyColumns(entity).length > 0,
    );
    const fkMetadataLines = entitiesWithFk.map(
      (entity) => `${entity.table}: ${entity.id}ForeignKeys;`,
    );

    return {
      label: `DatabaseSchema`,
      lines: [
        `declare module "sonamu" {`,
        `  export interface DatabaseSchemaExtend {`,
        ...entitySchemaLines,
        ...joinTables.map(
          (joinTable) =>
            `${joinTable.table}: ManyToManyBaseSchema<"${joinTable.fromTableKey}", "${joinTable.toTableKey}">;`,
        ),
        `  }`,
        ``,
        `  export interface DatabaseForeignKeys {`,
        ...fkMetadataLines,
        `  }`,
        `}`,
      ],
      importKeys: entities.map((entity) => `${entity.id}BaseSchema`),
    };
  }

  // FK 관계를 컬럼명으로 변환 (예: company → company_id)
  private getForeignKeyColumns(entity: Entity): string[] {
    return entity.props
      .filter((prop) => {
        if (isBelongsToOneRelationProp(prop)) {
          return true;
        }
        if (isOneToOneRelationProp(prop) && prop.hasJoinColumn) {
          return true;
        }
        return false;
      })
      .map((prop) => `${prop.name}_id`);
  }

  private getForeignKeyTypeSourceCode(entities: Entity[]): SourceCode | null {
    if (entities.length === 0) {
      return null;
    }

    // FK가 있는 엔티티만 타입 생성
    const entitiesWithFk = entities.filter(
      (entity) => this.getForeignKeyColumns(entity).length > 0,
    );

    if (entitiesWithFk.length === 0) {
      return null;
    }

    const fkTypeLines = entitiesWithFk.map((entity) => {
      const fkColumns = this.getForeignKeyColumns(entity);
      const fkTypeValue = fkColumns.map((col) => `"${col}"`).join(" | ");

      return `export type ${entity.id}ForeignKeys = ${fkTypeValue};`;
    });

    return {
      label: `ForeignKey Types`,
      lines: fkTypeLines,
      importKeys: [],
    };
  }
}
