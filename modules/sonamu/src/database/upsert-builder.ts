import { randomUUID } from "crypto";

import { getLogger } from "@logtape/logtape";
import { type Knex } from "knex";
import { cluster, isArray, unique } from "radashi";

import { EntityManager } from "../entity/entity-manager";
import { Naite } from "../naite/naite";
import {
  type DatabaseForeignKeys,
  type DatabaseSchemaExtend,
  type EntityIndex,
} from "../types/types";
import { asArray } from "../utils/model";
import { isNumberValue, isObjectValue, isStringValue } from "../utils/runtime-value";
import { assertDefined, nonNullable } from "../utils/utils";
import { batchUpdate } from "./_batch_update";
import { type RowWithId } from "./_batch_update";
import { type ColumnKeys, type ForeignKeyColumns, type IdType, type TableName } from "./puri.types";

const logger = getLogger(["sonamu", "internal", "upsert-builder"]);

/**
 * FK 타입 추론을 위해 DatabaseForeignKeys export
 * (module augmentation 자동 로드 보장)
 */
export type { DatabaseForeignKeys };

type InheritableColumns<TTable extends TableName<DatabaseSchemaExtend>> =
  TTable extends keyof DatabaseSchemaExtend ? ColumnKeys<DatabaseSchemaExtend[TTable]> : never;

// 참조 필드 타입
export type UBRef = {
  uuid: string;
  of: string;
  use?: string;
};

type UpsertValue =
  | string
  | number
  | boolean
  | bigint
  | Date
  | Buffer
  | Knex.Raw
  | UBRef
  | null
  | UpsertValue[]
  | { [key: string]: UpsertValue | undefined };
type UpsertRow = Record<string, UpsertValue | undefined>;

// 테이블 데이터 타입
type TableData = {
  references: Set<string>;
  rows: UpsertRow[];
  uniqueIndexes: EntityIndex[];
  uniquesMap: Map<string, string>;
  jsonColumns: string[];
};

// upsert 옵션
export type UpsertOptions<TTable extends TableName<DatabaseSchemaExtend>> = {
  chunkSize?: number;
  cleanOrphans?: ForeignKeyColumns<TTable> | ForeignKeyColumns<TTable>[];
  inherit?: InheritableColumns<TTable>[];
};

// insertOnly 옵션
export type InsertOnlyOptions = {
  chunkSize?: number;
};

export function isRefField<Value>(field: Value): field is Value & UBRef {
  return isObjectValue(field) && "of" in field && "uuid" in field;
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
      jsonColumns: tableSpec?.jsonColumns ?? [],
    };
    this.tables.set(tableName, tableData);
    return tableData;
  }

  hasTable(tableName: string): boolean {
    return this.tables.has(tableName);
  }

  register<Row extends object>(tableName: string, row: Row): UBRef {
    const table = this.getTable(tableName);

    // 해당 테이블의 unique 인덱스를 순회하며 키 생성
    const uniqueKeys = table.uniqueIndexes
      .map((unqIndex) => {
        const uniqueKeyArray = unqIndex.columns.map((unqCol) => {
          // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
          const val = row[unqCol.name as keyof typeof row];
          if (isRefField(val)) {
            return val.uuid;
          } else {
            // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
            return row[unqCol.name as keyof typeof row] ?? randomUUID(); // nullable인 경우 uuid로 랜덤값 삽입
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
    const normalizedRow = Object.fromEntries(
      Object.entries(row).map(([rowKey, rowValue]) => {
        if (isRefField(rowValue)) {
          rowValue.use ??= "id";
          table.references.add(`${rowValue.of}.${rowValue.use}`);
          return [rowKey, rowValue] as const;
        } else if (table.jsonColumns.includes(rowKey) && rowValue !== null) {
          // JSON 컬럼인 경우 JSON.stringify 처리 (Knex는 JSON 타입을 지원하지 않음)
          return [rowKey, JSON.stringify(rowValue)] as const;
        } else if (isArray(rowValue)) {
          // 배열은 그대로 저장
          return [rowKey, rowValue] as const;
        } else {
          return [rowKey, rowValue] as const;
        }
      }),
    );

    table.rows.push({
      uuid,
      ...normalizedRow,
    });

    const result: UBRef = {
      of: tableName,
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      uuid: isStringValue(normalizedRow.uuid) ? normalizedRow.uuid : uuid,
    };

    Naite.t("puri:ub-register", {
      tableName,
      uuid: result.uuid,
      isUuidReused: isReused,
      row,
    });

    return result;
  }

  async upsert<TTable extends TableName<DatabaseSchemaExtend>>(
    wdb: Knex,
    tableName: TTable,
    options?: UpsertOptions<TTable>,
  ): Promise<IdType<DatabaseSchemaExtend, TTable>[]> {
    return this.upsertOrInsert(wdb, tableName, "upsert", options);
  }

  async insertOnly<TTable extends TableName<DatabaseSchemaExtend>>(
    wdb: Knex,
    tableName: TTable,
    options?: InsertOnlyOptions,
  ): Promise<IdType<DatabaseSchemaExtend, TTable>[]> {
    return this.upsertOrInsert(wdb, tableName, "insert", options);
  }

  async upsertOrInsert<TTable extends TableName<DatabaseSchemaExtend>>(
    wdb: Knex,
    tableName: TTable,
    mode: "upsert" | "insert",
    options?: UpsertOptions<TTable>,
  ): Promise<IdType<DatabaseSchemaExtend, TTable>[]> {
    if (!this.hasTable(tableName)) {
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
      (r, [, candidateTable]) => {
        const reference = Array.from(candidateTable.references.values()).find((ref) =>
          ref.includes(`${tableName}.`),
        );
        if (reference) {
          r.references.push(reference);
          r.refTables.push(candidateTable);
        }

        return r;
      },
      {
        // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
        references: [] as string[],
        // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
        refTables: [] as TableData[],
      },
    );
    const extractFields = unique(references)
      .map((reference) => reference.split(".")[1])
      .filter((field): field is string => field !== undefined);

    // 의존성 순서에 따라 레벨별 그룹화 (자기 참조가 없으면 Level 0 하나)
    const { levels, hasCircular } = this.buildInsertLevels(table.rows, tableName);

    if (hasCircular) {
      throw new Error(`${tableName}에 순환 자기 참조가 있습니다.`);
    }

    const uuidMap = new Map<string, UpsertRow & { id: number | string }>();
    const allIds: (number | string)[] = [];

    // 레벨별로 순차 처리
    for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
      const levelRows = levels[levelIdx];
      logger.debug("Processing Query Level: {current} / {total}", {
        current: levelIdx + 1,
        total: levels.length,
      });

      // 이전 레벨에서 얻은 ID로 자기 참조 해결
      const resolvedRows = levelRows.map((row) => {
        const resolved = { ...row };
        for (const [key, value] of Object.entries(row)) {
          if (isRefField(value) && value.of === tableName) {
            const parent = uuidMap.get(value.uuid);

            if (!parent) throw new Error(`존재하지 않는 uuid ${value.uuid} -- in ${tableName}`);

            // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
            resolved[key] = (parent as UpsertRow)[value.use ?? "id"];

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
      const chunkSize = options?.chunkSize;
      const levelChunks = chunkSize ? cluster(resolvedRows, chunkSize) : [resolvedRows];
      const selectFields = unique(["id", ...extractFields]);

      for (let index = 0; index < levelChunks.length; index++) {
        const dataChunk = levelChunks[index];
        if (dataChunk.length === 0) continue;
        logger.debug("Processing Chunk: {current} / {total}", {
          current: index + 1,
          total: levelChunks.length,
        });

        // uuid를 별도로 보관하고, DB에 저장할 데이터에서 제거
        // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
        const originalUuids = dataChunk.map((r) => r.uuid as string);
        const dataForDb = dataChunk.map((row) => {
          const rest = { ...row };
          delete rest.uuid;
          return rest;
        });

        let resultRows: (UpsertRow & { id: number | string })[];

        if (mode === "insert") {
          // INSERT 모드 - RETURNING 사용
          resultRows = await wdb.insert(dataForDb).into(tableName).returning(selectFields);
        } else {
          // UPSERT 모드 - id 없는 row들의 id를 사전 조회로 채우기
          const rowsWithoutId = dataForDb.filter((row) => !row.id);

          if (rowsWithoutId.length > 0 && table.uniqueIndexes.length > 0) {
            // 모든 uniqueIndexes로 기존 레코드 조회
            for (const uniqueIndex of table.uniqueIndexes) {
              const columns = uniqueIndex.columns.map((c) => c.name);

              // 조회할 조건들 추출 (각 row의 unique 컬럼 값들)
              const conditions: unknown[][] = [];
              for (const row of rowsWithoutId) {
                const values = columns.map((col) => row[col]);
                // null이 포함된 조건은 제외 (PostgreSQL UNIQUE는 NULL 무시)
                if (!values.some((v) => v === null || v === undefined)) {
                  conditions.push(values);
                }
              }

              if (conditions.length === 0) continue;

              // 배치 SELECT
              // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
              const existingRows = (await wdb(tableName)
                // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
                .whereIn(columns, conditions as UpsertRow[][])
                .select("id", ...columns)) as UpsertRow[];

              // Map 생성: unique 컬럼 조합 → id
              const existingMap = new Map<string, number | string>();
              for (const existing of existingRows) {
                const key = columns
                  .map((col) => String(existing[col] ?? ""))
                  .join("---delimiter---");
                const id = existing.id;
                if (isNumberValue(id) || isStringValue(id)) {
                  existingMap.set(key, id);
                }
              }

              // id 없는 row들에 매칭되는 id 채우기
              for (const row of rowsWithoutId) {
                if (row.id) continue; // 이미 다른 uniqueIndex에서 채워진 경우 스킵

                const key = columns.map((col) => String(row[col] ?? "")).join("---delimiter---");
                const existingId = existingMap.get(key);

                if (existingId) {
                  row.id = existingId;
                }
              }
            }
          }

          // onConflict는 id만 사용 (모든 uniqueIndexes는 이미 사전 조회로 처리됨)
          const conflictColumns = ["id"];

          const allColumns = Object.keys(dataForDb[0]);
          let updateColumns = allColumns.filter((c) => c !== "id");

          // inherit 옵션 처리 - inherit 컬럼은 update 대상에서 제외
          if (options?.inherit?.length) {
            // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
            const inheritColumns = options.inherit as string[];

            const excludedFromUpdate = updateColumns.filter((c) => inheritColumns.includes(c));
            updateColumns = updateColumns.filter((c) => !inheritColumns.includes(c));

            // 실제로 제외된 컬럼 로깅
            if (excludedFromUpdate.length) {
              Naite.t("puri:ub-inherit", {
                tableName,
                inheritColumns,
                excludedFromUpdate,
              });
            }
          }

          // updateColumns가 비어있어도 merge()를 사용하여 모든 행이 RETURNING되도록 보장
          const mergeColumns = updateColumns.length ? updateColumns : conflictColumns;

          resultRows = await wdb
            .insert(dataForDb)
            .into(tableName)
            .onConflict(conflictColumns)
            .merge(mergeColumns)
            .returning(selectFields);
        }

        if (originalUuids.length !== resultRows.length) {
          throw new Error(`${tableName}: register/returning 불일치`);
        }

        for (let i = 0; i < resultRows.length; i++) {
          uuidMap.set(originalUuids[i], resultRows[i]);
          allIds.push(resultRows[i].id);
        }
      }
    }

    // 해당 테이블 참조를 실제 밸류로 변경
    for (const referencingTable of refTables) {
      referencingTable.rows = referencingTable.rows.map((row) => {
        for (const key of Object.keys(row)) {
          const prop = row[key];
          if (isRefField(prop) && prop.of === tableName) {
            const parent = uuidMap.get(prop.uuid);
            if (!parent) {
              console.error(prop);
              throw new Error(`존재하지 않는 uuid ${prop.uuid} -- in ${tableName}`);
            }
            // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
            const resolvedValue = parent[prop.use ?? "id"];
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

    if (options?.cleanOrphans) {
      const cleanOrphans = options.cleanOrphans;
      const fkColumns = asArray(cleanOrphans);

      // 현재 register된 레코드들의 FK 값들 추출
      const fkConditions = fkColumns.map((fkCol) => {
        const fkValues = [...new Set(table.rows.map((row) => row[fkCol]).filter(Boolean))];
        return { column: fkCol, values: fkValues };
      });

      // 모든 FK 컬럼에 값이 있는 경우에만 삭제 실행
      if (fkConditions.every((fc) => fc.values.length > 0)) {
        let deleteQuery = wdb(tableName);

        // 각 FK 컬럼에 대한 WHERE IN 조건 추가
        for (const { column, values } of fkConditions) {
          // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
          deleteQuery = deleteQuery.whereIn(column, values as Knex.Value[]);
        }

        // 방금 upsert한 ID는 제외
        deleteQuery = deleteQuery.whereNotIn("id", allIds);

        const deletedCount = await deleteQuery.delete();

        Naite.t("puri:ub-clean-orphans", {
          tableName,
          cleanOrphans: fkColumns,
          deletedCount,
        });
      }
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

    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    return allIds as IdType<DatabaseSchemaExtend, TTable>[];
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

    if (!this.hasTable(tableName)) {
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
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
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
  // Private Helper Methods
  // ============================================================================

  /**
   * rows를 의존성 순서에 따라 레벨별로 그룹화
   * - 자기 참조 없는 경우 : 모든 rows가 Level 0
   * - 자기 참조 있는 경우 : 자기 참조 관계를 위상 정렬하여 레벨별로 그룹화
   */
  private buildInsertLevels(rows: UpsertRow[], tableName: string) {
    // 1. 자기 참조가 없으면 한 레벨로 처리
    const hasSelfRef = rows
      .flatMap((row) => Object.values(row))
      .some((value) => isRefField(value) && value.of === tableName);
    if (!hasSelfRef) return { levels: [rows], hasCircular: false };

    // 2. uuid → row 매핑 (중복 uuid 방지)
    const rowByUuid = new Map<string, UpsertRow>();
    for (const row of rows) {
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      const uuid = row.uuid as string | undefined;
      if (!uuid) throw new Error(`buildInsertLevels: uuid가 없는 row -- in ${tableName}`);
      rowByUuid.set(uuid, row);
    }

    let pending = Array.from(rowByUuid.values());
    const levels: UpsertRow[][] = [];
    const inserted = new Set<string>();

    // 3. 레벨별 분류
    while (pending.length > 0) {
      const currentLevel: UpsertRow[] = [];
      const nextPending: UpsertRow[] = [];

      for (const row of pending) {
        // 이 row가 참조하는 자기 참조들
        // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
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
        // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
        inserted.add(row.uuid as string);
      }

      pending = nextPending;
    }

    return { levels, hasCircular: false };
  }
}
