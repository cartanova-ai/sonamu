import { AsyncLocalStorage } from "async_hooks";
import knex, { type Knex } from "knex";
import { assign } from "radashi";

import { Sonamu } from "../api";
import type { DatabaseConfig, SonamuConfig } from "../api/config";
import { TransactionContext } from "./transaction-context";

export type DBPreset = "w" | "r";

export type SonamuDBConfig = {
  development_master: Knex.Config;
  development_slave: Knex.Config;
  test: Knex.Config;
  fixture_remote: Knex.Config;
  production_master: Knex.Config;
  production_slave: Knex.Config;
};

export class DBClass {
  private wdb?: Knex;
  private rdb?: Knex;

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
      if (this.testTransaction) {
        return this.testTransaction;
      } else if (this.wdb) {
        return this.wdb;
      } else {
        this.wdb = knex({
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
      let config: Knex.Config;
      switch (process.env.NODE_ENV ?? "development") {
        case "development":
        case "staging":
          config =
            which === "w"
              ? dbConfig.development_master
              : (dbConfig.development_slave ?? dbConfig.development_master);
          break;
        case "production":
          config =
            which === "w"
              ? dbConfig.production_master
              : (dbConfig.production_slave ?? dbConfig.production_master);
          break;
        default:
          throw new Error(`현재 ENV ${process.env.NODE_ENV}에는 설정 가능한 DB설정이 없습니다.`);
      }
      this[instanceName] = knex(config);
    }

    return this[instanceName];
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
  }

  public generateDBConfig(config: SonamuConfig["database"]): SonamuDBConfig {
    const defaultKnexConfig: Partial<DatabaseConfig> = assign(
      {
        client: "pg",
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

    // 로컬 환경 설정
    const test: DatabaseConfig = assign(defaultKnexConfig, {
      connection: {
        database: `${config.name}_test`,
        ...config.defaultOptions?.connection,
      },
    });

    // 개발 환경 설정
    const devMasterOptions = config.environments?.development;
    const devSlaveOptions = config.environments?.development_slave;
    const development_master = assign(defaultKnexConfig, devMasterOptions ?? {});
    const development_slave = assign(
      assign(defaultKnexConfig, devMasterOptions ?? {}),
      devSlaveOptions ?? {},
    );
    // NOTE: fixture remote는 default connection의 DB를 override해선 안됨.
    const fixture_remote = assign(
      assign(assign(defaultKnexConfig, devMasterOptions ?? {}), {
        connection: {
          database: `${config.name}_fixture_remote`,
        },
      }),
      config.environments?.remote_fixture ?? {},
    );

    // 프로덕션 환경 설정
    const prodMasterOptions = config.environments?.production ?? {};
    const prodSlaveOptions = config.environments?.production_slave ?? {};
    const production_master = assign(defaultKnexConfig, prodMasterOptions);
    const production_slave = assign(
      assign(defaultKnexConfig, prodMasterOptions),
      prodSlaveOptions ?? {},
    );

    return {
      test,
      fixture_remote,
      development_master,
      development_slave,
      production_master,
      production_slave,
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
