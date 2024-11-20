import { Kysely, SelectQueryBuilder } from "kysely";
import { SubsetQuery, isCustomJoinClause } from "../../../types/types";
import { BaseModelClassAbstract } from "../../base-model";
import { DB } from "../../db";
import { DBPreset, Database } from "../../types";
import { KyselyClient } from "./client";
import { UpsertBuilder } from "../../upsert-builder";
import { UndirectedOrderByExpression } from "kysely/dist/cjs/parser/order-by-parser";
import { EntityManager } from "../../../entity/entity-manager";

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

  parseOrderBy(
    orderBy: string
  ): [
    UndirectedOrderByExpression<Database, keyof Database, {}>,
    "asc" | "desc",
  ] {
    const [_column, order] = orderBy.split("-");
    // FIXME: 조인 2개 이상일 때 처리
    const [table, column] = _column.includes(".")
      ? _column.split(".")
      : [this.modelName, _column];

    if (order !== "asc" && order !== "desc") {
      throw new Error("parseOrderBy: Invalid order");
    }
    if (!column) {
      throw new Error("parseOrderBy: Invalid column");
    }

    const entity = EntityManager.get(table);
    if (!entity.props.find((p) => p.name === column)) {
      throw new Error("parseOrderBy: 현재 엔티티에 존재하지 않는 컬럼입니다: ");
    }

    return [
      `${table}.${column}` as unknown as UndirectedOrderByExpression<
        Database,
        keyof Database,
        {}
      >,
      order as "asc" | "desc",
    ];
  }
}
