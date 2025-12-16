/** biome-ignore-all lint/suspicious/noExplicitAny: Puri의 타입은 개별 모델에서 확정되므로 BaseModel에서는 any를 허용함 */

import type { Knex } from "knex";
import { group, isObject, omit, set } from "radashi";
import { Sonamu } from "../api";
import type { DatabaseSchemaExtend, SonamuQueryMode } from "../types/types";
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
    return new PuriWrapper(db, new UpsertBuilder());
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
    LP extends { num: number; page: number; queryMode?: SonamuQueryMode },
  >(
    params: {
      subset: T;
      qb: Puri<any, any, any>;
      params: LP;
      debug?: boolean;
      optimizeCountQuery?: boolean;
    } & EnhancerParam<TSubsetKey, TComputedResults, TSubsetMapping>,
  ): Promise<ExecuteSubsetQueryResult<TSubsetMapping, T>> {
    const { subset, qb, params: queryParams, debug = false, optimizeCountQuery = false } = params;

    if (!this.loaderQueries) {
      throw new Error("loaderQueries is not defined");
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
      const parsedQuery = parser.astify(countPuri.toQuery(), {
        database: Sonamu.config.database.database,
      });

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
      .select({ total: Puri.rawNumber(`COUNT(*)::integer`) })
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

    const limitedQb = (() => {
      if (num === 0) {
        return qb;
      } else {
        return qb.limit(num).offset(num * (page - 1));
      }
    })();
    let unloadedRows = (await limitedQb) as any[];

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
   * - nullable relation의 경우 id 필드가 null이면 객체 자체를 null로
   */
  hydrate<T extends UnknownDBRecord>(rows: T[]): T[] {
    return rows.map((row: T) => {
      // nullable relation 처리: 그룹의 id 필드가 null이면 객체 전체를 null로
      const nestedKeys = Object.keys(row).filter((key) => key.includes("__"));
      const groups = Object.groupBy(nestedKeys, (key) => key.split("__")[0]);

      // id 필드가 null인 그룹 찾기 (예: parent__id가 null이면 parent 그룹 전체가 null)
      const nullKeys = Object.entries(groups)
        .filter(([groupKey, fields]) => {
          if (!fields || fields.length === 0) return false;

          // 그룹의 id 필드 찾기 (예: "parent__id")
          const idField = `${groupKey}__id`;
          if (idField in row) {
            // id 필드가 null이면 객체 전체가 null
            return row[idField] === null;
          }

          // id 필드가 없으면 기존 로직: 모든 필드가 null인지 확인
          return fields.every(
            (field) =>
              row[field] === null || (Array.isArray(row[field]) && row[field].length === 0),
          );
        })
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
