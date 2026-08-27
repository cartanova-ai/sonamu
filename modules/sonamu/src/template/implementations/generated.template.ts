import assert from "assert";

import { unique } from "radashi";

import { Sonamu } from "../../api";
import { type Entity } from "../../entity/entity";
import { EntityManager } from "../../entity/entity-manager";
import { Naite } from "../../naite/naite";
import { isVirtualCodeProp, isVirtualQueryProp } from "../../types/types";
import { type EntityIndex, type EntityPropNode } from "../../types/types";
import { nonNullable } from "../../utils/utils";
import { Template } from "../template";
import { BUILT_IN_TYPES, propNodeToZodTypeDef, zodTypeToZodCode } from "../zod-converter";

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
  render() {
    const entityIds = EntityManager.getAllIds();
    const entities = entityIds.map((id) => EntityManager.get(id));

    // 전체 SourceCode 생성
    const sourceCodes = entities.flatMap((entity) => {
      return [
        this.getEnumsSourceCode(entity),
        this.getBaseSchemaSourceCode(entity),
        this.getBaseListParamsSourceCode(entity),
        this.getSubsetSourceCode(entity),
      ].filter(nonNullable);
    });
    Naite.t("Template__generated:sourceCodes", sourceCodes);

    // Sort
    const LABEL_KEY_ORDER = ["Enums", "BaseSchema", "BaseListParams", "Subsets", "SubsetQueries"];
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
          lines: [...result.lines, `// ${ts.label}`, ...ts.lines, ""],
          importKeys: unique([...result.importKeys, ...ts.importKeys].toSorted()),
        };
      },
      /* SAFETY: reduce 누산기는 label을 제외한 SourceCode의 두 배열로 초기화된다. */ {
        lines: [],
        importKeys: [],
      } as Omit<SourceCode, "label">,
    );

    // .types.ts의 타입을 참조하는 경우 순환참조(상호참조)가 발생하므로 타입을 가져와 인라인 처리
    const allTypeKeys = entities.flatMap((entity) => Object.keys(entity.types));
    const cdImportKeys = sourceCode.importKeys.filter((importKey) =>
      allTypeKeys.includes(importKey),
    );
    if (cdImportKeys.length > 0) {
      const customScalarLines = cdImportKeys.flatMap((importKey) => {
        const entity = entities.find((candidateEntity) => candidateEntity.types[importKey]);
        if (!entity) {
          throw new Error(`ZodType not found ${importKey}`);
        }
        const zodType = entity.types[importKey];
        assert(zodType);

        return [
          `// CustomScalar: ${importKey}`,
          `const ${importKey} = ${zodTypeToZodCode(zodType, sourceCode.importKeys)};`,
          `type ${importKey} = z.infer<typeof ${importKey}>`,
          "",
        ];
      });
      sourceCode.lines = [...customScalarLines, ...sourceCode.lines];
      sourceCode.importKeys = unique(
        sourceCode.importKeys.filter((importKey) => !cdImportKeys.includes(importKey)),
      );
    }

    const body = sourceCode.lines.join("\n");
    Naite.t("Template__generated:body", body);

    // import
    // sourceCode.importKeys에 내장 타입의 스키마가 있으면 sonamu import에 추가
    const builtInSchemaNames = Object.values(BUILT_IN_TYPES).map(
      (info) =>
        /* SAFETY: BUILT_IN_TYPES의 모든 항목은 생성 코드에 쓸 schemaName을 가진다. */ info.schemaName as string,
    );
    const builtInSchemas = sourceCode.importKeys.filter((key) => builtInSchemaNames.includes(key));
    const sonamuImports = [
      "zArrayable",
      "SQLDateTimeString",
      "SubsetQuery",
      "SonamuQueryMode",
      "ApplySonamuFilter",
      ...builtInSchemas,
    ].filter((mod) => body.includes(mod));

    return {
      ...this.getTargetAndPath(),
      body,
      importKeys: sourceCode.importKeys,
      customHeaders: [
        "/**",
        " * @generated",
        " * 직접 수정하지 마세요.",
        " */",
        "",
        "/* oxlint-disable */",
        "",
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
      lines: Object.entries(entity.enumLabels)
        .filter(([, enumLabel]) => Object.keys(enumLabel).length > 0)
        .flatMap(([enumId, enumLabel]) => [
          `export const ${enumId} = z.enum([${Object.keys(enumLabel).map(
            (el) => `"${el}"`,
          )}]).describe("${enumId}");`,
          `export type ${enumId} = z.infer<typeof ${enumId}>;`,
          `export const ${enumId}Label = ${JSON.stringify(enumLabel)};`,
        ]),
      importKeys: [],
    };
  }

  getBaseSchemaSourceCode(entity: Entity, importKeys: string[] = []): SourceCode {
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

    const schemaBody = (() => {
      const result = propNodeToZodTypeDef(propNode, importKeys);
      if (result.endsWith(",")) {
        return result.slice(0, -1);
      }

      return result;
    })();

    // fulltext index에 포함된 컬럼들 추출
    // TODO: GIN/GiST 인덱스 생성된 컬럼 추출
    const fulltextColumns: EntityIndex["columns"][] = [];

    // virtual props (virtualType: "code" 또는 undefined인 것만 포함)
    const virtualProps = entity.props
      .filter((prop) => isVirtualCodeProp(prop))
      .map((prop) => prop.name);

    // query virtual props (virtualType: "query"인 것만 포함)
    const virtualQueryProps = entity.props
      .filter((prop) => isVirtualQueryProp(prop))
      .map((prop) => prop.name);

    /**
     * hasDefault props
     * - nullable 또는 dbDefault가 있는 컬럼 (id 포함)
     * - relation이 아니거나, relation이어도 nullable이면 포함
     */
    const hasDefaultColumns = entity.props
      .filter(
        (prop) =>
          (prop.type !== "relation" || prop.nullable === true) &&
          (prop.nullable === true || (prop.type !== "relation" && prop.dbDefault !== undefined)),
      )
      .map((prop) => (prop.type === "relation" ? `${prop.name}_id` : prop.name))
      .concat("id");

    /**
     * hasVector props
     * - vector 타입인 컬럼
     */
    const hasVectorColumns = entity.props
      .filter((prop) => prop.type === "vector" || prop.type === "vector[]")
      .map((prop) => prop.name);

    /**
     * JSON props
     * - json 타입인 컬럼
     */
    const jsonColumns = entity.props
      .filter((prop) => prop.type === "json")
      .map((prop) => prop.name);

    /**
     * generated props
     * - generated 속성이 있는 컬럼 (INSERT/UPDATE 시 값 제공 불가)
     */
    const generatedColumns = entity.props
      .filter(
        (prop) =>
          prop.type !== "relation" && (prop.generated !== undefined || prop.type === "searchText"),
      )
      .map((prop) => prop.name);

    const hasMetadata =
      fulltextColumns.length > 0 ||
      virtualProps.length > 0 ||
      virtualQueryProps.length > 0 ||
      hasDefaultColumns.length > 0 ||
      generatedColumns.length > 0 ||
      hasVectorColumns.length > 0 ||
      jsonColumns.length > 0;

    const lines = [
      `export const ${schemaName} = ${schemaBody};`,
      `export type ${schemaName} = z.infer<typeof ${schemaName}>` +
        (hasMetadata
          ? ` & {${
              (fulltextColumns.length > 0
                ? `readonly __fulltext__: readonly [${fulltextColumns
                    .map((col) => `"${col}"`)
                    .join(", ")}],`
                : "") +
              (virtualProps.length > 0
                ? `readonly __virtual__: readonly [${virtualProps.map((prop) => `"${prop}"`).join(", ")}],`
                : "") +
              (virtualQueryProps.length > 0
                ? `readonly __virtual_query__: readonly [${virtualQueryProps.map((prop) => `"${prop}"`).join(", ")}],`
                : "") +
              (hasDefaultColumns.length > 0
                ? `readonly __hasDefault__: readonly [${hasDefaultColumns
                    .map((col) => `"${col}"`)
                    .join(", ")}],`
                : "") +
              (generatedColumns.length > 0
                ? `readonly __generated__: readonly [${generatedColumns
                    .map((col) => `"${col}"`)
                    .join(", ")}],`
                : "") +
              (hasVectorColumns.length > 0
                ? `readonly __vector__: readonly [${hasVectorColumns
                    .map((col) => `"${col}"`)
                    .join(", ")}],`
                : "") +
              (jsonColumns.length > 0
                ? `readonly __json__: readonly [${jsonColumns
                    .map((col) => `"${col}"`)
                    .join(", ")}],`
                : "")
            }}`
          : "") +
        ";",
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

    // FilterQuery 타입을 위한 제외할 props 추출 (virtual만 제외)
    const excludedProps = entity.props.filter((p) => p.type === "virtual").map((p) => p.name);

    // numeric 타입인 props 추출
    const numericProps = entity.props.filter((p) => p.type === "numeric");

    // ApplySonamuFilter 타입 인자 생성
    const entityType = `${entity.id}BaseSchema`;
    const numericKeysUnion =
      numericProps.length > 0 ? numericProps.map((prop) => `"${prop.name}"`).join(" | ") : "never";
    const omitKeysUnion =
      excludedProps.length > 0 ? excludedProps.map((n) => `"${n}"`).join(" | ") : "never";

    // PK 타입에 따른 id Zod 타입 결정
    const pkType = entity.getPkType();
    const idZodType =
      pkType === "string" || pkType === "uuid"
        ? "zArrayable(z.string())"
        : "zArrayable(z.number().int().positive())";

    const schemaBody = `
z.object({
  num: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  search: ${entity.id}SearchField,
  keyword: z.string(),
  orderBy: ${entity.id}OrderBy,
  queryMode: SonamuQueryMode,
  id: ${idZodType},
  sonamuFilter: z.custom<ApplySonamuFilter<${entityType}, ${omitKeysUnion}, ${numericKeysUnion}>>(),${filterBody}
}).partial();
`.trim();

    const lines = [
      `export const ${schemaName} = ${schemaBody};`,
      `export type ${schemaName} = z.infer<typeof ${schemaName}>;`,
    ];

    return {
      label: `BaseListParams: ${entity.id}`,
      importKeys,
      lines,
    };
  }

  getSubsetSourceCode(entity: Entity): SourceCode | null {
    if (Object.keys(entity.subsets).length === 0) {
      return null;
    } else if (entity.parentId !== undefined) {
      return null;
    }

    const subsetKeys = Object.keys(entity.subsets);
    const importKeys: string[] = [];
    const lines: string[] = [
      ...subsetKeys.flatMap((subsetKey) => {
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
          `export const ${schemaName} = ${body.replace(/,$/, "")};`,
          `export type ${schemaName} = z.infer<typeof ${schemaName}>;`,
        ];
      }),
      `export type ${entity.names.module}SubsetMapping = {`,
      ...subsetKeys.map((subsetKey) => `  ${subsetKey}: ${entity.names.module}Subset${subsetKey};`),
      "};",
      `export const ${entity.names.module}SubsetKey = z.enum([${subsetKeys
        .map((k) => `"${k}"`)
        .join(",")}]);`,
      `export type ${entity.names.module}SubsetKey = z.infer<typeof ${entity.names.module}SubsetKey>;`,
      "",
    ];

    return {
      label: `Subsets: ${entity.id}`,
      lines,
      importKeys: unique(importKeys),
    };
  }
}
