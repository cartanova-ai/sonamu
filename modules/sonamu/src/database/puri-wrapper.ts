import { Knex } from "knex";
import { Puri } from "./puri";
import { UBRef, UpsertBuilder } from "./upsert-builder";
import { DatabaseSchemaExtend } from "../types/types";

type TableName<DBSchema extends DatabaseSchemaExtend> = Extract<
  keyof DBSchema,
  string
>;

export class PuriWrapper<
  DBSchema extends DatabaseSchemaExtend = DatabaseSchemaExtend,
> {
  constructor(
    public knex: Knex,
    public upsertBuilder: UpsertBuilder
  ) {}

  raw(sql: string): Knex.Raw {
    return this.knex.raw(sql);
  }
  // 기존: 테이블로 시작
  table<TTable extends TableName<DBSchema>>(
    tableName: TTable
  ): Puri<DBSchema, TTable> {
    return new Puri(this.knex, tableName as any);
  }

  // 새로 추가: 서브쿼리로 시작
  fromSubquery<TSubResult, TAlias extends string>(
    subquery: Puri<DBSchema, any, TSubResult, any>,
    alias: TAlias extends string ? TAlias : never
  ): Puri<DBSchema, TAlias, TSubResult, {}> {
    return new Puri(this.knex, subquery, alias);
  }

  async transaction<T>(callback: (trx: PuriWrapper) => Promise<T>): Promise<T> {
    return this.knex.transaction(async (trx) => {
      return callback(new PuriWrapper(trx, this.upsertBuilder));
    });
  }

  ubRegister<TTable extends TableName<DBSchema>>(
    tableName: TTable,
    row: Partial<{
      [K in keyof DBSchema[TTable]]: DBSchema[TTable][K] | UBRef;
    }>
  ): UBRef {
    return this.upsertBuilder.register(tableName, row);
  }

  ubUpsert(
    tableName: TableName<DBSchema>,
    chunkSize?: number
  ): Promise<number[]> {
    return this.upsertBuilder.upsert(this.knex, tableName, chunkSize);
  }

  ubInsertOnly(
    tableName: TableName<DBSchema>,
    chunkSize?: number
  ): Promise<number[]> {
    return this.upsertBuilder.insertOnly(this.knex, tableName, chunkSize);
  }

  ubUpsertOrInsert(
    tableName: TableName<DBSchema>,
    mode: "upsert" | "insert",
    chunkSize?: number
  ): Promise<number[]> {
    return this.upsertBuilder.upsertOrInsert(
      this.knex,
      tableName,
      mode,
      chunkSize
    );
  }

  ubUpdateBatch(
    tableName: TableName<DBSchema>,
    options?: { chunkSize?: number; where?: string | string[] }
  ): Promise<void> {
    return this.upsertBuilder.updateBatch(this.knex, tableName, options);
  }
}
