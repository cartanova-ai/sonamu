import { camelize } from "inflection";
import { uniq } from "lodash";
import {
  isDateProp,
  isDateTimeProp,
  isTimestampProp,
  TemplateOptions,
} from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { SMD } from "../smd/smd";
import { SMDPropNode, SubsetQuery } from "../types/types";
import { propNodeToZodTypeDef } from "../api/code-converters";
import { Template } from "./base-template";

export class Template__generated extends Template {
  constructor() {
    super("generated");
  }

  getTargetAndPath(names: SMDNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.generated.ts`,
    };
  }

  render({ smdId }: TemplateOptions["generated"]) {
    const names = SMDManager.getNamesFromId(smdId);
    const smd = SMDManager.get(smdId);

    const typeSource = [
      this.getBaseSchemaTypeSource(smd),
      this.getBaseListParamsTypeSource(smd),
      this.getSubsetTypeSource(smd),
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

    const fieldExprs = smd
      .getFieldExprs()
      .map((fieldExpr) => `"${fieldExpr}"`)
      .join(" | ");
    const fieldExprsLine = `export type ${smd.id}FieldExpr = ${
      fieldExprs.length > 0 ? fieldExprs : "string"
    }`;

    return {
      ...this.getTargetAndPath(names),
      body: [...typeSource!.lines, fieldExprsLine, "/* END Server-side Only */"]
        .join("\n")
        .trim(),
      importKeys: typeSource?.importKeys ?? [],
      customHeaders: [
        `import { z } from 'zod';`,
        smd.props.length > 0
          ? `import { zArrayable${
              smd.props.find(
                (p) => isTimestampProp(p) || isDateProp(p) || isDateTimeProp(p)
              )
                ? ", SQLDateTimeString"
                : ""
            } } from "sonamu";`
          : "",
      ],
    };
  }

  getBaseSchemaTypeSource(
    smd: SMD,
    depth: number = 0,
    importKeys: string[] = []
  ): {
    lines: string[];
    importKeys: string[];
  } {
    const childrenIds = SMDManager.getChildrenIds(smd.id);

    const schemaName = `${smd.names.module}BaseSchema`;
    const propNode: SMDPropNode = {
      nodeType: "object",
      children: smd.props.map((prop) => {
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
          const child = SMDManager.get(childId);
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

  getBaseListParamsTypeSource(smd: SMD): {
    lines: string[];
    importKeys: string[];
  } {
    // Prop 없는 MD인 경우 생성 제외
    if (smd.props.length === 0) {
      return {
        lines: [],
        importKeys: [],
      };
    }

    const schemaName = `${smd.names.module}BaseListParams`;

    const filterProps = smd.props.filter((prop) => prop.toFilter === true);

    const propNodes: SMDPropNode[] = filterProps.map((prop) => {
      return {
        nodeType: "plain" as const,
        prop,
        children: [],
      };
    });

    const importKeys: string[] = [`${smd.id}SearchField`, `${smd.id}OrderBy`];
    const filterBody = propNodes
      .map((propNode) => propNodeToZodTypeDef(propNode, importKeys))
      .join("\n");

    const schemaBody = `
z.object({
  num: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  search: ${smd.id}SearchField,
  keyword: z.string(),
  orderBy: ${smd.id}OrderBy,
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

  getSubsetTypeSource(smd: SMD): {
    lines: string[];
    importKeys: string[];
  } | null {
    if (Object.keys(smd.subsets).length == 0) {
      return null;
    }

    const subsetKeys = Object.keys(smd.subsets);

    const subsetQueryObject = subsetKeys.reduce(
      (r, subsetKey) => {
        const subsetQuery = smd.getSubsetQuery(subsetKey);
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
          const fieldExprs = smd.subsets[subsetKey];

          // FieldExpr[]로 MDPropNode[] 가져옴
          const propNodes = smd.fieldExprsToPropNodes(fieldExprs);
          const schemaName = `${smd.names.module}Subset${subsetKey}`;
          const propNode: SMDPropNode = {
            nodeType: "object",
            children: propNodes,
          };

          // MDPropNode[]로 ZodTypeDef(string)을 가져옴
          const body = propNodeToZodTypeDef(propNode, importKeys);

          return [
            `export const ${schemaName} = ${body}`,
            `export type ${schemaName} = z.infer<typeof ${schemaName}>`,
            "",
          ];
        })
        .flat(),
      "",
      `export type ${smd.names.module}SubsetMapping = {`,
      ...subsetKeys.map(
        (subsetKey) => `  ${subsetKey}: ${smd.names.module}Subset${subsetKey};`
      ),
      "}",
      `export const ${smd.names.module}SubsetKey = z.enum([${subsetKeys
        .map((k) => `"${k}"`)
        .join(",")}]);`,
      `export type ${smd.names.module}SubsetKey = z.infer<typeof ${smd.names.module}SubsetKey>`,
      "",
      "/* BEGIN- Server-side Only */",
      `import { SubsetQuery } from "sonamu";`,
      `export const ${camelize(smd.id, true)}SubsetQueries:{ [key in ${
        smd.names.module
      }SubsetKey]: SubsetQuery} = ${JSON.stringify(subsetQueryObject)}`,
      "",
    ];
    return {
      lines,
      importKeys: uniq(importKeys),
    };
  }
}
