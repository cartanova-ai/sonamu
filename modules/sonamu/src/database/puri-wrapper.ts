import { Knex } from "knex";
import { Puri } from "./puri";
import { UBRef, UpsertBuilder } from "./upsert-builder";
import { DatabaseSchemaExtend } from "../types/types";

export class PuriWrapper<DBSchema = DatabaseSchemaExtend> {
  constructor(
    public knex: Knex,
    public upsertBuilder: UpsertBuilder
  ) {}

  raw(sql: string): Knex.Raw {
    return this.knex.raw(sql);
  }
  // 기존: 테이블로 시작
  table<T extends keyof DBSchema>(tableName: T): Puri<DBSchema, T> {
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

  ubRegister<T extends string>(
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
    return this.upsertBuilder.register(tableName as string, row);
  }

  ubUpsert(tableName: string, chunkSize?: number): Promise<number[]> {
    return this.upsertBuilder.upsert(this.knex, tableName as string, chunkSize);
  }

  ubInsertOnly(tableName: string, chunkSize?: number): Promise<number[]> {
    return this.upsertBuilder.insertOnly(this.knex, tableName, chunkSize);
  }

  ubUpsertOrInsert(
    tableName: string,
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
    tableName: string,
    options?: { chunkSize?: number; where?: string | string[] }
  ): Promise<void> {
    return this.upsertBuilder.updateBatch(this.knex, tableName, options);
  }
}
