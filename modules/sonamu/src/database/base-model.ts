import assert from "assert";
import inflection from "inflection";
import type { Knex } from "knex";
import { group, isObject, omit, set, unique } from "radashi";
import { type DatabaseSchemaExtend, isCustomJoinClause, type SubsetQuery } from "../types/types";
import type { BaseListParams } from "../utils/model";
import { chunk } from "../utils/utils";
import type { DBPreset } from "./db";
import { DB } from "./db";
import { Puri } from "./puri";
import type {
  InferAllSubsets,
  PuriLoaderQueries,
  PuriSubsetFn,
  UnionExtractedTTables,
} from "./puri.types";
import { PuriWrapper } from "./puri-wrapper";
import { UpsertBuilder } from "./upsert-builder";

type UnknownDBRecord = Record<string, unknown>;

// Puri에서 Tables 추출
type GetTables<T> = T extends Puri<any, infer TTables, any> ? TTables : never;

// 두 Puri의 테이블 교집합을 가진 새로운 Puri 생성
type MergePuri<A, B> = Puri<
  DatabaseSchemaExtend,
  Pick<GetTables<A>, Extract<keyof GetTables<A>, keyof GetTables<B>>>,
  any
>;

// 서브셋 키 배열을 순회하며 교집합 Puri 계산
type ResolveIntersection<
  Keys extends readonly string[],
  Queries extends Record<string, (...args: any) => any>,
> = Keys extends [infer Head extends string, ...infer Tail extends string[]]
  ? Tail extends []
    ? ReturnType<Queries[Head]>
    : MergePuri<ReturnType<Queries[Head]>, ResolveIntersection<Tail, Queries>>
  : never;

type EnhancerFn<TComputed, TMapping> = (row: TComputed) => TMapping | Promise<TMapping>;

type RequiredEnhancerKeys<
  TSubsetKey extends string,
  TComputedResults extends Record<TSubsetKey, any>,
  TSubsetMapping extends Record<TSubsetKey, any>,
> = keyof {
  [K in TSubsetKey as TComputedResults[K] extends TSubsetMapping[K] ? never : K]: unknown;
};

/**
 * TSubsetKey 전체에 대해,
 * - TComputedResults[K] 가 TSubsetMapping[K] 에 assignable 이면 → enhancer 옵셔널
 * - 아니면 → enhancer 필수
 */
type EnhancerPlaceholder<
  TSubsetKey extends string,
  TComputedResults extends Record<TSubsetKey, any>,
  TSubsetMapping extends Record<TSubsetKey, any>,
> = {
  // TComputedResults[K]가 이미 TSubsetMapping[K]에 들어맞으면 옵셔널
  [K in TSubsetKey as TComputedResults[K] extends TSubsetMapping[K] ? K : never]?: EnhancerFn<
    TComputedResults[K],
    TSubsetMapping[K]
  >;
} & {
  // 안 맞으면 필수
  [K in TSubsetKey as TComputedResults[K] extends TSubsetMapping[K] ? never : K]: EnhancerFn<
    TComputedResults[K],
    TSubsetMapping[K]
  >;
};

export class BaseModelClass<
  TSubsetKey extends string = never,
  TSubsetMapping extends Record<string, any> = never,
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn> = never,
  TLoaderQueries extends PuriLoaderQueries<TSubsetKey> = never,
> {
  public modelName: string = "Unknown";

  constructor(
    protected puriSubsetQueries?: TSubsetQueries,
    protected subsetLoaders?: TLoaderQueries,
  ) {}

  /* DB 인스턴스 get, destroy */
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
    return new PuriWrapper(db, this.getUpsertBuilder());
  }

  async destroy() {
    return DB.destroy();
  }

  async getInsertedIds(
    wdb: Knex,
    rows: UnknownDBRecord[],
    tableName: string,
    unqKeyFields: string[],
    chunkSize: number = 500,
  ) {
    if (!wdb) {
      wdb = this.getDB("w");
    }

    let unqKeys: string[];
    let whereInField: string | Knex.Raw, selectField: string;
    if (unqKeyFields.length > 1) {
      whereInField = wdb.raw(`CONCAT_WS('_', '${unqKeyFields.join(",")}')`);
      selectField = `${whereInField} as tmpUid`;
      unqKeys = rows.map((row) => unqKeyFields.map((field) => row[field]).join("_"));
    } else {
      whereInField = unqKeyFields[0];
      selectField = unqKeyFields[0];
      unqKeys = rows.map((row) => row[unqKeyFields[0]] as string);
    }

    let resultIds: number[] = [];
    for (const items of chunk(unqKeys, chunkSize)) {
      const dbRows = await wdb(tableName)
        .select("id", wdb.raw(selectField))
        .whereIn(whereInField as string, items);
      resultIds = resultIds.concat(
        dbRows.map((dbRow: UnknownDBRecord) => parseInt(String(dbRow.id))),
      );
    }

    return resultIds;
  }

  getSubsetQueries<T extends TSubsetKey>(subset: T) {
    if (!this.puriSubsetQueries) {
      throw new Error("puriSubsetQueries is not defined");
    }

    const puriWrapper = new PuriWrapper(this.getDB("r"), new UpsertBuilder());
    const qb = this.puriSubsetQueries[subset]?.(puriWrapper);

    return {
      qb: qb as unknown as Puri<
        DatabaseSchemaExtend,
        UnionExtractedTTables<TSubsetKey, TSubsetQueries> & {
          NonAllowedAsSingleTable: { __fulltext__: true };
        },
        {}
      >,
      onSubset: ((_subset: TSubsetKey | readonly TSubsetKey[]) => qb) as {
        // 단일 키
        <S extends TSubsetKey>(subset: S): ReturnType<TSubsetQueries[S]>;

        // 키 배열 -> 교집합 반환
        <Arr extends readonly TSubsetKey[]>(
          subsets: [...Arr],
        ): ResolveIntersection<Arr, TSubsetQueries>;
      },
    };
  }

  // 헬퍼 메서드: 타입 검증 및 추론을 도와줌
  createEnhancers<T extends TSubsetKey>(
    enhancers: EnhancerPlaceholder<
      T,
      InferAllSubsets<TSubsetQueries, TLoaderQueries>,
      TSubsetMapping
    >,
  ) {
    return enhancers;
  }

  async executeSubsetQuery<
    T extends TSubsetKey,
    TComputedResults extends InferAllSubsets<TSubsetQueries, TLoaderQueries>,
  >({
    subset,
    qb,
    params,
    enhancers,
    debug = false,
  }: {
    subset: T;
    qb: Puri<any, any, any>;
    params: {
      num?: number;
      page?: number;
      queryMode?: "list" | "count" | "both";
    };
    debug?: boolean;
  } & ([RequiredEnhancerKeys<TSubsetKey, TComputedResults, TSubsetMapping>] extends [never]
    ? {
        enhancers?: EnhancerPlaceholder<TSubsetKey, TComputedResults, TSubsetMapping>;
      }
    : {
        enhancers: EnhancerPlaceholder<TSubsetKey, TComputedResults, TSubsetMapping>;
      })): Promise<{
    rows: TSubsetMapping[T][];
    total: number;
  }> {
    if (!this.subsetLoaders) {
      throw new Error("subsetLoaders is not defined");
    }

    if (!params.num || !params.page) {
      throw new Error("num and page are required");
    }

    const { num, page } = params;

    const total = await (async () => {
      if (params.queryMode === "list") {
        return 0;
      }

      const countPuri = qb.clone().clear("order").clear("limit").clear("offset");

      // COUNT(*)로 전체 레코드 수를 계산
      // TODO: qb의 DISTINCT가 있는 경우 처리해야 함
      const countResult: { total?: number } = await countPuri
        .clear("select")
        .select({
          total: Puri.rawNumber(`COUNT(*)`),
        })
        .first();

      if (debug) {
        countPuri.debug();
      }

      return countResult?.total ?? 0;
    })();

    const computedRows = await (async () => {
      if (params.queryMode === "count") {
        return [];
      }

      let unloadedRows = (await qb.limit(num).offset(num * (page - 1))) as any[];

      if (debug) {
        qb.debug();
      }

      // 재귀적으로 loader를 처리하는 헬퍼 함수
      const processLoaders = async (rows: any[], loaders: any[]): Promise<any[]> => {
        for (const resolveLoader of loaders) {
          const { as, refId, qb: resolveLoaderQbFn, loaders: nestedLoaders } = resolveLoader;

          const resolveLoaderQb = resolveLoaderQbFn(
            new PuriWrapper(this.getDB("r"), new UpsertBuilder()),
            rows.map((row) => row[refId]),
          );

          if (debug) {
            resolveLoaderQb.debug();
          }

          let loadedRows = (await resolveLoaderQb) as any[];

          // 중첩 loaders가 있으면 재귀 처리
          if (nestedLoaders && nestedLoaders.length > 0) {
            loadedRows = await processLoaders(loadedRows, nestedLoaders);
          }

          const subRowGroups = group(loadedRows, (row) => row.refId);

          rows = rows.map((row) => {
            row[as] = (subRowGroups[row[refId]] ?? []).map((r) => omit(r, ["refId"]));
            return row;
          });
        }
        return rows;
      };

      const loaders = (this.subsetLoaders as any)[subset];
      if (loaders && Array.isArray(loaders)) {
        unloadedRows = await processLoaders(unloadedRows, loaders);
      }

      return this.hydrate(unloadedRows) as TComputedResults[T][];
    })();

    // Enhancer 적용
    const enhancer = (enhancers as any)?.[subset];
    const rows = (await Promise.all(
      computedRows.map((row) => enhancer?.(row) ?? row),
    )) as TSubsetMapping[T][];

    return { rows, total };
  }

  async useLoaders(db: Knex, rows: UnknownDBRecord[], loaders: SubsetQuery["loaders"]) {
    if (loaders.length === 0) {
      return rows;
    }

    for (const loader of loaders) {
      let subQ: Knex.QueryBuilder;
      let subRows: UnknownDBRecord[];
      let toCol: string;

      const fromIds = rows.map((row) => row[loader.manyJoin.idField]);

      if (loader.manyJoin.through === undefined) {
        // HasMany
        const idColumn = `${loader.manyJoin.toTable}.${loader.manyJoin.toCol}`;
        subQ = db(loader.manyJoin.toTable)
          .whereIn(idColumn as string, fromIds as string[])
          .select([...loader.select, idColumn]);

        // HasMany에서 OneJoin이 있는 경우
        loader.oneJoins.forEach((join) => {
          if (join.join === "inner") {
            subQ.innerJoin(`${join.table} as ${join.as}`, this.getJoinClause(db, join));
          } else if (join.join === "outer") {
            subQ.leftOuterJoin(`${join.table} as ${join.as}`, this.getJoinClause(db, join));
          }
        });
        toCol = loader.manyJoin.toCol;
      } else {
        // ManyToMany
        const idColumn = `${loader.manyJoin.through.table}.${loader.manyJoin.through.fromCol}`;
        subQ = db(loader.manyJoin.through.table)
          .join(
            loader.manyJoin.toTable,
            `${loader.manyJoin.through.table}.${loader.manyJoin.through.toCol}`,
            `${loader.manyJoin.toTable}.${loader.manyJoin.toCol}`,
          )
          .whereIn(idColumn as string, fromIds as string[])
          .select(unique([...loader.select, idColumn]));

        // ManyToMany에서 OneJoin이 있는 경우
        loader.oneJoins.forEach((join) => {
          if (join.join === "inner") {
            subQ.innerJoin(`${join.table} as ${join.as}`, this.getJoinClause(db, join));
          } else if (join.join === "outer") {
            subQ.leftOuterJoin(`${join.table} as ${join.as}`, this.getJoinClause(db, join));
          }
        });
        toCol = loader.manyJoin.through.fromCol;
      }
      subRows = await subQ;

      if (loader.loaders) {
        // 추가 -Many 케이스가 있는 경우 recursion 처리
        subRows = await this.useLoaders(db, subRows, loader.loaders);
      }

      // 불러온 row들을 참조ID 기준으로 분류 배치
      const subRowGroups = group(subRows, (row) => row[toCol] as string);
      rows = rows.map((row) => {
        row[loader.as] = (subRowGroups[row[loader.manyJoin.idField] as string] ?? []).map((r) =>
          omit(r, [toCol]),
        );
        return row;
      });
    }
    return rows;
  }

  hydrate<T extends UnknownDBRecord>(rows: T[]): T[] {
    return rows.map((row: T) => {
      // nullable relation인 경우 관련된 필드가 전부 null로 생성되는 것 방지하는 코드
      const nestedKeys = Object.keys(row).filter((key) => key.includes("__"));
      const groups = Object.groupBy(nestedKeys, (key) => key.split("__")[0]);
      const nullKeys = Object.entries(groups)
        .filter(
          ([_, data]) =>
            data &&
            data.length > 1 &&
            data.every(
              (field) =>
                row[field] === null || (Array.isArray(row[field]) && row[field].length === 0),
            ),
        )
        .map(([key]) => key);

      const hydrated = Object.keys(row).reduce((r, field) => {
        if (!field.includes("__")) {
          if (Array.isArray(row[field]) && isObject(row[field][0])) {
            r[field] = this.hydrate(row[field]);
            return r;
          } else {
            r[field] = row[field];
            return r;
          }
        }

        const parts = field.split("__");
        const objPath =
          parts[0] +
          parts
            .slice(1)
            .map((part) => `[${part}]`)
            .join("");
        r = set(
          r,
          objPath,
          row[field] && Array.isArray(row[field]) && isObject(row[field][0])
            ? this.hydrate(row[field])
            : row[field],
        );

        return r;
      }, {} as UnknownDBRecord);
      nullKeys.forEach((nullKey) => {
        hydrated[nullKey] = null;
      });

      return hydrated;
    }) as T[];
  }

  async runSubsetQuery<T extends BaseListParams, U extends string>({
    params,
    baseTable,
    subset,
    subsetQuery,
    build,
    afterBuild,
    debug,
    db: _db,
    optimizeCountQuery,
  }: {
    subset: U;
    params: T;
    subsetQuery: SubsetQuery;
    build: (buildParams: {
      qb: Knex.QueryBuilder;
      db: Knex;
      select: (string | Knex.Raw)[];
      joins: SubsetQuery["joins"];
      virtual: string[];
    }) => Knex.QueryBuilder;
    afterBuild?: (buildParams: {
      qb: Knex.QueryBuilder;
      db: Knex;
      select: (string | Knex.Raw)[];
      joins: SubsetQuery["joins"];
      virtual: string[];
    }) => Knex.QueryBuilder;
    baseTable?: string;
    debug?: boolean | "list" | "count";
    db?: Knex;
    optimizeCountQuery?: boolean;
  }): Promise<{
    // biome-ignore lint/suspicious/noExplicitAny: Puri 도입 전까지 any로 유지
    rows: any[];
    total?: number | undefined;
    subsetQuery: SubsetQuery;
    qb: Knex.QueryBuilder;
  }> {
    const chalk = (await import("chalk")).default;
    const SqlParser = (await import("node-sql-parser")).default;
    const { getTableName, getTableNamesFromWhere } = await import("../utils/sql-parser");

    const db = _db ?? this.getDB(subset.startsWith("A") ? "w" : "r");
    baseTable = baseTable ?? inflection.pluralize(inflection.underscore(this.modelName));
    const queryMode = params.queryMode ?? (params.id !== undefined ? "list" : "both");

    const { select, virtual, joins, loaders } = subsetQuery;
    const qb = build({
      qb: db.from(baseTable),
      db,
      select,
      joins,
      virtual,
    });

    const applyJoinClause = (qb: Knex.QueryBuilder, joins: SubsetQuery["joins"]) => {
      joins.forEach((join) => {
        if (join.join === "inner") {
          qb.innerJoin(`${join.table} as ${join.as}`, this.getJoinClause(db, join));
        } else if (join.join === "outer") {
          qb.leftOuterJoin(`${join.table} as ${join.as}`, this.getJoinClause(db, join));
        }
      });
    };

    // countQuery
    const total = await (async () => {
      if (queryMode === "list") {
        return undefined;
      }

      const clonedQb = qb.clone().clear("order").clear("offset").clear("limit");
      const parser = new SqlParser.Parser();

      // optmizeCountQuery가 true인 경우 다른 clause에 영향을 주지 않는 모든 join을 제외함
      if (optimizeCountQuery) {
        const parsedQuery = parser.astify(clonedQb.toQuery());
        const tables = getTableNamesFromWhere(parsedQuery);
        // where절에 사용되는 테이블의 조인을 위해 사용되는 테이블
        const needToJoin = unique(
          tables.flatMap((table) => table.split("__").map((t) => inflection.pluralize(t))),
        );
        applyJoinClause(
          clonedQb,
          joins.filter((j) => needToJoin.includes(j.table)),
        );
      } else {
        applyJoinClause(clonedQb, joins);
      }

      const processedQb =
        afterBuild?.({
          qb: clonedQb,
          db,
          select,
          joins,
          virtual,
        }) ?? clonedQb;

      const parsedQuery = parser.astify(processedQb.toQuery());
      const q = Array.isArray(parsedQuery) ? parsedQuery[0] : parsedQuery;
      if (q.type !== "select") {
        throw new Error("Invalid query");
      }

      const countQuery =
        q.distinct !== null
          ? clonedQb
              .clear("select")
              .select(
                db.raw(
                  `COUNT(DISTINCT \`${getTableName(q.columns[0].expr)}\`.\`${q.columns[0].expr.column}\`) as total`,
                ),
              )
              .first()
          : clonedQb.clear("select").count("*", { as: "total" }).first();
      const countRow: { total?: number } = await countQuery;

      // debug: countQuery
      if (debug === true || debug === "count") {
        console.debug("DEBUG: count query", chalk.blue(countQuery.toQuery().toString()));
      }

      return countRow?.total ?? 0;
    })();

    // listQuery
    const rows = await (async () => {
      if (queryMode === "count") {
        return [];
      }

      // limit, offset
      if (params.num !== 0) {
        assert(params.num);
        qb.limit(params.num);
        qb.offset(params.num * ((params.page ?? 1) - 1));
      }

      // select, rows
      const clonedQb = qb.clone().select(select);

      // join
      applyJoinClause(clonedQb, joins);

      const listQuery =
        afterBuild?.({
          qb: clonedQb,
          db,
          select,
          joins,
          virtual,
        }) ?? clonedQb;

      let rows = await listQuery;
      // debug: listQuery
      if (debug === true || debug === "list") {
        console.debug("DEBUG: list query", chalk.blue(listQuery.toQuery().toString()));
      }

      rows = await this.useLoaders(db, rows, loaders);
      rows = this.hydrate(rows);
      return rows;
    })();

    return { rows, total, subsetQuery, qb };
  }

  // biome-ignore lint/suspicious/noExplicitAny: Knex.Raw<any> is used to return a raw SQL string
  getJoinClause(db: Knex<any, unknown>, join: SubsetQuery["joins"][number]): Knex.Raw<any> {
    if (!isCustomJoinClause(join)) {
      return db.raw(`${join.from} = ${join.to}`);
    } else {
      return db.raw(join.custom);
    }
  }

  getUpsertBuilder(): UpsertBuilder {
    return new UpsertBuilder();
  }
}
export const BaseModel = new BaseModelClass();
