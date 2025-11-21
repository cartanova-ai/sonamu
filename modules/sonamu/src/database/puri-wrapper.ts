/** biome-ignore-all lint/suspicious/noExplicitAny: PuriWrapper는 다양한 타입을 사용하고 있습니다. */

import chalk from "chalk";
import type { Knex } from "knex";
import type { DatabaseSchemaExtend } from "../types/types";
import type { DBPreset } from "./db";
import { Puri } from "./puri";
import type { UBRef, UpsertBuilder } from "./upsert-builder";
import type { ColumnKeys, OmitMetadataColumns, PuriTable } from "./puri.types";

type TableName<TSchema extends DatabaseSchemaExtend> = Extract<keyof TSchema, string>;

export type TransactionalOptions = {
  isolation?: Exclude<Knex.IsolationLevels, "snapshot">; // snapshot: mssql only
  dbPreset?: DBPreset;
  readOnly?: boolean;
};

export class PuriWrapper<TSchema extends DatabaseSchemaExtend = DatabaseSchemaExtend> {
  constructor(
    public knex: Knex,
    public upsertBuilder: UpsertBuilder,
  ) {}

  raw(sql: string): Knex.Raw {
    return this.knex.raw(sql);
  }

  // 테이블명으로 시작
  from<TTable extends keyof TSchema>(
    tableName: TTable
  ): Puri<
    TSchema,
    Record<TTable, PuriTable<TSchema[TTable]>>,
    OmitMetadataColumns<PuriTable<TSchema[TTable]>>
  >;
  // 테이블명 + Alias로 시작
  from<TTable extends keyof TSchema, TAlias extends string>(spec: {
    [K in TAlias]: TTable;
  }): Puri<
    TSchema,
    Record<TAlias, PuriTable<TSchema[TTable]>>,
    OmitMetadataColumns<PuriTable<TSchema[TTable]>>
  >;
  // 서브쿼리로 시작
  from<TAlias extends string, TSubResult>(spec: {
    [K in TAlias]: Puri<TSchema, any, TSubResult>;
  }): Puri<
    TSchema,
    Record<TAlias, PuriTable<TSubResult>>,
    OmitMetadataColumns<PuriTable<TSubResult>>
  >;
  from(spec: any): any {
    return new Puri(this.knex, spec);
  }

  // 테이블명으로 시작
  table<TTable extends keyof TSchema>(
    tableName: TTable
  ): Puri<
    TSchema,
    Record<TTable, PuriTable<TSchema[TTable]>>,
    OmitMetadataColumns<PuriTable<TSchema[TTable]>>
  >;
  // 테이블명 + Alias로 시작
  table<TTable extends keyof TSchema, TAlias extends string>(spec: {
    [K in TAlias]: TTable;
  }): Puri<
    TSchema,
    Record<TAlias, PuriTable<TSchema[TTable]>>,
    OmitMetadataColumns<PuriTable<TSchema[TTable]>>
  >;
  // 서브쿼리로 시작
  table<TAlias extends string, TSubResult>(spec: {
    [K in TAlias]: Puri<TSchema, any, TSubResult>;
  }): Puri<
    TSchema,
    Record<TAlias, PuriTable<TSubResult>>,
    OmitMetadataColumns<PuriTable<TSubResult>>
  >;
  table(spec: any): any {
    return new Puri(this.knex, spec);
  }

  async transaction<T>(
    callback: (trx: PuriTransactionWrapper) => Promise<T>,
    options: TransactionalOptions = {},
  ): Promise<T> {
    const { isolation, readOnly, dbPreset = "w" } = options;

    // @transactional 데코레이터와 동일한 로직: 이미 트랜잭션 컨텍스트가 있는지 확인
    const { DB } = await import("./db");
    const existingContext = DB.transactionStorage.getStore();

    // AsyncLocalStorage 컨텍스트가 없거나 해당 preset의 트랜잭션이 없으면 새로 시작
    const startTransaction = async (
      knex: Knex | Knex.Transaction,
      upsertBuilder: UpsertBuilder,
    ) => {
      return knex.transaction(
        async (trx) => {
          const trxWrapper = new PuriTransactionWrapper(trx, upsertBuilder);

          // TransactionContext에 트랜잭션 저장
          DB.getTransactionContext().setTransaction(dbPreset, trxWrapper);

          try {
            return await callback(trxWrapper);
          } finally {
            // 트랜잭션 제거
            DB.getTransactionContext().deleteTransaction(dbPreset);
          }
        },
        { isolationLevel: isolation, readOnly },
      );
    };

    // AsyncLocalStorage 컨텍스트가 없으면 새로 생성
    if (!existingContext) {
      return DB.runWithTransaction(() => startTransaction(this.knex, this.upsertBuilder));
    }

    // 해당 preset의 트랜잭션이 이미 있으면 SAVEPOINT로 중첩 트랜잭션 생성
    const existingTrx = existingContext.getTransaction(dbPreset);
    if (existingTrx) {
      return startTransaction(existingTrx.trx, existingTrx.upsertBuilder);
    } else {
      // 컨텍스트는 있지만 이 preset의 트랜잭션은 없는 경우 (같은 컨텍스트 내에서 실행)
      return startTransaction(this.knex, this.upsertBuilder);
    }
  }

  ubRegister<TTable extends TableName<TSchema>>(
    tableName: TTable,
    row: Partial<{
      [K in ColumnKeys<TSchema[TTable]>]: TSchema[TTable][K] | UBRef;
    }>
  ): UBRef {
    return this.upsertBuilder.register(tableName, row);
  }

  ubUpsert(tableName: TableName<TSchema>, chunkSize?: number): Promise<number[]> {
    return this.upsertBuilder.upsert(this.knex, tableName, chunkSize);
  }

  ubInsertOnly(tableName: TableName<TSchema>, chunkSize?: number): Promise<number[]> {
    return this.upsertBuilder.insertOnly(this.knex, tableName, chunkSize);
  }

  ubUpsertOrInsert(
    tableName: TableName<TSchema>,
    mode: "upsert" | "insert",
    chunkSize?: number,
  ): Promise<number[]> {
    return this.upsertBuilder.upsertOrInsert(this.knex, tableName, mode, chunkSize);
  }

  ubUpdateBatch(
    tableName: TableName<TSchema>,
    options?: { chunkSize?: number; where?: string | string[] },
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
    const [connectionIdRows] = await this.knex.raw(`SELECT CONNECTION_ID() as connection_id`);
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

export class PuriTransactionWrapper extends PuriWrapper {
  constructor(
    public trx: Knex.Transaction,
    public upsertBuilder: UpsertBuilder,
  ) {
    super(trx, upsertBuilder);
  }

  async rollback(): Promise<void> {
    await this.trx.rollback();
  }

  async commit(): Promise<void> {
    await this.trx.commit();
  }
}
