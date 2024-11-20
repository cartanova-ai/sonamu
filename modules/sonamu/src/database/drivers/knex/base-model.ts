// base-model.knex.ts
import { Knex } from "knex";
import { SubsetQuery, isCustomJoinClause } from "../../../types/types";
import { BaseModelClassAbstract } from "../../base-model";
import { DB } from "../../db";
import { KnexClient } from "./client";
import { DBPreset } from "../../types";
import { UpsertBuilder } from "../../upsert-builder";

export class BaseModelClass extends BaseModelClassAbstract<"knex"> {
  getDB(which: DBPreset): Knex {
    return DB.getDB(which) as Knex;
  }

  async destroy(): Promise<void> {
    return DB.destroy();
  }

  getUpsertBuilder() {
    return new UpsertBuilder<"knex">();
  }

  protected createQueryBuilder(db: Knex, baseTable: string): Knex.QueryBuilder {
    return db.from(baseTable);
  }

  protected applyJoins(
    clonedQb: KnexClient,
    joins: SubsetQuery["joins"]
  ): KnexClient {
    for (const join of joins) {
      if (isCustomJoinClause(join)) {
        if (join.join === "inner") {
          clonedQb.qb = clonedQb.qb.innerJoin(
            `${join.table} as ${join.as}`,
            join.custom as any
          );
        } else {
          clonedQb.qb = clonedQb.qb.leftJoin(
            `${join.table} as ${join.as}`,
            join.custom as any
          );
        }
      } else {
        if (join.join === "inner") {
          clonedQb.innerJoin(`${join.table} as ${join.as}`, join.from, join.to);
        } else if (join.join === "outer") {
          clonedQb.leftJoin(`${join.table} as ${join.as}`, join.from, join.to);
        }
      }
    }
    return clonedQb;
  }

  protected async executeCountQuery(qb: Knex.QueryBuilder): Promise<number> {
    const result = await qb.clear("select").count("* as total").first();
    return Number(result?.total) ?? 0;
  }
}
