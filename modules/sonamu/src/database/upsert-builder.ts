import { v4 as uuidv4 } from "uuid";
import _, { chunk, defaults, groupBy } from "lodash";
import { Knex } from "knex";
import { EntityManager } from "../entity/entity-manager";

type TableData = {
  references: Set<string>;
  rows: any[];
  uniqueColumns: string[];
  uniquesMap: Map<string, string>;
};
export type UBRef = {
  uuid: string;
  of: string;
  use?: string;
};
export function isRefField(field: any): field is UBRef {
  return (
    field !== undefined &&
    field !== null &&
    field.of !== undefined &&
    field.uuid !== undefined
  );
}

export class UpsertBuilder {
  tables: Map<string, TableData>;
  constructor() {
    this.tables = new Map();
  }

  getTable(tableName: string): TableData {
    const table = this.tables.get(tableName);
    if (table === undefined) {
      const tableSpec = (() => {
        try {
          return EntityManager.getTableSpec(tableName);
        } catch {
          return null;
        }
      })();

      this.tables.set(tableName, {
        references: new Set(),
        rows: [],
        uniqueColumns: tableSpec?.uniqueColumns ?? [],
        uniquesMap: new Map<string, string>(),
      });
    }

    return this.tables.get(tableName)!;
  }

  hasTable(tableName: string): boolean {
    return this.tables.has(tableName);
  }

  register<T extends string>(
    tableName: string,
    row: {
      [key in T]?: UBRef | string | number | boolean | bigint | null | object;
    }
  ): UBRef {
    const table = this.getTable(tableName);

    // uuid 생성 로직
    let uuid: string | undefined;

    // 해당 테이블의 unique 컬럼들의 값을 통해 키 생성
    const uniqueKey = table.uniqueColumns
      .map((unqCol) => {
        const val = row[unqCol as keyof typeof row];
        if (isRefField(val)) {
          return val.uuid;
        } else {
          return row[unqCol as keyof typeof row] ?? uuidv4(); // nullable 컬럼은 uuid로 대체
        }
      })
      .join("---delimiter--");
    if (table.uniqueColumns.length > 0) {
      // 기존 키가 있는 경우 uuid 그대로 사용
      uuid = table.uniquesMap.get(uniqueKey);
    }

    // 없는 경우 uuid 생성하고, 생성한 uuid를 uniquesMap에 보관
    if (!uuid) {
      uuid = uuidv4();
      table.uniquesMap.set(uniqueKey, uuid);
    }

    // 이 테이블에 사용된 RefField를 순회하여, 현재 테이블 정보에 어떤 필드를 참조하는지 추가
    // 이 정보를 나중에 치환할 때 사용
    row = Object.keys(row).reduce((r, rowKey) => {
      const rowValue = row[rowKey as keyof typeof row];

      if (isRefField(rowValue)) {
        rowValue.use ??= "id";
        table.references.add(rowValue.of + "." + rowValue.use);
        r[rowKey] = rowValue;
      } else if (typeof rowValue === "object" && rowValue !== null) {
        // object인 경우 JSON으로 변환
        r[rowKey] = JSON.stringify(rowValue);
      } else {
        r[rowKey] = rowValue;
      }
      return r;
    }, {} as any);

    table.rows.push({
      uuid,
      ...row,
    });

    return {
      of: tableName,
      uuid: (row as { uuid?: string }).uuid ?? uuid,
    };
  }

  async upsert(wdb: Knex, tableName: string): Promise<number[]> {
    return this.upsertOrInsert(wdb, tableName, "upsert");
  }
  async insertOnly(wdb: Knex, tableName: string): Promise<number[]> {
    return this.upsertOrInsert(wdb, tableName, "insert");
  }

  async upsertOrInsert(
    wdb: Knex,
    tableName: string,
    mode: "upsert" | "insert"
  ): Promise<number[]> {
    if (this.hasTable(tableName) === false) {
      return [];
    }

    const table = this.tables.get(tableName);
    if (table === undefined) {
      throw new Error(`존재하지 않는 테이블 ${tableName}에 upsert 요청`);
    } else if (table.rows.length === 0) {
      throw new Error(`${tableName}에 upsert 할 데이터가 없습니다.`);
    }

    if (
      table.rows.some((row) =>
        Object.entries(row).some(
          ([, value]) => isRefField(value) && value.of !== tableName
        )
      )
    ) {
      throw new Error(`${tableName} 해결되지 않은 참조가 있습니다.`);
    }

    // 내부 참조 있는 경우 필터하여 분리
    const groups = groupBy(table.rows, (row) =>
      Object.entries(row).some(([, value]) => isRefField(value))
        ? "selfRef"
        : "normal"
    );
    const targetRows = groups.normal;

    // Insert On Duplicate Update
    const q = wdb.insert(targetRows).into(tableName);
    if (mode === "insert") {
      await q;
    } else if (mode === "upsert") {
      await q.onDuplicateUpdate.apply(q, Object.keys(targetRows[0]));
    }

    // 전체 테이블 순회하여 현재 테이블 참조하는 모든 테이블 추출
    const { references, refTables } = Array.from(this.tables).reduce(
      (r, [, table]) => {
        const reference = Array.from(table.references.values()).find((ref) =>
          ref.includes(tableName + ".")
        );
        if (reference) {
          r.references.push(reference);
          r.refTables.push(table);
        }

        return r;
      },
      {
        references: [] as string[],
        refTables: [] as TableData[],
      }
    );

    const extractFields = _.uniq(references).map(
      (reference) => reference.split(".")[1]
    );

    // UUID 기준으로 id 추출
    const uuids = table.rows.map((row) => row.uuid);
    const upsertedRows = await wdb(tableName)
      .select(_.uniq(["uuid", "id", ...extractFields]))
      .whereIn("uuid", uuids);
    const uuidMap = new Map<string, any>(
      upsertedRows.map((row: any) => [row.uuid, row])
    );

    // 해당 테이블 참조를 실제 밸류로 변경
    refTables.map((table) => {
      table.rows = table.rows.map((row) => {
        Object.keys(row).map((key) => {
          const prop = row[key];
          if (isRefField(prop) && prop.of === tableName) {
            const parent = uuidMap.get(prop.uuid);
            if (parent === undefined) {
              console.error(prop);
              throw new Error(
                `존재하지 않는 uuid ${prop.uuid} -- in ${tableName}`
              );
            }
            row[key] = parent[prop.use ?? "id"];
          }
        });
        return row;
      });
    });

    const ids = Array.from(uuidMap.values()).map((val) => val.id);

    if (groups.selfRef) {
      const selfRefIds = await this.upsert(wdb, tableName);
      return [...ids, ...selfRefIds];
    }

    return ids;
  }

  async updateBatch(
    wdb: Knex,
    tableName: string,
    options?: {
      chunkSize?: number;
      where?: string;
    }
  ): Promise<void> {
    options = defaults(options, {
      chunkSize: 500,
    });

    if (this.hasTable(tableName) === false) {
      return;
    }
    const table = this.tables.get(tableName)!;
    if (table.rows.length === 0) {
      return;
    }

    const chunks = chunk(table.rows, options.chunkSize);
    for await (const chunk of chunks) {
      await Promise.all(
        chunk.map(async ({ id, ...row }) => {
          const { uuid, ...update } = row;
          return await wdb(tableName).where("id", id).update(update);
        })
      );
    }
  }
}
