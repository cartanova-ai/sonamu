import { randomUUID } from "crypto";
import type { Knex } from "knex";
import { unique } from "radashi";
import { EntityManager } from "../entity/entity-manager";
import { Naite } from "../naite/naite";
import { assertDefined, chunk, nonNullable } from "../utils/utils";
import { batchUpdate, type RowWithId } from "./_batch_update";

type TableData = {
  references: Set<string>;
  rows: Record<string, unknown>[];
  uniqueIndexes: { name?: string; columns: string[] }[];
  uniquesMap: Map<string, string>;
};
export type UBRef = {
  uuid: string;
  of: string;
  use?: string;
};
export function isRefField(field: unknown): field is UBRef {
  return (
    field !== undefined &&
    field !== null &&
    (field as UBRef)?.of !== undefined &&
    (field as UBRef)?.uuid !== undefined
  );
}

export class UpsertBuilder {
  tables: Map<string, TableData>;
  constructor() {
    this.tables = new Map();
  }

  getTable(tableName: string): TableData {
    const table = this.tables.get(tableName);
    if (table) {
      return table;
    }

    const tableSpec = (() => {
      try {
        return EntityManager.getTableSpec(tableName);
      } catch {
        return null;
      }
    })();

    const tableData = {
      references: new Set<string>(),
      rows: [],
      uniqueIndexes: tableSpec?.uniqueIndexes ?? [],
      uniquesMap: new Map<string, string>(),
    };
    this.tables.set(tableName, tableData);
    return tableData;
  }

  hasTable(tableName: string): boolean {
    return this.tables.has(tableName);
  }

  register<T extends string>(
    tableName: string,
    row: {
      [key in T]?: UBRef | string | number | boolean | bigint | null | object | unknown;
    },
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
            return row[unqCol as keyof typeof row] ?? randomUUID(); // nullable인 경우 uuid로 랜덤값 삽입
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
    const { uuid, isReused } = (() => {
      // 키를 순회하여 이미 존재하는 키가 있는지 확인
      if (uniqueKeys.length > 0) {
        for (const uniqueKey of uniqueKeys) {
          if (table.uniquesMap.has(uniqueKey)) {
            return {
              uuid: assertDefined(table.uniquesMap.get(uniqueKey), "Unique key not found"),
              isReused: true,
            };
          }
        }
      }

      // 찾을 수 없는 경우 생성
      return { uuid: randomUUID(), isReused: false };
    })();

    // 모든 유니크키에 대해 유니크맵에 uuid 저장
    if (uniqueKeys.length > 0) {
      for (const uniqueKey of uniqueKeys) {
        table.uniquesMap.set(uniqueKey, uuid);
      }
    }

    // 이 테이블에 사용된 RefField를 순회하여, 현재 테이블 정보에 어떤 필드를 참조하는지 추가
    // 이 정보를 나중에 치환할 때 사용
    row = Object.fromEntries(
      Object.entries(row).map(([rowKey, rowValue]) => {
        if (isRefField(rowValue)) {
          rowValue.use ??= "id";
          table.references.add(`${rowValue.of}.${rowValue.use}`);
          return [rowKey, rowValue];
        } else if (typeof rowValue === "object" && !(rowValue instanceof Date)) {
          // object인 경우 JSON으로 변환
          return [rowKey, rowValue === null ? null : JSON.stringify(rowValue)];
        } else {
          return [rowKey, rowValue];
        }
      }),
    ) as { [key in T]?: unknown };

    table.rows.push({
      uuid,
      ...row,
    });

    const result: UBRef = {
      of: tableName,
      uuid: (row as { uuid?: string }).uuid ?? uuid,
    };

    Naite.t("puri:ub-register", {
      tableName,
      uuid: result.uuid,
      isUuidReused: isReused,
      row,
    });

    return result;
  }

  async upsert(wdb: Knex, tableName: string, chunkSize?: number): Promise<number[]> {
    return this.upsertOrInsert(wdb, tableName, "upsert", chunkSize);
  }
  async insertOnly(wdb: Knex, tableName: string, chunkSize?: number): Promise<number[]> {
    return this.upsertOrInsert(wdb, tableName, "insert", chunkSize);
  }

  async upsertOrInsert(
    wdb: Knex,
    tableName: string,
    mode: "upsert" | "insert",
    chunkSize?: number,
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
        Object.entries(row).some(([, value]) => isRefField(value) && value.of !== tableName),
      )
    ) {
      throw new Error(`${tableName} 해결되지 않은 참조가 있습니다.`);
    }

    // 전체 테이블 순회하여 현재 테이블 참조하는 모든 테이블 추출
    const { references, refTables } = Array.from(this.tables).reduce(
      (r, [, table]) => {
        const reference = Array.from(table.references.values()).find((ref) =>
          ref.includes(`${tableName}.`),
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
      },
    );
    const extractFields = unique(references).map((reference) => reference.split(".")[1]);

    // 의존성 순서에 따라 레벨별 그룹화 (자기 참조가 없으면 Level 0 하나)
    const { levels, hasCircular } = this.buildInsertLevels(table.rows, tableName);

    if (hasCircular) {
      throw new Error(`${tableName}에 순환 자기 참조가 있습니다.`);
    }

    // upsert 모드일 때 유니크 인덱스가 없으면 에러
    if (mode === "upsert" && table.uniqueIndexes.length === 0) {
      throw new Error(`${tableName}에 unique index가 정의되지 않아 upsert를 할 수 없습니다.`);
    }

    const uuidMap = new Map<string, unknown>();
    const allIds: number[] = [];

    // 레벨별로 순차 처리
    for (const levelRows of levels) {
      // 이전 레벨에서 얻은 ID로 자기 참조 해결
      const resolvedRows = levelRows.map((row) => {
        const resolved = { ...row };
        for (const [key, value] of Object.entries(row)) {
          if (isRefField(value) && value.of === tableName) {
            const parent = uuidMap.get(value.uuid);

            if (!parent) throw new Error(`존재하지 않는 uuid ${value.uuid} -- in ${tableName}`);

            resolved[key] = (parent as Record<string, unknown>)[value.use ?? "id"];

            Naite.t("puri:ub-ref-resolved", {
              tableName,
              field: key,
              from: { of: value.of, uuid: value.uuid, use: value.use ?? "id" },
              to: resolved[key],
            });
          }
        }
        return resolved;
      });

      // 현재 레벨 upsert
      const levelChunks = chunkSize ? chunk(resolvedRows, chunkSize) : [resolvedRows];
      const selectFields = unique(["uuid", "id", ...extractFields]);

      for (const chunk of levelChunks) {
        let resultRows: { uuid: string; id: number; [key: string]: unknown }[];

        if (mode === "insert") {
          // INSERT 모드
          await wdb.insert(chunk).into(tableName);

          const uuids = chunk.map((r) => r.uuid);
          resultRows = await wdb(tableName)
            .select(selectFields)
            .whereIn("uuid", uuids as readonly string[]);
        } else {
          // UPSERT 모드 (uniqueIndexes 이미 체크됨)
          const conflictColumns = table.uniqueIndexes[0].columns;
          const updateColumns = Object.keys(chunk[0]).filter(
            (col) => col !== "uuid" && !conflictColumns.includes(col),
          );

          // RETURNING으로 결과 받기
          const query = wdb.insert(chunk).into(tableName).onConflict(conflictColumns);

          // updateColumns가 비어있으면 ignore(), 아니면 merge()
          if (updateColumns.length === 0) {
            resultRows = await query.ignore().returning(selectFields);
          } else {
            resultRows = await query.merge(updateColumns).returning(selectFields);
          }
        }

        // 양쪽 모드 공통 처리
        for (const row of resultRows) {
          uuidMap.set(row.uuid, row);
          allIds.push(row.id);
        }
      }
    }

    // 해당 테이블 참조를 실제 밸류로 변경
    for (const table of refTables) {
      table.rows = table.rows.map((row) => {
        for (const key of Object.keys(row)) {
          const prop = row[key];
          if (isRefField(prop) && prop.of === tableName) {
            const parent = uuidMap.get(prop.uuid);
            if (!parent) {
              console.error(prop);
              throw new Error(`존재하지 않는 uuid ${prop.uuid} -- in ${tableName}`);
            }
            const resolvedValue = (parent as Record<string, unknown>)[prop.use ?? "id"];
            row[key] = resolvedValue;

            Naite.t("puri:ub-ref-resolved", {
              tableName,
              field: key,
              from: { of: prop.of, uuid: prop.uuid, use: prop.use ?? "id" },
              to: resolvedValue,
            });
          }
        }
        return row;
      });
    }

    // 해당 테이블의 데이터 초기화
    table.rows = [];
    table.references.clear();
    table.uniquesMap.clear();

    Naite.t("puri:ub-upserted", {
      tableName,
      mode,
      rowCount: allIds.length,
      returnedIds: allIds,
    });

    return allIds;
  }

  async updateBatch(
    wdb: Knex,
    tableName: string,
    options?: {
      chunkSize?: number;
      where?: string | string[];
    },
  ): Promise<void> {
    options = {
      ...options,
      chunkSize: options?.chunkSize ?? 500,
      where: options?.where ?? "id",
    };

    if (this.hasTable(tableName) === false) {
      return;
    }
    const table = this.tables.get(tableName);
    if (!table) {
      throw new Error(`등록되지 않은 테이블 ${tableName}에 updateBatch 요청`);
    } else if (table.rows.length === 0) {
      return;
    }

    const whereColumns = Array.isArray(options.where) ? options.where : [options.where ?? "id"];
    const rows = table.rows.map((_row) => {
      const { uuid: _, ...row } = _row; // uuid 제외
      return row as RowWithId<string>;
    });

    await batchUpdate(wdb, tableName, whereColumns, rows, options.chunkSize);

    Naite.t("puri:ub-batch-updated", {
      tableName,
      rowCount: rows.length,
      whereColumns,
    });

    // updateBatch 완료 후 처리된 데이터 제거
    table.rows = [];
    table.references.clear();
    table.uniquesMap.clear();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * rows를 의존성 순서에 따라 레벨별로 그룹화
   * - 자기 참조 없는 경우 : 모든 rows가 Level 0
   * - 자기 참조 있는 경우 : 자기 참조 관계를 위상 정렬하여 레벨별로 그룹화
   */
  private buildInsertLevels(
    rows: Record<string, unknown>[],
    tableName: string,
  ): { levels: Record<string, unknown>[][]; hasCircular: boolean } {
    // 1. 자기 참조가 없으면 한 레벨로 처리
    const hasSelfRef = rows
      .flatMap((row) => Object.values(row))
      .some((value) => isRefField(value) && value.of === tableName);
    if (!hasSelfRef) return { levels: [rows], hasCircular: false };

    // 2. uuid → row 매핑 (중복 uuid 방지)
    const rowByUuid = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const uuid = row.uuid as string | undefined;
      if (!uuid) throw new Error(`buildInsertLevels: uuid가 없는 row -- in ${tableName}`);
      rowByUuid.set(uuid, row);
    }

    let pending = Array.from(rowByUuid.values());
    const levels: Record<string, unknown>[][] = [];
    const inserted = new Set<string>();

    // 3. 레벨별 분류
    while (pending.length > 0) {
      const currentLevel: Record<string, unknown>[] = [];
      const nextPending: Record<string, unknown>[] = [];

      for (const row of pending) {
        // 이 row가 참조하는 자기 참조들
        const selfRefs = Object.values(row).filter(
          (value) => isRefField(value) && value.of === tableName,
        ) as UBRef[];

        // 참조하는 모든 uuid가 이미 inserted에 있어야 이번 레벨에 포함
        const canInsert = selfRefs.every((ref) => {
          if (!rowByUuid.has(ref.uuid)) {
            throw new Error(`존재하지 않는 uuid ${ref.uuid} -- in ${tableName}`);
          }
          return inserted.has(ref.uuid);
        });

        if (canInsert) {
          currentLevel.push(row);
        } else {
          nextPending.push(row);
        }
      }

      // 순환 참조 감지
      if (currentLevel.length === 0) return { levels: [], hasCircular: true };

      // 레벨 확정 + inserted 갱신
      levels.push(currentLevel);
      for (const row of currentLevel) {
        inserted.add(row.uuid as string);
      }

      pending = nextPending;
    }

    return { levels, hasCircular: false };
  }
}
