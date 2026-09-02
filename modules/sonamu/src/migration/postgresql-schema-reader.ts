import assert from "assert";

import { type Knex } from "knex";
import { group } from "radashi";

import {
  type MigrationColumn,
  type MigrationForeign,
  type MigrationIndex,
  type MigrationSet,
  type RelationOn,
} from "../types/types";

/**
 * 특정 테이블의 PK를 참조하는 다른 테이블의 FK 정보입니다.
 * PK 타입 변경 시 관련 FK 제약조건을 처리하기 위해 사용됩니다.
 */
export type ReferencingForeignKey = {
  /** FK가 정의된 테이블명 */
  tableName: string;
  /** FK 제약조건 이름 */
  constraintName: string;
  /** FK 컬럼명 */
  columnName: string;
  /** 참조하는 테이블명 (PK가 있는 테이블) */
  referencedTableName: string;
  /** 참조하는 컬럼명 (보통 'id') */
  referencedColumnName: string;
  /** ON UPDATE 액션 */
  onUpdate: RelationOn;
  /** ON DELETE 액션 */
  onDelete: RelationOn;
};

export type PgColumn = {
  column_name: string;
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  precision: number | null;
  numeric_scale: number | null;
  is_nullable: string;
  column_default: string | null;
  is_generated: string; // 's' = STORED, 'v' = VIRTUAL, '' = none
  generation_expression: string | null;
};

type PgIndex = {
  index_name: string;
  column_name: string;
  is_unique: boolean;
  is_primary: boolean;
  index_type: string;
  nulls_first: boolean;
  sort_order: "ASC" | "DESC";
  nulls_not_distinct: boolean;
  column_order: number;
  index_definition: string;
  predicate?: string | null;
};

type PgForeign = {
  constraint_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  update_rule: string;
  delete_rule: string;
};

type TableSchemaRows = {
  columns: PgColumn[];
  indexes: PgIndex[];
  foreigns: PgForeign[];
};

type RawCapableKnex = Pick<Knex, "raw">;

class PostgreSQLSchemaReaderClass {
  private readonly genericIndexTypes = new Set(["btree", "hash", "gin", "gist", "pgroonga"]);

  /**
   * DB에서 테이블 정보를 읽어서 MigrationSet을 만들어옵니다.
   * @param compareDB Knex 인스턴스
   * @param table 테이블 이름
   * @returns MigrationSet 객체
   */
  async getMigrationSetFromDB(
    compareDB: RawCapableKnex,
    table: string,
  ): Promise<MigrationSet | null> {
    let dbColumns: PgColumn[], dbIndexes: PgIndex[], dbForeigns: PgForeign[];
    try {
      [dbColumns, dbIndexes, dbForeigns] = await this.readTable(compareDB, table);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("Table not found")) {
        return null;
      }
      throw e;
    }

    // vector 컬럼의 dimensions 조회
    const vectorDimensions = await this.getVectorDimensions(compareDB, table);

    return this.buildMigrationSet(table, dbColumns, dbIndexes, dbForeigns, vectorDimensions);
  }

  /**
   * public 스키마의 모든 테이블을 한 번에 읽어서 테이블별 MigrationSet을 반환합니다.
   *
   * getMigrationSetFromDB를 테이블마다 호출하면 (컬럼/인덱스/FK/벡터차원) × 테이블 수 만큼
   * 왕복이 발생한다. 비교 대상이 수십 개면 원격 DB에서 왕복 비용이 지배적이 되므로,
   * 종류별로 한 번씩만 조회한다. 행 해석은 getMigrationSetFromDB와 동일한
   * buildMigrationSet을 공유한다.
   *
   * @returns 테이블명 → MigrationSet. DB에 없는 테이블은 항목이 없다.
   */
  async getMigrationSetFromDBAll(compareDB: RawCapableKnex): Promise<Map<string, MigrationSet>> {
    const [tables, vectorDimensions] = await Promise.all([
      this.readTables(compareDB),
      this.getVectorDimensionsAll(compareDB),
    ]);

    const migrationSets = new Map<string, MigrationSet>();
    for (const [table, rows] of tables) {
      migrationSets.set(
        table,
        this.buildMigrationSet(
          table,
          rows.columns,
          rows.indexes,
          rows.foreigns,
          vectorDimensions.get(table) ?? {},
        ),
      );
    }
    return migrationSets;
  }

  /**
   * 조회 결과 행들을 MigrationSet으로 변환합니다.
   * 테이블 단위 조회(getMigrationSetFromDB)와 전체 일괄 조회(getMigrationSetFromDBAll)가
   * 이 로직을 공유합니다.
   */
  private buildMigrationSet(
    table: string,
    dbColumns: PgColumn[],
    dbIndexes: PgIndex[],
    dbForeigns: PgForeign[],
    vectorDimensions: Record<string, number>,
  ): MigrationSet {
    const columns: MigrationColumn[] = dbColumns.map((dbColumn) => {
      const dbColType = this.resolveDBColType(dbColumn);

      // vector 타입인 경우 dimensions 설정
      if (dbColType.type === "vector") {
        dbColType.dimensions = vectorDimensions[dbColumn.column_name] ?? 0;
      }

      return {
        name: dbColumn.column_name,
        nullable: dbColumn.is_nullable === "YES",
        ...dbColType,
        // Generated Column 처리
        ...(() => {
          if (dbColumn.is_generated === "s" || dbColumn.is_generated === "v") {
            return {
              generated: {
                type: dbColumn.is_generated === "s" ? "STORED" : "VIRTUAL",
                expression: dbColumn.generation_expression ?? "",
              },
            };
          }
          return {};
        })(),
        // Default 값 처리 (Generated Column이 아닌 경우만)
        ...(() => {
          // Generated Column은 default 값이 없음
          if (dbColumn.is_generated === "s" || dbColumn.is_generated === "v") {
            return {};
          }

          if (dbColumn.column_default !== null) {
            // PostgreSQL default 값 정리 (nextval, CURRENT_TIMESTAMP 등)
            let defaultValue = dbColumn.column_default;

            // nextval 제거 (SERIAL 타입)
            if (defaultValue.startsWith("nextval(")) {
              return {};
            }

            // 타입 캐스팅 제거 (예: '1'::integer → 1)
            defaultValue = defaultValue.replace(/::[\w\s]+$/g, "");

            // 따옴표가 single quote인 경우 double quote로 변환
            if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
              defaultValue = defaultValue.replaceAll("'", '"');
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
    const indexes: MigrationIndex[] = [];
    for (const indexName of Object.keys(dbIndexesGroup)) {
      const currentIndexes = dbIndexesGroup[indexName]?.toSorted(
        (left, right) => left.column_order - right.column_order,
      );
      assert(currentIndexes);

      const firstIndex = currentIndexes[0];
      const parsedIndexDefinition = this.parseIndexDefinition(firstIndex.index_definition);
      const restoredIndexType = this.restoreMigrationIndexType(
        firstIndex,
        parsedIndexDefinition.accessMethod,
      );
      const using = this.restoreGenericUsing(
        parsedIndexDefinition.accessMethod ?? firstIndex.index_type,
      );

      const indexColumns: MigrationIndex["columns"] = [];
      for (const currentIndex of currentIndexes) {
        const opclass = this.extractIndexColumnOpclass(
          parsedIndexDefinition.columnDefinitions[currentIndex.column_order - 1],
        );
        const column: MigrationIndex["columns"][number] = {
          name: currentIndex.column_name,
        };
        if (opclass) {
          Object.assign(column, { opclass });
        }
        switch (using) {
          case "btree":
            Object.assign(column, {
              sortOrder: currentIndex.sort_order,
              nullsFirst: currentIndex.nulls_first,
            });
            break;
        }
        indexColumns.push(column);
      }
      const index: MigrationIndex = {
        type: restoredIndexType,
        name: indexName,
        columns: indexColumns,
        nullsNotDistinct: firstIndex.nulls_not_distinct,
        ...this.parseVectorIndexOptions(restoredIndexType, parsedIndexDefinition.withOptions),
      };
      if (firstIndex.predicate) {
        index.where = firstIndex.predicate;
      }
      if (using) {
        index.using = using;
      }
      indexes.push(index);
    }

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
    const actionMap = new Map<string, RelationOn>([
      ["NO ACTION", "NO ACTION"],
      ["RESTRICT", "RESTRICT"],
      ["CASCADE", "CASCADE"],
      ["SET NULL", "SET NULL"],
      ["SET DEFAULT", "SET DEFAULT"],
    ]);
    return actionMap.get(action) ?? "NO ACTION";
  }

  /**
   * 기존 테이블 읽어서 cols, indexes, foreigns 반환
   */
  async readTable(
    compareDB: RawCapableKnex,
    tableName: string,
  ): Promise<[PgColumn[], PgIndex[], PgForeign[]]> {
    const tables = await this.readTables(compareDB, tableName);
    const rows = tables.get(tableName);
    if (rows === undefined) {
      throw new Error(`Table not found: ${tableName}`);
    }
    return [rows.columns, rows.indexes, rows.foreigns];
  }

  /**
   * public 스키마 테이블들의 cols/indexes/foreigns를 테이블별로 묶어서 반환합니다.
   *
   * tableName을 주면 그 테이블만, 생략하면 전체를 조회합니다. 쿼리는 두 경로가 공유하므로
   * 단일 조회와 일괄 조회의 해석이 갈라지지 않습니다. 전체 조회 시에는 테이블마다 4번씩
   * 왕복하는 대신 종류별로 한 번씩만 돌기 때문에, 원격 DB에서 왕복 비용이 크게 줄어듭니다.
   */
  private async readTables(
    compareDB: RawCapableKnex,
    tableName?: string,
  ): Promise<Map<string, TableSchemaRows>> {
    const bindings = tableName === undefined ? [] : [tableName, tableName, tableName];
    const tableFilter = (column: string) => (tableName === undefined ? "" : `AND ${column} = ?`);

    // Columns 조회 (Generated Column 정보 포함)
    const columnsQuery = `
      SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.udt_name,
        COALESCE(
          c.character_maximum_length,
          CASE WHEN c.data_type = 'ARRAY' AND a.atttypmod > 0
            THEN a.atttypmod - 4
            ELSE NULL
          END
        ) AS character_maximum_length,
        COALESCE(c.datetime_precision, c.numeric_precision) AS precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        COALESCE(a.attgenerated, '') as is_generated,
        c.generation_expression
      FROM information_schema.columns c
      LEFT JOIN pg_attribute a ON a.attname = c.column_name
        AND a.attrelid = (
          SELECT oid FROM pg_class WHERE relname = c.table_name
          AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = c.table_schema)
        )
      WHERE c.table_schema = 'public'
        ${tableFilter("c.table_name")}
      ORDER BY c.table_name, c.ordinal_position
    `;

    // Indexes 조회 (PGroonga 표현식 인덱스 포함)
    const indexesQuery = `
      SELECT
          t.relname AS table_name,
          i.relname AS index_name,
          CASE
              WHEN am.amname = 'pgroonga' AND u.attnum = 0 THEN
                  regexp_replace(
                      regexp_replace(
                          TRIM(pgroonga_col.column_expr),
                          '::text',
                          '',
                          'g'
                      ),
                      '[()]',
                      '',
                      'g'
                  )
              ELSE a.attname
          END AS column_name,
          ix.indisunique AS is_unique,
          ix.indisprimary AS is_primary,
          am.amname AS index_type,
          COALESCE((u.opt & 2) = 2, FALSE) AS nulls_first,
          CASE 
              WHEN (u.opt & 1) = 1 THEN 'DESC'
              ELSE 'ASC'
          END AS sort_order,
          ix.indnullsnotdistinct AS nulls_not_distinct,
          u.ord AS column_order,
          pg_get_indexdef(ix.indexrelid) AS index_definition,
          pg_get_expr(ix.indpred, ix.indrelid) AS predicate
      FROM pg_class t
      JOIN pg_namespace ns ON ns.oid = t.relnamespace
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON i.relam = am.oid
      JOIN LATERAL unnest(ix.indkey, ix.indoption)
          WITH ORDINALITY AS u(attnum, opt, ord) ON true
      LEFT JOIN pg_attribute a ON a.attrelid = t.oid 
          AND a.attnum = u.attnum 
          AND u.attnum > 0
      LEFT JOIN LATERAL (
          -- PGroonga 표현식 인덱스는 모든 행의 attnum이 0이라 u.ord가 같다.
          -- 표현식 배열의 순번(expr_ord)을 함께 뽑아 정렬을 확정한다.
          SELECT expr.column_expr, expr.expr_ord
          FROM unnest(
                  CASE
                      WHEN pg_get_expr(ix.indexprs, ix.indrelid) ~ '^ARRAY\\[' THEN
                          string_to_array(
                              regexp_replace(
                                  pg_get_expr(ix.indexprs, ix.indrelid),
                                  '^ARRAY\\[(.*)\\]$',
                                  '\\1'
                              ),
                              ', '
                          )
                      ELSE
                          ARRAY[pg_get_expr(ix.indexprs, ix.indrelid)]
                  END
              ) WITH ORDINALITY AS expr(column_expr, expr_ord)
      ) pgroonga_col ON am.amname = 'pgroonga' AND u.attnum = 0
      WHERE t.relkind = 'r'
          AND ns.nspname = 'public'
          ${tableFilter("t.relname")}
          AND (u.attnum > 0 OR (am.amname = 'pgroonga' AND u.attnum = 0))
      ORDER BY t.relname, i.relname, u.ord, pgroonga_col.expr_ord;
`;

    // Foreign Keys 조회
    //
    // information_schema(table_constraints × key_column_usage × constraint_column_usage
    // × referential_constraints) 4중 조인 대신 pg_constraint를 직접 읽는다.
    // constraint_column_usage는 뷰 안으로 테이블 필터가 밀려들어가지 않아 DB 전체의
    // 제약조건을 훑는다. 제약이 조금만 많아져도 테이블 하나 조회에 1초 이상 걸리고,
    // 비교는 테이블마다 이 쿼리를 돌리므로 전체 소요가 급격히 커진다.
    // contype='f' 인덱스 스캔으로 바꾸면 NOT NULL 제약(PG 17+에서 pg_constraint에
    // 기록된다) 등을 아예 건너뛴다.
    //
    // conkey/confkey는 컬럼 순서를 담은 배열이므로 WITH ORDINALITY로 같은 순번끼리
    // 짝지어야 복합 FK에서 컬럼 대응이 어긋나지 않는다.
    const foreignsQuery = `
      SELECT
        cl.relname AS table_name,
        con.conname AS constraint_name,
        att.attname AS column_name,
        ref_cl.relname AS foreign_table_name,
        ref_att.attname AS foreign_column_name,
        CASE con.confupdtype
          WHEN 'a' THEN 'NO ACTION'
          WHEN 'r' THEN 'RESTRICT'
          WHEN 'c' THEN 'CASCADE'
          WHEN 'n' THEN 'SET NULL'
          WHEN 'd' THEN 'SET DEFAULT'
        END AS update_rule,
        CASE con.confdeltype
          WHEN 'a' THEN 'NO ACTION'
          WHEN 'r' THEN 'RESTRICT'
          WHEN 'c' THEN 'CASCADE'
          WHEN 'n' THEN 'SET NULL'
          WHEN 'd' THEN 'SET DEFAULT'
        END AS delete_rule
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_class ref_cl ON ref_cl.oid = con.confrelid
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS key_col(attnum, ord) ON true
      JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS ref_key_col(attnum, ord)
        ON ref_key_col.ord = key_col.ord
      JOIN pg_attribute att
        ON att.attrelid = cl.oid AND att.attnum = key_col.attnum
      JOIN pg_attribute ref_att
        ON ref_att.attrelid = ref_cl.oid AND ref_att.attnum = ref_key_col.attnum
      WHERE con.contype = 'f'
        AND ns.nspname = 'public'
        ${tableFilter("cl.relname")}
      ORDER BY cl.relname, con.conname, key_col.ord
    `;

    // 종류별로 한 번씩만 조회한 뒤 테이블명으로 묶습니다.
    const [columnRows, indexRows, foreignRows] = await Promise.all([
      compareDB
        .raw(columnsQuery, bindings.slice(0, 1))
        .then((result: { rows: (PgColumn & { table_name: string })[] }) => result.rows),
      compareDB
        .raw(indexesQuery, bindings.slice(1, 2))
        .then((result: { rows: (PgIndex & { table_name: string })[] }) => result.rows),
      compareDB
        .raw(foreignsQuery, bindings.slice(2, 3))
        .then((result: { rows: (PgForeign & { table_name: string })[] }) => result.rows),
    ]);

    const tables = new Map<string, TableSchemaRows>();
    const ensure = (table: string): TableSchemaRows => {
      const existing = tables.get(table);
      if (existing !== undefined) {
        return existing;
      }
      const created: TableSchemaRows = { columns: [], indexes: [], foreigns: [] };
      tables.set(table, created);
      return created;
    };

    // 컬럼이 없는 테이블은 존재하지 않는 것으로 취급하므로 컬럼 기준으로 항목을 만듭니다.
    for (const row of columnRows) {
      ensure(row.table_name).columns.push(row);
    }
    for (const row of indexRows) {
      tables.get(row.table_name)?.indexes.push(row);
    }
    for (const row of foreignRows) {
      tables.get(row.table_name)?.foreigns.push(row);
    }

    return tables;
  }

  private restoreMigrationIndexType(
    index: Pick<PgIndex, "is_unique" | "index_type">,
    accessMethod?: string,
  ): MigrationIndex["type"] {
    const resolvedAccessMethod = (accessMethod ?? index.index_type).toLowerCase();

    if (resolvedAccessMethod === "hnsw" || resolvedAccessMethod === "ivfflat") {
      return resolvedAccessMethod;
    }

    return index.is_unique ? "unique" : "index";
  }

  private restoreGenericUsing(
    accessMethod: string | undefined,
  ): MigrationIndex["using"] | undefined {
    if (!accessMethod) {
      return undefined;
    }

    const normalized = accessMethod.toLowerCase();
    if (!this.genericIndexTypes.has(normalized)) {
      return undefined;
    }

    return /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ normalized as MigrationIndex["using"];
  }

  private parseVectorIndexOptions(
    type: MigrationIndex["type"],
    withOptions: Record<string, string>,
  ): Pick<MigrationIndex, "m" | "efConstruction" | "lists"> {
    if (type === "hnsw") {
      const options: Pick<MigrationIndex, "m" | "efConstruction"> = {};
      const m = this.parseIntegerOption(withOptions.m);
      const efConstruction = this.parseIntegerOption(withOptions.ef_construction);
      if (m !== undefined) options.m = m;
      if (efConstruction !== undefined) options.efConstruction = efConstruction;
      return options;
    }

    if (type === "ivfflat") {
      return this.parseIntegerOption(withOptions.lists) !== undefined
        ? { lists: this.parseIntegerOption(withOptions.lists) }
        : {};
    }

    return {};
  }

  private parseIntegerOption(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private extractIndexColumnOpclass(columnDefinition: string | undefined): string | undefined {
    if (!columnDefinition) {
      return undefined;
    }

    const trimmed = columnDefinition
      .replace(/\s+NULLS\s+(FIRST|LAST)\s*$/i, "")
      .replace(/\s+(ASC|DESC)\s*$/i, "")
      .trim();
    const tokens = this.tokenizeTopLevel(trimmed);

    if (tokens.length < 2) {
      return undefined;
    }

    if (tokens[tokens.length - 2]?.toUpperCase() === "COLLATE") {
      return undefined;
    }

    return tokens.at(-1);
  }

  private parseIndexDefinition(indexDefinition: string) {
    const accessMethod = indexDefinition.match(/\bUSING\s+([a-z_][\w]*)/i)?.[1]?.toLowerCase();
    const usingMatchIndex = indexDefinition.search(/\bUSING\b/i);
    const columnsStart = usingMatchIndex >= 0 ? indexDefinition.indexOf("(", usingMatchIndex) : -1;
    const columnsEnd =
      columnsStart >= 0 ? this.findMatchingParenthesis(indexDefinition, columnsStart) : -1;
    const columnDefinitions =
      columnsStart >= 0 && columnsEnd > columnsStart
        ? this.splitTopLevel(indexDefinition.slice(columnsStart + 1, columnsEnd), ",")
        : [];

    const withMatch = /\bWITH\s*\(/i.exec(indexDefinition);
    const withStart = withMatch ? indexDefinition.indexOf("(", withMatch.index) : -1;
    const withEnd = withStart >= 0 ? this.findMatchingParenthesis(indexDefinition, withStart) : -1;
    const withOptions =
      withStart >= 0 && withEnd > withStart
        ? this.parseIndexOptionEntries(indexDefinition.slice(withStart + 1, withEnd))
        : {};

    return {
      accessMethod,
      columnDefinitions,
      withOptions,
    };
  }

  private parseIndexOptionEntries(optionSource: string): Record<string, string> {
    return this.splitTopLevel(optionSource, ",").reduce<Record<string, string>>((result, entry) => {
      const matched = entry.trim().match(/^([a-z_][\w]*)\s*=\s*(.+)$/i);
      if (!matched) {
        return result;
      }

      const [, key, rawValue] = matched;
      result[key.toLowerCase()] = rawValue.trim().replace(/^['"]|['"]$/g, "");
      return result;
    }, {});
  }

  private splitTopLevel(source: string, delimiter: string): string[] {
    const items: string[] = [];
    let start = 0;
    let parenDepth = 0;
    let bracketDepth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const nextChar = source[index + 1];

      if (char === "'" && !inDoubleQuote) {
        if (inSingleQuote && nextChar === "'") {
          index += 1;
          continue;
        }
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        if (inDoubleQuote && nextChar === '"') {
          index += 1;
          continue;
        }
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (inSingleQuote || inDoubleQuote) {
        continue;
      }

      if (char === "(") {
        parenDepth += 1;
        continue;
      }
      if (char === ")") {
        parenDepth -= 1;
        continue;
      }
      if (char === "[") {
        bracketDepth += 1;
        continue;
      }
      if (char === "]") {
        bracketDepth -= 1;
        continue;
      }

      if (char === delimiter && parenDepth === 0 && bracketDepth === 0) {
        items.push(source.slice(start, index).trim());
        start = index + 1;
      }
    }

    const tail = source.slice(start).trim();
    if (tail.length > 0) {
      items.push(tail);
    }

    return items;
  }

  private tokenizeTopLevel(source: string): string[] {
    const tokens: string[] = [];
    let start = -1;
    let parenDepth = 0;
    let bracketDepth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    const pushToken = (endIndex: number) => {
      if (start < 0) {
        return;
      }

      const token = source.slice(start, endIndex).trim();
      if (token.length > 0) {
        tokens.push(token);
      }
      start = -1;
    };

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const nextChar = source[index + 1];

      if (char === "'" && !inDoubleQuote) {
        if (start < 0) {
          start = index;
        }
        if (inSingleQuote && nextChar === "'") {
          index += 1;
          continue;
        }
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        if (start < 0) {
          start = index;
        }
        if (inDoubleQuote && nextChar === '"') {
          index += 1;
          continue;
        }
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (!inSingleQuote && !inDoubleQuote) {
        if (char === "(") {
          if (start < 0) {
            start = index;
          }
          parenDepth += 1;
          continue;
        }
        if (char === ")") {
          parenDepth -= 1;
          continue;
        }
        if (char === "[") {
          if (start < 0) {
            start = index;
          }
          bracketDepth += 1;
          continue;
        }
        if (char === "]") {
          bracketDepth -= 1;
          continue;
        }

        if (/\s/.test(char) && parenDepth === 0 && bracketDepth === 0) {
          pushToken(index);
          continue;
        }
      }

      if (start < 0) {
        start = index;
      }
    }

    pushToken(source.length);
    return tokens;
  }

  private findMatchingParenthesis(source: string, openIndex: number): number {
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let index = openIndex; index < source.length; index += 1) {
      const char = source[index];
      const nextChar = source[index + 1];

      if (char === "'" && !inDoubleQuote) {
        if (inSingleQuote && nextChar === "'") {
          index += 1;
          continue;
        }
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        if (inDoubleQuote && nextChar === '"') {
          index += 1;
          continue;
        }
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (inSingleQuote || inDoubleQuote) {
        continue;
      }

      if (char === "(") {
        depth += 1;
        continue;
      }

      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  /**
   * 특정 테이블의 PK를 참조하는 다른 테이블의 FK 목록을 조회합니다.
   * PK 타입 변경 시 관련 FK 제약조건을 삭제/복구하기 위해 사용됩니다.
   */
  async getReferencingForeignKeys(db: Knex, tableName: string): Promise<ReferencingForeignKey[]> {
    const query = `
      SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS referenced_table_name,
        ccu.column_name AS referenced_column_name,
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
        AND ccu.table_name = ?
        AND tc.table_schema = 'public'
    `;

    const result = await db.raw(query, [tableName]);
    return result.rows.map(
      (row: {
        table_name: string;
        constraint_name: string;
        column_name: string;
        referenced_table_name: string;
        referenced_column_name: string;
        update_rule: string;
        delete_rule: string;
      }) => ({
        tableName: row.table_name,
        constraintName: row.constraint_name,
        columnName: row.column_name,
        referencedTableName: row.referenced_table_name,
        referencedColumnName: row.referenced_column_name,
        onUpdate: this.mapConstraintAction(row.update_rule),
        onDelete: this.mapConstraintAction(row.delete_rule),
      }),
    );
  }

  /**
   * vector 컬럼의 dimensions를 조회합니다.
   * pg_attribute의 atttypmod에서 차원 수를 추출합니다.
   */
  private async getVectorDimensions(
    compareDB: RawCapableKnex,
    tableName: string,
  ): Promise<Record<string, number>> {
    return (await this.getVectorDimensionsAll(compareDB, tableName)).get(tableName) ?? {};
  }

  /**
   * vector 컬럼의 dimensions를 테이블별로 조회합니다.
   * tableName을 생략하면 public 스키마 전체를 한 번에 조회합니다.
   */
  private async getVectorDimensionsAll(
    compareDB: RawCapableKnex,
    tableName?: string,
  ): Promise<Map<string, Record<string, number>>> {
    const query = `
      SELECT
        c.relname as table_name,
        a.attname as column_name,
        a.atttypmod as dimensions
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_type t ON a.atttypid = t.oid
      WHERE t.typname = 'vector'
        AND a.attnum > 0
        AND n.nspname = 'public'
        ${tableName === undefined ? "" : "AND c.relname = ?"}
    `;
    const result = await compareDB.raw(query, tableName === undefined ? [] : [tableName]);

    const dimensionsByTable = new Map<string, Record<string, number>>();
    for (const row of result.rows) {
      const dimensions = dimensionsByTable.get(row.table_name) ?? {};
      // atttypmod에서 실제 dimensions 값 추출
      dimensions[row.column_name] = row.dimensions > 0 ? row.dimensions : 0;
      dimensionsByTable.set(row.table_name, dimensions);
    }
    return dimensionsByTable;
  }

  /**
   * PostgreSQL 컬럼 타입을 분석하여 MigrationColumn 객체로 변환합니다.
   */
  resolveDBColType(
    dbColumn: PgColumn,
  ): Pick<
    MigrationColumn,
    "type" | "length" | "precision" | "scale" | "numberType" | "dimensions"
  > {
    const { udt_name: _udt_name, character_maximum_length, precision, numeric_scale } = dbColumn;

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
        ...(precision !== null &&
          numeric_scale !== null && {
            precision: precision,
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
      return {
        type: `date${singleOrArray}`,
        ...(precision !== null && {
          precision: precision,
        }),
      }; // DateProp → timestamptz
    }

    // JSON
    if (udt_name === "json" || udt_name === "jsonb") {
      return { type: "json" };
    }

    // Vector (pgvector)
    if (udt_name === "vector") {
      // vector 타입의 차원 수는 column_default나 별도 쿼리로 확인해야 함
      // 현재는 기본값 0으로 설정 (실제 dimensions는 getMigrationSetFromDB에서 별도 쿼리로 확인)
      return { type: `vector${singleOrArray}`, dimensions: 0 };
    }

    // tsvector (PostgreSQL 전문 검색용 타입)
    if (udt_name === "tsvector") {
      return { type: "tsvector" };
    }

    throw new Error(`resolve 불가능한 PostgreSQL 컬럼 타입: ${udt_name}`);
  }
}

export const PostgreSQLSchemaReader = new PostgreSQLSchemaReaderClass();
