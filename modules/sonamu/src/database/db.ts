import assert from "assert";
import { AsyncLocalStorage } from "async_hooks";

import { type Knex } from "knex";

import { type DatabaseConfig, type SonamuConfig } from "../api/config";
import { getSonamuEnvironment, type EnvironmentSnapshots, type SonamuEnvironment } from "../env";
import { isObjectValue } from "../utils/runtime-value";
import { createKnexInstance } from "./knex";
import { type PuriTransactionWrapper } from "./puri-wrapper";
import { TransactionContext } from "./transaction-context";

function isPlainObject<Value>(value: Value): value is Value & object {
  return isObjectValue(value) && !Array.isArray(value);
}

function mergeRecord<Target extends object, Source extends object>(
  target: Target,
  source: Source,
): Target {
  const targetEntries = new Map(Object.entries(target));

  for (const [key, value] of Object.entries(source)) {
    const currentValue = targetEntries.get(key);
    const mergedValue =
      isPlainObject(currentValue) && isPlainObject(value)
        ? mergeRecord({ ...currentValue }, value)
        : value;
    Object.assign(target, { [key]: mergedValue });
  }

  return target;
}

function mergeConfigs<T extends object>(
  baseConfig: T,
  ...configs: (Partial<T> | undefined | null)[]
): T {
  const merged = { ...baseConfig };

  for (const config of configs) {
    if (config !== undefined && config !== null) {
      mergeRecord(merged, config);
    }
  }

  return merged;
}

export type SonamuMainDBPreset = "test" | "fixture" | SonamuEnvironment;
export type SonamuReadonlyDBPreset =
  | "test_readonly"
  | "development_readonly"
  | "staging_readonly"
  | "production_readonly";
export type SonamuDBPreset = SonamuMainDBPreset | SonamuReadonlyDBPreset;
export type DBPreset = "w" | "r" | SonamuDBPreset;

export type SonamuDBConfig = Record<SonamuDBPreset, Knex.Config>;

function isConcretePreset(value: DBPreset): value is SonamuDBPreset {
  return value !== "w" && value !== "r";
}

function getReadonlyPreset(environment: SonamuEnvironment): SonamuReadonlyDBPreset {
  // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
  return `${environment}_readonly` as SonamuReadonlyDBPreset;
}

function getProjectDatabaseBaseName(projectName?: string): string {
  return (projectName ?? "sonamu")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid database port: ${value}`);
  }

  return parsed;
}

function connectionFromEnv(options: {
  baseName: string;
  suffix: SonamuMainDBPreset;
  baseConnection?: Knex.PgConnectionConfig;
  prefix?: "SONAMU_DB_READONLY" | "SONAMU_DB_FIXTURE";
  env?: NodeJS.ProcessEnv;
}): Knex.PgConnectionConfig {
  const {
    baseName,
    suffix,
    baseConnection = {},
    prefix = "SONAMU_DB",
    env = process.env,
  } = options;
  const read = (key: "HOST" | "PORT" | "USER" | "PASSWORD" | "NAME") => {
    const prefixedValue = env[`${prefix}_${key}`];
    if (prefixedValue !== undefined) {
      return prefixedValue;
    }
    if (prefix === "SONAMU_DB_FIXTURE" && key === "NAME") {
      return undefined;
    }

    return env[`SONAMU_DB_${key}`];
  };

  return {
    ...baseConnection,
    host: read("HOST") ?? baseConnection.host ?? "0.0.0.0",
    port: numberFromEnv(read("PORT"), baseConnection.port ?? 5432),
    user: read("USER") ?? baseConnection.user ?? "postgres",
    password: read("PASSWORD") ?? baseConnection.password,
    database: read("NAME") ?? `${baseName}_${suffix}`,
  };
}

function neutralizeEnvironmentConnectionFields(
  connection: Knex.PgConnectionConfig | undefined,
): Knex.PgConnectionConfig | undefined {
  if (connection === undefined) {
    return undefined;
  }

  const neutralConnection = { ...connection };
  delete neutralConnection.host;
  delete neutralConnection.port;
  delete neutralConnection.user;
  delete neutralConnection.password;
  delete neutralConnection.database;

  return neutralConnection;
}

function assertNoLegacyDatabaseConfig(config: SonamuConfig["database"]): void {
  // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
  const legacyConfig = config as SonamuConfig["database"] & {
    name?: unknown;
    environments?: unknown;
  };

  if (legacyConfig.name !== undefined || legacyConfig.environments !== undefined) {
    throw new Error(
      "Sonamu database.name and database.environments were removed. Use SONAMU_DB_* dotenv variables instead.",
    );
  }
}

export class DBClass {
  private wdb?: Knex;
  private rdb?: Knex;
  private presetDBs: Map<SonamuDBPreset, Knex> = new Map();
  private workerDBs: Map<number, Knex> = new Map();
  private currentConfig: SonamuDBConfig | null = null;

  public transactionStorage = new AsyncLocalStorage<TransactionContext>();

  public runWithTransactionScope<T>(
    preset: DBPreset,
    transaction: PuriTransactionWrapper,
    callback: () => Promise<T>,
  ): Promise<T> {
    const parentContext = this.transactionStorage.getStore();
    const transactionContext = new TransactionContext(parentContext, { preset, transaction });

    return this.transactionStorage.run(transactionContext, async () => {
      try {
        return await callback();
      } finally {
        // detached descendant가 완료된 트랜잭션을 다시 사용하지 않도록 local scope를 비운다.
        transactionContext.clearLocal();
      }
    });
  }

  setConfig(dbConfig: SonamuDBConfig): void {
    this.currentConfig = dbConfig;
  }

  private getCurrentConfig(): SonamuDBConfig {
    if (this.currentConfig === null) {
      throw new Error("Sonamu DB config has not been initialized");
    }

    return this.currentConfig;
  }

  public getTransactionContext(): TransactionContext {
    return this.transactionStorage.getStore() ?? new TransactionContext();
  }

  getDB(which: DBPreset): Knex {
    const dbConfig = this.getCurrentConfig();

    if (isConcretePreset(which)) {
      if (!this.presetDBs.has(which)) {
        this.presetDBs.set(which, createKnexInstance(dbConfig[which]));
      }

      const db = this.presetDBs.get(which);
      assert(db, `DB preset ${which} not found`);
      return db;
    }

    if (getSonamuEnvironment() === "test") {
      if (process.env.SONAMU_WORKER_DB === "true") {
        return this.getWorkerDB(dbConfig);
      }

      if (this.testTransaction) {
        return this.testTransaction;
      } else if (this.wdb) {
        return this.wdb;
      } else {
        this.wdb = createKnexInstance({
          ...dbConfig.test,
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

  private getWorkerDB(dbConfig: SonamuDBConfig): Knex {
    if (this.testTransaction) {
      return this.testTransaction;
    }

    const workerId = parseInt(process.env.VITEST_POOL_ID ?? "1", 10);

    if (!this.workerDBs.has(workerId)) {
      const baseTestConfig = dbConfig.test;
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
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

    const db = this.workerDBs.get(workerId);
    assert(db, `Worker DB ${workerId} not found`);
    return db;
  }

  getDBConfig(which: DBPreset): Knex.Config {
    const dbConfig = this.getCurrentConfig();

    if (isConcretePreset(which)) {
      return dbConfig[which];
    }

    const environment = getSonamuEnvironment();
    if (environment === "test") {
      const target = which === "w" ? dbConfig.test : dbConfig.test_readonly;
      return {
        ...target,
        pool: {
          min: 1,
          max: 1,
        },
      };
    }

    return which === "w" ? dbConfig[environment] : dbConfig[getReadonlyPreset(environment)];
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
    for (const db of this.presetDBs.values()) {
      await db.destroy();
    }
    this.presetDBs.clear();
    for (const db of this.workerDBs.values()) {
      await db.destroy();
    }
    this.workerDBs.clear();
  }

  public generateDBConfig(
    config: SonamuConfig["database"],
    projectName?: string,
    snapshots?: EnvironmentSnapshots,
  ) {
    assertNoLegacyDatabaseConfig(config);

    const baseName = getProjectDatabaseBaseName(projectName);
    const defaultKnexConfig = mergeConfigs<Partial<DatabaseConfig>>(
      {
        client: config.database === "pgnative" ? "pgnative" : "postgresql",
        pool: {
          min: 1,
          max: 5,
        },
        migrations: {
          directory: "./src/migrations",
        },
      },
      config.defaultOptions,
    );
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    const baseConnection = defaultKnexConfig.connection as Knex.PgConnectionConfig | undefined;
    const environmentFallbackConnection = snapshots
      ? neutralizeEnvironmentConnectionFields(baseConnection)
      : baseConnection;

    const envForPreset = (preset: SonamuMainDBPreset): NodeJS.ProcessEnv => {
      if (!snapshots) {
        return process.env;
      }
      if (preset === "fixture") {
        return snapshots.test;
      }
      return snapshots[preset];
    };

    const mainConfig = (preset: SonamuMainDBPreset): Knex.Config =>
      mergeConfigs(defaultKnexConfig, {
        connection: connectionFromEnv({
          baseName,
          suffix: preset,
          baseConnection: environmentFallbackConnection,
          env: envForPreset(preset),
        }),
      });
    const readonlyConfig = (environment: SonamuEnvironment): Knex.Config =>
      mergeConfigs<Knex.Config>(defaultKnexConfig, mainConfig(environment), {
        connection: connectionFromEnv({
          baseName,
          suffix: environment,
          // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
          baseConnection: mainConfig(environment).connection as Knex.PgConnectionConfig,
          prefix: "SONAMU_DB_READONLY",
          env: envForPreset(environment),
        }),
      });

    const test = mainConfig("test");

    return {
      test,
      test_readonly: readonlyConfig("test"),
      fixture: mergeConfigs(defaultKnexConfig, {
        connection: connectionFromEnv({
          baseName,
          suffix: "fixture",
          baseConnection: environmentFallbackConnection,
          prefix: "SONAMU_DB_FIXTURE",
          env: envForPreset("fixture"),
        }),
      }),
      development: mainConfig("development"),
      development_readonly: readonlyConfig("development"),
      staging: mainConfig("staging"),
      staging_readonly: readonlyConfig("staging"),
      production: mainConfig("production"),
      production_readonly: readonlyConfig("production"),
    } satisfies SonamuDBConfig;
  }

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
