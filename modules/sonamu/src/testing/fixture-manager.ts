import assert from "assert";
import chalk from "chalk";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import inflection from "inflection";
import knex, { type Knex } from "knex";
import { unique } from "radashi";
import { inspect } from "util";
import { Sonamu } from "../api";
import { BaseModel } from "../database/base-model";
import type { SonamuDBConfig } from "../database/db";
import { type UBRef, UpsertBuilder } from "../database/upsert-builder";
import type { Entity } from "../entity/entity";
import { EntityManager } from "../entity/entity-manager";
import {
  type DatabaseSchemaExtend,
  type EntityProp,
  type FixtureImportResult,
  type FixtureRecord,
  type FixtureSearchOptions,
  isBelongsToOneRelationProp,
  isHasManyRelationProp,
  isManyToManyRelationProp,
  isOneToOneRelationProp,
  isRelationProp,
  isVirtualProp,
  type ManyToManyRelationProp,
} from "../types/types";
import { RelationGraph } from "./_relation-graph";

/** 사용자 지정 중복 확인 컬럼 (entityId별로 지정) */
export interface DuplicateCheckOptions {
  columns?: {
    [entityId: string]: string[];
  };
}

export class FixtureManagerClass {
  private _tdb: Knex | null = null;
  set tdb(tdb: Knex) {
    this._tdb = tdb;
  }
  get tdb(): Knex {
    if (this._tdb === null) {
      throw new Error("FixtureManager has not been initialized");
    }
    return this._tdb;
  }

  private _fdb: Knex | null = null;
  set fdb(fdb: Knex) {
    this._fdb = fdb;
  }
  get fdb(): Knex {
    if (this._fdb === null) {
      throw new Error("FixtureManager has not been initialized");
    }
    return this._fdb;
  }
  cachedTableNames: string[] | null = null;

  private relationGraph = new RelationGraph();

  // UpsertBuilder 기반 import를 위한 상태
  private builder: UpsertBuilder = new UpsertBuilder();
  private fixtureRefMap: Map<string, UBRef> = new Map();
  private uuidToFixtureId: Map<string, string> = new Map();
  private skippedFixtures: Map<string, { entityId: string; existingId: number }> = new Map();

  init() {
    if (this._tdb !== null) {
      return;
    }
    if (Sonamu.dbConfig.test && Sonamu.dbConfig.production_master) {
      const tConn = Sonamu.dbConfig.test.connection as Knex.ConnectionConfig & {
        port?: number;
      };
      const pConn = Sonamu.dbConfig.production_master.connection as Knex.ConnectionConfig & {
        port?: number;
      };
      if (
        `${tConn.host ?? "localhost"}:${tConn.port ?? 5432}/${tConn.database}` ===
        `${pConn.host ?? "localhost"}:${pConn.port ?? 5432}/${pConn.database}`
      ) {
        throw new Error(`테스트DB와 프로덕션DB에 동일한 데이터베이스가 사용되었습니다.`);
      }
    }

    this.tdb = knex(Sonamu.dbConfig.test);
    this.fdb = knex(Sonamu.dbConfig.fixture_remote);
  }

  async getChecksum(db: Knex, tableName: string) {
    const [[checksumRow]] = await db.raw(`CHECKSUM TABLE ${tableName}`);
    return checksumRow.Checksum;
  }

  /**
    원격 fixture DB를 로컬 test DB로 복사합니다.
    pg_dump로 원격 DB를 덤프하고, pg_restore로 로컬에 복원합니다.
  */
  async sync() {
    const fixtureConn = Sonamu.dbConfig.fixture_remote.connection as Knex.PgConnectionConfig;
    const testConn = Sonamu.dbConfig.test.connection as Knex.PgConnectionConfig;

    // 1. 로컬 test DB 연결 종료 및 재생성
    const testPgEnv = { PGPASSWORD: testConn.password || "" };
    execSync(
      `psql -h ${testConn.host} -p ${testConn.port ?? 5432} -U ${testConn.user} -d postgres -c "
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE datname = '${testConn.database}'
          AND pid <> pg_backend_pid();
      "`,
      { stdio: "inherit", env: { ...process.env, ...testPgEnv } as NodeJS.ProcessEnv },
    );

    execSync(
      `psql -h ${testConn.host} -p ${testConn.port ?? 5432} -U ${testConn.user} -d postgres -c "DROP DATABASE IF EXISTS \\"${testConn.database}\\""`,
      { stdio: "inherit", env: { ...process.env, ...testPgEnv } as NodeJS.ProcessEnv },
    );

    execSync(
      `psql -h ${testConn.host} -p ${testConn.port ?? 5432} -U ${testConn.user} -d postgres -c "CREATE DATABASE \\"${testConn.database}\\""`,
      { stdio: "inherit", env: { ...process.env, ...testPgEnv } as NodeJS.ProcessEnv },
    );

    // 2. 원격 fixture DB → 로컬 test DB로 복사 (pg_dump | pg_restore)
    const fixturePgEnv = { PGPASSWORD: fixtureConn.password || "" };
    const dumpCmd = `pg_dump -h ${fixtureConn.host} -p ${fixtureConn.port ?? 5432} -U ${fixtureConn.user} -d ${fixtureConn.database} -Fc`;
    const restoreCmd = `pg_restore -h ${testConn.host} -p ${testConn.port ?? 5432} -U ${testConn.user} -d ${testConn.database} --no-owner --no-acl`;

    execSync(`${dumpCmd} | PGPASSWORD="${testConn.password || ""}" ${restoreCmd}`, {
      stdio: "inherit",
      env: { ...process.env, ...fixturePgEnv } as NodeJS.ProcessEnv,
      shell: "/bin/bash",
    });
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
      const [rsh] = await wdb.raw(query);
      console.log({
        query,
        info: rsh.info,
      });
    }
  }

  async getImportQueries(entityId: string, field: string, id: number): Promise<string[]> {
    const recordKey = `${entityId}#${field}#${id}`;

    // 순환 참조 방지: 이미 방문한 레코드는 스킵
    if (this.visitedRecords.has(recordKey)) {
      return [];
    }
    this.visitedRecords.add(recordKey);

    console.log({ entityId, field, id });
    const entity = EntityManager.get(entityId);
    const wdb = BaseModel.getDB("w");

    // 여기서 실DB의 row 가져옴
    const [row] = await wdb(entity.table).where(field, id).limit(1);
    if (row === undefined) {
      throw new Error(`${entityId}#${id} row를 찾을 수 없습니다.`);
    }

    // 픽스쳐DB, 실DB
    const fixtureDatabase = (Sonamu.dbConfig.fixture_remote.connection as Knex.ConnectionConfig)
      .database;
    const realDatabase = (Sonamu.dbConfig.production_master.connection as Knex.ConnectionConfig)
      .database;

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
        let field: string;
        let id: number;
        if (isOneToOneRelationProp(relation) && !relation.hasJoinColumn) {
          const relatedEntity = EntityManager.get(relation.with);
          const relatedIdColumnName = relatedEntity.props.find(
            (p) => isRelationProp(p) && p.with === entity.id,
          )?.name;
          if (!relatedIdColumnName) {
            throw new Error(`${relatedEntity.id}의 ${entity.id} 관계 프롭을 찾을 수 없습니다.`);
          }
          field = `${relatedIdColumnName}_id`;
          id = row.id;
        } else {
          field = "id";
          id = row[`${relation.name}_id`];
        }
        return {
          entityId: relation.with,
          field,
          id,
        };
      })
      .filter((arg) => arg.id !== null);

    const relQueries = await Promise.all(
      args.map(async (args) => {
        return this.getImportQueries(args.entityId, args.field, args.id);
      }),
    );

    return [...unique(relQueries.reverse().flat()), selfQuery];
  }

  async destroy() {
    if (this._tdb) {
      await this._tdb.destroy();
      this._tdb = null;
    }
    if (this._fdb) {
      await this._fdb.destroy();
      this._fdb = null;
    }
    await BaseModel.destroy();
  }

  async getFixtures(
    sourceDBName: keyof SonamuDBConfig,
    targetDBName: keyof SonamuDBConfig,
    searchOptions: FixtureSearchOptions,
    duplicateCheck?: DuplicateCheckOptions,
  ) {
    const sourceDB = knex(Sonamu.dbConfig[sourceDBName]);
    const targetDB = knex(Sonamu.dbConfig[targetDBName]);

    const { entityId, field, value, searchType } = searchOptions;

    const entity = EntityManager.get(entityId);
    const column =
      entity.props.find((prop) => prop.name === field)?.type === "relation" ? `${field}_id` : field;

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
        _db: sourceDB,
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

    for await (const fixture of fixtures) {
      const entity = EntityManager.get(fixture.entityId);

      // 사용자 지정 컬럼 기준 중복 확인 → target
      const customColumns = duplicateCheck?.columns?.[fixture.entityId];
      if (customColumns && customColumns.length > 0) {
        const customDuplicateRow = await this.checkDuplicateByColumns(
          targetDB,
          entity,
          fixture,
          customColumns,
        );
        if (customDuplicateRow) {
          const [record] = await this.createFixtureRecord(entity, customDuplicateRow, {
            singleRecord: true,
            _db: targetDB,
          });
          fixture.target = record;
        }
      }

      // Unique index 기준 중복 확인 → fixture.unique
      const uniqueRow = await this.checkUniqueViolation(targetDB, entity, fixture);
      if (uniqueRow) {
        const [record] = await this.createFixtureRecord(entity, uniqueRow, {
          singleRecord: true,
          _db: targetDB,
        });
        fixture.unique = record;
      }
    }

    await targetDB.destroy();
    await sourceDB.destroy();

    return unique(fixtures, (f) => f.fixtureId);
  }

  async createFixtureRecord(
    entity: Entity,
    row: {
      id: number;
      [key: string]: string | number | boolean | null;
    },
    options?: {
      singleRecord?: boolean;
      _db?: Knex;
    },
  ): Promise<FixtureRecord[]> {
    const records: FixtureRecord[] = [];
    const visitedEntities = new Set<string>();

    const create = async (
      entity: Entity,
      row: {
        id: number;
        [key: string]: string | number | boolean | null;
      },
    ) => {
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

        record.columns[prop.name] = {
          prop: prop,
          value: row[prop.name],
        };

        const db = options?._db ?? BaseModel.getDB("w");
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
          const relatedEntity = EntityManager.get(prop.with);
          const relatedProp = relatedEntity.props.find(
            (p) => isRelationProp(p) && p.with === entity.id,
          );
          if (relatedProp) {
            const relatedRow = await db(relatedEntity.table).where("id", row.id).first();
            record.columns[prop.name].value = relatedRow?.id;
          }
        } else if (isRelationProp(prop)) {
          const relatedId = row[`${prop.name}_id`];
          record.columns[prop.name].value = relatedId;
          if (relatedId) {
            record.belongsRecords.push(`${prop.with}#${relatedId}`);
          }
          if (!options?.singleRecord && relatedId) {
            const relatedEntity = EntityManager.get(prop.with);
            const relatedRow = await db(relatedEntity.table).where("id", relatedId).first();
            if (relatedRow) {
              await create(relatedEntity, relatedRow);
            }
          }
        }
      }

      records.push(record);
    };

    await create(entity, row);

    return records;
  }

  /**
   * 1. RelationGraph로 fixture 단위 삽입 순서 계산 (self-reference 포함)
   * 2. 순서대로 UpsertBuilder에 등록 (UBRef로 참조 관계 표현)
   * 3. 테이블별 upsert 실행 (ID는 DB가 자동 할당)
   */
  async insertFixtures(
    dbName: keyof SonamuDBConfig,
    _fixtures: FixtureRecord[],
  ): Promise<FixtureImportResult[]> {
    const fixtures = unique(_fixtures, (f) => f.fixtureId);

    // 초기화
    this.builder = new UpsertBuilder();
    this.fixtureRefMap = new Map();
    this.uuidToFixtureId = new Map();
    this.skippedFixtures = new Map();

    const db = knex(Sonamu.dbConfig[dbName]);
    const results: FixtureImportResult[] = [];

    try {
      // 1. RelationGraph로 fixture 단위 삽입 순서 계산
      this.relationGraph.buildGraph(fixtures);
      const insertionOrder = this.relationGraph.getInsertionOrder();

      // 2. 순서대로 UpsertBuilder에 등록 (override 체크)
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

          console.log(
            chalk.yellow(
              `Skipped ${fixture.entityId}#${fixture.id} (existing: #${existingId}, override: false)`,
            ),
          );
          continue;
        }

        this.registerFixture(fixture);
        console.log(
          chalk.blue(
            `Registered ${fixture.entityId}#${fixture.id}${fixture.override ? ` (override existing: #${fixture.target?.id})` : ""}`,
          ),
        );
      }

      // 3. 테이블별 upsert 실행
      const tableOrder = this.getTableOrder(fixtures);

      await db.transaction(async (trx) => {
        const insertedIdsByTable = new Map<string, Map<string, number>>();

        for (const tableName of tableOrder) {
          if (!this.builder.hasTable(tableName)) continue;

          // upsert 실행 전 uuid 목록 저장
          const table = this.builder.getTable(tableName);
          const uuids = table.rows.map((row) => row.uuid as string);

          console.log(chalk.blue(`Upserting ${tableName} with ${uuids.length} rows`));
          await this.builder.upsert(trx, tableName);

          // upsert된 row들의 uuid -> id 매핑 구축
          if (uuids.length > 0) {
            const uuidToId = new Map<string, number>();
            const rows = await trx(tableName as string)
              .select("uuid", "id")
              .whereIn("uuid", uuids);

            for (const row of rows) {
              uuidToId.set(row.uuid, row.id);
            }

            insertedIdsByTable.set(tableName, uuidToId);
          }
        }

        // 4. ManyToMany 관계 처리
        await this.processManyToManyRelations(trx, fixtures, insertedIdsByTable);

        // 5. 결과 수집
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
   */
  private registerFixture(fixture: FixtureRecord): UBRef {
    const entity = EntityManager.get(fixture.entityId);
    const row: Record<string, unknown> = {};

    // Override 모드 판단: target 또는 unique가 있고 override=true인 경우
    const existingRecord = fixture.target ?? fixture.unique;
    const isOverrideMode = fixture.override && existingRecord;

    for (const [propName, column] of Object.entries(fixture.columns)) {
      const prop = column.prop;

      if (isVirtualProp(prop)) {
        continue;
      }

      // id/uuid 처리: Override 모드일 때만 기존 값 사용
      if (propName === "id" || propName === "uuid") {
        if (isOverrideMode && existingRecord) {
          // Override: 기존 레코드의 값 사용 → UPDATE
          row[propName] = existingRecord.columns[propName]?.value;
        }
        // 새 레코드: 제외 → INSERT (DB/UpsertBuilder가 생성)
        continue;
      }

      if (isRelationProp(prop)) {
        if (
          isBelongsToOneRelationProp(prop) ||
          (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
        ) {
          const relatedId = column.value as number | null;
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
                // 이미 등록된 fixture 참조 → UBRef 사용
                row[`${propName}_id`] = relatedRef;
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
        row[propName] = this.convertColumnValue(prop as EntityProp, column.value);
      }
    }

    console.log(chalk.blue(`Registering ${entity.table} - ${inspect(row, false, null, true)}`));
    const ref = this.builder.register(entity.table, row);
    this.fixtureRefMap.set(fixture.fixtureId, ref);
    this.uuidToFixtureId.set(ref.uuid, fixture.fixtureId);

    return ref;
  }

  /**
   * 컬럼 값 변환
   */
  private convertColumnValue(prop: EntityProp, value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    switch (prop.type) {
      case "json":
        // UpsertBuilder.register에서 JSON.stringify 처리하므로 object 그대로 전달
        return value;

      case "date":
        if (typeof value === "string" || typeof value === "number") {
          return new Date(value);
        }
        return value;

      default:
        return value;
    }
  }

  /**
   * 테이블 순서 추출 (fixtures에 포함된 테이블만)
   */
  private getTableOrder(fixtures: FixtureRecord[]): (keyof DatabaseSchemaExtend)[] {
    const tables: string[] = [];
    const seen = new Set<string>();

    for (const fixture of fixtures) {
      const entity = EntityManager.get(fixture.entityId);
      if (!seen.has(entity.table)) {
        seen.add(entity.table);
        tables.push(entity.table);
      }
    }

    return tables as (keyof DatabaseSchemaExtend)[];
  }

  private async processManyToManyRelations(
    trx: Knex.Transaction,
    fixtures: FixtureRecord[],
    insertedIdsByTable: Map<string, Map<string, number>>,
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
          if (this.builder.hasTable(targetTable.table) === false) continue;

          const relatedIds = column.value as number[];
          if (relatedIds.length === 0) continue;

          const joinTable = (prop as ManyToManyRelationProp).joinTable;
          const relatedEntity = EntityManager.get(prop.with);

          const sourceColumn = `${inflection.singularize(entity.table)}_id`;
          const targetColumn = `${inflection.singularize(relatedEntity.table)}_id`;

          for (const relatedId of relatedIds) {
            const relatedFixtureId = `${prop.with}#${relatedId}`;
            const relatedRef = this.fixtureRefMap.get(relatedFixtureId);

            let targetId: number;

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

  private async checkUniqueViolation(db: Knex, entity: Entity, fixture: FixtureRecord) {
    const _uniqueIndexes = entity.indexes?.filter((i) => i.type === "unique") ?? [];

    const uniqueIndexes = _uniqueIndexes.filter((index) =>
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

    const whereClause: Record<string, unknown> = {};

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
    const content = readFileSync(path).toString();

    const fixtureLoaderStart = content.indexOf("const fixtureLoader = {");
    const fixtureLoaderEnd = content.indexOf("};", fixtureLoaderStart);

    if (fixtureLoaderStart !== -1 && fixtureLoaderEnd !== -1) {
      const newContent = `${content.slice(0, fixtureLoaderEnd)}  ${code}\n${content.slice(fixtureLoaderEnd)}`;

      writeFileSync(path, newContent);
    } else {
      throw new Error("Failed to find fixtureLoader in fixture.ts");
    }
  }
}

export const FixtureManager = new FixtureManagerClass();
