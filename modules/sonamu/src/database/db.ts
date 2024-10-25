export type DBPreset = "w" | "r";
import knex, { Knex } from "knex";
import path from "path";
import _ from "lodash";
import { Sonamu } from "../api";
import { ServiceUnavailableException } from "../exceptions/so-exceptions";

type MySQLConfig = Omit<Knex.Config, "connection"> & {
  connection?: Knex.MySql2ConnectionConfig;
};

export type SonamuDBBaseConfig = {
  // 기본 데이터베이스 이름
  database: string;

  // 모든 환경에 적용될 기본 Knex 옵션
  defaultOptions?: MySQLConfig;

  // 환경별 설정
  environments?: {
    development?: MySQLConfig;
    development_slave?: MySQLConfig;
    production?: MySQLConfig;
    production_slave?: MySQLConfig;
  };
};

export type SonamuDBConfig = {
  development_master: Knex.Config;
  development_slave: Knex.Config;
  test: Knex.Config;
  fixture_local: Knex.Config;
  fixture_remote: Knex.Config;
  production_master: Knex.Config;
  production_slave: Knex.Config;
};

class DBClass {
  private wdb?: Knex;
  private rdb?: Knex;

  async readKnexfile(): Promise<SonamuDBConfig> {
    const dbConfigPath: string = path.join(
      Sonamu.apiRootPath,
      "/dist/configs/db.js"
    );
    try {
      const knexfileModule = await import(dbConfigPath);
      const config =
        knexfileModule.default?.default ??
        knexfileModule.default ??
        knexfileModule;
      return this.generateDBConfig(config);
    } catch {}

    throw new ServiceUnavailableException(
      `DB설정 파일을 찾을 수 없습니다. ${dbConfigPath}`
    );
  }

  getDB(which: DBPreset): Knex {
    const dbConfig = Sonamu.dbConfig;

    const instanceName = which === "w" ? "wdb" : "rdb";

    if (!this[instanceName]) {
      let config: Knex.Config;
      switch (process.env.NODE_ENV ?? "development") {
        case "development":
        case "staging":
          config =
            which === "w"
              ? dbConfig["development_master"]
              : dbConfig["development_slave"] ?? dbConfig["development_master"];
          break;
        case "production":
          config =
            which === "w"
              ? dbConfig["production_master"]
              : dbConfig["production_slave"] ?? dbConfig["production_master"];
          break;
        case "test":
          config = dbConfig["test"];
          break;
        default:
          throw new Error(
            `현재 ENV ${process.env.NODE_ENV}에는 설정 가능한 DB설정이 없습니다.`
          );
      }
      this[instanceName] = knex(config);
    }

    return this[instanceName]!;
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

  private generateDBConfig(config: SonamuDBBaseConfig): SonamuDBConfig {
    const defaultKnexConfig: Partial<MySQLConfig> = _.merge(
      {
        client: "mysql2",
        pool: {
          min: 1,
          max: 5,
        },
        migrations: {
          extension: "js",
          directory: "./dist/migrations",
        },
        connection: {
          database: config.database,
        },
      },
      config.defaultOptions
    );

    // 로컬 환경 설정
    const test: MySQLConfig = _.merge({}, defaultKnexConfig, {
      connection: {
        database: `${config.database}_test`,
      },
    });

    const fixture_local = _.merge({}, defaultKnexConfig, {
      connection: {
        database: `${config.database}_fixture_local`,
      },
    });

    // 개발 환경 설정
    const devMasterOptions = config.environments?.development;
    const devSlaveOptions = config.environments?.development_slave;
    const development_master = _.merge({}, defaultKnexConfig, devMasterOptions);
    const development_slave = _.merge(
      {},
      defaultKnexConfig,
      devMasterOptions,
      devSlaveOptions
    );
    const fixture_remote = _.merge({}, defaultKnexConfig, devMasterOptions, {
      connection: {
        database: `${config.database}_fixture_remote`,
      },
    });

    // 프로덕션 환경 설정
    const prodMasterOptions = config.environments?.production ?? {};
    const prodSlaveOptions = config.environments?.production_slave ?? {};
    const production_master = _.merge({}, defaultKnexConfig, prodMasterOptions);
    const production_slave = _.merge(
      {},
      defaultKnexConfig,
      prodMasterOptions,
      prodSlaveOptions
    );

    return {
      test,
      fixture_local,
      fixture_remote,
      development_master,
      development_slave,
      production_master,
      production_slave,
    };
  }
}
export const DB = new DBClass();
