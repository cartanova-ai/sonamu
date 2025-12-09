import assert from "assert";
import type { Knex } from "knex";
import { group } from "radashi";
import type {
  MigrationColumn,
  MigrationForeign,
  MigrationIndex,
  MigrationSet,
  RelationOn,
} from "../types/types";

export type PgColumn = {
  column_name: string;
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: string;
  column_default: string | null;
};

type PgIndex = {
  index_name: string;
  column_name: string;
  is_unique: boolean;
  is_primary: boolean;
  index_type: string;
};

type PgForeign = {
  constraint_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  update_rule: string;
  delete_rule: string;
};

class PostgreSQLSchemaReaderClass {
  /**
   * DB에서 테이블 정보를 읽어서 MigrationSet을 만들어옵니다.
   * @param compareDB Knex 인스턴스
   * @param table 테이블 이름
   * @returns MigrationSet 객체
   */
  async getMigrationSetFromDB(compareDB: Knex, table: string): Promise<MigrationSet | null> {
    let dbColumns: PgColumn[], dbIndexes: PgIndex[], dbForeigns: PgForeign[];
    try {
      [dbColumns, dbIndexes, dbForeigns] = await this.readTable(compareDB, table);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("Table not found")) {
        return null;
      }
      console.error(e);
      return null;
    }

    const columns: MigrationColumn[] = dbColumns.map((dbColumn) => {
      const dbColType = this.resolveDBColType(dbColumn);
      return {
        name: dbColumn.column_name,
        nullable: dbColumn.is_nullable === "YES",
        ...dbColType,
        ...(() => {
          if (dbColumn.column_default !== null) {
            // PostgreSQL default 값 정리 (nextval, CURRENT_TIMESTAMP 등)
            let defaultValue = dbColumn.column_default;

            // nextval 제거 (SERIAL 타입)
            if (defaultValue.startsWith("nextval(")) {
              return {};
            }

            // 타입 캐스팅 제거 (예: '1'::integer → 1)
            defaultValue = defaultValue.replace(/::[\w\s]+$/g, "");

            // 따옴표 제거가 필요한 경우
            if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
              defaultValue = defaultValue.slice(1, -1);
            }

            return {
              defaultTo: defaultValue,
            };
          }
          return {};
        })(),
      };
    });

    // PRIMARY KEY와 foreign key용 인덱스 제외
    const dbIndexesGroup = group(
      dbIndexes.filter(
        (dbIndex) =>
          !dbIndex.is_primary &&
          !dbForeigns.find((dbForeign) => dbIndex.index_name.includes(dbForeign.constraint_name)),
      ),
      (dbIndex) => dbIndex.index_name,
    );

    // indexes 처리
    const indexes: MigrationIndex[] = Object.keys(dbIndexesGroup).map((indexName) => {
      const currentIndexes = dbIndexesGroup[indexName];
      assert(currentIndexes);

      const firstIndex = currentIndexes[0];
      const type = firstIndex.is_unique ? "unique" : "index";

      return {
        type,
        name: indexName,
        columns: currentIndexes.map((idx) => idx.column_name),
      };
    });

    // foreigns 처리
    const foreigns: MigrationForeign[] = dbForeigns.map((dbForeign) => {
      return {
        columns: [dbForeign.column_name],
        to: `${dbForeign.foreign_table_name}.${dbForeign.foreign_column_name}`,
        onUpdate: this.mapConstraintAction(dbForeign.update_rule),
        onDelete: this.mapConstraintAction(dbForeign.delete_rule),
      };
    });

    return {
      table,
      columns,
      indexes,
      foreigns,
    };
  }

  /**
   * PostgreSQL의 constraint action을 Knex 형식으로 변환
   */
  private mapConstraintAction(action: string): RelationOn {
    const actionMap: Record<string, RelationOn> = {
      "NO ACTION": "NO ACTION",
      RESTRICT: "RESTRICT",
      CASCADE: "CASCADE",
      "SET NULL": "SET NULL",
      "SET DEFAULT": "SET DEFAULT",
    };
    return actionMap[action] ?? "NO ACTION";
  }

  /**
   * 기존 테이블 읽어서 cols, indexes, foreigns 반환
   */
  async readTable(
    compareDB: Knex,
    tableName: string,
  ): Promise<[PgColumn[], PgIndex[], PgForeign[]]> {
    // Columns 조회
    const columns = await compareDB
      .select(
        "column_name",
        "data_type",
        "udt_name",
        "character_maximum_length",
        "numeric_precision",
        "numeric_scale",
        "is_nullable",
        "column_default",
      )
      .from("information_schema.columns")
      .where({ table_name: tableName })
      .orderBy("ordinal_position");
    if (columns.length === 0) {
      throw new Error(`Table not found: ${tableName}`);
    }

    // Indexes 조회
    const indexesQuery = `
      SELECT
        i.relname as index_name,
        a.attname as column_name,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        am.amname as index_type
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid
      JOIN pg_am am ON i.relam = am.oid
      WHERE t.relname = ?
        AND a.attnum = ANY(ix.indkey)
      ORDER BY i.relname, array_position(ix.indkey, a.attnum)
    `;
    const indexes = (await compareDB.raw(indexesQuery, [tableName])).rows;

    // Foreign Keys 조회
    const foreignsQuery = `
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ?
    `;
    const foreigns = (await compareDB.raw(foreignsQuery, [tableName])).rows;

    return [columns, indexes, foreigns];
  }

  /**
   * PostgreSQL 컬럼 타입을 분석하여 MigrationColumn 객체로 변환합니다.
   */
  resolveDBColType(
    dbColumn: PgColumn,
  ): Pick<MigrationColumn, "type" | "length" | "precision" | "scale" | "numberType"> {
    const {
      udt_name: _udt_name,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
    } = dbColumn;

    const { udt_name, singleOrArray } = (() => {
      if (_udt_name.startsWith("_")) {
        return {
          udt_name: _udt_name.substring(1),
          singleOrArray: "[]" as const,
        };
      }
      return {
        udt_name: _udt_name,
        singleOrArray: "" as const,
      };
    })();

    // UUID
    if (udt_name === "uuid") {
      return { type: `uuid${singleOrArray}` };
    }

    // Integer types
    if (udt_name === "int4") {
      return { type: `integer${singleOrArray}` };
    }
    if (udt_name === "int8") {
      return { type: `bigInteger${singleOrArray}` };
    }

    // String types
    if (udt_name === "varchar") {
      return {
        type: `string${singleOrArray}`,
        ...(character_maximum_length && {
          length: character_maximum_length,
        }),
      };
    }
    if (udt_name === "text") {
      return { type: `string${singleOrArray}` }; // StringProp without length
    }

    // NumberOrNumeric types
    if (udt_name === "numeric") {
      return {
        type: `numberOrNumeric${singleOrArray}`,
        numberType: "numeric",
        ...(numeric_precision !== null &&
          numeric_scale !== null && {
            precision: numeric_precision,
            scale: numeric_scale,
          }),
      };
    }
    if (udt_name === "float4") {
      return { type: `numberOrNumeric${singleOrArray}`, numberType: "real" };
    }
    if (udt_name === "float8") {
      return { type: `numberOrNumeric${singleOrArray}`, numberType: "double precision" };
    }

    // Boolean
    if (udt_name === "bool") {
      return { type: `boolean${singleOrArray}` };
    }

    // Timestampz types
    if (udt_name === "timestamptz") {
      return { type: `date${singleOrArray}` }; // DateProp → timestamptz
    }

    // JSON
    if (udt_name === "json" || udt_name === "jsonb") {
      return { type: "json" };
    }

    throw new Error(`resolve 불가능한 PostgreSQL 컬럼 타입: ${udt_name}`);
  }
}

export const PostgreSQLSchemaReader = new PostgreSQLSchemaReaderClass();
