import path from "path";
import { findApiRootPath } from "../utils/utils";
import { DBKnexClass } from "./drivers/knex/db";
import { DBKyselyClass } from "./drivers/kysely/db";
import { SonamuDBBaseConfig } from "./types";

const dbConfigPath: string = path.join(
  findApiRootPath(),
  "/dist/configs/db.js"
);
const knexfileModule = await import(dbConfigPath);

export const DB = (() => {
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
