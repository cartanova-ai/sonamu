import { Knex } from "knex";

export type DBPreset = "w" | "r";
export type DatabaseType = "knex";
export type DatabaseInstance<T extends DatabaseType> = T extends "knex"
  ? Knex
  : never;

export type WhereClause = [string, string, any];

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

export type SonamuDBBaseConfig = KnexBaseConfig;
export type SonamuDBFullConfig<T extends KnexConfig> = {
  development_master: T;
  development_slave: T;
  test: T;
  fixture_local: T;
  fixture_remote: T;
  production_master: T;
  production_slave: T;
};

export type SonamuDBConfig = SonamuDBFullConfig<KnexConfig>;

export interface DatabaseExtend {}
export type Database = DatabaseExtend & {};
