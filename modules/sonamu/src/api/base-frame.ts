import { getLogger } from "@logtape/logtape";
import { type Logger } from "@logtape/logtape";
import { type Knex } from "knex";

import { type DBPreset } from "../database/db";
// Static imports kept for non-async functions (getDB, getPuri, getUpsertBuilder)
import { DB } from "../database/db";
import { PuriWrapper } from "../database/puri-wrapper";
import { UpsertBuilder } from "../database/upsert-builder";
import { convertDomainToCategory } from "../logger/category";

export abstract class BaseFrameClass {
  protected readonly logger: Logger;

  constructor(public readonly frameName: string = this.constructor.name) {
    this.logger = getLogger(convertDomainToCategory(this.frameName, "frame"));
  }

  getDB(which: DBPreset): Knex {
    return DB.getDB(which);
  }

  getPuri(which: DBPreset): PuriWrapper {
    // 트랜잭션 컨텍스트에서 트랜잭션 획득
    const trx = DB.getTransactionContext().getTransaction(which);
    if (trx) {
      return trx;
    }

    // 트랜잭션이 없으면 새로운 PuriWrapper 반환
    const db = this.getDB(which);
    return new PuriWrapper(db, new UpsertBuilder());
  }

  getUpsertBuilder() {
    return new UpsertBuilder();
  }
}
