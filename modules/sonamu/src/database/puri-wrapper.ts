import { Knex } from "knex";
import { Puri } from "./puri";
import { UBRef, UpsertBuilder } from "./upsert-builder";
import { DatabaseSchemaExtend } from "../types/types";
import chalk from "chalk";
import { DBPreset } from "./db";

type TableName<DBSchema extends DatabaseSchemaExtend> = Extract<
  keyof DBSchema,
  string
>;

export type TransactionalOptions = {
  isolation?: Exclude<Knex.IsolationLevels, "snapshot">; // snapshot: mssql only
  dbPreset?: DBPreset;
};

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

  async transaction<T>(
    callback: (trx: PuriWrapper) => Promise<T>,
    options: TransactionalOptions = {}
  ): Promise<T> {
    const { isolation } = options;

    return this.knex.transaction(
      async (trx) => {
        return callback(new PuriWrapper(trx, this.upsertBuilder));
      },
      { isolationLevel: isolation }
    );
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

  // 트랜잭션 연결 테스트용
  async debugTransaction() {
    const info = await this.getTransactionInfo();
    console.log(`${chalk.cyan("[Puri Transaction]")} ${chalk.magenta(info)}`);
  }

  private async getTransactionInfo(): Promise<string> {
    // 연결 ID 조회
    const [connectionIdRows] = await this.knex.raw(
      `SELECT CONNECTION_ID() as connection_id`
    );
    const connectionId = connectionIdRows[0].connection_id;

    // 트랜잭션 정보 조회
    const [trxRows] = await this.knex.raw(`
        SELECT STATE, ISOLATION_LEVEL, THREAD_ID, EVENT_ID
        FROM performance_schema.events_transactions_current
        WHERE THREAD_ID = 
          (SELECT THREAD_ID
          FROM performance_schema.threads 
          WHERE PROCESSLIST_ID = CONNECTION_ID())
      `);

    if (trxRows.length > 0 && trxRows[0].STATE !== "COMMITTED") {
      const trx = trxRows[0];
      return `In Transaction, ConnID: ${connectionId}, ThreadID: ${trx.THREAD_ID}, EventID: ${trx.EVENT_ID}, InnoDB TRX: ${trx.STATE}(${trx.ISOLATION_LEVEL})`;
    } else {
      return `Not in Transaction, ConnID: ${connectionId}`;
    }
  }
}
