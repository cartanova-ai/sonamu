import { SubsetQuery, TemplateOptions } from "../types/types";
import { EntityManager } from "../entity/entity-manager";
import { Template } from "./base-template";
import inflection from "inflection";
import { SourceCode } from "./generated.template";
import _ from "lodash";
import { nonNullable } from "../utils/utils";
import { Sonamu } from "../api";

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

  render({}: TemplateOptions["generated_sso"]) {
    const entityIds = EntityManager.getAllIds();
    const entities = entityIds.map((id) => EntityManager.get(id));

    const sourceCodes: SourceCode[] = entities
      .map((entity) => {
        if (
          entity.parentId !== undefined ||
          Object.keys(entity.subsets).length === 0
        ) {
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
          }
        );

        const subsetKeyTypeName = `${entity.names.module}SubsetKey`;
        return {
          label: `SubsetQuery: ${entity.id}`,
          lines: [
            `export const ${inflection.camelize(
              entity.id,
              true
            )}SubsetQueries:{ [key in ${subsetKeyTypeName}]: SubsetQuery} = ${JSON.stringify(
              subsetQueryObject
            )};`,
            "",
          ],
          importKeys: [subsetKeyTypeName],
        };
      })
      .filter(nonNullable);

    const sourceCode = sourceCodes.reduce(
      (result, ts) => {
        if (ts === null) {
          return result;
        }
        return {
          lines: [...result!.lines, `// ${ts.label}`, ...ts.lines, ""],
          importKeys: _.uniq([...result!.importKeys, ...ts.importKeys]),
        };
      },
      {
        lines: [],
        importKeys: [],
      } as Omit<SourceCode, "label">
    );

    return {
      ...this.getTargetAndPath(),
      body: sourceCode.lines.join("\n"),
      importKeys: sourceCode.importKeys,
      customHeaders: [`import { SubsetQuery } from "sonamu";`],
    };
  }
}
