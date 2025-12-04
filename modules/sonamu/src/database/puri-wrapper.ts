/** biome-ignore-all lint/suspicious/noExplicitAny: PuriWrapper는 다양한 타입을 사용하고 있습니다. */

import chalk from "chalk";
import type { Knex } from "knex";
import type { DatabaseSchemaExtend } from "../types/types";
import type { DBClass, DBPreset } from "./db";
import { Puri } from "./puri";
import type { ColumnKeys, OmitMetadataColumns, PuriTable } from "./puri.types";
import type { UBRef, UpsertBuilder } from "./upsert-builder";

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

  // ============================================================================
  // Public API
  // ============================================================================

  raw(sql: string): Knex.Raw {
    return this.knex.raw(sql);
  }

  // 테이블명으로 시작
  from<TTable extends keyof TSchema>(
    tableName: TTable,
  ): Puri<
    TSchema,
    Record<TTable, PuriTable<TSchema[TTable]>>,
    OmitMetadataColumns<PuriTable<TSchema[TTable]>>
  >;
  // 테이블명 + Alias로 시작
  from<TTable extends keyof TSchema, TAlias extends string>(
    spec: {
      [K in TAlias]: TTable;
    },
  ): Puri<
    TSchema,
    Record<TAlias, PuriTable<TSchema[TTable]>>,
    OmitMetadataColumns<PuriTable<TSchema[TTable]>>
  >;
  // 서브쿼리로 시작
  from<TAlias extends string, TSubResult>(
    spec: {
      [K in TAlias]: Puri<TSchema, any, TSubResult>;
    },
  ): Puri<
    TSchema,
    Record<TAlias, PuriTable<TSubResult>>,
    OmitMetadataColumns<PuriTable<TSubResult>>
  >;
  from(spec: any): any {
    return new Puri(this.knex, spec);
  }

  // 테이블명으로 시작
  table<TTable extends keyof TSchema>(
    tableName: TTable,
  ): Puri<
    TSchema,
    Record<TTable, PuriTable<TSchema[TTable]>>,
    OmitMetadataColumns<PuriTable<TSchema[TTable]>>
  >;
  // 테이블명 + Alias로 시작
  table<TTable extends keyof TSchema, TAlias extends string>(
    spec: {
      [K in TAlias]: TTable;
    },
  ): Puri<
    TSchema,
    Record<TAlias, PuriTable<TSchema[TTable]>>,
    OmitMetadataColumns<PuriTable<TSchema[TTable]>>
  >;
  // 서브쿼리로 시작
  table<TAlias extends string, TSubResult>(
    spec: {
      [K in TAlias]: Puri<TSchema, any, TSubResult>;
    },
  ): Puri<
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
      if (readOnly) {
        // Knex의 readOnly 옵션이 MySQL에서 작동하지 않으므로 직접 구현
        return this._startReadOnlyTrx(knex, upsertBuilder, isolation, dbPreset, callback, DB);
      } else {
        // 일반 트랜잭션은 Knex의 기본 기능 사용
        return this._startNormalTrx(knex, upsertBuilder, isolation, dbPreset, callback, DB);
      }
    };

    // AsyncLocalStorage 컨텍스트가 없으면 새로 생성
    if (!existingContext) {
      return DB.runWithTransaction(() => startTransaction(this.knex, this.upsertBuilder));
    }

    // 해당 preset의 트랜잭션이 이미 있으면 SAVEPOINT로 중첩 트랜잭션 생성
    const existingTrx = existingContext.getTransaction(dbPreset);
    if (existingTrx) {
      // 중첩 트랜잭션에서는 READ ONLY를 적용할 수 없음
      if (readOnly) throw new Error("Nested READ ONLY transaction not supported");
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
    }>,
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

  async debugTransaction() {
    const info = await this.getTransactionInfo();
    console.log(`${chalk.cyan("[Puri Transaction]")} ${chalk.magenta(info)}`);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * 일반 트랜잭션 시작 (Knex 기본 기능 사용)
   */
  private async _startNormalTrx<T>(
    knex: Knex | Knex.Transaction,
    upsertBuilder: UpsertBuilder,
    isolation: TransactionalOptions["isolation"],
    dbPreset: DBPreset,
    callback: (trx: PuriTransactionWrapper) => Promise<T>,
    DB: DBClass,
  ): Promise<T> {
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
      { isolationLevel: isolation },
    );
  }

  /**
   * READ ONLY 트랜잭션 시작 (MySQL 전용)
   *
   * Knex의 readOnly 옵션이 MySQL에서 제대로 작동하지 않는 문제를 우회하기 위해
   * 직접 START TRANSACTION READ ONLY SQL을 실행
   *
   * - DB connection을 명시적으로 획득하여 같은 연결에서 모든 쿼리 실행
   * - Proxy를 사용하여 Knex API와 호환되는 트랜잭션 객체 생성
   * - 수동 커밋/롤백 구현
   *
   * NOTE: PostgreSQL 지원이 필요한 경우 PosgreSQL 호환되도록 메소드 분리 필요
   */
  private async _startReadOnlyTrx<T>(
    knex: Knex | Knex.Transaction,
    upsertBuilder: UpsertBuilder,
    isolation: TransactionalOptions["isolation"],
    dbPreset: DBPreset,
    callback: (trx: PuriTransactionWrapper) => Promise<T>,
    DB: DBClass,
  ): Promise<T> {
    const client: Knex.Client = knex.client;
    let connection: any;
    // connection 해제 여부 추적 (Proxy commit/rollback과 cleanup이 상태를 공유)
    const state = { released: false };

    try {
      // Step 1: DB 연결 획득 (같은 연결을 계속 사용해야 트랜잭션이 유지됨)
      connection = await client.acquireConnection();

      // Step 2: START TRANSACTION READ ONLY 실행 (MySQL)
      let sql = "START TRANSACTION";
      if (isolation) {
        sql += ` ISOLATION LEVEL ${isolation.replace(/\s+/g, " ").toUpperCase()}`;
      }
      sql += " READ ONLY";
      await client.query(connection, { sql });

      // Step 3: Knex 호환 트랜잭션 Proxy 객체 생성
      const manualTrx = this._createManualTrx(knex, client, connection, state);

      // Step 4: TransactionContext에 트랜잭션 등록
      const trxWrapper = new PuriTransactionWrapper(manualTrx, upsertBuilder);
      DB.getTransactionContext().setTransaction(dbPreset, trxWrapper);

      try {
        // Step 5: 콜백 실행 및 자동 커밋
        const result = await callback(trxWrapper);
        await manualTrx.commit();
        return result;
      } catch (error) {
        // Step 6: 에러 시 롤백
        await manualTrx.rollback();
        throw error;
      } finally {
        // Step 7: TransactionContext에서 제거
        DB.getTransactionContext().deleteTransaction(dbPreset);
      }
    } catch (error) {
      // 예외 발생 시 연결 정리
      if (connection && !state.released) {
        try {
          await client.query(connection, { sql: "ROLLBACK" });
          await client.releaseConnection(connection);
        } catch {
          // 원래 에러 전파
        }
      }
      throw error;
    }
  }

  /**
   * 수동으로 시작한 트랜잭션용 Knex 호환 Proxy 객체 생성
   *
   * 직접 SQL로 트랜잭션을 시작한 경우 모든 후속 쿼리가 같은 DB connection에서 실행되도록 보장
   * Proxy를 사용하여 Knex의 connection pooling을 우회하고 트랜잭션 일관성을 유지
   *
   * 사용 사례:
   * - READ ONLY 트랜잭션
   * - 특수 isolation level 설정
   * - Knex가 지원하지 않는 트랜잭션 옵션
   */
  private _createManualTrx(
    knex: Knex | Knex.Transaction,
    client: Knex.Client,
    connection: any,
    state: { released: boolean },
  ): Knex.Transaction {
    return new Proxy(
      (tableName: string) => {
        return (knex as Knex)(tableName).connection(connection);
      },
      {
        get(_target: unknown, prop: string | symbol) {
          switch (prop) {
            case "commit":
              return async () => {
                if (!state.released) {
                  await client.query(connection, { sql: "COMMIT" });
                  await client.releaseConnection(connection);
                  state.released = true;
                }
              };

            case "rollback":
              return async (err?: Error) => {
                if (!state.released) {
                  await client.query(connection, { sql: "ROLLBACK" });
                  await client.releaseConnection(connection);
                  state.released = true;
                }
                if (err) throw err;
              };

            case "isTransaction":
              return true;

            case "client":
              return Object.assign(Object.create(client), {
                acquireConnection: async () => connection,
              });

            case "raw":
              return (sql: string, bindings?: any) => {
                const queryObj = (knex as any).raw(sql, bindings);
                queryObj.client = {
                  ...queryObj.client,
                  acquireConnection: async () => connection,
                };
                return queryObj;
              };

            default:
              // 나머지 속성은 원본 knex 객체에서 가져옴
              return (knex as any)[prop];
          }
        },
        apply(target: any, _thisArg: unknown, argArray: any[]) {
          return target(...argArray);
        },
      },
    );
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
