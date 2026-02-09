import type { Knex } from "knex";
import type { CacheManager } from "../cache/types";
import type { Entity } from "../entity/entity";
import type { EntityManager } from "../entity/entity-manager";
import { isRelationProp } from "../types/types";

export type DataExplorerStrategy = "sample" | "ids" | "query" | "file" | "recent" | "random";

/** WHERE 조건 타입 (객체 또는 Knex QueryBuilder 함수) */
export type WhereCondition = Record<string, unknown> | ((queryBuilder: Knex.QueryBuilder) => void);

export type DataExplorerOptions = {
  strategy: DataExplorerStrategy;
  limit?: number;
  where?: WhereCondition;
  orderBy?: string;
  ids?: number[];
  filePath?: string;
  /** 캐싱 사용 여부 (기본값: false) */
  useCache?: boolean;
  /** 캐시 TTL (초 단위, 기본값: 300) */
  cacheTtl?: number;
};

// 기존 DB 데이터를 탐색하여 fixture 생성 시 참조할 수 있는 시스템
export class DataExplorer {
  private cache?: CacheManager;

  constructor(
    private db: Knex,
    private entityManager: typeof EntityManager,
    cacheManager?: CacheManager,
  ) {
    this.cache = cacheManager;
  }

  async explore(
    entityName: string,
    options: DataExplorerOptions,
  ): Promise<Record<string, unknown>[]> {
    const entity = this.entityManager.get(entityName);
    if (!entity) {
      throw new Error(`Entity not found: ${entityName}`);
    }

    // 캐싱 지원
    if (options.useCache && this.cache) {
      const cacheKey = this.generateCacheKey(entityName, options);
      return this.cache.getOrSet({
        key: cacheKey,
        ttl: options.cacheTtl || 300,
        factory: () => this.exploreInternal(entity, options),
      });
    }

    return this.exploreInternal(entity, options);
  }

  private async exploreInternal(
    entity: Entity,
    options: DataExplorerOptions,
  ): Promise<Record<string, unknown>[]> {
    const query = this.db(entity.table);

    switch (options.strategy) {
      case "sample":
        return this.sampleData(query, options.limit || 10);

      case "recent": {
        const createdAtCol = this.findTimestampColumn(entity, "created_at");
        if (createdAtCol) {
          query.orderBy(createdAtCol, "desc");
        }
        return await query.limit(options.limit || 10);
      }

      case "random":
        return this.randomSample(query, options.limit || 10);

      case "ids":
        if (options.ids && options.ids.length > 0) {
          query.whereIn("id", options.ids);
        }
        return await query;

      case "query":
        if (options.where) {
          query.where(options.where);
        }
        if (options.orderBy) {
          const [col, dir = "asc"] = options.orderBy.split(":");
          // id 컬럼은 숫자로 캐스팅하여 정렬합니다 (문자열 정렬 방지)
          if (col === "id") {
            query.orderByRaw(`CAST(?? AS INTEGER) ${dir}`, [col]);
          } else {
            query.orderBy(col, dir as "asc" | "desc");
          }
        }
        return await query.limit(options.limit || 10);

      case "file":
        if (!options.filePath) {
          throw new Error("filePath is required for file strategy");
        }
        return this.loadFromFile(options.filePath);

      default:
        throw new Error(`Unknown strategy: ${options.strategy}`);
    }
  }

  // 균등 샘플링 (PostgreSQL ROW_NUMBER 사용)
  private async sampleData(
    query: Knex.QueryBuilder,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const [{ count }] = await query.clone().count("* as count");
    const total = Number(count);

    if (total <= limit) {
      return query.limit(limit);
    }

    // 균등 간격 계산
    const interval = Math.floor(total / limit);

    // 테이블명 추출
    const tableName = query.toString().match(/from\s+"?(\w+)"?/i)?.[1];
    if (!tableName) {
      throw new Error("Could not extract table name from query");
    }

    // ROW_NUMBER()로 한 번에 균등 샘플링 (단일 쿼리)
    const result = await this.db.raw(
      `
      WITH numbered_rows AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY id) as rn
        FROM ??
      )
      SELECT * FROM numbered_rows
      WHERE MOD(rn - 1, ?) = 0
      LIMIT ?
    `,
      [tableName, interval, limit],
    );

    return result.rows;
  }

  private async randomSample(
    query: Knex.QueryBuilder,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    return query.orderByRaw("RANDOM()").limit(limit);
  }

  private findTimestampColumn(entity: Entity, columnName: string): string | null {
    const prop = entity.props.find((p) => p.name === columnName);
    return prop?.name || null;
  }

  private async loadFromFile(filePath: string): Promise<Record<string, unknown>[]> {
    const fs = await import("fs/promises");
    const content = await fs.readFile(filePath, "utf-8");

    if (filePath.endsWith(".json")) {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON file must contain an array");
      }
      return parsed as Record<string, unknown>[];
    } else if (filePath.endsWith(".csv")) {
      const lines = content.split("\n").filter((line) => line.trim());
      if (lines.length === 0) return [];

      const headers = lines[0].split(",").map((h) => h.trim());
      return lines.slice(1).map((line) => {
        const values = line.split(",");
        return headers.reduce(
          (obj: Record<string, unknown>, header: string, i: number) => {
            obj[header] = values[i]?.trim();
            return obj;
          },
          {} as Record<string, unknown>,
        );
      });
    }

    throw new Error(`Unsupported file format: ${filePath}`);
  }

  async exploreRelation(
    entityName: string,
    relationProp: string,
    options?: Partial<DataExplorerOptions>,
  ): Promise<Record<string, unknown>[]> {
    const entity = this.entityManager.get(entityName);
    const prop = entity.props.find((p) => p.name === relationProp);

    if (!prop || !isRelationProp(prop)) {
      throw new Error(`Relation property not found: ${entityName}.${relationProp}`);
    }

    const dataSource = prop.postIt?.dataSource;
    const strategy = dataSource?.strategy || options?.strategy || "sample";
    const config =
      dataSource?.config && typeof dataSource.config === "object"
        ? (dataSource.config as Record<string, unknown>)
        : {};

    return this.explore(prop.with, {
      strategy,
      limit: options?.limit || (typeof config.limit === "number" ? config.limit : 10),
      ...(typeof config === "object" ? config : {}),
      ...options,
    });
  }

  /**
   * 여러 relation을 병렬로 조회합니다 (N+1 문제 해결)
   */
  async exploreRelations(
    entityName: string,
    relationProps: string[],
    options?: Partial<DataExplorerOptions>,
  ): Promise<Record<string, Record<string, unknown>[]>> {
    const results = await Promise.all(
      relationProps.map(async (prop) => {
        const data = await this.exploreRelation(entityName, prop, options);
        return [prop, data] as const;
      }),
    );

    return Object.fromEntries(results);
  }

  private generateCacheKey(entityName: string, options: DataExplorerOptions): string {
    const parts = [
      `DataExplorer:${entityName}`,
      options.strategy,
      options.limit?.toString() || "default",
    ];

    if (options.where) {
      parts.push(JSON.stringify(options.where));
    }
    if (options.orderBy) {
      parts.push(options.orderBy);
    }
    if (options.ids) {
      parts.push(options.ids.join(","));
    }

    return parts.join(":");
  }
}
