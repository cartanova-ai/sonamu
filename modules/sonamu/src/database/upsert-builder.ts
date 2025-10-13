import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import { Knex } from "knex";
import { EntityManager } from "../entity/entity-manager";
import { nonNullable } from "../utils/utils";
import { RowWithId, batchUpdate } from "./_batch_update";

type TableData = {
  references: Set<string>;
  rows: any[];
  uniqueIndexes: { name?: string; columns: string[] }[];
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
        uniqueIndexes: tableSpec?.uniqueIndexes ?? [],
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
      [key in T]?:
        | UBRef
        | string
        | number
        | boolean
        | bigint
        | null
        | object
        | unknown;
    }
  ): UBRef {
    const table = this.getTable(tableName);

    // 해당 테이블의 unique 인덱스를 순회하며 키 생성
    const uniqueKeys = table.uniqueIndexes
      .map((unqIndex) => {
        const uniqueKeyArray = unqIndex.columns.map((unqCol) => {
          const val = row[unqCol as keyof typeof row];
          if (isRefField(val)) {
            return val.uuid;
          } else {
            return row[unqCol as keyof typeof row] ?? uuidv4(); // nullable인 경우 uuid로 랜덤값 삽입
          }
        });

        // 값이 모두 null인 경우 키 생성 패스
        if (uniqueKeyArray.length === 0) {
          return null;
        }
        return uniqueKeyArray.join("---delimiter--");
      })
      .filter(nonNullable);

    // uuid 생성 로직
    const uuid: string = (() => {
      // 키를 순회하여 이미 존재하는 키가 있는지 확인
      if (uniqueKeys.length > 0) {
        for (const uniqueKey of uniqueKeys) {
          if (table.uniquesMap.has(uniqueKey)) {
            return table.uniquesMap.get(uniqueKey)!; // 이미 has 체크를 했으므로 undefined 불가능
          }
        }
      }

      // 찾을 수 없는 경우 생성
      return uuidv4();
    })();

    // 모든 유니크키에 대해 유니크맵에 uuid 저장
    if (uniqueKeys.length > 0) {
      for (const uniqueKey of uniqueKeys) {
        table.uniquesMap.set(uniqueKey, uuid);
      }
    }

    // 이 테이블에 사용된 RefField를 순회하여, 현재 테이블 정보에 어떤 필드를 참조하는지 추가
    // 이 정보를 나중에 치환할 때 사용
    row = Object.keys(row).reduce((r, rowKey) => {
      const rowValue = row[rowKey as keyof typeof row];

      if (isRefField(rowValue)) {
        rowValue.use ??= "id";
        table.references.add(rowValue.of + "." + rowValue.use);
        r[rowKey] = rowValue;
      } else if (typeof rowValue === "object" && !(rowValue instanceof Date)) {
        // object인 경우 JSON으로 변환
        r[rowKey] = rowValue === null ? null : JSON.stringify(rowValue);
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

  async upsert(
    wdb: Knex,
    tableName: string,
    chunkSize?: number
  ): Promise<number[]> {
    return this.upsertOrInsert(wdb, tableName, "upsert", chunkSize);
  }
  async insertOnly(
    wdb: Knex,
    tableName: string,
    chunkSize?: number
  ): Promise<number[]> {
    return this.upsertOrInsert(wdb, tableName, "insert", chunkSize);
  }

  async upsertOrInsert(
    wdb: Knex,
    tableName: string,
    mode: "upsert" | "insert",
    chunkSize?: number
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

    // 내부 참조 있는 경우 필터하여 분리
    const groups = _.groupBy(table.rows, (row) =>
      Object.entries(row).some(([, value]) => isRefField(value))
        ? "selfRef"
        : "normal"
    );
    const normalRows = groups.normal ?? [];
    const selfRefRows = groups.selfRef ?? [];

    const chunks = chunkSize ? _.chunk(normalRows, chunkSize) : [normalRows];
    const uuidMap = new Map<string, any>();

    for (const chunk of chunks) {
      const q = wdb.insert(chunk).into(tableName);
      if (mode === "insert") {
        await q;
      } else if (mode === "upsert") {
        await q.onDuplicateUpdate.apply(q, Object.keys(normalRows[0]));
      }

      // upsert된 row들을 다시 조회하여 uuidMap에 저장
      const uuids = chunk.map((row) => row.uuid);
      const upsertedRows = await wdb(tableName)
        .select(_.uniq(["uuid", "id", ...extractFields]))
        .whereIn("uuid", uuids);
      upsertedRows.forEach((row: any) => {
        uuidMap.set(row.uuid, row);
      });
    }

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

    const allIds = Array.from(uuidMap.values()).map((row) => row.id);

    // 자기 참조가 있는 경우 재귀적으로 upsert
    if (selfRefRows.length > 0) {
      // 처리된 데이터를 제외하고 다시 upsert
      table.rows = selfRefRows;
      const selfRefIds = await this.upsert(wdb, tableName, chunkSize);
      allIds.push(...selfRefIds);
    }

    return allIds;
  }

  async updateBatch(
    wdb: Knex,
    tableName: string,
    options?: {
      chunkSize?: number;
      where?: string | string[];
    }
  ): Promise<void> {
    options = _.defaults(options, {
      chunkSize: 500,
      where: "id",
    });

    if (this.hasTable(tableName) === false) {
      return;
    }
    const table = this.tables.get(tableName)!;
    if (table.rows.length === 0) {
      return;
    }

    const whereColumns = Array.isArray(options.where)
      ? options.where
      : [options.where ?? "id"];
    const rows = table.rows.map((_row) => {
      const { uuid, ...row } = _row;
      return row as RowWithId<string>;
    });

    await batchUpdate(wdb, tableName, whereColumns, rows, options.chunkSize);
  }
}
