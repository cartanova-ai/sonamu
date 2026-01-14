import { AsyncLocalStorage } from "async_hooks";
import type { Knex } from "knex";
import { assign } from "radashi";
import { Sonamu } from "../api";
import type { DatabaseConfig, SonamuConfig } from "../api/config";
import { createKnexInstance } from "./knex";
import { TransactionContext } from "./transaction-context";

/**
 * 여러 설정 객체를 순차적으로 deep merge합니다.
 * undefined/null인 인자는 무시됩니다.
 */
function mergeConfigs<T extends object>(...configs: (Partial<T> | undefined | null)[]): T {
  return configs.reduce<T>((acc, config) => (config ? assign(acc, config as T) : acc), {} as T);
}

export type DBPreset = "w" | "r";

export type SonamuDBConfig = {
  development_master: Knex.Config;
  development_slave: Knex.Config;
  production_master: Knex.Config;
  production_slave: Knex.Config;
  fixture: Knex.Config;
  test: Knex.Config;
};

export class DBClass {
  private wdb?: Knex;
  private rdb?: Knex;
  private workerDBs: Map<number, Knex> = new Map();

  public transactionStorage = new AsyncLocalStorage<TransactionContext>();

  public runWithTransaction<T>(callback: () => Promise<T>): Promise<T> {
    return this.transactionStorage.run(new TransactionContext(), callback);
  }

  public getTransactionContext(): TransactionContext {
    return this.transactionStorage.getStore() ?? new TransactionContext();
  }

  getDB(which: DBPreset): Knex {
    const dbConfig = Sonamu.dbConfig;

    // 테스트 트랜잭션 격리
    if (process.env.NODE_ENV === "test") {
      // 병렬 테스트 모드: worker별 DB 사용
      if (process.env.SONAMU_PARALLEL_TEST === "true") {
        return this.getWorkerDB(dbConfig);
      }

      // 기존 단일 테스트 로직
      if (this.testTransaction) {
        return this.testTransaction;
      } else if (this.wdb) {
        return this.wdb;
      } else {
        this.wdb = createKnexInstance({
          ...dbConfig.test,
          // 단일 풀
          pool: {
            min: 1,
            max: 1,
          },
        });
        return this.wdb;
      }
    }

    const instanceName = which === "w" ? "wdb" : "rdb";

    if (!this[instanceName]) {
      const config = this.getDBConfig(which);
      this[instanceName] = createKnexInstance(config);
    }

    return this[instanceName];
  }

  /**
   * 병렬 테스트에서 worker별 DB 인스턴스를 반환합니다.
   * VITEST_POOL_ID 환경변수로 worker를 식별하여 해당 DB에 연결합니다.
   */
  private getWorkerDB(dbConfig: SonamuDBConfig): Knex {
    // 트랜잭션이 있으면 트랜잭션 반환
    if (this.testTransaction) {
      return this.testTransaction;
    }

    const workerId = parseInt(process.env.VITEST_POOL_ID ?? "1", 10);

    // Worker별 DB 인스턴스 캐싱
    if (!this.workerDBs.has(workerId)) {
      const baseTestConfig = dbConfig.test;
      const connection = baseTestConfig.connection as { database: string };
      const workerDbName = `${connection.database}_${workerId}`;

      const workerConfig = {
        ...baseTestConfig,
        connection: {
          ...connection,
          database: workerDbName,
        },
        pool: { min: 1, max: 1 },
      };

      this.workerDBs.set(workerId, createKnexInstance(workerConfig));
    }

    return this.workerDBs.get(workerId)!;
  }

  getDBConfig(which: DBPreset): Knex.Config {
    const dbConfig = Sonamu.dbConfig;
    if (process.env.NODE_ENV === "test") {
      return {
        ...dbConfig.test,
        // 단일 풀
        pool: {
          min: 1,
          max: 1,
        },
      };
    }
    switch (process.env.NODE_ENV ?? "development") {
      case "development":
      case "staging":
        return which === "w"
          ? dbConfig.development_master
          : (dbConfig.development_slave ?? dbConfig.development_master);
      case "production":
        return which === "w"
          ? dbConfig.production_master
          : (dbConfig.production_slave ?? dbConfig.production_master);
      default:
        throw new Error(`현재 ENV ${process.env.NODE_ENV}에는 설정 가능한 DB설정이 없습니다.`);
    }
  }

  async destroy(): Promise<void> {
    if (this.wdb !== undefined) {
      await this.wdb.destroy();
      this.wdb = undefined;
    }
    if (this.rdb !== undefined) {
      await this.rdb.destroy();
      this.rdb = undefined;
    }
    // 병렬 테스트용 worker DB들도 정리
    for (const db of this.workerDBs.values()) {
      await db.destroy();
    }
    this.workerDBs.clear();
  }

  public generateDBConfig(config: SonamuConfig["database"]): SonamuDBConfig {
    const defaultKnexConfig: Partial<DatabaseConfig> = assign(
      {
        client: "postgresql",
        pool: {
          min: 1,
          max: 5,
        },
        migrations: {
          directory: "./src/migrations",
        },
        connection: {
          database: config.name,
          ...config.defaultOptions?.connection,
        },
      },
      config.defaultOptions,
    );

    // biome-ignore format: 설정 구조 가독성을 위해 여러 줄로 유지
    return {
      // 여기에 나열한 순서대로 Sonamu UI의 DB Migration 탭에 표시됩니다.
      test: mergeConfigs(
        defaultKnexConfig, 
        { connection: { database: `${config.name}_test` } },
        config.environments?.test
      ),
      fixture: mergeConfigs(
        defaultKnexConfig, 
        { connection: { database: `${config.name}_fixture` } },
        config.environments?.fixture,
      ),
      development_master: mergeConfigs(
        defaultKnexConfig, 
        config.environments?.development
      ),
      development_slave: mergeConfigs(
        defaultKnexConfig,
        config.environments?.development,
        config.environments?.development_slave,
      ),
      production_master: mergeConfigs(
        defaultKnexConfig, 
        config.environments?.production
      ),
      production_slave: mergeConfigs(
        defaultKnexConfig,
        config.environments?.production,
        config.environments?.production_slave,
      ),
    };
  }

  // Test 환경에서 트랜잭션 사용
  public testTransaction: Knex.Transaction | null = null;
  async createTestTransaction(): Promise<Knex.Transaction> {
    const db = this.getDB("w");
    this.testTransaction = await db.transaction();
    return this.testTransaction;
  }
  async clearTestTransaction(): Promise<void> {
    await this.testTransaction?.rollback();
    this.testTransaction = null;
  }
  async getTestConnection(): Promise<Knex> {
    const db = this.getDB("w");
    return db;
  }
}
export const DB = new DBClass();
