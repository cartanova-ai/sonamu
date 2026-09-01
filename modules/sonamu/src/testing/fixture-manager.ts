import assert from "node:assert";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { inspect } from "node:util";

import chalk from "chalk";
import inflection from "inflection";
import { type Knex } from "knex";
import { unique } from "radashi";
import { z } from "zod";

import { Sonamu } from "../api/sonamu";
import { BaseModel } from "../database/base-model";
import { type SonamuDBConfig } from "../database/db";
import { createKnexInstance } from "../database/knex";
import { UpsertBuilder } from "../database/upsert-builder";
import { type UBRef } from "../database/upsert-builder";
import { type Entity } from "../entity/entity";
import { EntityManager } from "../entity/entity-manager";
import {
  isBelongsToOneRelationProp,
  isHasManyRelationProp,
  isManyToManyRelationProp,
  isOneToOneRelationProp,
  isRelationProp,
  isVirtualProp,
} from "../types/types";
import {
  type BelongsToOneRelationProp,
  type DatabaseSchemaExtend,
  type EntityProp,
  type FixtureImportResult,
  type FixtureRecord,
  type FixtureSearchOptions,
  type OneToOneRelationProp,
} from "../types/types";
import { isTest } from "../utils/controller";
import { RelationGraph } from "./_relation-graph";
import { dataExplorerRecordSchema } from "./data-explorer";
import { type DataExplorerRecord, type DataExplorerValue } from "./data-explorer";

const pgConnectionSchema = z
  .object({
    host: z.string().optional(),
    port: z.number().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    database: z.string(),
  })
  .passthrough();
const databaseConnectionSchema = z.object({ database: z.string() }).passthrough();
const fixtureRecordIdsSchema = z.array(z.union([z.number(), z.string()]));
const relationIdSchema = z.union([z.number(), z.string(), z.null()]);

export type FixtureSourceRecord = DataExplorerRecord & {
  id: number | string;
};

type UpsertRowValue = DataExplorerValue | UBRef;
type UpsertRow = {
  [columnName: string]: UpsertRowValue;
};

function waitForFixtureCommand(child: ChildProcess, executable: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${executable} 명령이 ${code ?? signal ?? "unknown"} 상태로 실패했습니다.`),
        );
    });
  });
}

function executeFixtureCommand(
  executable: string,
  args: string[],
  options: Pick<SpawnOptions, "env" | "stdio">,
): Promise<void> {
  return waitForFixtureCommand(spawn(executable, args, options), executable);
}

async function pipeFixtureCommands(
  source: { executable: string; args: string[]; env: NodeJS.ProcessEnv },
  destination: { executable: string; args: string[]; env: NodeJS.ProcessEnv },
): Promise<void> {
  const sourceProcess = spawn(source.executable, source.args, {
    env: source.env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const destinationProcess = spawn(destination.executable, destination.args, {
    env: destination.env,
    stdio: ["pipe", "inherit", "inherit"],
  });
  assert(sourceProcess.stdout);
  assert(destinationProcess.stdin);
  sourceProcess.stdout.pipe(destinationProcess.stdin);

  try {
    await Promise.all([
      waitForFixtureCommand(sourceProcess, source.executable),
      waitForFixtureCommand(destinationProcess, destination.executable),
    ]);
  } catch (error) {
    sourceProcess.kill();
    destinationProcess.kill();
    throw new Error("Fixture database synchronization command failed", { cause: error });
  }
}

/** 사용자 지정 중복 확인 컬럼 (entityId별로 지정) */
export interface DuplicateCheckOptions {
  columns?: {
    [entityId: string]: string[];
  };
  includeRelations?: boolean;
  maxDepth?: number;
}

export class FixtureManagerClass {
  private testingDb: Knex | null = null;
  set tdb(tdb: Knex) {
    this.testingDb = tdb;
  }
  get tdb(): Knex {
    if (this.testingDb === null) {
      throw new Error("FixtureManager has not been initialized");
    }
    return this.testingDb;
  }

  private fixtureDb: Knex | null = null;
  set fdb(fdb: Knex) {
    this.fixtureDb = fdb;
  }
  get fdb(): Knex {
    if (this.fixtureDb === null) {
      throw new Error("FixtureManager has not been initialized");
    }
    return this.fixtureDb;
  }
  cachedTableNames: string[] | null = null;

  private relationGraph = new RelationGraph();

  // UpsertBuilder 기반 import를 위한 상태
  private builder: UpsertBuilder = new UpsertBuilder();
  private fixtureRefMap: Map<string, UBRef> = new Map();
  private skippedFixtures: Map<string, { entityId: string; existingId: number | string }> =
    new Map();

  init() {
    if (this.testingDb !== null) {
      return;
    }
    if (Sonamu.dbConfig.test && Sonamu.dbConfig.production) {
      const tConn = pgConnectionSchema.parse(Sonamu.dbConfig.test.connection);
      const pConn = pgConnectionSchema.parse(Sonamu.dbConfig.production.connection);
      if (
        `${tConn.host ?? "localhost"}:${tConn.port ?? 5432}/${tConn.database}` ===
        `${pConn.host ?? "localhost"}:${pConn.port ?? 5432}/${pConn.database}`
      ) {
        throw new Error(`테스트DB와 프로덕션DB에 동일한 데이터베이스가 사용되었습니다.`);
      }
    }

    this.tdb = createKnexInstance(Sonamu.dbConfig.test);
    this.fdb = createKnexInstance(Sonamu.dbConfig.fixture);
  }

  /**
    원격 fixture DB를 로컬 test DB로 복사합니다.
    pg_dump로 원격 DB를 덤프하고, pg_restore로 로컬에 복원합니다.
  */
  async sync() {
    const fixtureConn = pgConnectionSchema.parse(Sonamu.dbConfig.fixture.connection);
    const testConn = pgConnectionSchema.parse(Sonamu.dbConfig.test.connection);

    // 1. 로컬 test DB 연결 종료 및 재생성
    const testPgEnv = { PGPASSWORD: testConn.password || "" };
    const testPsqlArgs = [
      "-h",
      testConn.host ?? "localhost",
      "-p",
      String(testConn.port ?? 5432),
      "-U",
      testConn.user ?? "",
      "-d",
      "postgres",
      "-c",
    ];
    await executeFixtureCommand(
      "psql",
      [
        ...testPsqlArgs,
        `
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE datname = '${testConn.database}'
          AND pid <> pg_backend_pid();
      `,
      ],
      { stdio: "inherit", env: { ...process.env, ...testPgEnv } },
    );
    await executeFixtureCommand(
      "psql",
      [...testPsqlArgs, `DROP DATABASE IF EXISTS "${testConn.database}"`],
      { stdio: "inherit", env: { ...process.env, ...testPgEnv } },
    );
    await executeFixtureCommand(
      "psql",
      [...testPsqlArgs, `CREATE DATABASE "${testConn.database}"`],
      { stdio: "inherit", env: { ...process.env, ...testPgEnv } },
    );

    // 2. 원격 fixture DB → 로컬 test DB로 복사 (pg_dump | pg_restore)
    const fixturePgEnv = { PGPASSWORD: fixtureConn.password || "" };
    await pipeFixtureCommands(
      {
        executable: "pg_dump",
        args: [
          "-h",
          fixtureConn.host ?? "localhost",
          "-p",
          String(fixtureConn.port ?? 5432),
          "-U",
          fixtureConn.user ?? "",
          "-d",
          fixtureConn.database,
          "-Fc",
        ],
        env: { ...process.env, ...fixturePgEnv },
      },
      {
        executable: "pg_restore",
        args: [
          "-h",
          testConn.host ?? "localhost",
          "-p",
          String(testConn.port ?? 5432),
          "-U",
          testConn.user ?? "",
          "-d",
          testConn.database,
          "--no-owner",
          "--no-acl",
        ],
        env: { ...process.env, ...testPgEnv },
      },
    );
    // 3. 시퀀스 리셋 (데이터 복사 후 시퀀스를 MAX(id)로 정렬)
    await this.resetSequences(Sonamu.dbConfig.test);
  }

  /**
   * 모든 테이블의 시퀀스를 현재 MAX(id)로 리셋합니다.
   * fixture sync 후 시퀀스가 실제 데이터와 맞지 않는 문제를 해결합니다.
   */
  private async resetSequences(dbConfig: SonamuDBConfig["test"]) {
    const testDb = createKnexInstance(dbConfig);
    const entities = EntityManager.getAllEntities();

    try {
      for (const entity of entities) {
        const tableName = entity.table || entity.id.toLowerCase();

        // id 필드의 타입을 확인합니다
        const idProp = entity.props.find((p) => p.name === "id");
        const idType = idProp?.type;

        // integer/bigInteger이거나, string이지만 fixtureStrategy=sequence인 경우에만 리셋합니다
        const usesSequence =
          idType === "integer" ||
          idType === "bigInteger" ||
          idProp?.cone?.fixtureStrategy === "sequence";

        if (!usesSequence) {
          !isTest() &&
            console.log(
              `Skipping sequence reset for ${tableName} (id type: ${idType || "unknown"})`,
            );
          continue;
        }

        // PostgreSQL 시퀀스를 현재 테이블의 MAX(id)로 리셋합니다.
        // string 타입의 경우 숫자 캐스팅이 필요합니다.
        const maxExpr = idType === "string" ? "MAX(id::bigint)" : "MAX(id)";
        await testDb.raw(`
          SELECT setval(
            pg_get_serial_sequence('public.${tableName}', 'id'),
            COALESCE((SELECT ${maxExpr} FROM ${tableName}), 1)
          )
        `);
      }
    } finally {
      await testDb.destroy();
    }
  }

  private visitedRecords = new Set<string>();
  async importFixture(entityId: string, ids: number[]) {
    // 방문 기록 초기화 (새로운 import 작업 시작)
    this.visitedRecords.clear();

    const queries = unique(
      (
        await Promise.all(
          ids.map(async (id) => {
            return await this.getImportQueries(entityId, "id", id);
          }),
        )
      ).flat(),
    );

    const wdb = BaseModel.getDB("w");
    for (const query of queries) {
      await wdb.raw(query);
    }
  }

  async getImportQueries(entityId: string, field: string, id: number): Promise<string[]> {
    const recordKey = `${entityId}#${field}#${id}`;

    // 순환 참조 방지: 이미 방문한 레코드는 스킵
    if (this.visitedRecords.has(recordKey)) {
      return [];
    }
    this.visitedRecords.add(recordKey);

    const entity = EntityManager.get(entityId);
    const wdb = BaseModel.getDB("w");

    // 여기서 실DB의 row 가져옴
    const [row] = await wdb(entity.table).where(field, id).limit(1);
    if (row === undefined) {
      throw new Error(`${entityId}#${id} row를 찾을 수 없습니다.`);
    }

    // 픽스쳐DB, 실DB
    const fixtureDatabase = databaseConnectionSchema.parse(
      Sonamu.dbConfig.fixture.connection,
    ).database;
    const realDatabase = databaseConnectionSchema.parse(
      Sonamu.dbConfig.production.connection,
    ).database;

    const selfQuery = `INSERT IGNORE INTO \`${fixtureDatabase}\`.\`${entity.table}\` (SELECT * FROM \`${realDatabase}\`.\`${entity.table}\` WHERE \`id\` = ${id})`;

    const args = Object.entries(entity.relations)
      .filter(
        ([, relation]) =>
          isBelongsToOneRelationProp(relation) ||
          (isOneToOneRelationProp(relation) && relation.customJoinClause === undefined),
      )
      .map(([, relation]) => {
        /*
        BelongsToOne인 경우
          Category / 'id' / row[category_id] 호출
        OneToOne에 joinColumn === true 인 경우
          Profile / 'id' / row[profile_id] 호출
        OneToOne에 joinColumn === false 인 경우
          Profile / 'profile_id' / row['id'] 호출
        */
        let relationField: string;
        let relationId: number;
        if (isOneToOneRelationProp(relation) && !relation.hasJoinColumn) {
          const relatedEntity = EntityManager.get(relation.with);
          const relatedIdColumnName = relatedEntity.props.find(
            (p) => isRelationProp(p) && p.with === entity.id,
          )?.name;
          if (!relatedIdColumnName) {
            throw new Error(`${relatedEntity.id}의 ${entity.id} 관계 프롭을 찾을 수 없습니다.`);
          }
          relationField = `${relatedIdColumnName}_id`;
          relationId = row.id;
        } else {
          relationField = "id";
          relationId = row[`${relation.name}_id`];
        }
        return {
          entityId: relation.with,
          field: relationField,
          id: relationId,
        };
      })
      .filter((arg) => arg.id !== null);

    const relQueries = await Promise.all(
      args.map(async (relationArgs) => {
        return this.getImportQueries(relationArgs.entityId, relationArgs.field, relationArgs.id);
      }),
    );

    return [...unique(relQueries.toReversed().flat()), selfQuery];
  }

  async destroy() {
    if (this.testingDb) {
      await this.testingDb.destroy();
      this.testingDb = null;
    }
    if (this.fixtureDb) {
      await this.fixtureDb.destroy();
      this.fixtureDb = null;
    }
    await BaseModel.destroy();
  }

  async getFixtures(
    sourceDBName: keyof SonamuDBConfig,
    targetDBName: keyof SonamuDBConfig,
    searchOptions: FixtureSearchOptions,
    duplicateCheck?: DuplicateCheckOptions,
  ) {
    const sourceDB = createKnexInstance(Sonamu.dbConfig[sourceDBName]);
    const targetDB = createKnexInstance(Sonamu.dbConfig[targetDBName]);

    try {
      const { entityId, field, value, searchType } = searchOptions;

      const entity = EntityManager.get(entityId);
      const column =
        entity.props.find((prop) => prop.name === field)?.type === "relation"
          ? `${field}_id`
          : field;

      let query = sourceDB(entity.table);
      if (searchType === "equals") {
        query = query.where(column, value);
      } else if (searchType === "like") {
        query = query.where(column, "like", `%${value}%`);
      }

      const rows = await query;
      if (rows.length === 0) {
        throw new Error("No records found");
      }

      const fixtures: FixtureRecord[] = [];
      for (const row of rows) {
        const initialRecordsLength = fixtures.length;
        const newRecords = await this.createFixtureRecord(entity, row, {
          db: sourceDB,
          includeRelations: duplicateCheck?.includeRelations,
          maxDepth: duplicateCheck?.maxDepth,
        });
        fixtures.push(...newRecords);
        const currentFixtureRecord = fixtures.find((r) => r.fixtureId === `${entityId}#${row.id}`);

        if (currentFixtureRecord) {
          // 현재 fixture로부터 생성된 fetchedRecords 설정
          currentFixtureRecord.fetchedRecords = fixtures
            .filter((r) => r.fixtureId !== currentFixtureRecord.fixtureId)
            .slice(initialRecordsLength)
            .map((r) => r.fixtureId);
        }
      }

      for (const fixture of fixtures) {
        const fixtureEntity = EntityManager.get(fixture.entityId);

        // 사용자 지정 컬럼 기준 중복 확인 → target
        const customColumns = duplicateCheck?.columns?.[fixture.entityId];
        if (customColumns && customColumns.length > 0) {
          const customDuplicateRow = await this.checkDuplicateByColumns(
            targetDB,
            fixtureEntity,
            fixture,
            customColumns,
          );
          if (customDuplicateRow) {
            const [record] = await this.createFixtureRecord(fixtureEntity, customDuplicateRow, {
              singleRecord: true,
              db: targetDB,
            });
            fixture.target = record;
          }
        }

        // Unique index 기준 중복 확인 → fixture.unique
        const uniqueRow = await this.checkUniqueViolation(targetDB, fixtureEntity, fixture);
        if (uniqueRow) {
          const [record] = await this.createFixtureRecord(fixtureEntity, uniqueRow, {
            singleRecord: true,
            db: targetDB,
          });
          fixture.unique = record;
        }
      }

      return unique(fixtures, (f) => f.fixtureId);
    } finally {
      await Promise.allSettled([targetDB.destroy(), sourceDB.destroy()]);
    }
  }

  async createFixtureRecord(
    rootEntity: Entity,
    rootRow: FixtureSourceRecord,
    options?: {
      singleRecord?: boolean;
      db?: Knex;
      includeRelations?: boolean;
      maxDepth?: number;
    },
  ): Promise<FixtureRecord[]> {
    const records: FixtureRecord[] = [];
    const visitedEntities = new Set<string>();

    const create = async (entity: Entity, row: FixtureSourceRecord, depth: number) => {
      const fixtureId = `${entity.id}#${row.id}`;
      if (visitedEntities.has(fixtureId)) {
        return;
      }
      visitedEntities.add(fixtureId);

      const record: FixtureRecord = {
        fixtureId,
        entityId: entity.id,
        id: row.id,
        columns: {},
        fetchedRecords: [],
        belongsRecords: [],
      };

      for (const prop of entity.props) {
        if (isVirtualProp(prop)) {
          continue;
        }

        // SAFETY: FixtureRecord의 레거시 값 타입보다 실제 DB/JSON fixture 값 계약이 넓습니다.
        const columnValue = row[prop.name] as FixtureRecord["columns"][string]["value"];
        record.columns[prop.name] = {
          prop: prop,
          value: columnValue,
        };

        const db = options?.db ?? BaseModel.getDB("w");
        if (isManyToManyRelationProp(prop)) {
          const relatedEntity = EntityManager.get(prop.with);
          const throughTable = prop.joinTable;
          const fromColumn = `${inflection.singularize(entity.table)}_id`;
          const toColumn = `${inflection.singularize(relatedEntity.table)}_id`;

          const relatedIds = await db(throughTable).where(fromColumn, row.id).pluck(toColumn);
          record.columns[prop.name].value = relatedIds;
        } else if (isHasManyRelationProp(prop)) {
          const relatedEntity = EntityManager.get(prop.with);
          const relatedIds = await db(relatedEntity.table)
            .where(prop.joinColumn, row.id)
            .pluck("id");
          record.columns[prop.name].value = relatedIds;
        } else if (isOneToOneRelationProp(prop) && !prop.hasJoinColumn) {
          // 역방향 OneToOne: FK를 가진 관련 엔티티를 찾습니다
          // 예시: User OneToOne Employee (Employee가 user_id FK를 가짐)
          const relatedEntity = EntityManager.get(prop.with);
          const relatedProp = relatedEntity.props.find(
            (p) => isRelationProp(p) && p.with === entity.id,
          );
          if (relatedProp && isRelationProp(relatedProp)) {
            // 관련 엔티티에서 FK 컬럼으로 쿼리합니다 (id가 아님)
            const fkColumn = `${relatedProp.name}_id`;
            const relatedRow = await db(relatedEntity.table).where(fkColumn, row.id).first();
            record.columns[prop.name].value = relatedRow?.id;
          }
        } else if (isRelationProp(prop)) {
          const relatedId = relationIdSchema.parse(row[`${prop.name}_id`]);
          record.columns[prop.name].value = relatedId;
          if (relatedId) {
            record.belongsRecords.push(`${prop.with}#${relatedId}`);
          }
          if (
            !options?.singleRecord &&
            options?.includeRelations !== false &&
            depth < (options?.maxDepth ?? Number.POSITIVE_INFINITY) &&
            relatedId
          ) {
            const relatedEntity = EntityManager.get(prop.with);
            const relatedRow = await db(relatedEntity.table).where("id", relatedId).first();
            if (relatedRow) {
              await create(
                relatedEntity,
                {
                  ...dataExplorerRecordSchema.parse(relatedRow),
                  id: z.union([z.number(), z.string()]).parse(relatedRow.id),
                },
                depth + 1,
              );
            }
          }
        }
      }

      records.push(record);
    };

    await create(rootEntity, rootRow, 0);

    return records;
  }

  /**
   * 1. RelationGraph로 fixture 단위 삽입 순서 계산 (self-reference 포함)
   * 2. 테이블별 레벨별로 UpsertBuilder에 등록 및 upsert 실행
   * 3. 순서 기반 uuid→id 매핑 (UpsertBuilder가 uuid를 DB에 저장하지 않으므로)
   *
   * UpsertBuilder는 self-reference가 있으면 buildInsertLevels()로 재정렬하여
   * 등록 순서와 반환 순서가 달라질 수 있습니다. 이를 방지하기 위해
   * FixtureManager가 레벨별로 나눠서 처리하여 각 upsert 호출에서는
   * self-reference가 없도록 합니다.
   */
  async insertFixtures(
    dbName: keyof SonamuDBConfig,
    _fixtures: FixtureRecord[],
  ): Promise<FixtureImportResult[]> {
    const fixtures = unique(_fixtures, (f) => f.fixtureId);

    // 초기화
    this.builder = new UpsertBuilder();
    this.fixtureRefMap = new Map();
    this.skippedFixtures = new Map();

    // 병렬 테스트 모드에서는 worker별 DB에 저장
    const dbConfig =
      process.env.SONAMU_WORKER_DB === "true" && process.env.VITEST_POOL_ID
        ? (() => {
            const workerId = parseInt(process.env.VITEST_POOL_ID ?? "1", 10);
            const baseConfig = Sonamu.dbConfig[dbName];
            const connection = databaseConnectionSchema.parse(baseConfig.connection);
            return {
              ...baseConfig,
              connection: { ...connection, database: `${connection.database}_${workerId}` },
              pool: { min: 1, max: 1 },
            };
          })()
        : Sonamu.dbConfig[dbName];
    const db = createKnexInstance(dbConfig);
    const results: FixtureImportResult[] = [];

    try {
      // 1. RelationGraph로 fixture 단위 삽입 순서 계산
      this.relationGraph.buildGraph(fixtures);
      const insertionOrder = this.relationGraph.getInsertionOrder();

      // 2. 스킵할 fixture 먼저 처리 (override 체크)
      for (const fixtureId of insertionOrder) {
        const fixture = fixtures.find((f) => f.fixtureId === fixtureId);
        if (!fixture) continue;

        const hasTarget = !!fixture.target;
        const hasUnique = !!fixture.unique;
        const hasDuplicate = hasTarget || hasUnique;

        // 중복이 있고 override=false인 경우: 스킵
        if (hasDuplicate && !fixture.override) {
          // 기존 레코드 ID 저장 (unique 우선, 없으면 target)
          const existingId = fixture.unique?.id ?? fixture.target?.id;
          assert(existingId);
          this.skippedFixtures.set(fixtureId, {
            entityId: fixture.entityId,
            existingId,
          });

          !isTest() &&
            console.log(
              chalk.yellow(
                `Skipped ${fixture.entityId}#${fixture.id} (existing: #${existingId}, override: false)`,
              ),
            );
        }
      }

      // 3. 테이블별 fixture 그룹화 (insertionOrder 순서 기반)
      const fixturesByTable = new Map<string, FixtureRecord[]>();
      const tableOrder: string[] = [];

      for (const fixtureId of insertionOrder) {
        // 스킵된 fixture 제외
        if (this.skippedFixtures.has(fixtureId)) continue;

        const fixture = fixtures.find((f) => f.fixtureId === fixtureId);
        if (!fixture) continue;

        const entity = EntityManager.get(fixture.entityId);
        const tableName = entity.table;

        if (!fixturesByTable.has(tableName)) {
          fixturesByTable.set(tableName, []);
          tableOrder.push(tableName);
        }
        fixturesByTable.get(tableName)?.push(fixture);
      }

      await db.transaction(async (trx) => {
        const insertedIdsByTable = new Map<string, Map<string, number | string>>();

        // 4. 테이블별 레벨별 처리
        for (const tableName of tableOrder) {
          const tableFixtures = fixturesByTable.get(tableName) ?? [];
          const levels = this.groupFixturesByLevel(tableFixtures);

          for (const levelFixtures of levels) {
            // 해당 레벨의 fixture들 register
            for (const fixture of levelFixtures) {
              this.registerFixture(fixture, insertedIdsByTable);
              !isTest() &&
                console.log(
                  chalk.blue(
                    `Registered ${fixture.entityId}#${fixture.id}${fixture.override ? ` (override)` : ""}`,
                  ),
                );
            }

            // upsert 실행 전 uuid 목록 저장
            const table = this.builder.getTable(tableName);
            const uuids = table.rows.map((row) => z.string().parse(row.uuid));

            !isTest() &&
              console.log(
                chalk.blue(
                  `Upserting ${tableName} with ${uuids.length} rows (level ${levels.indexOf(levelFixtures) + 1}/${levels.length})`,
                ),
              );
            // SAFETY: tableName은 등록된 Entity의 실제 테이블명에서만 생성됩니다.
            const schemaTableName = tableName as keyof DatabaseSchemaExtend;
            const ids = fixtureRecordIdsSchema.parse(
              await this.builder.upsert(trx, schemaTableName),
            );

            // 순서 기반 uuid -> id 매핑
            // self-reference가 없으므로 등록 순서 = 반환 순서 보장
            if (uuids.length > 0 && uuids.length === ids.length) {
              const existingMap =
                insertedIdsByTable.get(tableName) ?? new Map<string, number | string>();
              for (let i = 0; i < uuids.length; i++) {
                existingMap.set(uuids[i], ids[i]);
              }
              insertedIdsByTable.set(tableName, existingMap);
            } else if (uuids.length !== ids.length) {
              console.warn(
                chalk.yellow(
                  `Warning: uuid count (${uuids.length}) != id count (${ids.length}) for ${tableName}`,
                ),
              );
            }
          }
        }

        // 5. ManyToMany 관계 처리
        await this.processManyToManyRelations(trx, fixtures, insertedIdsByTable);

        // 6. PostgreSQL 시퀀스 리셋
        // Fixture 삽입 후 각 테이블의 ID 시퀀스를 최대 ID 값으로 업데이트합니다.
        // 이렇게 하지 않으면 다음 INSERT 시 ID가 2000번대로 생성될 수 있습니다.
        !isTest() && console.log(chalk.blue("Resetting sequences..."));
        for (const tableName of tableOrder) {
          try {
            // Entity를 찾아서 id 타입 확인
            const entity = EntityManager.getAllEntities().find(
              (e) => e.table === tableName || e.id.toLowerCase() === tableName,
            );

            if (entity) {
              const idProp = entity.props.find((p) => p.name === "id");
              const idType = idProp?.type;

              // integer/bigInteger이거나, string이지만 fixtureStrategy=sequence인 경우에만 리셋합니다
              const usesSequence =
                idType === "integer" ||
                idType === "bigInteger" ||
                idProp?.cone?.fixtureStrategy === "sequence";

              if (!usesSequence) {
                !isTest() &&
                  console.log(
                    chalk.gray(
                      `Skipped sequence reset for ${tableName} (id type: ${idType || "unknown"})`,
                    ),
                  );
                continue;
              }
            }

            // 테이블의 최대 ID 조회 (string 타입은 숫자 캐스팅 필요)
            const entity2 = EntityManager.getAllEntities().find(
              (e) => e.table === tableName || e.id.toLowerCase() === tableName,
            );
            const idType2 = entity2?.props.find((p) => p.name === "id")?.type;
            const maxIdResult =
              idType2 === "string"
                ? await trx
                    .raw(`SELECT MAX(id::bigint) as max_id FROM "${tableName}"`)
                    .then((r) => r.rows[0])
                : await trx(tableName).max("id as max_id").first();
            const maxId = maxIdResult?.max_id;

            if (maxId !== null && maxId !== undefined) {
              // 시퀀스명을 pg_get_serial_sequence로 안전하게 조회
              await trx.raw(`SELECT setval(pg_get_serial_sequence(?, 'id'), ?)`, [
                tableName,
                maxId,
              ]);
              !isTest() && console.log(chalk.green(`Reset sequence for ${tableName}: ${maxId}`));
            }
          } catch {
            // 시퀀스가 없는 테이블(join table 등)은 무시
            !isTest() && console.log(chalk.gray(`Skipped sequence reset for ${tableName}`));
          }
        }

        // 7. 결과 수집
        for (const fixture of fixtures) {
          const entity = EntityManager.get(fixture.entityId);

          // 스킵된 fixture는 기존 레코드 정보로 결과 추가
          const skipped = this.skippedFixtures.get(fixture.fixtureId);
          if (skipped) {
            results.push({
              entityId: fixture.entityId,
              data: await trx(entity.table).where("id", skipped.existingId).first(),
            });
            continue;
          }

          const ref = this.fixtureRefMap.get(fixture.fixtureId);
          if (ref) {
            const uuidToId = insertedIdsByTable.get(entity.table);
            const insertedId = uuidToId?.get(ref.uuid);

            if (insertedId !== undefined) {
              results.push({
                entityId: fixture.entityId,
                data: await trx(entity.table).where("id", insertedId).first(),
              });

              !isTest() &&
                console.log(
                  chalk.green(`Inserted into ${entity.table}: #${fixture.id} -> #${insertedId}`),
                );
            }
          }
        }
      });
    } finally {
      await db.destroy();
    }

    return unique(results, (r) => `${r.entityId}#${r.data.id}`);
  }

  /**
   * FixtureRecord를 UpsertBuilder에 등록
   * @param insertedIdsByTable 이미 upsert된 테이블의 uuid→id 매핑 (레벨별 처리 시 사용)
   */
  private registerFixture(
    fixture: FixtureRecord,
    insertedIdsByTable?: Map<string, Map<string, number | string>>,
  ): UBRef {
    const entity = EntityManager.get(fixture.entityId);
    const row: UpsertRow = {};

    // Override 모드 판단: target 또는 unique가 있고 override=true인 경우
    const existingRecord = fixture.target ?? fixture.unique;
    const isOverrideMode = fixture.override && existingRecord;

    for (const [propName, column] of Object.entries(fixture.columns)) {
      const prop = column.prop;

      if (isVirtualProp(prop)) {
        continue;
      }

      // Generated column은 INSERT에서 제외 (DB가 자동 생성)
      if ("generated" in prop && prop.generated) {
        continue;
      }

      // id 처리
      if (propName === "id") {
        const idProp = entity.props.find((p) => p.name === "id");
        // parentId 엔티티의 id는 부모 엔티티의 FK이므로 시퀀스 미사용 (명시적으로 포함)
        const usesSequence =
          !entity.parentId &&
          (idProp?.type === "integer" ||
            idProp?.type === "bigInteger" ||
            idProp?.cone?.fixtureStrategy === "sequence");

        if (isOverrideMode && existingRecord) {
          // Override: 기존 레코드의 값 사용 → UPDATE
          row[propName] = existingRecord.columns[propName]?.value;
        } else if (!usesSequence) {
          // string PK 또는 parentId 엔티티 FK: 생성된 id 값을 INSERT에 포함
          row[propName] = column.value;
        }
        // integer/bigInteger PK: DB 시퀀스에 맡김 (값 제외)
        continue;
      }

      if (isRelationProp(prop)) {
        if (
          isBelongsToOneRelationProp(prop) ||
          (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
        ) {
          const relatedId = relationIdSchema.parse(column.value);
          if (relatedId !== null && relatedId !== undefined) {
            const relatedFixtureId = `${prop.with}#${relatedId}`;

            // 먼저 skip된 fixture인지 확인
            const skippedExistingId = this.skippedFixtures.get(relatedFixtureId)?.existingId;
            if (skippedExistingId !== undefined) {
              // skip된 fixture → target DB의 기존 레코드 id 사용
              row[`${propName}_id`] = skippedExistingId;
            } else {
              const relatedRef = this.fixtureRefMap.get(relatedFixtureId);
              if (relatedRef) {
                // 이미 upsert된 같은 테이블 fixture 확인
                const relatedEntity = EntityManager.get(prop.with);
                const relatedInsertedIds = insertedIdsByTable?.get(relatedEntity.table);
                const actualId = relatedInsertedIds?.get(relatedRef.uuid);

                if (actualId !== undefined) {
                  // 이미 upsert됨 → 실제 ID 사용
                  row[`${propName}_id`] = actualId;
                } else {
                  // 아직 upsert 안됨 → UBRef 사용
                  row[`${propName}_id`] = relatedRef;
                }
              } else {
                // fixtures에 포함되지 않은 레코드 → ID 그대로 사용
                row[`${propName}_id`] = relatedId;
              }
            }
          } else {
            row[`${propName}_id`] = null;
          }
        }
        // HasMany, ManyToMany는 별도 처리
      } else {
        // 일반 컬럼
        row[propName] = this.convertColumnValue(prop, column.value);
      }
    }

    !isTest() &&
      console.log(chalk.blue(`Registering ${entity.table} - ${inspect(row, false, null, true)}`));
    const ref = this.builder.register(entity.table, row);
    this.fixtureRefMap.set(fixture.fixtureId, ref);

    return ref;
  }

  /**
   * 컬럼 값 변환
   */
  private convertColumnValue(
    prop: EntityProp,
    value: FixtureRecord["columns"][string]["value"],
  ): DataExplorerValue {
    if (value === null || value === undefined) {
      return null;
    }

    switch (prop.type) {
      case "json":
        // UpsertBuilder.register에서 JSON.stringify 처리하므로 object 그대로 전달
        return value;

      case "date":
        {
          const dateSource = z.union([z.string(), z.number()]).safeParse(value);
          if (dateSource.success) {
            return new Date(dateSource.data);
          }
        }
        return value;

      default:
        return value;
    }
  }

  private async processManyToManyRelations(
    trx: Knex.Transaction,
    fixtures: FixtureRecord[],
    insertedIdsByTable: Map<string, Map<string, number | string>>,
  ): Promise<void> {
    for (const fixture of fixtures) {
      const entity = EntityManager.get(fixture.entityId);
      const sourceRef = this.fixtureRefMap.get(fixture.fixtureId);

      if (!sourceRef) continue;

      const sourceUuidToId = insertedIdsByTable.get(entity.table);
      const sourceId = sourceUuidToId?.get(sourceRef.uuid);

      if (sourceId === undefined) continue;

      for (const [, column] of Object.entries(fixture.columns)) {
        const prop = column.prop;

        if (isManyToManyRelationProp(prop) && Array.isArray(column.value)) {
          // 선택되지 않은 ManyToMany 관계는 저장하지 않음
          const targetTable = EntityManager.get(prop.with);
          if (!this.builder.hasTable(targetTable.table)) continue;

          const relatedIds = fixtureRecordIdsSchema.parse(column.value);
          if (relatedIds.length === 0) continue;

          const joinTable = prop.joinTable;
          const relatedEntity = EntityManager.get(prop.with);

          const sourceColumn = `${inflection.singularize(entity.table)}_id`;
          const targetColumn = `${inflection.singularize(relatedEntity.table)}_id`;

          for (const relatedId of relatedIds) {
            const relatedFixtureId = `${prop.with}#${relatedId}`;
            const relatedRef = this.fixtureRefMap.get(relatedFixtureId);

            let targetId: number | string;

            if (relatedRef) {
              const relatedUuidToId = insertedIdsByTable.get(relatedEntity.table);
              const resolvedId = relatedUuidToId?.get(relatedRef.uuid);

              if (resolvedId === undefined) {
                console.warn(
                  `Related fixture ${relatedFixtureId} not found in insertedIds, skipping`,
                );
                continue;
              }
              targetId = resolvedId;
            } else {
              targetId = relatedId;
            }

            // JoinTable에 삽입
            const [found] = await trx(joinTable)
              .where({
                [sourceColumn]: sourceId,
                [targetColumn]: targetId,
              })
              .limit(1);

            if (!found) {
              await trx(joinTable).insert({
                [sourceColumn]: sourceId,
                [targetColumn]: targetId,
              });

              !isTest() &&
                console.log(
                  chalk.green(
                    `Inserted into ${joinTable}: ${entity.table}(${sourceId}) - ${relatedEntity.table}(${targetId})`,
                  ),
                );
            }
          }
        }
      }
    }
  }

  /**
   * 같은 테이블 내 fixture들을 self-reference 레벨별로 분할
   * - self-reference가 없는 fixture들: Level 0
   * - Level 0을 참조하는 fixture들: Level 1
   * - 반복
   *
   * UpsertBuilder가 self-reference가 있으면 buildInsertLevels()로 재정렬하여
   * 등록 순서와 반환 순서가 달라질 수 있습니다.
   * 이를 방지하기 위해 FixtureManager가 레벨별로 나눠서 처리합니다.
   */
  private groupFixturesByLevel(fixtures: FixtureRecord[]): FixtureRecord[][] {
    if (fixtures.length === 0) {
      return [];
    }

    const entity = EntityManager.get(fixtures[0].entityId);

    // self-reference relation prop 찾기
    const selfRefProps = entity.props.filter(
      (p): p is BelongsToOneRelationProp | OneToOneRelationProp =>
        isRelationProp(p) &&
        (isBelongsToOneRelationProp(p) || (isOneToOneRelationProp(p) && p.hasJoinColumn)) &&
        p.with === entity.id,
    );

    if (selfRefProps.length === 0) {
      // self-reference 없음 → 단일 레벨
      return [fixtures];
    }

    // 레벨별 분할 (topological sort)
    const levels: FixtureRecord[][] = [];
    const remaining = new Set(fixtures.map((f) => f.fixtureId));
    const processed = new Set<string>();

    while (remaining.size > 0) {
      const currentLevel: FixtureRecord[] = [];

      for (const fixture of fixtures) {
        if (!remaining.has(fixture.fixtureId)) continue;

        // self-reference가 모두 이미 처리됐거나 null인 경우
        const canProcess = selfRefProps.every((prop) => {
          const refId = relationIdSchema.parse(fixture.columns[prop.name]?.value);
          if (refId === null || refId === undefined) return true;
          const refFixtureId = `${prop.with}#${refId}`;
          // 이미 처리됐거나, 현재 fixtures에 포함되지 않은 경우 (외부 참조)
          return processed.has(refFixtureId) || !remaining.has(refFixtureId);
        });

        if (canProcess) {
          currentLevel.push(fixture);
        }
      }

      if (currentLevel.length === 0) {
        const remainingIds = Array.from(remaining).join(", ");
        throw new Error(
          `Circular self-reference detected in ${entity.table}. Remaining fixtures: ${remainingIds}`,
        );
      }

      for (const fixture of currentLevel) {
        remaining.delete(fixture.fixtureId);
        processed.add(fixture.fixtureId);
      }

      levels.push(currentLevel);
    }

    return levels;
  }

  private async checkUniqueViolation(db: Knex, entity: Entity, fixture: FixtureRecord) {
    const entityUniqueIndexes = entity.indexes?.filter((i) => i.type === "unique") ?? [];

    const uniqueIndexes = entityUniqueIndexes.filter((index) =>
      index.columns.every((column) => !column.name.startsWith(`${entity.table}__`)),
    );
    if (uniqueIndexes.length === 0) {
      return null;
    }

    let uniqueQuery = db(entity.table);
    let hasCondition = false;

    for (const index of uniqueIndexes) {
      // 컬럼 중 하나라도 null이면 유니크 제약을 위반하지 않기 때문에 해당 인덱스는 무시
      const containsNull = index.columns.some((column) => {
        const field = column.name.replace(/_id$/, "");
        return fixture.columns[field]?.value === null;
      });
      if (containsNull) {
        continue;
      }

      uniqueQuery = uniqueQuery.orWhere((qb) => {
        for (const column of index.columns) {
          const field = column.name.replace(/_id$/, "");

          if (Array.isArray(fixture.columns[field]?.value)) {
            qb.whereIn(column.name, fixture.columns[field].value);
          } else {
            qb.andWhere(column.name, fixture.columns[field]?.value);
          }
        }
      });
      hasCondition = true;
    }

    if (!hasCondition) {
      return null;
    }

    const [uniqueFound] = await uniqueQuery;
    return uniqueFound;
  }

  private async checkDuplicateByColumns(
    db: Knex,
    entity: Entity,
    fixture: FixtureRecord,
    columns: string[],
  ) {
    if (columns.length === 0) {
      return null;
    }

    const whereClause: DataExplorerRecord = {};

    for (const column of columns) {
      // relation 필드인 경우 _id 붙이기
      const prop = entity.props.find((p) => p.name === column);
      const dbColumn = prop && isRelationProp(prop) ? `${column}_id` : column;
      const value = fixture.columns[column]?.value;

      // null 값이 포함된 경우 중복 확인 스킵
      if (value === null || value === undefined) {
        return null;
      }

      whereClause[dbColumn] = value;
    }

    const [found] = await db(entity.table).where(whereClause).limit(1);
    return found;
  }

  async addFixtureLoader(code: string) {
    const path = `${Sonamu.apiRootPath}/src/testing/fixture.ts`;
    const content = await readFile(path, "utf8");

    const fixtureLoaderStart = content.indexOf("const fixtureLoader = {");
    const fixtureLoaderEnd = content.indexOf("};", fixtureLoaderStart);

    if (fixtureLoaderStart !== -1 && fixtureLoaderEnd !== -1) {
      const newContent = `${content.slice(0, fixtureLoaderEnd)}  ${code}\n${content.slice(fixtureLoaderEnd)}`;

      await writeFile(path, newContent);
    } else {
      throw new Error("Failed to find fixtureLoader in fixture.ts");
    }
  }
}

export const FixtureManager = new FixtureManagerClass();
