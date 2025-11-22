import assert from "assert";
import inflection from "inflection";
import uniq from "lodash-es/uniq.js";
import { Sonamu } from "../../api";
import type { Entity } from "../../entity/entity";
import { EntityManager } from "../../entity/entity-manager";
import { isManyToManyRelationProp, type SubsetQuery } from "../../types/types";
import { nonNullable } from "../../utils/utils";
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

    const sourceCodes: SourceCode[] = entities
      .map((entity) => {
        if (entity.parentId !== undefined || Object.keys(entity.subsets).length === 0) {
          return null;
        }
        const subsetKeys = Object.keys(entity.subsets);
        const subsetQueryObject = subsetKeys.reduce(
          (r, subsetKey) => {
            const subsetQuery = entity.getSubsetQuery(subsetKey);
            r[subsetKey] = subsetQuery;
            return r;
          },
          {} as {
            [key: string]: SubsetQuery;
          },
        );

        const subsetKeyTypeName = `${entity.names.module}SubsetKey`;
        return {
          label: `SubsetQuery: ${entity.id}`,
          lines: [
            `export const ${inflection.camelize(
              entity.id,
              true,
            )}SubsetQueries:{ [key in ${subsetKeyTypeName}]: SubsetQuery} = ${JSON.stringify(
              subsetQueryObject,
            )};`,
            "",
          ],
          importKeys: [subsetKeyTypeName],
        };
      })
      .filter(nonNullable);

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
          importKeys: uniq([...result.importKeys, ...ts.importKeys]),
        };
      },
      {
        lines: [],
        importKeys: [],
      } as Omit<SourceCode, "label">,
    );

    const body = sourceCode.lines.join("\n");
    const isUsingManyToManyBaseSchema = body.includes("ManyToManyBaseSchema");
    return {
      ...this.getTargetAndPath(),
      body: sourceCode.lines.join("\n"),
      importKeys: sourceCode.importKeys,
      customHeaders: [
        `import { SubsetQuery, ${isUsingManyToManyBaseSchema ? "ManyToManyBaseSchema" : ""} } from "sonamu";`,
      ],
    };
  }

  getDatabaseSchemaSourceCode(entities: Entity[]): SourceCode | null {
    if (entities.length === 0) {
      return null;
    }

    const entitySchemaLines = entities.map((entity) => `${entity.table}: ${entity.id}BaseSchema;`);

    const joinTableSchemaLines = uniq(
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
