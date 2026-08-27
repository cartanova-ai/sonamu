/*
  아래의 링크에서 참고해서 가져온 소스코드
  https://github.com/knex/knex/issues/5716
*/

import { getLogger } from "@logtape/logtape";
import { type Knex } from "knex";

const logger = getLogger(["sonamu", "internal", "batch-update"]);

type ColumnValue = string | number | boolean | null;
export type RowWithId<Id extends string> = {
  [key in Id]: ColumnValue;
} & Record<string, ColumnValue>;

/**
 * Batch update rows in a table. Technically its a patch since it only updates the specified columns. Any omitted columns will not be affected
 * @param knex
 * @param tableName
 * @param ids
 * @param rows
 * @param chunkSize
 * @param trx
 */
export async function batchUpdate<Id extends string>(
  knex: Knex,
  tableName: string,
  ids: Id[],
  rows: RowWithId<Id>[],
  chunkSize = 50,
  trx: Knex.Transaction | null = null,
) {
  const chunks: RowWithId<Id>[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }

  const executeUpdate = async (chunk: RowWithId<Id>[], transaction: Knex.Transaction) => {
    const rawQuery = generateBatchUpdateSQL(knex, tableName, chunk, ids);
    return rawQuery.transacting(transaction);
  };

  if (trx) {
    for (const chunk of chunks) {
      logger.debug("Processing Batch Chunk in Existing Transaction: {current} / {total}", {
        current: chunk.length,
        total: chunks.length,
      });
      await executeUpdate(chunk, trx);
    }
  } else {
    await knex.transaction(async (newTrx) => {
      for (const chunk of chunks) {
        logger.debug("Processing Batch Chunk in New Transaction: {current} / {total}", {
          current: chunk.length,
          total: chunks.length,
        });
        await executeUpdate(chunk, newTrx);
      }
    });
  }
}

/**
 * Generate a set of unique keys in a data array
 *
 * Example:
 * [ { a: 1, b: 2 }, { a: 3, c: 4 } ] => Set([ "a", "b", "c" ])
 * @param data
 */
function generateKeySetFromData(data: Record<string, ColumnValue>[]) {
  const keySet: Set<string> = new Set();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      keySet.add(key);
    }
  }
  return keySet;
}

function generateBatchUpdateSQL<Id extends string>(
  db: Knex,
  tableName: string,
  data: Record<string, ColumnValue>[],
  identifiers: Id[],
): Knex.Raw {
  const keySet = generateKeySetFromData(data);
  const allBindings: (string | number | boolean | null)[] = [];

  const invalidIdentifiers = identifiers.filter((id) => !keySet.has(id));
  if (invalidIdentifiers.length > 0) {
    throw new Error(
      `Invalid identifiers: ${invalidIdentifiers.join(", ")}. Identifiers must exist in the data`,
    );
  }

  const cases: string[] = [];

  for (const key of keySet) {
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    if (identifiers.includes(key as Id)) continue;

    const caseBindings: (string | number | boolean | null)[] = [];
    const whenClauses: string[] = [];

    for (const row of data) {
      if (Object.hasOwn(row, key)) {
        const whereParts = identifiers.map(() => `?? = ?`).join(" AND ");
        whenClauses.push(`WHEN (${whereParts}) THEN ?`);

        // identifier 이름과 값들을 추가
        for (const id of identifiers) {
          caseBindings.push(id, row[id]);
        }
        // THEN 값 추가
        caseBindings.push(row[key]);
      }
    }

    const whenThen = whenClauses.join(" ");
    cases.push(`?? = CASE ${whenThen} ELSE ?? END`);

    // 컬럼명 2개 추가 (SET의 컬럼명, ELSE의 컬럼명)
    allBindings.push(key);
    allBindings.push(...caseBindings);
    allBindings.push(key);
  }

  const whereInClauses = identifiers
    .map((_col) => `?? IN (${data.map(() => "?").join(", ")})`)
    .join(" AND ");

  const whereInBindings: (string | number | boolean | null)[] = [];
  for (const col of identifiers) {
    whereInBindings.push(col);
    for (const row of data) {
      whereInBindings.push(row[col]);
    }
  }

  const sql = db.raw(`UPDATE ?? SET ${cases.join(", ")} WHERE ${whereInClauses}`, [
    tableName,
    ...allBindings,
    ...whereInBindings,
  ]);

  return sql;
}
