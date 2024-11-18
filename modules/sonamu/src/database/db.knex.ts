import _ from "lodash";
import {
  DBPreset,
  KnexConfig,
  KnexBaseConfig,
  SonamuKnexDBConfig,
} from "./types";
import knex, { Knex } from "knex";
import { KnexClient } from "./drivers/knex-client";
import { DBClass } from "./db.abstract";
import { attachOnDuplicateUpdate } from "./knex-plugins/knex-on-duplicate-update";
import { KnexGenerator } from "./drivers/knex-generator";

export class DBKnexClass extends DBClass {
  public generator: KnexGenerator = new KnexGenerator();
  public baseConfig?: KnexBaseConfig;

  public declare _fullConfig?: SonamuKnexDBConfig;
  set fullConfig(config: SonamuKnexDBConfig) {
    this._fullConfig = config;
  }
  get fullConfig() {
    if (!this._fullConfig) {
      throw new Error("FixtureManager has not been initialized");
    }
    return this._fullConfig;
  }

  private wdb?: Knex;
  get _wdb(): KnexClient {
    return new KnexClient(undefined, this.getDB("w"));
  }
  private rdb?: Knex;
  get _rdb(): KnexClient {
    return new KnexClient(undefined, this.getDB("r"));
  }

  private _tdb: KnexClient | null = null;
  set tdb(tdb: KnexClient) {
    this._tdb = tdb;
  }
  get tdb(): KnexClient {
    if (this._tdb === null) {
      throw new Error("FixtureManager has not been initialized");
    }
    return this._tdb;
  }

  private _fdb: KnexClient | null = null;
  set fdb(fdb: KnexClient) {
    this._fdb = fdb;
  }
  get fdb(): KnexClient {
    if (this._fdb === null) {
      throw new Error("FixtureManager has not been initialized");
    }
    return this._fdb;
  }

  constructor() {
    super();
    attachOnDuplicateUpdate();
  }

  init(config: KnexBaseConfig) {
    this.baseConfig = config;
    this.fullConfig = this.generateDBConfig(config);
  }

  async testInit() {
    if (this._tdb !== null) {
      return;
    }

    if (this.fullConfig.test && this.fullConfig.production_master) {
      const tConn = this.fullConfig.test;
      const pConn = this.fullConfig.production_master;

      if (
        `${tConn.host ?? "localhost"}:${tConn.port ?? 3306}/${
          tConn.database
        }` ===
        `${pConn.host ?? "localhost"}:${pConn.port ?? 3306}/${pConn.database}`
      ) {
        throw new Error(
          `테스트DB와 프로덕션DB에 동일한 데이터베이스가 사용되었습니다.`
        );
      }
    }

    this.tdb = new KnexClient(this.fullConfig.test);
    this.fdb = new KnexClient(this.fullConfig.fixture_local);
  }

  getDB(which: DBPreset) {
    const instanceName = which === "w" ? "wdb" : "rdb";

    if (!this[instanceName]) {
      const _config = this.getCurrentConfig(which) as KnexConfig;
      const { host, user, password, port, database, ...config } = _config;

      this[instanceName] = knex({
        ...config,
        connection: {
          ...config.connection,
          host,
          user,
          password,
          port,
          database,
        },
      });
    }

    return this[instanceName]!;
  }

  getClient(mode: keyof SonamuKnexDBConfig) {
    return new KnexClient(this.fullConfig[mode]);
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

  async testDestroy() {
    if (this._tdb) {
      await this._tdb.destroy();
      this._tdb = null;
    }
    if (this._fdb) {
      await this._fdb.destroy();
      this._fdb = null;
    }
  }

  raw(db: Knex, query: string) {
    return db.raw(query);
  }

  private generateDBConfig(config: KnexBaseConfig): SonamuKnexDBConfig {
    const defaultKnexConfig: KnexConfig = _.merge(
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
        database: config.database,
      },
      config.defaultOptions
    );

    // 로컬 환경 설정
    const test: KnexConfig = _.merge({}, defaultKnexConfig, {
      database: `${config.database}_test`,
    });

    const fixture_local = _.merge({}, defaultKnexConfig, {
      database: `${config.database}_fixture`,
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
      database: `${config.database}_fixture`,
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

  /**
   * keys에 해당하는 설정들을 중복없이 가져옵니다. (host/port/database가 같은 설정은 중복으로 처리합니다.)
   */
  getUniqueConfigs(keys: (keyof SonamuKnexDBConfig)[]) {
    const targets = keys.map((key) => ({
      connKey: key,
      options: this.fullConfig[key as keyof SonamuKnexDBConfig],
    }));

    return _.uniqBy(targets, ({ options }) => {
      const conn = options.connection as Knex.ConnectionConfig & {
        port?: number;
      };

      return `${conn.host ?? "localhost"}:${conn.port ?? 3306}/${
        conn.database
      }`;
    });
  }
}
