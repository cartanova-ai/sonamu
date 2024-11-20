import { Knex } from "knex";
import {
  FileMigrationProviderProps,
  Kysely,
  MysqlDialectConfig,
  ReferenceExpression,
  SelectQueryBuilder,
} from "kysely";
import { KnexClient } from "./drivers/knex/client";
import { KyselyClient } from "./drivers/kysely/client";
import { PoolOptions } from "mysql2";

export type DBPreset = "w" | "r";

export type DatabaseDriver = keyof DriverSpec;
/**
 * core: 실제 데이터베이스 라이브러리 인스턴스
 * adapter: Sonamu의 래퍼 클라이언트 구현체
 * queryBuilder: 쿼리빌더 인스턴스
 * table/column: 테이블과 컬럼 타입 정보
 */
export interface DriverSpec {
  knex: {
    core: Knex;
    adapter: KnexClient;
    queryBuilder: Knex.QueryBuilder;
    table: string;
    column: string;
  };
  kysely: {
    core: Kysely<Database>;
    adapter: KyselyClient;
    queryBuilder: SelectQueryBuilder<Database, keyof Database, {}>;
    table: keyof Database;
    column: ReferenceExpression<Database, keyof Database>;
  };
}

export type WhereClause = [string, string, any];

export interface DatabaseClient<T extends DatabaseDriver> {
  from(table: string): DriverSpec[T]["adapter"];
  innerJoin(table: string, k1: string, k2: string): DriverSpec[T]["adapter"];
  leftJoin(table: string, k1: string, k2: string): DriverSpec[T]["adapter"];
  select(columns: string | string[]): DriverSpec[T]["adapter"];
  where(o: WhereClause): DriverSpec[T]["adapter"];
  orWhere(o: WhereClause | WhereClause[]): DriverSpec[T]["adapter"];
  insert(table: string, data: Record<string, any>): Promise<void>;
  first(): DriverSpec[T]["adapter"];
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
export type KnexConfig = Knex.Config & {
  connection: Knex.MySql2ConnectionConfig & {
    user: string;
    password: string;
    database?: string;
  };
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
  types?: {
    enabled?: boolean; // 인터페이스 자동 생성 활성화 (기본값: true)
    outDir?: string; // 생성될 파일 경로 (기본값: src/typings)
    fileName?: string; // 생성될 파일명 (기본값: database.types.ts)
  };
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
