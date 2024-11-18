import { SonamuDBBaseConfig } from "./types";
import { DBKnexClass } from "./db.knex";
import path from "path";
import { DBKyselyClass } from "./db.kysely";
import { findApiRootPath } from "../utils/utils";

export const DB = (() => {
  const dbConfigPath: string = path.join(
    findApiRootPath(),
    "/dist/configs/db.js"
  );
  const knexfileModule = require(dbConfigPath);
  const config = (knexfileModule.default?.default ??
    knexfileModule.default ??
    knexfileModule) as SonamuDBBaseConfig;
  if (config.client === "knex") {
    return new DBKnexClass();
  } else if (config.client === "kysely") {
    return new DBKyselyClass();
  }
  throw new Error("지원하지 않는 DB 클라이언트입니다.");
})();
