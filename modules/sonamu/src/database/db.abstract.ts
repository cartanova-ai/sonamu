import { Knex } from "knex";
import { Kysely } from "kysely";
import path from "path";
import { KnexClient } from "./drivers/knex/client";
import { KyselyClient } from "./drivers/kysely/client";
import {
  SonamuDBConfig,
  DBPreset,
  Database,
  SonamuDBBaseConfig,
  KnexConfig,
} from "./types";

// db.ts에 포함시킬 경우 순환참조 발생

export abstract class DBClass {
  public _fullConfig?: SonamuDBConfig;
  set fullConfig(config: SonamuDBConfig) {
    this._fullConfig = config;
  }
  get fullConfig() {
    if (!this._fullConfig) {
      throw new Error("FixtureManager has not been initialized");
    }
    return this._fullConfig;
  }

  abstract tdb: KnexClient | KyselyClient;
  abstract fdb: KnexClient | KyselyClient;

  abstract testInit(): Promise<void>;
  abstract getDB(which: DBPreset): Knex | Kysely<Database>;
  abstract destroy(): Promise<void>;
  abstract raw(db: Knex | Kysely<Database>, query: string): any;

  async getBaseConfig(rootPath: string): Promise<SonamuDBBaseConfig> {
    const baseConfigPath = path.join(rootPath, "/dist/configs/db.js");
    const module = await import(baseConfigPath);
    const config = module.default?.default ?? module.default ?? module;
    return config;
  }

  getCurrentConfig(which?: DBPreset) {
    switch (process.env.NODE_ENV ?? "development") {
      case "development":
      case "staging":
        return which === "w"
          ? this.fullConfig["development_master"]
          : this.fullConfig["development_slave"] ??
              this.fullConfig["development_master"];
        break;
      case "production":
        return which === "w"
          ? this.fullConfig["production_master"]
          : this.fullConfig["production_slave"] ??
              this.fullConfig["production_master"];
        break;
      case "test":
        return this.fullConfig["test"];
        break;
      default:
        throw new Error(
          `현재 ENV ${process.env.NODE_ENV}에는 설정 가능한 DB설정이 없습니다.`
        );
    }
  }

  toClient(db: Knex | Kysely<Database>): KnexClient | KyselyClient {
    if (db instanceof Kysely) {
      return new KyselyClient(this.getCurrentConfig(), db);
    } else {
      return new KnexClient(this.getCurrentConfig() as KnexConfig, db);
    }
  }
}
