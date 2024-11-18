import {
  EntityProp,
  isBelongsToOneRelationProp,
  isBigIntegerProp,
  isBooleanProp,
  isDateProp,
  isDateTimeProp,
  isDecimalProp,
  isDoubleProp,
  isEnumProp,
  isFloatProp,
  isIntegerProp,
  isJsonProp,
  isRelationProp,
  isStringProp,
  isTextProp,
  isTimeProp,
  isTimestampProp,
  isUuidProp,
  isVirtualProp,
} from "../types/types";
import { EntityManager } from "../entity/entity-manager";
import { Template } from "./base-template";
import { SourceCode } from "./generated.template";
import _ from "lodash";
import { nonNullable } from "../utils/utils";
import { Sonamu } from "../api";
import { Entity } from "../entity/entity";
import inflection from "inflection";
import { DB } from "../database/db";
import { KyselyBaseConfig } from "../database/types";

export class Template__kysely_interface extends Template {
  constructor() {
    super("kysely_interface");
  }

  getTargetAndPath() {
    const { dir } = Sonamu.config.api;
    const { types } = DB.baseConfig as KyselyBaseConfig;
    const outDir = types?.outDir ?? "src/typings";
    const fileName = types?.fileName ?? "database.types.ts";

    return {
      target: `${dir}/${outDir}`,
      path: fileName,
    };
  }

  render() {
    const entityIds = EntityManager.getAllIds();
    const entities = entityIds
      .map((id) => EntityManager.get(id))
      .filter(
        (e) => e.parentId === undefined || Object.keys(e.subsets).length > 0
      );
    const enums = _.merge({}, ...entities.map((e) => e.enums));

    const manyToManyTables = _.uniq(
      entities.flatMap((e) =>
        e.props
          .map((p) => {
            if (isRelationProp(p) && p.relationType === "ManyToMany") {
              return p.joinTable;
            }
            return null;
          })
          .filter(nonNullable)
      )
    ).map((table) => {
      const [fromTable, toTable] = table.split("__");
      return {
        table,
        fromTable,
        toTable,
        interfaceName: `${inflection.classify(fromTable)}${inflection.classify(toTable)}Table`,
      };
    });

    const sourceCodes: Omit<SourceCode, "label">[] = entities.map((entity) => {
      const columns = entity.props.map((prop) =>
        this.resolveColumn(prop, enums)
      );

      return {
        lines: [
          `interface ${entity.id}Table {
              ${columns.join("\n")}
            }`,
          "",
        ],
        importKeys: [],
      };
    });

    sourceCodes.push(
      ...manyToManyTables.map(({ fromTable, toTable, interfaceName }) => {
        return {
          lines: [
            `interface ${interfaceName} {
            id: number;
            ${inflection.singularize(fromTable)}_id: number;
            ${inflection.singularize(toTable)}_id: number;
          }`,
            "",
          ],
          importKeys: [],
        };
      })
    );

    const sourceCode = sourceCodes.reduce(
      (result, ts) => {
        if (ts === null) {
          return result;
        }
        return {
          lines: [...result!.lines, ...ts.lines, ""],
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
      customHeaders: [
        `import { Generated } from "kysely";`,
        "",
        `export interface KyselyDatabase {
          ${entities.map((entity) => `${entity.table}: ${entity.id}Table`).join(",\n")}
          ${manyToManyTables.map(({ table, interfaceName }) => `${table}: ${interfaceName}`).join(",\n")}
        }`,
      ],
    };
  }

  private resolveColumn(prop: EntityProp, enums: Entity["enums"]) {
    if (isVirtualProp(prop)) {
      return null;
    }

    if (prop.name === "id") {
      return "id: Generated<number>";
    }

    if (isRelationProp(prop)) {
      if (isBelongsToOneRelationProp(prop)) {
        return `${prop.name}_id: ${prop.nullable ? "number | null" : "number"}`;
      }
      return null;
    }

    let type: string;

    if (isIntegerProp(prop)) {
      type = "number";
    } else if (isBigIntegerProp(prop)) {
      type = "string";
    } else if (isStringProp(prop) || isTextProp(prop)) {
      type = "string";
    } else if (isEnumProp(prop)) {
      const enumValues = enums[prop.id];
      if (!enumValues) {
        console.warn(`Enum values not found for ${prop.id}`);
        return null;
      }
      type = Object.keys(enumValues.Values)
        .map((e) => `"${e}"`)
        .join(" | ");
    } else if (isFloatProp(prop) || isDoubleProp(prop) || isDecimalProp(prop)) {
      type = "number";
    } else if (isBooleanProp(prop)) {
      type = "boolean";
    } else if (
      isDateProp(prop) ||
      isDateTimeProp(prop) ||
      isTimeProp(prop) ||
      isTimestampProp(prop)
    ) {
      type = "Date";
    } else if (isJsonProp(prop)) {
      type = "string";
    } else if (isUuidProp(prop)) {
      type = "string";
    } else {
      console.warn(`Unknown prop type: ${(prop as any).type}`);
      type = "unknown";
    }

    if (prop.nullable) {
      type = `${type} | null`;
    }

    return `${prop.name}: ${type};`;
  }
}
