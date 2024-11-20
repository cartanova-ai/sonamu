import { Kysely, SelectQueryBuilder } from "kysely";
import { SubsetQuery, isCustomJoinClause } from "../../types/types";
import { BaseModelClassAbstract } from "../base-model";
import { DB } from "../db";
import { DBPreset, Database } from "../types";
import { KyselyClient } from "./kysely-client";
import { UpsertBuilder } from "../upsert-builder";

type TB = keyof Database;

export class BaseModelClass extends BaseModelClassAbstract<"kysely"> {
  constructor() {
    super();
    this._wdb = DB.getDB("w") as unknown as KyselyClient;
    this._rdb = DB.getDB("r") as unknown as KyselyClient;
  }

  getDB(which: DBPreset): Kysely<Database> {
    return DB.getDB(which) as Kysely<Database>;
  }

  async destroy(): Promise<void> {
    return DB.destroy();
  }

  getUpsertBuilder() {
    return new UpsertBuilder<"kysely">();
  }

  protected applyJoins(
    clonedQb: KyselyClient,
    joins: SubsetQuery["joins"]
  ): KyselyClient {
    for (const join of joins) {
      if (isCustomJoinClause(join)) {
        throw new Error("Custom join clause is not supported in Kysely");
      }

      if (join.join === "inner") {
        clonedQb.innerJoin(`${join.table} as ${join.as}`, join.from, join.to);
      } else if (join.join === "outer") {
        clonedQb.leftJoin(`${join.table} as ${join.as}`, join.from, join.to);
      }
    }

    return clonedQb;
  }

  protected async executeCountQuery(
    qb: SelectQueryBuilder<Database, TB, any>
  ): Promise<number> {
    const result = await qb
      .clearSelect()
      .select((eb) => eb.fn.count("id" as any).as("total"))
      .executeTakeFirstOrThrow();
    return Number(result.total);
  }
}
