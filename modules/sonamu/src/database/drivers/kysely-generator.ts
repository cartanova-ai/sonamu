import _ from "lodash";
import prettier from "prettier";
import equal from "fast-deep-equal";
import {
  GenMigrationCode,
  MigrationColumn,
  MigrationForeign,
  MigrationIndex,
} from "../../types/types";
import { CodeGenerator } from "../code-generator";
import { inspect } from "util";
import { EntityManager } from "../../entity/entity-manager";

export class KyselyGenerator extends CodeGenerator {
  async generateCreateCode_ColumnAndIndexes(
    table: string,
    columns: MigrationColumn[],
    indexes: MigrationIndex[]
  ): Promise<GenMigrationCode> {
    // 컬럼, 인덱스 처리
    const lines: string[] = [
      "// @ts-ignore",
      'import { Kysely, sql } from "kysely";',
      'import { Database } from "sonamu";',
      "",
      "export async function up(db: Kysely<Database>): Promise<void> {",
      `await db.schema.createTable("${table}")`,
      ...this.genColumnDefinitions(columns),
      ".execute();",
      "",
      "// indexes",
      ...this.genIndexDefinitions(table, indexes),
      "}",
      "",
      "export async function down(db: Kysely<Database>): Promise<void> {",
      ` await db.schema.dropTable("${table}").execute();`,
      "}",
    ];

    return {
      table,
      type: "normal",
      title: `create__${table}`,
      formatted: await prettier.format(lines.join("\n"), {
        parser: "typescript",
      }),
    };
  }

  /*
  테이블 생성하는 케이스 - FK 생성
*/
  async generateCreateCode_Foreign(
    table: string,
    foreigns: MigrationForeign[]
  ): Promise<GenMigrationCode[]> {
    if (foreigns.length === 0) {
      return [];
    }

    const { up, down } = this.genForeignDefinitions(table, foreigns);
    if (up.length === 0 && down.length === 0) {
      console.log("fk 가 뭔가 다릅니다");
      return [];
    }

    const lines: string[] = [
      "// @ts-ignore",
      'import { Kysely, sql } from "kysely";',
      'import { Database } from "sonamu";',
      "",
      "export async function up(db: Kysely<Database>): Promise<void> {",
      ...up,
      "}",
      "",
      "export async function down(db: Kysely<Database>): Promise<void> {",
      ...down,
      "}",
    ];

    const foreignKeysString = foreigns
      .map((foreign) => foreign.columns.join("_"))
      .join("_");
    return [
      {
        table,
        type: "foreign",
        title: `foreign__${table}__${foreignKeysString}`,
        formatted: await prettier.format(lines.join("\n"), {
          parser: "typescript",
        }),
      },
    ];
  }

  async generateAlterCode_ColumnAndIndexes(
    table: string,
    entityColumns: MigrationColumn[],
    entityIndexes: MigrationIndex[],
    dbColumns: MigrationColumn[],
    dbIndexes: MigrationIndex[]
  ): Promise<GenMigrationCode[]> {
    /*
      세부 비교 후 다른점 찾아서 코드 생성

      1. 컬럼갯수 다름: MD에 있으나, DB에 없다면 추가
      2. 컬럼갯수 다름: MD에 없으나, DB에 있다면 삭제
      3. 그외 컬럼(컬럼 갯수가 동일하거나, 다른 경우 동일한 컬럼끼리) => alter
      4. 다른거 다 동일하고 index만 변경되는 경우

      ** 컬럼명을 변경하는 경우는 따로 핸들링하지 않음
      => drop/add 형태의 마이그레이션 코드가 생성되는데, 수동으로 rename 코드로 수정하여 처리
    */

    // 각 컬럼 이름 기준으로 add, drop, alter 여부 확인
    const alterColumnsTo = this.getAlterColumnsTo(entityColumns, dbColumns);
    console.debug("=== generateAlterCode_ColumnAndIndexes ===");
    console.debug(inspect(alterColumnsTo, false, null));

    // 추출된 컬럼들을 기준으로 각각 라인 생성
    const alterColumnLinesTo = this.getAlterColumnLinesTo(
      alterColumnsTo,
      entityColumns
    );

    // 인덱스의 add, drop 여부 확인
    const alterIndexesTo = this.getAlterIndexesTo(entityIndexes, dbIndexes);

    // 추출된 인덱스들을 기준으로 각각 라인 생성
    const alterIndexLinesTo = this.getAlterIndexLinesTo(
      table,
      alterIndexesTo,
      alterColumnsTo
    );

    const alterColumnsToExist =
      _.sumBy(Object.values(alterColumnsTo), (v) => v.length) > 0;
    const lines: string[] = [
      "// @ts-ignore",
      'import { Kysely, sql } from "kysely";',
      'import { Database } from "sonamu";',
      "",
      "export async function up(db: Kysely<Database>): Promise<void> {",
      ...(alterColumnsToExist
        ? [
            `await db.schema.alterTable("${table}")`,
            ...(alterColumnsTo.add.length > 0 ? alterColumnLinesTo.add.up : []),
            ...(alterColumnsTo.drop.length > 0
              ? alterColumnLinesTo.drop.up
              : []),
            ...(alterColumnsTo.alter.length > 0
              ? alterColumnLinesTo.alter.up
              : []),
            ".execute();",
          ]
        : []),
      ...(alterIndexesTo.add.length > 0 ? alterIndexLinesTo.add.up : []),
      ...(alterIndexesTo.drop.length > 0 ? alterIndexLinesTo.drop.up : []),
      "}",
      "",
      "export async function down(db: Kysely<Database>): Promise<void> {",
      ...(alterColumnsToExist
        ? [
            `await db.schema.alterTable("${table}")`,
            ...(alterColumnsTo.add.length > 0
              ? alterColumnLinesTo.add.down
              : []),
            ...(alterColumnsTo.drop.length > 0
              ? alterColumnLinesTo.drop.down
              : []),
            ...(alterColumnsTo.alter.length > 0
              ? alterColumnLinesTo.alter.down
              : []),
            ".execute();",
          ]
        : []),
      ...(alterIndexLinesTo.add.down.length > 0
        ? alterIndexLinesTo.add.down
        : []),
      ...(alterIndexLinesTo.drop.down.length > 0
        ? alterIndexLinesTo.drop.down
        : []),
      "}",
    ];

    const formatted = await prettier.format(lines.join("\n"), {
      parser: "typescript",
    });

    const title = [
      "alter",
      table,
      ...(["add", "drop", "alter"] as const)
        .map((action) => {
          const len = alterColumnsTo[action].length;
          if (len > 0) {
            return action + len;
          }
          return null;
        })
        .filter((part) => part !== null),
    ].join("_");

    return [
      {
        table,
        title,
        formatted,
        type: "normal",
      },
    ];
  }

  async generateAlterCode_Foreigns(
    table: string,
    entityForeigns: MigrationForeign[],
    dbForeigns: MigrationForeign[]
  ): Promise<GenMigrationCode[]> {
    console.debug("=== generateAlterCode_Foreigns ===");

    console.debug(inspect({ entityForeigns, dbForeigns }, false, null, true));

    const getKey = (mf: MigrationForeign): string => {
      return [mf.columns.join("-"), mf.to].join("///");
    };
    const fkTo = entityForeigns.reduce(
      (result, entityF) => {
        const matchingDbF = dbForeigns.find(
          (dbF) => getKey(entityF) === getKey(dbF)
        );
        if (!matchingDbF) {
          result.add.push(entityF);
          return result;
        }

        if (equal(entityF, matchingDbF) === false) {
          result.alterSrc.push(matchingDbF);
          result.alterDst.push(entityF);
          return result;
        }
        return result;
      },
      {
        add: [] as MigrationForeign[],
        alterSrc: [] as MigrationForeign[],
        alterDst: [] as MigrationForeign[],
      }
    );

    const linesTo = {
      add: this.genForeignDefinitions(table, fkTo.add),
      alterSrc: this.genForeignDefinitions(table, fkTo.alterSrc),
      alterDst: this.genForeignDefinitions(table, fkTo.alterDst),
    };

    const lines: string[] = [
      "// @ts-ignore",
      'import { Kysely, sql } from "kysely";',
      'import { Database } from "sonamu";',
      "",
      "export async function up(db: Kysely<Database>): Promise<void> {",
      ...linesTo.add.up,
      ...linesTo.alterSrc.down,
      ...linesTo.alterDst.up,
      "}",
      "",
      "export async function down(db: Kysely<Database>): Promise<void> {",
      ...linesTo.add.down,
      ...linesTo.alterDst.down,
      ...linesTo.alterSrc.up,
      "}",
    ];

    const formatted = await prettier.format(lines.join("\n"), {
      parser: "typescript",
    });

    const title = [
      "alter",
      table,
      "foreigns",
      // TODO 바뀌는 부분
    ].join("_");

    return [
      {
        table,
        title,
        formatted,
        type: "normal",
      },
    ];
  }

  generateModelTemplate(
    entityId: string,
    def: { orderBy: string; search: string }
  ) {
    const names = EntityManager.getNamesFromId(entityId);
    const entity = EntityManager.get(entityId);

    return `
import { ListResult, asArray, NotFoundException, BadRequestException, api } from 'sonamu';
import { BaseModelClass } from 'sonamu/kysely';
import {
  ${entityId}SubsetKey,
  ${entityId}SubsetMapping,
} from "../sonamu.generated";
import {
  ${names.camel}SubsetQueries,
} from "../sonamu.generated.sso";
import { ${entityId}ListParams, ${entityId}SaveParams } from "./${names.fs}.types";

/*
  ${entityId} Model
*/
class ${entityId}ModelClass extends BaseModelClass {
  modelName = "${entityId}";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "${entityId}" })
  async findById<T extends ${entityId}SubsetKey>(
    subset: T,
    id: number
  ): Promise<${entityId}SubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (rows.length == 0) {
      throw new NotFoundException(\`존재하지 않는 ${names.capital} ID \${id}\`);
    }

    return rows[0];
  }

  async findOne<T extends ${entityId}SubsetKey>(
    subset: T,
    listParams: ${entityId}ListParams
  ): Promise<${entityId}SubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "${names.capitalPlural}" })
  async findMany<T extends ${entityId}SubsetKey>(
    subset: T,
    params: ${entityId}ListParams = {}
  ): Promise<ListResult<${entityId}SubsetMapping[T]>> {
    // params with defaults
    params = {
      num: 24,
      page: 1,
      search: "${def.search}",
      orderBy: "${def.orderBy}",
      ...params,
    };

    // build queries
    let { rows, total } = await this.runSubsetQuery({
      subset,
      params,
      subsetQuery: ${names.camel}SubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb = qb.where("${entity.table}.id", "in", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb = qb.where("${entity.table}.id", "=", Number(params.keyword));
          }
          // } else if (params.search === "field") {
          //   qb = qb.where("${entity.table}.field", "like", \`%\${params.keyword}%\`);
          // }
          else {
            throw new BadRequestException(
              \`구현되지 않은 검색 필드 \${params.search}\`
            );
          }
        }

        // orderBy
        if (params.orderBy) {
          // default orderBy
          const [orderByField, orderByDirec] = params.orderBy.split("-");
          qb = qb.orderBy("${entity.table}." + orderByField, orderByDirec as any);
        }

        return qb;
      },
      debug: false,
    });

    return {
      rows,
      total,
    };
  }

  @api({ httpMethod: "POST" })
  async save(
    spa: ${entityId}SaveParams[]
  ): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    // register
    spa.map((sp) => {
      ub.register("${entity.table}", sp);
    });

    // transaction
    return wdb.transaction().execute(async (trx) => {
      const ids = await ub.upsert(trx, "${entity.table}");

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: [ "admin" ] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getDB("w");

    // transaction
    await wdb.transaction().execute(async (trx) => {
      return trx.deleteFrom("${entity.table}").where("${entity.table}.id", "in", ids).execute();
    });

    return ids.length;
  }
}

export const ${entityId}Model = new ${entityId}ModelClass();
      `.trim();
  }

  /*
  MigrationColumn[] 읽어서 컬럼 정의하는 구문 생성
*/
  private genColumnDefinitions(columns: MigrationColumn[]): string[] {
    return columns.map((column) => {
      let str = "";
      const chains: string[] = [];
      if (column.name === "id") {
        return `.addColumn("id", "integer", (col) => col.unsigned().autoIncrement().primaryKey())`;
      }

      if (column.type === "decimal") {
        str = `.addColumn("${column.name}", "${column.type}(${column.precision}, ${column.scale})"`;
      } else if (column.type.includes("text")) {
        str = `.addColumn("${column.name}", sql\`${column.type.toUpperCase()}\``;
      } else {
        // type, length
        let columnType: string = column.type;
        // FIXME: add double
        if (columnType === "float") {
          columnType = "float4";
        } else if (columnType === "uuid") {
          columnType = "char(36)";
        } else if (columnType === "string") {
          columnType = "varchar";
        }
        str = `.addColumn("${column.name}", "${columnType}${column.length ? `(${column.length})` : ""}"`;
      }
      if (column.unsigned) {
        chains.push("unsigned()");
      }

      // nullable
      if (!column.nullable) {
        chains.push("notNull()");
      }

      // defaultTo
      if (column.defaultTo !== undefined) {
        if (
          typeof column.defaultTo === "string" &&
          column.defaultTo.startsWith(`"`)
        ) {
          chains.push(`defaultTo("${column.defaultTo}")`);
        } else {
          chains.push(`defaultTo(sql\`${column.defaultTo}\`)`);
        }
      }

      return (
        (chains.length > 0 ? `${str}, (col) => col.${chains.join(".")}` : str) +
        ")"
      );
    });
  }

  /*
  MigrationIndex[] 읽어서 인덱스/유니크 정의하는 구문 생성
*/
  private genIndexDefinitions(
    table: string,
    indexes: MigrationIndex[]
  ): string[] {
    if (indexes.length === 0) {
      return [];
    }

    const lines = _.uniq(
      indexes.reduce((r, index) => {
        r.push(
          `await db.schema.createIndex("${this.createIndexName(table, index.columns, index.type)}")
          .on("${table}")
          .columns([${index.columns.map((col) => `"${col}"`).join(",")}])${index.type === "unique" ? ".unique()" : ""}
          .execute();`
        );
        return r;
      }, [] as string[])
    );
    return lines;
  }

  /*
  MigrationForeign[] 읽어서 외부키 constraint 정의하는 구문 생성
  */
  private genForeignDefinitions(
    table: string,
    foreigns: MigrationForeign[]
  ): { up: string[]; down: string[] } {
    console.debug("=== genForeignDefinitions ===");
    console.debug(inspect(foreigns, false, null));
    return foreigns.reduce(
      (r, foreign) => {
        const [toTable, toColumn] = foreign.to.split(".");
        const name = `${table}_${foreign.columns.join("_")}_foreign`;
        const columnsStringQuote = foreign.columns
          .map((col) => `'${col.replace(`${table}.`, "")}'`)
          .join(",");

        r.up.push(
          "// create fk",
          `await db.schema.alterTable("${table}")`,
          `.addForeignKeyConstraint("${name}", [${columnsStringQuote}], "${toTable}", ["${toColumn}"])`,
          `.onUpdate("${foreign.onUpdate.toLowerCase()}")`,
          `.onDelete("${foreign.onDelete.toLowerCase()}")`,
          `.execute();`
        );
        r.down.push(
          "// drop fk",
          `await db.schema.alterTable("${table}")`,
          `.dropConstraint("${name}")`,
          `.execute();`
        );

        return r;
      },
      {
        up: [] as string[],
        down: [] as string[],
      }
    );
  }

  private getAlterColumnLinesTo(
    columnsTo: ReturnType<KyselyGenerator["getAlterColumnsTo"]>,
    entityColumns: MigrationColumn[]
  ) {
    let linesTo = {
      add: {
        up: [] as string[],
        down: [] as string[],
      },
      drop: {
        up: [] as string[],
        down: [] as string[],
      },
      alter: {
        up: [] as string[],
        down: [] as string[],
      },
    };

    linesTo.add = {
      up: ["// add", ...this.genColumnDefinitions(columnsTo.add)],
      down: [
        "// rollback - add",
        ...columnsTo.add.map((col) => `.dropColumn("${col.name}")`),
      ],
    };
    linesTo.drop = {
      up: [
        "// drop",
        ...columnsTo.drop.map((col) => `.dropColumn("${col.name}")`),
      ],
      down: [
        "// rollback - drop",
        ...this.genColumnDefinitions(columnsTo.drop),
      ],
    };
    linesTo.alter = columnsTo.alter.reduce(
      (r, dbColumn) => {
        const entityColumn = entityColumns.find(
          (col) => col.name == dbColumn.name
        );
        if (entityColumn === undefined) {
          return r;
        }

        // 컬럼 변경사항
        const columnDiffUp = _.difference(
          this.genColumnDefinitions([entityColumn]),
          this.genColumnDefinitions([dbColumn])
        );
        const columnDiffDown = _.difference(
          this.genColumnDefinitions([dbColumn]),
          this.genColumnDefinitions([entityColumn])
        );
        if (columnDiffUp.length > 0) {
          r.up = [
            ...r.up,
            "// alter column",
            ...columnDiffUp.map((l) =>
              l.replace(".addColumn", ".modifyColumn")
            ),
          ];
          r.down = [
            ...r.down,
            "// rollback - alter column",
            ...columnDiffDown.map((l) =>
              l.replace(".addColumn", ".modifyColumn")
            ),
          ];
        }

        return r;
      },
      {
        up: [] as string[],
        down: [] as string[],
      }
    );

    return linesTo;
  }

  private getAlterIndexLinesTo(
    table: string,
    indexesTo: ReturnType<KyselyGenerator["getAlterIndexesTo"]>,
    columnsTo: ReturnType<KyselyGenerator["getAlterColumnsTo"]>
  ) {
    let linesTo = {
      add: {
        up: [] as string[],
        down: [] as string[],
      },
      drop: {
        up: [] as string[],
        down: [] as string[],
      },
    };

    // 인덱스가 추가되는 경우, 컬럼과 같이 추가된 케이스에는 drop에서 제외해야함!
    linesTo.add = {
      up: ["// add indexes", ...this.genIndexDefinitions(table, indexesTo.add)],
      down: [
        "// rollback - add indexes",
        ...indexesTo.add
          .filter(
            (index) =>
              index.columns.every((colName) =>
                columnsTo.add.map((col) => col.name).includes(colName)
              ) === false
          )
          .map(
            (index) => `await db.schema.alterTable("${table}")
            .dropIndex("${this.createIndexName(table, index.columns, index.type)}")
            .execute();`
          ),
      ],
    };
    // 인덱스가 삭제되는 경우, 컬럼과 같이 삭제된 케이스에는 drop에서 제외해야함!
    linesTo.drop = {
      up: [
        ...indexesTo.drop
          .filter(
            (index) =>
              index.columns.every((colName) =>
                columnsTo.drop.map((col) => col.name).includes(colName)
              ) === false
          )
          .map(
            (index) => `await db.schema.alterTable("${table}")
            .dropIndex("${this.createIndexName(table, index.columns, index.type)}")
            .execute();`
          ),
      ],
      down: [
        "// rollback - drop indexes",
        ...this.genIndexDefinitions(table, indexesTo.drop),
      ],
    };

    return linesTo;
  }

  private createIndexName(
    table: string,
    columns: string[],
    type: string
  ): string {
    if (columns[0].split(".").length > 1) {
      table = columns[0].split(".")[0];
      columns = columns.map((col) => col.split(".")[1]);
    }

    return `${table}_${columns.join("_")}_${type}`;
  }
}
