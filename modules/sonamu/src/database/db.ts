export type DBPreset = "w" | "r";
import knex, { Knex } from "knex";
import path from "path";
import { ServiceUnavailableException } from "../exceptions/so-exceptions";
import { findAppRootPath } from "../utils/utils";

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
  private knexfile?: SonamuDBConfig;

  async readKnexfile(_appRootPath?: string): Promise<SonamuDBConfig> {
    if (this.knexfile) {
      return this.knexfile;
    }

    const appRootPath = _appRootPath ?? (await findAppRootPath());
    const configPath: string = path.join(appRootPath, "/api/dist/configs/db");
    try {
      const knexfileModule = await import(configPath);
      this.knexfile = knexfileModule.default as SonamuDBConfig;
      return this.knexfile;
    } catch {}

    throw new ServiceUnavailableException(
      `DB설정 파일을 찾을 수 없습니다. ${configPath}`
    );
  }

  getKnexfile(): SonamuDBConfig {
    if (this.knexfile) {
      return this.knexfile;
    }

    throw new ServiceUnavailableException("DB설정이 로드되지 않았습니다.");
  }

  getDB(which: DBPreset): Knex {
    const knexfile = this.getKnexfile();

    const instanceName = which === "w" ? "wdb" : "rdb";

    if (!this[instanceName]) {
      let config: Knex.Config;
      switch (process.env.NODE_ENV ?? "development") {
        case "development":
        case "staging":
          config =
            which === "w"
              ? knexfile["development_master"]
              : knexfile["development_slave"] ?? knexfile["development_master"];
          break;
        case "production":
          config =
            which === "w"
              ? knexfile["production_master"]
              : knexfile["production_slave"] ?? knexfile["production_master"];
          break;
        case "test":
          config = knexfile["test"];
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
