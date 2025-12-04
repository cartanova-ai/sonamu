import assert from "assert";
import type { Knex } from "knex";
import { group } from "radashi";
import {
  isKnexError,
  type MigrationColumn,
  type MigrationForeign,
  type MigrationIndex,
  type MigrationSet,
  type RelationOn,
} from "../types/types";

type MyColumn = {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
};
type MyIndex = {
  Table: string;
  Non_unique: number;
  Key_name: string;
  Seq_in_index: number;
  Column_name: string;
  Collation: string | null;
  Cardinality: number | null;
  Sub_part: number | null;
  Packed: string | null;
  Null: string;
  Index_type: string;
  Comment: string;
  Index_comment: string;
  Visible: string;
  Expression: string | null;
};
type MyForeign = {
  keyName: string;
  from: string;
  referencesTable: string;
  referencesField: string;
  onDelete: string;
  onUpdate: string;
};

class MySQLSchemaReaderClass {
  /**
   * DB에서 테이블 정보를 읽어서 MigrationSet을 만들어옵니다.
   * @param compareDB Knex 인스턴스
   * @param table 테이블 이름
   * @returns MigrationSet 객체
   */
  async getMigrationSetFromDB(compareDB: Knex, table: string): Promise<MigrationSet | null> {
    let dbColumns: MyColumn[], dbIndexes: MyIndex[], dbForeigns: MyForeign[];
    try {
      [dbColumns, dbIndexes, dbForeigns] = await this.readTable(compareDB, table);
    } catch (e: unknown) {
      if (isKnexError(e) && e.code === "ER_NO_SUCH_TABLE") {
        return null;
      }
      console.error(e);
      return null;
    }

    const columns: MigrationColumn[] = dbColumns.map((dbColumn) => {
      const dbColType = this.resolveDBColType(dbColumn.Type, dbColumn.Field);
      return {
        name: dbColumn.Field,
        nullable: dbColumn.Null !== "NO",
        ...dbColType,
        ...(() => {
          if (dbColumn.Default !== null) {
            return {
              defaultTo: dbColumn.Default,
            };
          }
          return {};
        })(),
      };
    });

    const dbIndexesGroup = group(
      dbIndexes.filter(
        (dbIndex) =>
          dbIndex.Key_name !== "PRIMARY" &&
          !dbForeigns.find((dbForeign) => dbForeign.keyName === dbIndex.Key_name),
      ),
      (dbIndex) => dbIndex.Key_name,
    );

    const parseIndexType = (index: MyIndex) => {
      if (index.Index_type === "FULLTEXT") {
        return "fulltext";
      }
      return index.Non_unique === 1 ? "index" : "unique";
    };

    // indexes 처리
    const indexes: MigrationIndex[] = Object.keys(dbIndexesGroup).map((keyName) => {
      const currentIndexes = dbIndexesGroup[keyName];
      assert(currentIndexes);
      return {
        type: parseIndexType(currentIndexes[0]),
        columns: currentIndexes.map((currentIndex) => currentIndex.Column_name),
      };
    });
    // console.log(table);
    // console.table(dbIndexes);
    // console.table(dbForeigns);

    // foreigns 처리
    const foreigns: MigrationForeign[] = dbForeigns.map((dbForeign) => {
      return {
        columns: [dbForeign.from],
        to: `${dbForeign.referencesTable}.${dbForeign.referencesField}`,
        onUpdate: dbForeign.onUpdate as RelationOn,
        onDelete: dbForeign.onDelete as RelationOn,
      };
    });

    return {
      table,
      columns,
      indexes,
      foreigns,
    };
  }

  /*
   * 기존 테이블 읽어서 cols, indexes 반환
   */
  async readTable(
    compareDB: Knex,
    tableName: string,
  ): Promise<[MyColumn[], MyIndex[], MyForeign[]]> {
    const [_cols] = (await compareDB.raw(`SHOW FIELDS FROM ${tableName}`)) as [MyColumn[]];
    const cols = _cols.map((col) => ({
      ...col,
      // Default 값은 숫자나 MySQL Expression이 아닌 경우 ""로 감싸줌
      ...(col.Default !== null && {
        Default:
          col.Default.replace(/[0-9]+/g, "").length > 0 && col.Extra !== "DEFAULT_GENERATED"
            ? `"${col.Default}"`
            : col.Default,
      }),
    }));

    const [indexes] = await compareDB.raw(`SHOW INDEX FROM ${tableName}`);
    const [[row]] = await compareDB.raw(`SHOW CREATE TABLE ${tableName}`);
    const ddl = row["Create Table"];
    const matched = ddl.match(/CONSTRAINT .+/g);
    const foreignKeys = (matched ?? []).map((line: string) => {
      // 해당 라인을 정규식으로 파싱
      const matched = line.match(
        /CONSTRAINT `(.+)` FOREIGN KEY \(`(.+)`\) REFERENCES `(.+)` \(`(.+)`\)( ON [A-Z ]+)*/,
      );
      if (!matched) {
        throw new Error(`인식할 수 없는 FOREIGN KEY CONSTRAINT ${line}`);
      }
      const [, keyName, from, referencesTable, referencesField, onClause] = matched;
      // console.debug({ tableName, line, onClause });

      const [onUpdateFull, _onUpdate] = (onClause ?? "").match(/ON UPDATE ([A-Z ]+)$/) ?? [];
      const onUpdate = _onUpdate ?? "NO ACTION";

      const onDelete =
        (onClause ?? "")
          .replace(onUpdateFull ?? "", "")
          .match(/ON DELETE ([A-Z ]+)/)?.[1]
          ?.trim() ?? "NO ACTION";

      return {
        keyName,
        from,
        referencesTable,
        referencesField,
        onDelete,
        onUpdate,
      };
    });
    return [cols, indexes, foreignKeys];
  }

  /**
   * DB의 컬럼 타입을 분석하여 MigrationColumn 객체로 변환합니다.
   * @param colType DB 컬럼 타입
   * @param colField DB 컬럼 이름
   * @returns MigrationColumn
   */
  resolveDBColType(
    colType: string,
    colField: string,
  ): Pick<MigrationColumn, "type" | "unsigned" | "length" | "precision" | "scale"> {
    let [rawType, unsigned] = colType.split(" ");
    const matched = rawType.match(/\(([0-9]+)\)/);
    let length: number | undefined;
    if (matched?.[1]) {
      rawType = rawType.replace(/\(([0-9]+)\)/, "");
      length = parseInt(matched[1]);
    }

    if (rawType === "char" && colField === "uuid") {
      return {
        type: "uuid",
      };
    }

    switch (rawType) {
      case "int":
        return {
          type: "integer",
          unsigned: unsigned === "unsigned",
        };
      case "varchar":
        // case "char":
        return {
          type: "string",
          ...(length !== undefined && {
            length,
          }),
        };
      case "text":
      case "mediumtext":
      case "longtext":
      case "timestamp":
      case "json":
      case "date":
      case "time":
        return {
          type: rawType,
        };
      case "datetime":
        return {
          type: "datetime",
        };
      case "tinyint":
        return {
          type: "boolean",
        };
      default:
        // decimal 처리
        if (rawType.startsWith("decimal")) {
          const [, precision, scale] = rawType.match(/decimal\(([0-9]+),([0-9]+)\)/) ?? [];
          return {
            type: "decimal",
            precision: parseInt(precision),
            scale: parseInt(scale),
            ...(unsigned === "unsigned" && {
              unsigned: true,
            }),
          };
        } else if (rawType.startsWith("float")) {
          const [, precision, scale] = rawType.match(/float\(([0-9]+),([0-9]+)\)/) ?? [];
          return {
            type: "float",
            precision: parseInt(precision),
            scale: parseInt(scale),
            ...(unsigned === "unsigned" && {
              unsigned: true,
            }),
          };
        }
        throw new Error(`resolve 불가능한 DB컬럼 타입 ${colType} ${rawType}`);
    }
  }
}
export const MySQLSchemaReader = new MySQLSchemaReaderClass();
