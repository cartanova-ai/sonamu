/*
  아래의 링크에서 참고해서 가져온 소스코드
  https://github.com/knex/knex/issues/5716
*/

import { Knex } from "knex";

export type RowWithId<Id extends string> = {
  [key in Id]: any;
} & Record<string, any>;

/**
 * Batch update rows in a table. Technically its a patch since it only updates the specified columns. Any omitted columns will not be affected
 * @param knex
 * @param tableName
 * @param id
 * @param rows
 * @param chunkSize
 * @param trx
 */
export async function batchUpdate<Id extends string>(
  knex: Knex,
  tableName: string,
  id: Id,
  rows: RowWithId<Id>[],
  chunkSize = 50,
  trx: Knex.Transaction | null = null
) {
  const chunks: RowWithId<Id>[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }

  const executeUpdate = async (
    chunk: RowWithId<Id>[],
    transaction: Knex.Transaction
  ) => {
    const sql = generateBatchUpdateSQL(knex, tableName, chunk, id);
    return knex.raw(sql).transacting(transaction);
  };

  if (trx) {
    for (const chunk of chunks) {
      await executeUpdate(chunk, trx);
    }
  } else {
    await knex.transaction(async (newTrx) => {
      for (const chunk of chunks) {
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
function generateKeySetFromData(data: Record<string, any>[]) {
  const keySet: Set<string> = new Set();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      keySet.add(key);
    }
  }
  return keySet;
}

function generateBatchUpdateSQL<Id extends string>(
  knex: Knex,
  tableName: string,
  data: Record<string, any>[],
  identifier: Id
) {
  const keySet = generateKeySetFromData(data);
  const bindings = [];

  const cases = [];
  for (const key of keySet) {
    if (key === identifier) continue;

    const rows = [];
    for (const row of data) {
      if (Object.hasOwnProperty.call(row, key)) {
        rows.push(`WHEN \`${identifier}\` = ? THEN ?`);
        bindings.push(row[identifier], row[key]);
      }
    }

    const whenThen = rows.join(" ");
    cases.push(`\`${key}\` = CASE ${whenThen} ELSE \`${key}\` END`);
  }

  const whereInIds = data.map((row) => row[identifier]);
  const whereInPlaceholders = whereInIds.map(() => "?").join(", ");
  const sql = knex.raw(
    `UPDATE \`${tableName}\` SET ${cases.join(
      ", "
    )} WHERE ${identifier} IN (${whereInPlaceholders})`,
    [...bindings, ...whereInIds]
  );
  return sql.toString();
}
