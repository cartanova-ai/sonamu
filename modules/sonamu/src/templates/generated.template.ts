import _ from "lodash";
import { TemplateOptions } from "../types/types";
import { EntityManager } from "../entity/entity-manager";
import { Entity } from "../entity/entity";
import { EntityPropNode } from "../types/types";
import { propNodeToZodTypeDef, zodTypeToZodCode } from "../api/code-converters";
import { Template } from "./base-template";
import { nonNullable } from "../utils/utils";
import { Sonamu } from "../api";

export type SourceCode = {
  label: string;
  lines: string[];
  importKeys: string[];
};
export class Template__generated extends Template {
  constructor() {
    super("generated");
  }

  getTargetAndPath() {
    const { dir } = Sonamu.config.api;

    return {
      target: `${dir}/src/application`,
      path: `sonamu.generated.ts`,
    };
  }

  render({}: TemplateOptions["generated"]) {
    const entityIds = EntityManager.getAllIds();
    const entities = entityIds.map((id) => EntityManager.get(id));

    // 전체 SourceCode 생성
    const sourceCodes = entities
      .map((entity) => {
        return [
          this.getEnumsSourceCode(entity),
          this.getBaseSchemaSourceCode(entity),
          this.getBaseListParamsSourceCode(entity),
          this.getSubsetSourceCode(entity),
        ].filter(nonNullable);
      })
      .flat();

    // DatabaseSchema 생성
    const dbSchemaSourceCode = this.getDatabaseSchemaSourceCode(entities);
    if (dbSchemaSourceCode) {
      sourceCodes.push(dbSchemaSourceCode);
    }

    // Sort
    const LABEL_KEY_ORDER = [
      "Enums",
      "BaseSchema",
      "BaseListParams",
      "Subsets",
      "SubsetQueries",
      "DatabaseSchema",
    ];
    sourceCodes.sort((a, b) => {
      const [aKey] = a.label.split(":");
      const [bKey] = b.label.split(":");
      const aIndex = LABEL_KEY_ORDER.indexOf(aKey);
      const bIndex = LABEL_KEY_ORDER.indexOf(bKey);
      if (aIndex > bIndex) {
        return 1;
      } else if (aIndex < bIndex) {
        return -1;
      } else {
        return 0;
      }
    });

    const sourceCode = sourceCodes.reduce(
      (result, ts) => {
        if (ts === null) {
          return result;
        }
        return {
          lines: [...result!.lines, `// ${ts.label}`, ...ts.lines, ""],
          importKeys: _.uniq([...result!.importKeys, ...ts.importKeys].sort()),
        };
      },
      {
        lines: [],
        importKeys: [],
      } as Omit<SourceCode, "label">
    );

    // .types.ts의 타입을 참조하는 경우 순환참조(상호참조)가 발생하므로 타입을 가져와 인라인 처리
    const allTypeKeys = entities
      .map((entity) => Object.keys(entity.types))
      .flat();
    const cdImportKeys = sourceCode.importKeys.filter((importKey) =>
      allTypeKeys.includes(importKey)
    );
    if (cdImportKeys.length > 0) {
      const customScalarLines = cdImportKeys
        .map((importKey) => {
          const entity = entities.find((entity) => entity.types[importKey]);
          if (!entity) {
            throw new Error(`ZodType not found ${importKey}`);
          }
          const zodType = entity.types[importKey]!;

          return [
            `// CustomScalar: ${importKey}`,
            `const ${importKey} = ${zodTypeToZodCode(zodType)};`,
            `type ${importKey} = z.infer<typeof ${importKey}>`,
            "",
          ];
        })
        .flat();
      sourceCode.lines = [...customScalarLines, ...sourceCode.lines];
      sourceCode.importKeys = sourceCode.importKeys.filter(
        (importKey) => !cdImportKeys.includes(importKey)
      );
    }

    const body = sourceCode.lines.join("\n");

    // import
    const sonamuImports = [
      "zArrayable",
      "SQLDateTimeString",
      "SubsetQuery",
      "SonamuQueryMode",
    ].filter((mod) => body.includes(mod));

    return {
      ...this.getTargetAndPath(),
      body,
      importKeys: sourceCode.importKeys,
      customHeaders: [
        `import { z } from 'zod';`,
        `import { ${sonamuImports.join(",")} } from "sonamu";`,
      ],
    };
  }

  getEnumsSourceCode(entity: Entity): SourceCode | null {
    if (Object.keys(entity.enumLabels).length === 0) {
      return null;
    }
    return {
      label: `Enums: ${entity.id}`,
      lines: [
        ...Object.entries(entity.enumLabels)
          .filter(([_, enumLabel]) => Object.keys(enumLabel).length > 0)
          .map(([enumId, enumLabel]) => [
            `export const ${enumId} = z.enum([${Object.keys(enumLabel).map(
              (el) => `"${el}"`
            )}]).describe("${enumId}");`,
            `export type ${enumId} = z.infer<typeof ${enumId}>`,
            `export const ${enumId}Label = ${JSON.stringify(enumLabel)}`,
          ])
          .flat(),
      ],
      importKeys: [],
    };
  }

  getBaseSchemaSourceCode(
    entity: Entity,
    importKeys: string[] = []
  ): SourceCode {
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
    ];

    return {
      label: `BaseSchema: ${entity.id}`,
      importKeys,
      lines,
    };
  }

  getBaseListParamsSourceCode(entity: Entity): SourceCode | null {
    // Prop 없는 MD인 경우 생성 제외
    if (entity.props.length === 0) {
      return null;
    } else if (entity.parentId !== undefined) {
      return null;
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
  queryMode: SonamuQueryMode,
  id: zArrayable(z.number().int().positive()),${filterBody}
}).partial();
`.trim();

    const lines = [
      `export const ${schemaName} = ${schemaBody}`,
      `export type ${schemaName} = z.infer<typeof ${schemaName}>`,
    ];

    return {
      label: `BaseListParams: ${entity.id}`,
      importKeys,
      lines,
    };
  }

  getSubsetSourceCode(entity: Entity): SourceCode | null {
    if (Object.keys(entity.subsets).length == 0) {
      return null;
    } else if (entity.parentId !== undefined) {
      return null;
    }

    const subsetKeys = Object.keys(entity.subsets);
    const importKeys: string[] = [];
    const lines: string[] = [
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
          ];
        })
        .flat(),
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
    ];

    return {
      label: `Subsets: ${entity.id}`,
      lines,
      importKeys: _.uniq(importKeys),
    };
  }

  getDatabaseSchemaSourceCode(entities: Entity[]): SourceCode | null {
    if (entities.length === 0) {
      return null;
    }

    const lines = entities.map(
      (entity) => `${entity.table}: ${entity.id}BaseSchema;`
    );

    return {
      label: `DatabaseSchema`,
      lines: [
        //
        `export type DatabaseSchema = {`,
        ...lines,
        `};`,
      ],
      importKeys: [],
    };
  }
}
