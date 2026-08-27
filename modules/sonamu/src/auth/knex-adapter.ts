import { type BetterAuthOptions } from "better-auth";
import {
  type AdapterFactoryCustomizeAdapterCreator,
  type DBTransactionAdapter,
} from "better-auth/adapters";
import { createAdapterFactory } from "better-auth/adapters";
import { type Knex } from "knex";

import { DB } from "../database/db";

interface CleanedWhere {
  field: string;
  value: string | number | boolean | string[] | number[] | Date | null;
  operator: string;
  connector: string;
}

/**
 * better-auth용 Sonamu knex 어댑터
 *
 * better-auth의 모든 쿼리를 DB.getDB()를 통해 실행하여
 * Sonamu 테스트 트랜잭션과 동일한 커넥션을 공유합니다.
 */
export const sonamuKnexAdapter = () => {
  let lazyOptions: BetterAuthOptions | null = null;

  const createCustomAdapter = (
    getDb: () => Knex | Knex.Transaction,
  ): AdapterFactoryCustomizeAdapterCreator => {
    return ({ getFieldName }) => ({
      create: async ({ model, data }) => {
        const [row] = await getDb()(model).insert(data).returning("*");
        return row;
      },

      findOne: async ({ model, where }) => {
        let query = getDb()(model);
        query = applyWhere(query, where);
        const row = await query.first();
        return row ?? null;
      },

      findMany: async ({ model, where, limit, offset, sortBy }) => {
        let query = getDb()(model);
        if (where) {
          query = applyWhere(query, where);
        }
        if (sortBy) {
          const dbField = getFieldName({ model, field: sortBy.field });
          query = query.orderBy(dbField, sortBy.direction);
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
        let query = getDb()(model);
        query = applyWhere(query, where);
        const [row] = await query.update(update).returning("*");
        return row ?? null;
      },

      updateMany: async ({ model, where, update }) => {
        let query = getDb()(model);
        query = applyWhere(query, where);
        const count = await query.update(update);
        return count;
      },

      delete: async ({ model, where }) => {
        let query = getDb()(model);
        query = applyWhere(query, where);
        await query.del();
      },

      deleteMany: async ({ model, where }) => {
        let query = getDb()(model);
        query = applyWhere(query, where);
        const count = await query.del();
        return count;
      },

      count: async ({ model, where }) => {
        let query = getDb()(model);
        if (where) {
          query = applyWhere(query, where);
        }
        const [{ count }] = await query.count("* as count");
        return Number(count);
      },
    });
  };

  const adapterConfig = {
    adapterId: "sonamu-knex",
    adapterName: "Sonamu Knex Adapter",
    usePlural: false,
    supportsJSON: true,
    supportsDates: true,
    supportsBooleans: true,
    supportsNumericIds: false,
    transaction: async <R>(cb: (trx: DBTransactionAdapter) => Promise<R>): Promise<R> => {
      const db = DB.getDB("w");
      return db.transaction(async (trx) => {
        const options = lazyOptions;
        if (!options) {
          throw new Error("sonamuKnexAdapter: options not initialized");
        }
        return cb(
          createAdapterFactory({
            config: adapterConfig,
            adapter: createCustomAdapter(() => trx),
          })(options),
        );
      });
    },
  };

  const adapterCreator = createAdapterFactory({
    config: adapterConfig,
    adapter: createCustomAdapter(() => DB.getDB("w")),
  });

  return (options: BetterAuthOptions) => {
    lazyOptions = options;
    return adapterCreator(options);
  };
};

/**
 * Better Auth의 공식 어댑터(Kysely, Drizzle, Prisma, MongoDB) 패턴에 맞춰
 * AND 그룹과 OR 그룹을 분리한 뒤 top-level AND로 결합합니다.
 * 결과: (A AND B AND ...) AND (C OR D OR ...)
 */
export function applyWhere(
  query: Knex.QueryBuilder,
  conditions: CleanedWhere[],
): Knex.QueryBuilder {
  const andGroup = conditions.filter((c) => c.connector !== "OR");
  const orGroup = conditions.filter((c) => c.connector === "OR");

  if (andGroup.length > 0) {
    for (const condition of andGroup) {
      query = applyCondition(query, condition, "where");
    }
  }

  if (orGroup.length > 0) {
    query = query.where(function (this: Knex.QueryBuilder) {
      for (let i = 0; i < orGroup.length; i++) {
        applyCondition(this, orGroup[i], i === 0 ? "where" : "orWhere");
      }
    });
  }

  return query;
}

function applyCondition(
  query: Knex.QueryBuilder,
  condition: CleanedWhere,
  method: "where" | "orWhere",
): Knex.QueryBuilder {
  const { field, value, operator } = condition;

  switch (operator) {
    case "eq":
      if (value === null) {
        return query[method === "orWhere" ? "orWhereNull" : "whereNull"](field);
      }
      return query[method](field, "=", value);
    case "ne":
      if (value === null) {
        return query[method === "orWhere" ? "orWhereNotNull" : "whereNotNull"](field);
      }
      return query[method](field, "!=", value);
    case "lt":
      return query[method](field, "<", value);
    case "lte":
      return query[method](field, "<=", value);
    case "gt":
      return query[method](field, ">", value);
    case "gte":
      return query[method](field, ">=", value);
    case "in":
      return query[method === "orWhere" ? "orWhereIn" : "whereIn"](
        field,
        /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ value as (
          | string
          | number
        )[],
      );
    case "not_in":
      return query[method === "orWhere" ? "orWhereNotIn" : "whereNotIn"](
        field,
        /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ value as (
          | string
          | number
        )[],
      );
    case "contains":
      return query[method](field, "like", `%${value}%`);
    case "starts_with":
      return query[method](field, "like", `${value}%`);
    case "ends_with":
      return query[method](field, "like", `%${value}`);
    default:
      return query;
  }
}
