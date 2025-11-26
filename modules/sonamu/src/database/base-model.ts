import assert from "assert";
import inflection from "inflection";
import type { Knex } from "knex";
import { group, isObject, omit, set, unique } from "radashi";
import { type DatabaseSchemaExtend, isCustomJoinClause, type SubsetQuery } from "../types/types";
import type { BaseListParams } from "../utils/model";
import { getJoinTables, getTableNamesFromWhere } from "../utils/sql-parser";
import { chunk } from "../utils/utils";
import type {
  EnhancerMap,
  ExecuteSubsetQueryResult,
  ResolveSubsetIntersection,
  UnionExtractedTTables,
} from "./base-model.types";
import type { DBPreset } from "./db";
import { DB } from "./db";
import { Puri } from "./puri";
import type { InferAllSubsets, PuriLoaderQueries, PuriSubsetFn } from "./puri-subset.types";
import { PuriWrapper } from "./puri-wrapper";
import { UpsertBuilder } from "./upsert-builder";

type UnknownDBRecord = Record<string, unknown>;

/**
 * 모든 Model 클래스의 기본 클래스
 *
 * @template TSubsetKey - 서브셋 키 유니온 (예: "A" | "P" | "SS")
 * @template TSubsetMapping - 서브셋별 최종 결과 타입 매핑
 * @template TSubsetQueries - 서브셋 쿼리 함수 객체
 * @template TLoaderQueries - 서브셋별 로더 쿼리 배열 객체
 */
export class BaseModelClass<
  TSubsetKey extends string = never,
  TSubsetMapping extends Record<string, any> = never,
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn> = never,
  TLoaderQueries extends PuriLoaderQueries<TSubsetKey> = never,
> {
  public modelName: string = "Unknown";

  constructor(
    protected subsetQueries?: TSubsetQueries,
    protected loaderQueries?: TLoaderQueries,
  ) {}

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
    let whereInField: string | Knex.Raw;
    let selectField: string;

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

  /**
   * 특정 서브셋에 대한 쿼리 빌더 획득
   *
   * @returns qb - 쿼리 빌더 (조건 추가용)
   * @returns onSubset - 특정 서브셋 전용 타입이 필요할 때 사용
   */
  getSubsetQueries<T extends TSubsetKey>(subset: T) {
    if (!this.subsetQueries) {
      throw new Error("subsetQueries is not defined");
    }

    const puriWrapper = new PuriWrapper(this.getDB("r"), new UpsertBuilder());
    const qb = this.subsetQueries[subset]?.(puriWrapper);

    // NonAllowedAsSingleTable: 단일 테이블 컬럼 접근 방지용 마커
    type QBTables = UnionExtractedTTables<TSubsetKey, TSubsetQueries> & {
      NonAllowedAsSingleTable: { __fulltext__: true };
    };

    return {
      qb: qb as unknown as Puri<DatabaseSchemaExtend, QBTables, {}>,
      onSubset: ((_subset: TSubsetKey | readonly TSubsetKey[]) => qb) as {
        // 단일 키
        <S extends TSubsetKey>(subset: S): ReturnType<TSubsetQueries[S]>;
        // 키 배열 -> 교집합 반환
        <Arr extends readonly TSubsetKey[]>(
          subsets: [...Arr],
        ): ResolveSubsetIntersection<Arr, TSubsetQueries>;
      },
    };
  }

  /**
   * Enhancer 객체 생성 헬퍼
   * 타입 검증 및 추론을 도와줌
   */
  createEnhancers<T extends TSubsetKey>(
    enhancers: EnhancerMap<T, InferAllSubsets<TSubsetQueries, TLoaderQueries>, TSubsetMapping>,
  ) {
    return enhancers;
  }

  /**
   * 서브셋 쿼리 실행
   *
   * 1. 쿼리 실행 (pagination 적용)
   * 2. 로더 실행 (1:N, N:M 관계 데이터 로딩)
   * 3. Hydrate (flat → 중첩 객체)
   * 4. Enhancer 적용 (virtual 필드 계산)
   */
  async executeSubsetQuery<
    T extends TSubsetKey,
    TComputedResults extends InferAllSubsets<TSubsetQueries, TLoaderQueries>,
  >(
    params: {
      subset: T;
      qb: Puri<any, any, any>;
      params: {
        num?: number;
        page?: number;
        queryMode?: "list" | "count" | "both";
      };
      debug?: boolean;
      optimizeCountQuery?: boolean;
    } & EnhancerParam<TSubsetKey, TComputedResults, TSubsetMapping>,
  ): Promise<ExecuteSubsetQueryResult<TSubsetMapping, T>> {
    const { subset, qb, params: queryParams, debug = false, optimizeCountQuery = false } = params;

    if (!this.loaderQueries) {
      throw new Error("loaderQueries is not defined");
    }

    if (!queryParams.num || !queryParams.page) {
      throw new Error("num and page are required");
    }

    const { num, page } = queryParams;

    // COUNT 쿼리 실행
    const total = await this.executeCountQuery(qb, queryParams, debug, optimizeCountQuery);

    // LIST 쿼리 실행
    const computedRows = await this.executeListQuery(subset, qb, queryParams, num, page, debug);

    // Enhancer 적용
    const enhancer = (params as any).enhancers?.[subset];
    const rows = (await Promise.all(
      computedRows.map((row) => enhancer?.(row) ?? row),
    )) as TSubsetMapping[T][];

    return { rows, total };
  }

  /**
   * COUNT 쿼리 실행 (내부 메서드)
   */
  private async executeCountQuery(
    qb: Puri<any, any, any>,
    params: { queryMode?: "list" | "count" | "both" },
    debug: boolean,
    optimizeCountQuery: boolean,
  ): Promise<number> {
    if (params.queryMode === "list") {
      return 0;
    }

    const countPuri = qb.clone().clear("order").clear("limit").clear("offset");

    if (optimizeCountQuery) {
      const { default: SqlParser } = await import("node-sql-parser");
      const parser = new SqlParser.Parser();
      const parsedQuery = parser.astify(countPuri.toQuery());

      const leftJoinTables = getJoinTables(parsedQuery, ["LEFT JOIN"]);
      const whereTables = getTableNamesFromWhere(parsedQuery);

      const tablesToRemove = leftJoinTables.filter((j) => !whereTables.includes(j));
      tablesToRemove.forEach((table) => {
        countPuri.clearJoin(table);
      });
    }

    // COUNT(*)로 전체 레코드 수를 계산
    // TODO: qb의 DISTINCT가 있는 경우 처리해야 함
    const countResult: { total?: number } = await countPuri
      .clear("select")
      .select({ total: Puri.rawNumber(`COUNT(*)`) })
      .first();

    if (debug) {
      countPuri.debug();
    }

    return countResult?.total ?? 0;
  }

  /**
   * LIST 쿼리 실행 (내부 메서드)
   */
  private async executeListQuery<T extends TSubsetKey>(
    subset: T,
    qb: Puri<any, any, any>,
    params: { queryMode?: "list" | "count" | "both" },
    num: number,
    page: number,
    debug: boolean,
  ): Promise<any[]> {
    if (params.queryMode === "count") {
      return [];
    }

    let unloadedRows = (await qb.limit(num).offset(num * (page - 1))) as any[];

    if (debug) {
      qb.debug();
    }

    // 로더 처리
    const loaders = (this.loaderQueries as any)[subset];
    if (loaders && Array.isArray(loaders)) {
      unloadedRows = await this.processLoaders(unloadedRows, loaders, debug);
    }

    return this.hydrate(unloadedRows);
  }

  /**
   * 재귀적 로더 처리
   */
  private async processLoaders(rows: any[], loaders: any[], debug: boolean): Promise<any[]> {
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
        loadedRows = await this.processLoaders(loadedRows, nestedLoaders, debug);
      }

      const subRowGroups = group(loadedRows, (row) => row.refId);

      rows = rows.map((row) => {
        row[as] = (subRowGroups[row[refId]] ?? []).map((r) => omit(r, ["refId"]));
        return row;
      });
    }

    return rows;
  }

  /**
   * Flat 레코드를 중첩 객체로 변환
   *
   * - `user__name` → `{ user: { name } }`
   * - nullable relation의 경우 모든 필드가 null이면 객체 자체를 null로
   */
  hydrate<T extends UnknownDBRecord>(rows: T[]): T[] {
    return rows.map((row: T) => {
      // nullable relation 처리: 관련 필드가 전부 null인 경우 방지
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
          // 일반 필드: 배열 내 객체면 재귀 hydrate
          if (Array.isArray(row[field]) && isObject(row[field][0])) {
            r[field] = this.hydrate(row[field]);
          } else {
            r[field] = row[field];
          }
          return r;
        }

        // 중첩 필드 처리: user__name → user[name]
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

      // null relation 처리
      nullKeys.forEach((nullKey) => {
        hydrated[nullKey] = null;
      });

      return hydrated;
    }) as T[];
  }

  // Legacy SubsetQuery 실행 (Puri 도입 전 호환용)
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

      if (optimizeCountQuery) {
        const parsedQuery = parser.astify(clonedQb.toQuery());
        const tables = getTableNamesFromWhere(parsedQuery);
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

      const processedQb = afterBuild?.({ qb: clonedQb, db, select, joins, virtual }) ?? clonedQb;

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

      if (params.num !== 0) {
        assert(params.num);
        qb.limit(params.num);
        qb.offset(params.num * ((params.page ?? 1) - 1));
      }

      const clonedQb = qb.clone().select(select);
      applyJoinClause(clonedQb, joins);

      const listQuery = afterBuild?.({ qb: clonedQb, db, select, joins, virtual }) ?? clonedQb;

      let rows = await listQuery;
      if (debug === true || debug === "list") {
        console.debug("DEBUG: list query", chalk.blue(listQuery.toQuery().toString()));
      }

      rows = await this.useLoaders(db, rows, loaders);
      rows = this.hydrate(rows);
      return rows;
    })();

    return { rows, total, subsetQuery, qb };
  }

  // Legacy Loader 처리 (Puri 도입 전 호환용)
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
        subRows = await this.useLoaders(db, subRows, loader.loaders);
      }

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

/**
 * Enhancer 파라미터 조건부 타입
 * RequiredEnhancerKeys가 없으면 enhancers 선택적, 있으면 필수
 */
type EnhancerParam<
  TSubsetKey extends string,
  TComputedResults extends Record<TSubsetKey, any>,
  TSubsetMapping extends Record<TSubsetKey, any>,
> = [RequiredEnhancerKeys<TSubsetKey, TComputedResults, TSubsetMapping>] extends [never]
  ? { enhancers?: EnhancerMap<TSubsetKey, TComputedResults, TSubsetMapping> }
  : { enhancers: EnhancerMap<TSubsetKey, TComputedResults, TSubsetMapping> };

type RequiredEnhancerKeys<
  TSubsetKey extends string,
  TComputedResults extends Record<TSubsetKey, any>,
  TSubsetMapping extends Record<TSubsetKey, any>,
> = {
  [K in TSubsetKey]: TComputedResults[K] extends TSubsetMapping[K] ? never : K;
}[TSubsetKey];

export const BaseModel = new BaseModelClass();
