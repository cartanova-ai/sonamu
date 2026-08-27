import { type Knex } from "knex";
import { z } from "zod";

import { type CacheManager } from "../cache/types";
import { type Entity } from "../entity/entity";
import { type EntityManager } from "../entity/entity-manager";
import { isBelongsToOneRelationProp, isOneToOneRelationProp, isRelationProp } from "../types/types";
import { isFunctionValue } from "../utils/runtime-value";

export type DataExplorerStrategy = "sample" | "ids" | "query" | "file" | "recent" | "random";

export type DataExplorerValue =
  | string
  | number
  | boolean
  | bigint
  | Date
  | Uint8Array
  | null
  | undefined
  | DataExplorerValue[]
  | DataExplorerRecord;

export type DataExplorerRecord = {
  [columnName: string]: DataExplorerValue;
};

export const dataExplorerValueSchema: z.ZodType<DataExplorerValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.bigint(),
    z.date(),
    z.instanceof(Uint8Array),
    z.null(),
    z.undefined(),
    z.array(dataExplorerValueSchema),
    z.record(z.string(), dataExplorerValueSchema),
  ]),
);
export const dataExplorerRecordSchema = z.record(z.string(), dataExplorerValueSchema);
export const dataExplorerRecordsSchema = z.array(dataExplorerRecordSchema);
const dataExplorerDirectionSchema = z.enum(["asc", "desc"]);
export const dataSourceConfigSchema = z.object({
  strategy: z.enum(["sample", "ids", "query", "file", "recent", "random"]).optional(),
  limit: z.number().optional(),
  where: z.record(z.string(), dataExplorerValueSchema).optional(),
  orderBy: z.string().optional(),
  ids: z.array(z.union([z.number(), z.string()])).optional(),
  filePath: z.string().optional(),
  useCache: z.boolean().optional(),
  cacheTtl: z.number().optional(),
});

/** WHERE 조건 타입 (객체 또는 Knex QueryBuilder 함수) */
export type WhereCondition = object | ((queryBuilder: Knex.QueryBuilder) => void);

export type DataExplorerOptions = {
  strategy: DataExplorerStrategy;
  limit?: number;
  where?: WhereCondition;
  orderBy?: string;
  ids?: (number | string)[];
  filePath?: string;
  /** 캐싱 사용 여부 (기본값: false) */
  useCache?: boolean;
  /** 캐시 TTL (초 단위, 기본값: 300) */
  cacheTtl?: number;
};

export type ExploreWithRelationsOptions = DataExplorerOptions & {
  /** 관련 데이터 포함 여부 (기본값: true) */
  includeRelations?: boolean;
  /** 재귀 탐색 최대 깊이 (기본값: 2) */
  maxDepth?: number;
};

export type ExploreWithRelationsResult = {
  /** 메인 entity 데이터 */
  main: {
    entityId: string;
    records: DataExplorerRecord[];
  };
  /** 관련 entity 데이터 (entityId -> records) */
  related: Map<string, DataExplorerRecord[]>;
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

  async explore(entityName: string, options: DataExplorerOptions): Promise<DataExplorerRecord[]> {
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
  ): Promise<DataExplorerRecord[]> {
    const query = this.db(entity.table);

    switch (options.strategy) {
      case "sample":
        return await this.sampleData(query, options.limit || 10);

      case "recent": {
        const createdAtCol = this.findTimestampColumn(entity, "created_at");
        if (createdAtCol) {
          query.orderBy(createdAtCol, "desc");
        }
        return dataExplorerRecordsSchema.parse(await query.limit(options.limit || 10));
      }

      case "random":
        return await this.randomSample(query, options.limit || 10);

      case "ids":
        if (options.ids && options.ids.length > 0) {
          query.whereIn("id", options.ids);
        }
        return dataExplorerRecordsSchema.parse(await query);

      case "query":
        if (options.where) {
          const whereCallback = z
            .custom<(queryBuilder: Knex.QueryBuilder) => void>(isFunctionValue)
            .safeParse(options.where);
          if (whereCallback.success) {
            query.where(whereCallback.data);
          } else {
            query.where(dataExplorerRecordSchema.parse(options.where));
          }
        }
        if (options.orderBy) {
          const [col, dir = "asc"] = options.orderBy.split(":");
          const direction = dataExplorerDirectionSchema.parse(dir);
          // id 컬럼은 숫자로 캐스팅하여 정렬합니다 (문자열 정렬 방지)
          if (col === "id") {
            query.orderByRaw(`CAST(?? AS INTEGER) ${direction}`, [col]);
          } else {
            query.orderBy(col, direction);
          }
        }
        return dataExplorerRecordsSchema.parse(await query.limit(options.limit || 10));

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
  private async sampleData(query: Knex.QueryBuilder, limit: number): Promise<DataExplorerRecord[]> {
    const [{ count }] = await query.clone().count("* as count");
    const total = Number(count);

    if (total <= limit) {
      return dataExplorerRecordsSchema.parse(await query.limit(limit));
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

    return dataExplorerRecordsSchema.parse(result.rows);
  }

  private async randomSample(
    query: Knex.QueryBuilder,
    limit: number,
  ): Promise<DataExplorerRecord[]> {
    return dataExplorerRecordsSchema.parse(await query.orderByRaw("RANDOM()").limit(limit));
  }

  private findTimestampColumn(entity: Entity, columnName: string): string | null {
    const prop = entity.props.find((p) => p.name === columnName);
    return prop?.name || null;
  }

  private async loadFromFile(filePath: string): Promise<DataExplorerRecord[]> {
    const fs = await import("fs/promises");
    const content = await fs.readFile(filePath, "utf-8");

    if (filePath.endsWith(".json")) {
      try {
        const parsed = dataExplorerRecordsSchema.safeParse(JSON.parse(content));
        if (!parsed.success) {
          throw new Error("JSON file must contain an array of records");
        }
        return parsed.data;
      } catch (error) {
        throw new Error("JSON file must contain a valid array of records", { cause: error });
      }
    } else if (filePath.endsWith(".csv")) {
      const lines = content.split("\n").filter((line) => line.trim());
      if (lines.length === 0) return [];

      const headers = lines[0].split(",").map((h) => h.trim());
      return lines.slice(1).map((line): DataExplorerRecord => {
        const values = line.split(",");
        return Object.fromEntries(
          headers.map((header, index) => [header, values[index]?.trim()] as const),
        );
      });
    }

    throw new Error(`Unsupported file format: ${filePath}`);
  }

  async exploreRelation(
    entityName: string,
    relationProp: string,
    options?: Partial<DataExplorerOptions>,
  ): Promise<DataExplorerRecord[]> {
    const entity = this.entityManager.get(entityName);
    const prop = entity.props.find((p) => p.name === relationProp);

    if (!prop || !isRelationProp(prop)) {
      throw new Error(`Relation property not found: ${entityName}.${relationProp}`);
    }

    const dataSource = prop.cone?.dataSource;
    const strategy = dataSource?.strategy || options?.strategy || "sample";
    const config = dataSourceConfigSchema.parse(dataSource?.config ?? {});
    const exploreOptions: DataExplorerOptions = {
      strategy,
      limit: options?.limit ?? config.limit ?? 10,
      ...config,
      ...options,
    };

    return this.explore(prop.with, exploreOptions);
  }

  /**
   * 여러 relation을 병렬로 조회합니다 (N+1 문제 해결)
   */
  async exploreRelations(
    entityName: string,
    relationProps: string[],
    options?: Partial<DataExplorerOptions>,
  ): Promise<Record<string, DataExplorerRecord[]>> {
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

  /**
   * Entity와 관련된 데이터를 재귀적으로 탐색합니다.
   * BelongsToOne, OneToOne(hasJoinColumn) relation을 따라가며 참조 데이터를 수집합니다.
   */
  async exploreWithRelations(
    entityName: string,
    options: ExploreWithRelationsOptions,
  ): Promise<ExploreWithRelationsResult> {
    const includeRelations = options.includeRelations ?? true;
    const maxDepth = options.maxDepth ?? 2;

    // 메인 entity 조회
    const mainRecords = await this.explore(entityName, options);

    const result: ExploreWithRelationsResult = {
      main: {
        entityId: entityName,
        records: mainRecords,
      },
      related: new Map(),
    };

    // 관련 데이터 수집하지 않으면 바로 리턴
    if (!includeRelations || maxDepth <= 0) {
      return result;
    }

    // 이미 조회한 entity 추적 (중복 방지)
    const visited = new Set<string>([entityName]);

    // 재귀적으로 관련 데이터 수집
    await this.collectRelatedData(entityName, mainRecords, result.related, visited, maxDepth);

    return result;
  }

  /**
   * 관련 데이터를 재귀적으로 수집합니다 (private helper)
   */
  private async collectRelatedData(
    entityName: string,
    records: DataExplorerRecord[],
    relatedMap: Map<string, DataExplorerRecord[]>,
    visited: Set<string>,
    remainingDepth: number,
  ): Promise<void> {
    if (remainingDepth <= 0 || records.length === 0) {
      return;
    }

    const entity = this.entityManager.get(entityName);
    const recordIds = records.flatMap((record) => {
      const parsedId = z.union([z.number(), z.string()]).safeParse(record.id);
      return parsedId.success ? [parsedId.data] : [];
    });

    // 1. Forward references: 이 entity가 참조하는 다른 entity
    const forwardRelationProps = entity.props.filter(
      (prop) =>
        isRelationProp(prop) &&
        (isBelongsToOneRelationProp(prop) || (isOneToOneRelationProp(prop) && prop.hasJoinColumn)),
    );

    for (const prop of forwardRelationProps) {
      if (!isRelationProp(prop)) continue;

      const targetEntityName = prop.with;

      // 이미 조회한 entity는 스킵 (순환 참조 방지)
      if (visited.has(targetEntityName)) {
        continue;
      }

      // 참조하는 ID들 수집
      const foreignKeyName = `${prop.name}_id`;
      const referencedIds = records.flatMap((record) => {
        const parsedId = z.union([z.number(), z.string()]).safeParse(record[foreignKeyName]);
        return parsedId.success ? [parsedId.data] : [];
      });

      if (referencedIds.length === 0) {
        continue;
      }

      // 중복 제거
      const uniqueIds = [...new Set(referencedIds)];

      // 참조 데이터 조회
      const referencedRecords = await this.explore(targetEntityName, {
        strategy: "ids",
        ids: uniqueIds,
      });

      // 결과에 추가
      relatedMap.set(targetEntityName, referencedRecords);
      visited.add(targetEntityName);

      // 재귀: 참조된 데이터의 관련 데이터도 수집
      await this.collectRelatedData(
        targetEntityName,
        referencedRecords,
        relatedMap,
        visited,
        remainingDepth - 1,
      );
    }

    // 2. Backward references: 이 entity를 참조하는 다른 entity
    // 모든 entity를 순회하며 현재 entity를 참조하는 relation 찾기
    const allEntities = this.entityManager.getAllEntities();

    for (const otherEntity of allEntities) {
      const otherEntityName = otherEntity.id;

      // 이미 조회했거나 자기 자신이면 스킵
      if (visited.has(otherEntityName) || otherEntityName === entityName) {
        continue;
      }

      // 현재 entity를 참조하는 relation prop 찾기
      const backwardRelations = otherEntity.props.filter(
        (prop) =>
          isRelationProp(prop) &&
          prop.with === entityName &&
          (isBelongsToOneRelationProp(prop) ||
            (isOneToOneRelationProp(prop) && prop.hasJoinColumn)),
      );

      for (const prop of backwardRelations) {
        if (!isRelationProp(prop)) continue;

        // otherEntity가 현재 entity를 참조하는 FK 컬럼
        const foreignKeyName = `${prop.name}_id`;

        // 현재 레코드들을 참조하는 otherEntity 레코드 조회
        const query = this.db(otherEntity.table).whereIn(foreignKeyName, recordIds);
        const backwardRecords = await query;

        if (backwardRecords.length === 0) {
          continue;
        }

        // 결과에 추가
        relatedMap.set(otherEntityName, backwardRecords);
        visited.add(otherEntityName);

        // 재귀: 역참조 데이터의 관련 데이터도 수집
        await this.collectRelatedData(
          otherEntityName,
          backwardRecords,
          relatedMap,
          visited,
          remainingDepth - 1,
        );
      }
    }
  }
}
