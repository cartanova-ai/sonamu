/** biome-ignore-all lint/suspicious/noExplicitAny: Puri의 타입은 개별 모델에서 확정되므로 BaseModel에서는 any를 허용함 */
import { getLogger } from "@logtape/logtape";
import { type Logger } from "@logtape/logtape";
import { type Knex } from "knex";
import { cloneDeep, cluster, group, isObject, omit, set } from "radashi";

import { Sonamu } from "../api/sonamu";
import { EntityManager } from "../entity/entity-manager";
import { type FilterOperator, type FilterQuery } from "../filter/types";
import { normalizeFilterQuery, validateSonamuFilters } from "../filter/utils";
import { convertDomainToCategory } from "../logger/category";
import { type DatabaseSchemaExtend, type SonamuQueryMode } from "../types/types";
import { type ListResult } from "../utils/model";
import { isObjectValue } from "../utils/runtime-value";
import { getJoinTables, getTableNamesFromWhere } from "../utils/sql-parser";
import { type EnhancerMap, type ResolveSubsetIntersection } from "./base-model.types";
import { type DBPreset } from "./db";
import { DB } from "./db";
import { Puri } from "./puri";
import {
  type InferAllSubsets,
  type PuriLoaderQueries,
  type PuriSubsetFn,
} from "./puri-subset.types";
import { PuriWrapper } from "./puri-wrapper";
import { type UnionExtractedTTables } from "./puri.types";
import { UpsertBuilder } from "./upsert-builder";

type DatabaseRecordValue =
  | string
  | number
  | boolean
  | bigint
  | Date
  | Buffer
  | Knex.Raw
  | null
  | DatabaseRecordValue[]
  | { [key: string]: DatabaseRecordValue };
type DatabaseRecord = Record<string, DatabaseRecordValue | undefined>;

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
  TSubsetMapping extends { [K in TSubsetKey]: TSubsetMapping[K] } = never,
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn> = never,
  TLoaderQueries extends PuriLoaderQueries<TSubsetKey> = never,
> {
  protected readonly logger: Logger;

  constructor(
    public readonly modelName: string = this.constructor.name,
    protected subsetQueries?: TSubsetQueries,
    protected loaderQueries?: TLoaderQueries,
  ) {
    this.logger = getLogger(convertDomainToCategory(this.modelName, "model"));
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

  private getSubsetQueryPuri(): PuriWrapper {
    const activeTransaction = DB.getTransactionContext().getActiveTransaction();
    if (activeTransaction) {
      return activeTransaction;
    }

    return new PuriWrapper(this.getDB("r"), new UpsertBuilder());
  }

  async destroy() {
    return DB.destroy();
  }

  async getInsertedIds(
    wdb: Knex,
    rows: DatabaseRecord[],
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
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      unqKeys = rows.map((row) => row[unqKeyFields[0]] as string);
    }

    let resultIds: number[] = [];
    for (const items of cluster(unqKeys, chunkSize)) {
      const dbRows = await wdb(tableName)
        .select("id", wdb.raw(selectField))
        // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
        .whereIn(
          /* SAFETY: Knex 런타임은 컬럼 위치의 Raw 표현식을 지원하지만 선언 타입에는 누락되어 있습니다. */
          whereInField as string,
          items,
        );
      resultIds = resultIds.concat(
        dbRows.map((dbRow: DatabaseRecord) => parseInt(String(dbRow.id))),
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

    const puriWrapper = this.getSubsetQueryPuri();
    const qb = this.subsetQueries[subset]?.(puriWrapper);

    // NonAllowedAsSingleTable: 단일 테이블 컬럼 접근 방지용 마커
    type QBTables = UnionExtractedTTables<TSubsetKey, TSubsetQueries> & {
      NonAllowedAsSingleTable: { __fulltext__: true };
    };

    function onSubset<S extends TSubsetKey>(subset: S): ReturnType<TSubsetQueries[S]>;
    function onSubset<Arr extends readonly TSubsetKey[]>(
      subsets: [...Arr],
    ): ResolveSubsetIntersection<Arr, TSubsetQueries>;
    function onSubset(_subset: TSubsetKey | readonly TSubsetKey[]) {
      return qb;
    }

    return {
      // SAFETY: 같은 Puri 인스턴스에 단일 테이블 접근 제한용 타입 마커만 추가합니다.
      qb: qb as Puri<DatabaseSchemaExtend, QBTables, {}>,
      onSubset,
    };
  }

  /**
   * Enhancer 객체 생성 헬퍼
   * 타입 검증 및 추론을 도와줌
   */
  createEnhancers<T extends TSubsetKey>(
    enhancers: EnhancerMap<
      T,
      InferAllSubsets<TSubsetQueries, TLoaderQueries>,
      TSubsetMapping,
      TSubsetQueries
    >,
  ) {
    return enhancers;
  }

  /**
   * 서브셋 쿼리 실행
   *
   * 1. Sonamu 필터 적용 (타입 변환 포함)
   * 2. 쿼리 실행 (pagination 적용)
   * 3. 로더 실행 (1:N, N:M 관계 데이터 로딩)
   * 4. Hydrate (flat → 중첩 객체)
   * 5. Enhancer 적용 (virtual 필드 계산)
   */
  async executeSubsetQuery<
    T extends TSubsetKey,
    TComputedResults extends InferAllSubsets<TSubsetQueries, TLoaderQueries>,
    TFilter extends object,
    LP extends {
      num?: number;
      page?: number;
      queryMode?: SonamuQueryMode;
    },
  >(
    params: {
      subset: T;
      qb: Puri<any, any, any>;
      params: {
        num: number;
        page: number;
        queryMode?: SonamuQueryMode;
        sonamuFilter?: TFilter;
      };
      debug?: boolean;
      optimizeCountQuery?: boolean;
    } & EnhancerParam<TSubsetKey, TComputedResults, TSubsetMapping, TSubsetQueries>,
  ): Promise<ListResult<LP, TSubsetMapping[T]>> {
    const { subset, qb, params: queryParams, debug = false, optimizeCountQuery = false } = params;

    if (!this.loaderQueries) {
      throw new Error("loaderQueries is not defined");
    }

    // Sonamu Filter 적용
    if (queryParams.sonamuFilter) {
      const normalizedFilter = normalizeFilterQuery(queryParams.sonamuFilter);
      this.applySonamuFilters(qb, normalizedFilter);
    }

    const { num, page } = queryParams;
    // 모든 로더가 root query와 같은 연결을 사용하도록 실행 시점의 knex에서 한 번만 파생한다.
    const puriWrapper = new PuriWrapper(qb.knex, new UpsertBuilder());

    // COUNT 쿼리 실행 (queryMode: list일 때는 0 리턴)
    const total = await this.executeCountQuery(qb, queryParams, debug, optimizeCountQuery);

    if (queryParams?.queryMode === "count") {
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      return { total } as ListResult<LP, TSubsetMapping[T]>;
    }

    // LIST 쿼리 실행
    const computedRows = await this.executeListQuery(
      subset,
      qb,
      queryParams,
      num,
      page,
      debug,
      puriWrapper,
    );

    // Enhancer 적용
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    const enhancer = (params as any).enhancers?.[subset];
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    const enhancedRows = (await Promise.all(
      computedRows.map((row) => enhancer?.(row) ?? row),
    )) as TSubsetMapping[T][];

    // Internal 필드 제거
    const entity = EntityManager.get(this.modelName);
    const internalFields = entity.subsetsInternal[subset] ?? [];
    const rows =
      internalFields.length > 0
        ? enhancedRows.map((row) => this.omitInternalFields(row, internalFields))
        : enhancedRows;

    if (queryParams.queryMode === "list") {
      // 리스트만 리턴
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      return { rows } as ListResult<LP, TSubsetMapping[T]>;
    } else {
      // 둘다 리턴
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      return { rows, total } as ListResult<LP, TSubsetMapping[T]>;
    }
  }

  /**
   * 객체에서 internal 필드 제거
   * 중첩 필드(예: "user.email") 및 배열(예: "employees.salary")도 처리
   */
  omitInternalFields<T extends object>(row: T, fields: string[]): T {
    const result = cloneDeep(row);
    for (const field of fields) {
      this.deleteField(result, field.split("."));
    }
    return result;
  }

  /**
   * FilterQuery를 Puri QueryBuilder에 적용
   *
   * @param qb Puri QueryBuilder 인스턴스
   * @param filters FilterQuery 객체
   */
  protected applySonamuFilters<TEntity>(
    qb: Puri<any, any, any>,
    filters?: FilterQuery<TEntity>,
  ): void {
    if (!filters) return;

    const entity = EntityManager.get(this.modelName);

    // 1. 필터 검증 (Entity 기반)
    validateSonamuFilters(filters, entity);

    // 2. 검증된 필터 적용
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    const puri = qb as any;

    for (const [field, condition] of Object.entries(filters)) {
      if (condition === undefined || condition === null) continue;

      // 테이블명.필드명 형식으로 변환
      const fullField = entity.getFullFieldName(field);

      // 직접 값 (eq와 동일)
      if (!isObjectValue(condition) || Array.isArray(condition)) {
        puri.where(fullField, condition);
        continue;
      }

      // 연산자 객체
      for (const [operator, value] of Object.entries(condition)) {
        // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
        this.applyOperator(qb, fullField, operator as FilterOperator, value);
      }
    }
  }

  /**
   * 단일 연산자를 QueryBuilder에 적용
   */
  private applyOperator<Value>(
    qb: Puri<any, any, any>,
    field: string,
    operator: FilterOperator,
    value: Value,
  ): void {
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    const puri = qb as any;

    switch (operator) {
      case "eq":
        puri.where(field, value);
        break;

      case "ne":
        puri.where(field, "!=", value);
        break;

      case "gt":
        puri.where(field, ">", value);
        break;

      case "gte":
        puri.where(field, ">=", value);
        break;

      case "lt":
        puri.where(field, "<", value);
        break;

      case "lte":
        puri.where(field, "<=", value);
        break;

      case "in":
        puri.whereIn(field, value);
        break;

      case "notIn":
        puri.whereNotIn(field, value);
        break;

      case "contains":
        puri.where(field, "like", `%${value}%`);
        break;

      case "startsWith":
        puri.where(field, "like", `${value}%`);
        break;

      case "endsWith":
        puri.where(field, "like", `%${value}`);
        break;

      case "isNull":
        puri.where(field, null);
        break;

      case "isNotNull":
        puri.where(field, "!=", null);
        break;

      case "before":
        puri.where(field, "<", value);
        break;

      case "after":
        puri.where(field, ">", value);
        break;

      case "between": {
        if (Array.isArray(value) && value.length === 2) {
          const [min, max] = value;
          puri.where(field, ">=", min).where(field, "<=", max);
        }
        break;
      }

      default:
        console.warn(`Unsupported operator: ${operator}`);
    }
  }

  /**
   * 중첩 필드 삭제 (배열 내 객체도 처리)
   */
  deleteField(obj: any, parts: string[]): void {
    if (!obj || !isObjectValue(obj)) {
      return;
    }

    if (parts.length === 1) {
      if (Array.isArray(obj)) {
        obj.forEach((item) => {
          if (item && isObjectValue(item)) {
            delete item[parts[0]];
          }
        });
      } else {
        delete obj[parts[0]];
      }
      return;
    }

    const [first, ...rest] = parts;
    const next = obj[first];

    if (Array.isArray(next)) {
      next.map((item) => this.deleteField(item, rest));
    } else if (next && isObjectValue(next)) {
      this.deleteField(next, rest);
    }
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
    puriWrapper: PuriWrapper,
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
    let unloadedRows = await limitedQb;

    if (debug) {
      qb.debug();
    }

    // 로더 처리
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    const loaders = (this.loaderQueries as any)[subset];
    if (loaders && Array.isArray(loaders)) {
      unloadedRows = await this.processLoaders(unloadedRows, loaders, debug, puriWrapper);
    }

    return this.hydrate(unloadedRows);
  }

  /**
   * 재귀적 로더 처리
   */
  private async processLoaders(
    rows: any[],
    loaders: any[],
    debug: boolean,
    puriWrapper: PuriWrapper,
  ): Promise<any[]> {
    for (const resolveLoader of loaders) {
      const { as, refId, qb: resolveLoaderQbFn, loaders: nestedLoaders } = resolveLoader;

      const resolveLoaderQb = resolveLoaderQbFn(
        puriWrapper,
        rows.map((row) => row[refId]),
      );

      if (debug) {
        resolveLoaderQb.debug();
      }

      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      let loadedRows = (await resolveLoaderQb) as any[];

      // 중첩 loaders가 있으면 재귀 처리
      if (nestedLoaders && nestedLoaders.length > 0) {
        loadedRows = await this.processLoaders(loadedRows, nestedLoaders, debug, puriWrapper);
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
  hydrate<T extends object>(rows: T[]): T[] {
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    return rows.map((row: T) => {
      const rowValues = new Map(Object.entries(row));
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
            return rowValues.get(idField) === null;
          }

          // id 필드가 없으면 기존 로직: 모든 필드가 null인지 확인
          return fields.every((field) => {
            const fieldValue = rowValues.get(field);
            return fieldValue === null || (Array.isArray(fieldValue) && fieldValue.length === 0);
          });
        })
        .map(([key]) => key);

      let hydrated: DatabaseRecord = Object.fromEntries([]);
      for (const field of Object.keys(row)) {
        const fieldValue = rowValues.get(field);
        if (!field.includes("__")) {
          const hydratedValue =
            Array.isArray(fieldValue) && isObject(fieldValue[0])
              ? this.hydrate(fieldValue)
              : fieldValue;
          Object.assign(hydrated, { [field]: hydratedValue });
          continue;
        }

        // 중첩 필드 처리: user__name → user[name]
        const parts = field.split("__");
        const objPath =
          parts[0] +
          parts
            .slice(1)
            .map((part) => `[${part}]`)
            .join("");

        hydrated = set(
          hydrated,
          objPath,
          fieldValue && Array.isArray(fieldValue) && isObject(fieldValue[0])
            ? this.hydrate(fieldValue)
            : fieldValue,
        );
      }

      // null relation 처리
      nullKeys.forEach((nullKey) => {
        Object.assign(hydrated, { [nullKey]: null });
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
  TComputedResults extends { [K in TSubsetKey]: TComputedResults[K] },
  TSubsetMapping extends { [K in TSubsetKey]: TSubsetMapping[K] },
  TSubsetQueries extends Record<TSubsetKey, PuriSubsetFn>,
> = [RequiredEnhancerKeys<TSubsetKey, TComputedResults, TSubsetMapping>] extends [never]
  ? { enhancers?: EnhancerMap<TSubsetKey, TComputedResults, TSubsetMapping, TSubsetQueries> }
  : { enhancers: EnhancerMap<TSubsetKey, TComputedResults, TSubsetMapping, TSubsetQueries> };

type RequiredEnhancerKeys<
  TSubsetKey extends string,
  TComputedResults extends { [K in TSubsetKey]: TComputedResults[K] },
  TSubsetMapping extends { [K in TSubsetKey]: TSubsetMapping[K] },
> = {
  [K in TSubsetKey]: TComputedResults[K] extends TSubsetMapping[K] ? never : K;
}[TSubsetKey];

export const BaseModel = new BaseModelClass();
