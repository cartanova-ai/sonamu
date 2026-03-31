import { createAdapterFactory } from "better-auth/adapters";
import type { Knex } from "knex";
import { DB } from "../database/db";

/**
 * better-auth용 Sonamu knex 어댑터
 *
 * better-auth의 모든 쿼리를 DB.getDB()를 통해 실행하여
 * Sonamu 테스트 트랜잭션과 동일한 커넥션을 공유합니다.
 */
export const sonamuKnexAdapter = () =>
  createAdapterFactory({
    config: {
      adapterId: "sonamu-knex",
      adapterName: "Sonamu Knex Adapter",
      usePlural: false,
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      supportsNumericIds: false,
    },
    adapter: () => ({
      create: async ({ model, data }) => {
        const db = DB.getDB("w");
        const [row] = await db(model).insert(data).returning("*");
        return row;
      },

      findOne: async ({ model, where }) => {
        const db = DB.getDB("w");
        let query = db(model);
        query = applyWhere(query, where);
        const row = await query.first();
        return row ?? null;
      },

      findMany: async ({ model, where, limit, offset, sortBy }) => {
        const db = DB.getDB("w");
        let query = db(model);
        if (where) {
          query = applyWhere(query, where);
        }
        if (sortBy) {
          query = query.orderBy(sortBy.field, sortBy.direction);
        }
        if (limit) {
          query = query.limit(limit);
        }
        if (offset) {
          query = query.offset(offset);
        }
        return await query;
      },

      update: async ({ model, where, update }) => {
        const db = DB.getDB("w");
        let query = db(model);
        query = applyWhere(query, where);
        const [row] = await query.update(update).returning("*");
        return row ?? null;
      },

      updateMany: async ({ model, where, update }) => {
        const db = DB.getDB("w");
        let query = db(model);
        query = applyWhere(query, where);
        const count = await query.update(update);
        return count;
      },

      delete: async ({ model, where }) => {
        const db = DB.getDB("w");
        let query = db(model);
        query = applyWhere(query, where);
        await query.del();
      },

      deleteMany: async ({ model, where }) => {
        const db = DB.getDB("w");
        let query = db(model);
        query = applyWhere(query, where);
        const count = await query.del();
        return count;
      },

      count: async ({ model, where }) => {
        const db = DB.getDB("w");
        let query = db(model);
        if (where) {
          query = applyWhere(query, where);
        }
        const [{ count }] = await query.count("* as count");
        return Number(count);
      },
    }),
  });

interface CleanedWhere {
  field: string;
  value: string | number | boolean | string[] | number[] | Date | null;
  operator: string;
  connector: string;
}

function applyWhere(query: Knex.QueryBuilder, conditions: CleanedWhere[]): Knex.QueryBuilder {
  for (const condition of conditions) {
    const { field, value, operator, connector } = condition;
    const method = connector === "OR" ? "orWhere" : "where";

    switch (operator) {
      case "eq":
        if (value === null) {
          query = query[method === "orWhere" ? "orWhereNull" : "whereNull"](field);
        } else {
          query = query[method](field, "=", value);
        }
        break;
      case "ne":
        if (value === null) {
          query = query[method === "orWhere" ? "orWhereNotNull" : "whereNotNull"](field);
        } else {
          query = query[method](field, "!=", value);
        }
        break;
      case "lt":
        query = query[method](field, "<", value);
        break;
      case "lte":
        query = query[method](field, "<=", value);
        break;
      case "gt":
        query = query[method](field, ">", value);
        break;
      case "gte":
        query = query[method](field, ">=", value);
        break;
      case "in":
        query = query[method === "orWhere" ? "orWhereIn" : "whereIn"](
          field,
          value as (string | number)[],
        );
        break;
      case "not_in":
        query = query[method === "orWhere" ? "orWhereNotIn" : "whereNotIn"](
          field,
          value as (string | number)[],
        );
        break;
      case "contains":
        query = query[method](field, "like", `%${value}%`);
        break;
      case "starts_with":
        query = query[method](field, "like", `${value}%`);
        break;
      case "ends_with":
        query = query[method](field, "like", `%${value}`);
        break;
    }
  }
  return query;
}
