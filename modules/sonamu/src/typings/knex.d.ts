/* oxlint-disable @typescript-eslint/no-unused-vars */ // d.ts
/* oxlint-disable @typescript-eslint/no-explicit-any */ // d.ts
/* oxlint-disable @typescript-eslint/no-unused-vars */ // d.ts

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
