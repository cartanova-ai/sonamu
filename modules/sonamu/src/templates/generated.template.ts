import { camelize } from "inflection";
import { uniq } from "lodash";
import {
  isDateProp,
  isDateTimeProp,
  isTimestampProp,
  TemplateOptions,
} from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Entity } from "../entity/entity";
import { EntityPropNode, SubsetQuery } from "../types/types";
import { propNodeToZodTypeDef } from "../api/code-converters";
import { Template } from "./base-template";

export class Template__generated extends Template {
  constructor() {
    super("generated");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.generated.ts`,
    };
  }

  render({ entityId }: TemplateOptions["generated"]) {
    const entity = EntityManager.get(entityId);

    const typeSource = [
      this.getEnumsTypeSource(entity),
      this.getBaseSchemaTypeSource(entity),
      ...(entity.parentId === undefined
        ? [
            this.getBaseListParamsTypeSource(entity),
            this.getSubsetTypeSource(entity),
          ]
        : []),
    ].reduce(
      (result, ts) => {
        if (ts === null) {
          return result;
        }
        return {
          lines: [...result!.lines, ...ts.lines],
          importKeys: uniq([...result!.importKeys, ...ts.importKeys]),
        };
      },
      {
        lines: [],
        importKeys: [],
      }
    );

    // targetAndPath
    const names = EntityManager.getNamesFromId(entityId);
    const targetAndPath = this.getTargetAndPath(names);

    // import
    const sonamuImports = [
      "zArrayable",
      ...(entity.props.find(
        (p) => isTimestampProp(p) || isDateProp(p) || isDateTimeProp(p)
      )
        ? ["SQLDateTimeString"]
        : []),
    ];

    return {
      ...targetAndPath,
      body: [...typeSource!.lines, "/* END Server-side Only */"]
        .join("\n")
        .trim(),
      importKeys: typeSource?.importKeys ?? [],
      customHeaders: [
        `import { z } from 'zod';`,
        entity.props.length > 0
          ? `import { ${sonamuImports.join(",")} } from "sonamu";`
          : "",
      ],
    };
  }

  getEnumsTypeSource(entity: Entity): {
    lines: string[];
    importKeys: string[];
  } {
    const childrenIds = EntityManager.getChildrenIds(entity.id);
    const entities = [
      entity,
      ...childrenIds.map((id) => EntityManager.get(id)),
    ];

    return {
      lines: [
        "// Enums",
        ...entities
          .map((entity) =>
            Object.entries(entity.enumLabels).map(([enumId, enumLabel]) => [
              `export const ${enumId} = z.enum([${Object.keys(enumLabel).map(
                (el) => `"${el}"`
              )}]).describe("${enumId}");`,
              `export type ${enumId} = z.infer<typeof ${enumId}>`,
              `export const ${enumId}Label = ${JSON.stringify(enumLabel)}`,
            ])
          )
          .flat()
          .flat(),
        "",
      ],
      importKeys: [],
    };
  }

  getBaseSchemaTypeSource(
    entity: Entity,
    depth: number = 0,
    importKeys: string[] = []
  ): {
    lines: string[];
    importKeys: string[];
  } {
    const childrenIds = EntityManager.getChildrenIds(entity.id);

    const schemaName = `${entity.names.module}BaseSchema`;
    const propNode: EntityPropNode = {
      nodeType: "object",
      children: entity.props.map((prop) => {
        return {
          nodeType: "plain",
          prop,
        };
      }),
    };

    const schemaBody = propNodeToZodTypeDef(propNode, importKeys);

    const lines = [
      `export const ${schemaName} = ${schemaBody}`,
      `export type ${schemaName} = z.infer<typeof ${schemaName}>`,
      ...childrenIds
        .map((childId) => {
          const child = EntityManager.get(childId);
          const { lines } = this.getBaseSchemaTypeSource(
            child,
            depth + 1,
            importKeys
          );
          return lines;
        })
        .flat(),
    ];

    return {
      importKeys,
      lines,
    };
  }

  getBaseListParamsTypeSource(entity: Entity): {
    lines: string[];
    importKeys: string[];
  } {
    // Prop 없는 MD인 경우 생성 제외
    if (entity.props.length === 0) {
      return {
        lines: [],
        importKeys: [],
      };
    }

    const schemaName = `${entity.names.module}BaseListParams`;

    const filterProps = entity.props.filter((prop) => prop.toFilter === true);

    const propNodes: EntityPropNode[] = filterProps.map((prop) => {
      return {
        nodeType: "plain" as const,
        prop,
        children: [],
      };
    });

    const importKeys: string[] = [];
    const filterBody = propNodes
      .map((propNode) => propNodeToZodTypeDef(propNode, importKeys))
      .join("\n");

    const schemaBody = `
z.object({
  num: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  search: ${entity.id}SearchField,
  keyword: z.string(),
  orderBy: ${entity.id}OrderBy,
  withoutCount: z.boolean(),
  id: zArrayable(z.number().int().positive()),${filterBody}
}).partial();
`.trim();

    const lines = [
      `export const ${schemaName} = ${schemaBody}`,
      `export type ${schemaName} = z.infer<typeof ${schemaName}>`,
    ];

    return {
      importKeys,
      lines,
    };
  }

  getSubsetTypeSource(entity: Entity): {
    lines: string[];
    importKeys: string[];
  } | null {
    if (Object.keys(entity.subsets).length == 0) {
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

    const importKeys: string[] = [];
    const lines: string[] = [
      "",
      ...subsetKeys
        .map((subsetKey) => {
          // 서브셋에서 FieldExpr[] 가져옴
          const fieldExprs = entity.subsets[subsetKey];

          // FieldExpr[]로 EntityPropNode[] 가져옴
          const propNodes = entity.fieldExprsToPropNodes(fieldExprs);
          const schemaName = `${entity.names.module}Subset${subsetKey}`;
          const propNode: EntityPropNode = {
            nodeType: "object",
            children: propNodes,
          };

          // EntityPropNode[]로 ZodTypeDef(string)을 가져옴
          const body = propNodeToZodTypeDef(propNode, importKeys);

          return [
            `export const ${schemaName} = ${body}`,
            `export type ${schemaName} = z.infer<typeof ${schemaName}>`,
            "",
          ];
        })
        .flat(),
      "",
      `export type ${entity.names.module}SubsetMapping = {`,
      ...subsetKeys.map(
        (subsetKey) =>
          `  ${subsetKey}: ${entity.names.module}Subset${subsetKey};`
      ),
      "}",
      `export const ${entity.names.module}SubsetKey = z.enum([${subsetKeys
        .map((k) => `"${k}"`)
        .join(",")}]);`,
      `export type ${entity.names.module}SubsetKey = z.infer<typeof ${entity.names.module}SubsetKey>`,
      "",
      "/* BEGIN- Server-side Only */",
      `import { SubsetQuery } from "sonamu";`,
      `export const ${camelize(entity.id, true)}SubsetQueries:{ [key in ${
        entity.names.module
      }SubsetKey]: SubsetQuery} = ${JSON.stringify(subsetQueryObject)}`,
      "",
    ];
    return {
      lines,
      importKeys: uniq(importKeys),
    };
  }
}
