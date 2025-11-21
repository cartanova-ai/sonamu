import type { Knex } from "knex";
import type { DBPreset } from "../database/db";
// Static imports kept for non-async functions (getDB, getUpsertBuilder)
import { DB } from "../database/db";
import { UpsertBuilder } from "../database/upsert-builder";

export abstract class BaseFrameClass {
  getDB(which: DBPreset): Knex {
    return DB.getDB(which);
  }

  getUpsertBuilder() {
    return new UpsertBuilder();
  }
}
