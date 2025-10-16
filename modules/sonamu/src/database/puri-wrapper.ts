import { Knex } from "knex";
import { Puri } from "./puri";

export interface DatabaseSchemaExtend {}

export class PuriWrapper<DBSchema = DatabaseSchemaExtend> {
  constructor(private knex: Knex) {}

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
      return callback(new PuriWrapper(trx));
    });
  }
}
