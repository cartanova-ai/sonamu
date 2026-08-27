import assert from "assert";

import inflection from "inflection";
import { unique } from "radashi";

import { Sonamu } from "../../api";
import { type Entity } from "../../entity/entity";
import { EntityManager } from "../../entity/entity-manager";
import {
  isBelongsToOneRelationProp,
  isManyToManyRelationProp,
  isOneToOneRelationProp,
} from "../../types/types";
import { Template } from "../template";
import { type SourceCode } from "./generated.template";

/**
 * better-auth additionalFields의 type 값을 TypeScript 타입 문자열로 변환합니다.
 */
function mapBetterAuthFieldType(type: string): string {
  switch (type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
      return "Date";
    case "string[]":
      return "string[]";
    case "number[]":
      return "number[]";
    default:
      return "unknown";
  }
}

function addLoaderIdTypeSafetyComments(query: string): string {
  return query.replaceAll(
    /fromIds as (?:number|string)\[\]/g,
    "/* SAFETY: 로더가 전달하는 ID는 소스 엔티티의 기본 키 타입과 일치한다. */ $&",
  );
}

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
            const query = entity.getPuriLoaderQuery(subsetKey);
            return `${subsetKey}: ${addLoaderIdTypeSafetyComments(query)},`;
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

    // Auth User 타입 생성
    const authUserTypeSourceCode = this.getAuthUserTypeSourceCode();
    if (authUserTypeSourceCode) {
      sourceCodes.push(authUserTypeSourceCode);
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
      /* SAFETY: reduce 누산기는 label을 제외한 SourceCode의 두 배열로 초기화된다. */ {
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

    // customHeaders 구성
    const customHeaders = [
      "/**",
      " * @generated",
      " * 직접 수정하지 마세요.",
      " */",
      "",
      `import { ${sonamuImports} } from "sonamu";`,
    ];
    if (this.hasAuthConfig()) {
      customHeaders.push(`import type { User } from "better-auth";`);
    }

    return {
      ...this.getTargetAndPath(),
      body: sourceCode.lines.join("\n"),
      importKeys: sourceCode.importKeys,
      customHeaders,
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
          const toEntity = EntityManager.get(prop.with);
          const toTableKey = inflection.singularize(toEntity.table);
          return {
            table: prop.joinTable,
            fromTableKey,
            toTableKey,
            fromEntityId: entity.id,
            toEntityId: toEntity.id,
          };
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

    // ContextExtend - auth 설정이 있을 때만 user 타입 추가
    const contextExtendLines: string[] = [];
    if (this.hasAuthConfig()) {
      contextExtendLines.push(
        ``,
        `  export interface ContextExtend {`,
        `    user: SonamuUser | null;`,
        `  }`,
      );
    }

    return {
      label: `DatabaseSchema`,
      lines: [
        `declare module "sonamu" {`,
        `  export interface DatabaseSchemaExtend {`,
        ...entitySchemaLines,
        ...joinTables.map((joinTable) => {
          const fromEntity = EntityManager.get(joinTable.fromEntityId);
          const toEntity = EntityManager.get(joinTable.toEntityId);
          const fromPkType = fromEntity.getPkType() === "integer" ? "number" : "string";
          const toPkType = toEntity.getPkType() === "integer" ? "number" : "string";

          return `${joinTable.table}: ManyToManyBaseSchema<"${joinTable.fromTableKey}", "${joinTable.toTableKey}", ${fromPkType}, ${toPkType}>;`;
        }),
        `  }`,
        ``,
        `  export interface DatabaseForeignKeys {`,
        ...fkMetadataLines,
        `  }`,
        ...contextExtendLines,
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

  /**
   * sonamu.config.ts의 auth.user.additionalFields에서 SonamuUser 타입을 생성합니다.
   * @returns SourceCode | null - auth 설정이 없으면 null 반환
   */
  private getAuthUserTypeSourceCode(): SourceCode | null {
    const authConfig = Sonamu.config.server?.auth;
    if (!authConfig) {
      return null;
    }

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- additionalFields 타입이 동적임
    const additionalFields =
      /* SAFETY: better-auth 설정의 user.additionalFields는 동적 필드 맵이다. */ (authConfig as any)
        ?.user?.additionalFields;
    if (!additionalFields || Object.keys(additionalFields).length === 0) {
      // additionalFields가 없으면 기본 User 타입만 사용
      return {
        label: "Auth User Type",
        lines: ["export type SonamuUser = User;"],
        importKeys: [],
      };
    }

    const importKeys: string[] = [];

    // additionalFields를 TypeScript 타입으로 변환
    const fieldLines = Object.entries(additionalFields).map(([key, value]) => {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- better-auth additionalFields 구조
      const fieldConfig =
        /* SAFETY: additionalFields의 각 값은 better-auth 필드 설정 객체이다. */ value as any;
      const isRequired = fieldConfig.required !== false;

      let fieldType: string;

      // sonamuType이 있으면 description을 타입명으로 사용
      if (fieldConfig.sonamuType) {
        fieldType = fieldConfig.sonamuType;
        importKeys.push(fieldType);
      } else {
        fieldType = mapBetterAuthFieldType(fieldConfig.type);
      }

      return `  ${key}${isRequired ? "" : "?"}: ${fieldType};`;
    });

    return {
      label: "Auth User Type",
      lines: ["export type SonamuUser = User & {", ...fieldLines, "};"],
      importKeys,
    };
  }

  /**
   * auth 설정이 있는지 확인합니다.
   */
  private hasAuthConfig(): boolean {
    return !!Sonamu.config.server?.auth;
  }
}
