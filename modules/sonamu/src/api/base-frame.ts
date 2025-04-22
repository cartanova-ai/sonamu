import { Knex } from "knex";
import { DB } from "../database/db";
import { DBPreset } from "../database/types";
import { UpsertBuilder } from "../database/upsert-builder";

export abstract class BaseFrameClass {
  getDB(which: DBPreset): Knex {
    return DB.getDB(which) as Knex;
  }

  getUpsertBuilder() {
    return new UpsertBuilder<"knex">();
  }
}
