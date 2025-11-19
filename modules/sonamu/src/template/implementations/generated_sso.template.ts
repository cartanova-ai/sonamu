import assert from "assert";
import inflection from "inflection";
import { unique } from "radashi";
import { Sonamu } from "../../api";
import type { Entity } from "../../entity/entity";
import { EntityManager } from "../../entity/entity-manager";
import { isManyToManyRelationProp, type SubsetQuery } from "../../types/types";
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
      (entity) =>
        entity.parentId === undefined && Object.keys(entity.subsets).length > 0
    );

    // SubsetQueries 생성
    const sourceCodes: SourceCode[] = targetEntities.flatMap((entity) => {
      const subsetKeys = Object.keys(entity.subsets);
      const subsetQueryObject = subsetKeys.reduce(
        (r, subsetKey) => {
          const subsetQuery = entity.getSubsetQuery(subsetKey);
          r[subsetKey] = subsetQuery;
          return r;
        },
        {} as {
          [key: string]: SubsetQuery;
        }
      );

      const subsetKeyTypeName = `${entity.names.module}SubsetKey`;
      const entityCamelName = inflection.camelize(entity.id, true);

      // JSON 기반 SubsetQuery
      const jsonSubsetQuery: SourceCode = {
        label: `SubsetQuery: ${entity.id}`,
        lines: [
          `export const ${entityCamelName}SubsetQueries:{ [key in ${subsetKeyTypeName}]: SubsetQuery} = ${JSON.stringify(
            subsetQueryObject
          )};`,
          "",
        ],
        importKeys: [subsetKeyTypeName],
      };

      // Puri 기반 SubsetQuery
      const puriSubsetQuery: SourceCode = {
        label: `Puri SubsetQuery: ${entity.id}`,
        lines: [
          `export const ${entityCamelName}PuriSubsetQueries = {`,
          ...subsetKeys.map(
            (
              subsetKey
            ) => `${subsetKey}: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
            ${entity.getPuriSubsetQuery(subsetKey)};
          },`
          ),
          `};`,
          "",
        ],
        importKeys: [],
      };

      return [jsonSubsetQuery, puriSubsetQuery];
    });

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
      "SubsetQuery",
      "PuriWrapper",
      "DatabaseSchemaExtend",
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

  getDatabaseSchemaSourceCode(entities: Entity[]): SourceCode | null {
    if (entities.length === 0) {
      return null;
    }

    const entitySchemaLines = entities.map((entity) => `${entity.table}: ${entity.id}BaseSchema;`);

    const joinTableSchemaLines = unique(
      entities.flatMap((entity) =>
        entity.props.filter(isManyToManyRelationProp).map((prop) => {
          const fromTableKey = inflection.singularize(entity.table);
          const toTableKey = inflection.singularize(EntityManager.get(prop.with).table);
          return `${prop.joinTable}: ManyToManyBaseSchema<"${fromTableKey}", "${toTableKey}">;`;
        }),
      ),
    );

    return {
      label: `DatabaseSchema`,
      lines: [
        `declare module "sonamu" {`,
        `  export interface DatabaseSchemaExtend {`,
        ...entitySchemaLines,
        ...joinTableSchemaLines,
        `  }`,
        `}`,
      ],
      importKeys: entities.map((entity) => `${entity.id}BaseSchema`),
    };
  }
}
