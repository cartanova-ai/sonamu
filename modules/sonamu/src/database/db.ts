export type DBPreset = "w" | "r";
import knex, { Knex } from "knex";
import path from "path";
import { Sonamu } from "../api";
import { ServiceUnavailableException } from "../exceptions/so-exceptions";

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
      return (knexfileModule.default?.default ??
        knexfileModule.default ??
        knexfileModule) as SonamuDBConfig;
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
}
export const DB = new DBClass();
