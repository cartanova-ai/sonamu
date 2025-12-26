import { getLogger, type Logger } from "@logtape/logtape";
import type { Knex } from "knex";
import type { DBPreset } from "../database/db";
// Static imports kept for non-async functions (getDB, getUpsertBuilder)
import { DB } from "../database/db";
import { UpsertBuilder } from "../database/upsert-builder";
import { asCategory } from "../logger/category";

export abstract class BaseFrameClass {
  protected readonly logger: Logger;

  constructor(public readonly frameName: string = this.constructor.name) {
    this.logger = getLogger(asCategory(this.frameName, "frame"));
  }

  getDB(which: DBPreset): Knex {
    return DB.getDB(which);
  }

  getUpsertBuilder() {
    return new UpsertBuilder();
  }
}
