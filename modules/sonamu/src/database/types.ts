import { Knex } from "knex";
import {
  FileMigrationProviderProps,
  Kysely,
  MysqlDialectConfig,
  SelectQueryBuilder,
} from "kysely";
import { KnexClient } from "./drivers/knex-client";
import { KyselyClient } from "./drivers/kysely-client";
import { PoolOptions } from "mysql2";

export type DBPreset = "w" | "r";
export type DatabaseType = "knex" | "kysely";
export type DatabaseInstance<T extends DatabaseType> = T extends "knex"
  ? Knex
  : Kysely<Database>;
export type ClientType<T extends DatabaseType> = T extends "knex"
  ? KnexClient
  : T extends "kysely"
    ? KyselyClient
    : never;
export type TableName<T extends Database> = T extends "knex"
  ? string
  : keyof Database;

export type QueryBuilder<T extends DatabaseType> = T extends "knex"
  ? Knex.QueryBuilder
  : SelectQueryBuilder<Database, keyof Database, {}>;

export type WhereClause = [string, string, any];
export interface DatabaseClient<T extends DatabaseType> {
  from(table: string): ClientType<T>;
  innerJoin(table: string, k1: string, k2: string): ClientType<T>;
  leftJoin(table: string, k1: string, k2: string): ClientType<T>;
  select(columns: string | string[]): ClientType<T>;
  where(o: WhereClause): ClientType<T>;
  orWhere(o: WhereClause | WhereClause[]): ClientType<T>;
  insert(table: string, data: Record<string, any>): Promise<void>;
  first(): ClientType<T>;
  execute(): Promise<any[]>;

  raw<R>(query: string, bindings?: any[]): Promise<R[]>;
  truncate(table: string): Promise<void>;
  trx<T>(callback: (trx: any) => Promise<T>): Promise<T>;
  destroy(): Promise<void>;

  getMigrations(): Promise<string[]>;
}

//

export type Environment =
  | "development"
  | "development_slave"
  | "production"
  | "production_slave";
type EnvironmentConfigs<T> = {
  [K in Environment]?: Partial<T>;
};

// Knex 설정을 위한 타입
export type KnexConfig = Omit<Knex.Config, "connection"> & {
  connection?: Omit<
    Knex.MySql2ConnectionConfig,
    "database" | "host" | "user" | "password" | "port"
  >;
  database?: Knex.MySql2ConnectionConfig["database"];
  host: Knex.MySql2ConnectionConfig["host"];
  user: Knex.MySql2ConnectionConfig["user"];
  password: Knex.MySql2ConnectionConfig["password"];
  port?: Knex.MySql2ConnectionConfig["port"];
};
export type KnexBaseConfig = {
  client: "knex";
  database: string;
  defaultOptions?: KnexConfig;
  environments?: EnvironmentConfigs<KnexConfig>;
};

// Kysely 설정을 위한 타입
export type KyselyConfig = PoolOptions &
  Pick<MysqlDialectConfig, "onCreateConnection"> & {
    migration?: FileMigrationProviderProps;
  };
export type KyselyBaseConfig = {
  client: "kysely";
  database: string;
  defaultOptions: KyselyConfig;
  environments?: EnvironmentConfigs<KyselyConfig>;
};

export type SonamuDBBaseConfig = KnexBaseConfig | KyselyBaseConfig;
export type SonamuDBFullConfig<T extends KnexConfig | KyselyConfig> = {
  development_master: T;
  development_slave: T;
  test: T;
  fixture_local: T;
  fixture_remote: T;
  production_master: T;
  production_slave: T;
};
export type SonamuKnexDBConfig = SonamuDBFullConfig<KnexConfig>;
export type SonamuKyselyDBConfig = SonamuDBFullConfig<KyselyConfig>;
export type SonamuDBConfig = SonamuKnexDBConfig | SonamuKyselyDBConfig;

export interface DatabaseExtend {}
export type Database = DatabaseExtend & {};
