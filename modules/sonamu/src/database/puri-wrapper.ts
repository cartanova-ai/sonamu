import { Knex } from "knex";
import { Puri } from "./puri";

export class PuriWrapper<TSchema> {
  constructor(private knex: Knex) {}

  raw(sql: string): Knex.Raw {
    return this.knex.raw(sql);
  }
  // 기존: 테이블로 시작
  table<T extends keyof TSchema>(tableName: T): Puri<TSchema, T> {
    return new Puri(this.knex, tableName as any);
  }

  // 새로 추가: 서브쿼리로 시작
  fromSubquery<TSubResult, TAlias extends string>(
    subquery: Puri<TSchema, any, TSubResult, any>,
    alias: TAlias extends string ? TAlias : never
  ): Puri<TSchema, TAlias, TSubResult, {}> {
    return new Puri(this.knex, subquery, alias);
  }

  async transaction<T>(callback: (trx: PuriWrapper<TSchema>) => Promise<T>): Promise<T> {
    return this.knex.transaction(async (trx) => {
      return callback(new PuriWrapper(trx));
    });
  }
}
