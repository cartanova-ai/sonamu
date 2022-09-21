import { Knex } from "knex";

declare module "knex" {
  namespace Knex {
    interface QueryBuilder {
      onDuplicateUpdate<TRecord extends {}, TResult>(
        ...columns: string[]
      ): Knex.QueryBuilder<TRecord, TResult>;

      columnInfo<TRecord>(
        column?: keyof TRecord
      ): Promise<Knex.ColumnInfo | ColumnInfosObj>;

      whereBetween<TRecord, TResult>(
        columnName: string,
        range: readonly [any, any]
      ): Knex.QueryBuilder;
    }

    type ColumnInfosObj = {
      [columnName: string]: Knex.ColumnInfo;
    };
  }
}
