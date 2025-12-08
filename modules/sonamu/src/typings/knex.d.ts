/** biome-ignore-all lint/correctness/noUnusedImports: d.ts */
/** biome-ignore-all lint/suspicious/noExplicitAny: d.ts */
/** biome-ignore-all lint/correctness/noUnusedVariables: d.ts */

import type { Knex } from "knex";

declare module "knex" {
  namespace Knex {
    interface QueryBuilder {
      columnInfo<TRecord>(column?: keyof TRecord): Promise<Knex.ColumnInfo | ColumnInfosObj>;

      whereBetween<TRecord, TResult>(
        columnName: string,
        range: readonly [any, any],
      ): Knex.QueryBuilder;
    }

    type ColumnInfosObj = {
      [columnName: string]: Knex.ColumnInfo;
    };
  }
}
