import { Knex } from "knex";
import { DB, DBPreset } from "../database/db";
import { UpsertBuilder } from "../database/upsert-builder";

export abstract class BaseFrameClass {
  getDB(which: DBPreset): Knex {
    return DB.getDB(which);
  }

  getUpsertBuilder() {
    return new UpsertBuilder();
  }
}
