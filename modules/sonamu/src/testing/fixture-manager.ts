import chalk from "chalk";
import knex, { Knex } from "knex";
import _ from "lodash";
import { Sonamu } from "../api";
import { BaseModel } from "../database/base-model";
import { EntityManager } from "../entity/entity-manager";
import {
  EntityProp,
  FixtureImportResult,
  FixtureRecord,
  FixtureSearchOptions,
  ManyToManyRelationProp,
  isBelongsToOneRelationProp,
  isOneToOneRelationProp,
  isRelationProp,
} from "../types/types";
import { Entity } from "../entity/entity";
import inflection from "inflection";
import { SonamuDBConfig } from "../database/db";
import { readFileSync, writeFileSync } from "fs";

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

  private dependencyGraph: Map<
    string,
    {
      fixtureId: string;
      entityId: string;
      dependencies: Set<string>;
    }
  > = new Map();

  init() {
    if (this._tdb !== null) {
      return;
    }
    if (Sonamu.dbConfig.test && Sonamu.dbConfig.production_master) {
      const tConn = Sonamu.dbConfig.test.connection as Knex.ConnectionConfig & {
        port?: number;
      };
      const pConn = Sonamu.dbConfig.production_master
        .connection as Knex.ConnectionConfig & { port?: number };
      if (
        `${tConn.host ?? "localhost"}:${tConn.port ?? 3306}/${
          tConn.database
        }` ===
        `${pConn.host ?? "localhost"}:${pConn.port ?? 3306}/${pConn.database}`
      ) {
        throw new Error(
          `테스트DB와 프로덕션DB에 동일한 데이터베이스가 사용되었습니다.`
        );
      }
    }

    this.tdb = knex(Sonamu.dbConfig.test);
    this.fdb = knex(Sonamu.dbConfig.fixture_local);
  }

  async cleanAndSeed(usingTables?: string[]) {
    const tableNames = await (async () => {
      if (usingTables) {
        return usingTables;
      }

      const [tables] = await this.tdb.raw(
        "SHOW TABLE STATUS WHERE Engine IS NOT NULL"
      );
      return tables.map((tableInfo: any) => tableInfo["Name"] as string);
    })();

    await this.tdb.raw(`SET FOREIGN_KEY_CHECKS = 0`);
    for await (let tableName of tableNames) {
      if (tableName == "migrations") {
        continue;
      }

      const [[fdbChecksumRow]] = await this.fdb.raw(
        `CHECKSUM TABLE ${tableName}`
      );
      const fdbChecksum = fdbChecksumRow["Checksum"];

      const [[tdbChecksumRow]] = await this.tdb.raw(
        `CHECKSUM TABLE ${tableName}`
      );
      const tdbChecksum = tdbChecksumRow["Checksum"];

      if (fdbChecksum !== tdbChecksum) {
        await this.tdb(tableName).truncate();
        const rawQuery = `INSERT INTO ${
          (Sonamu.dbConfig.test.connection as Knex.ConnectionConfig).database
        }.${tableName}
            SELECT * FROM ${
              (
                Sonamu.dbConfig.fixture_local
                  .connection as Knex.ConnectionConfig
              ).database
            }.${tableName}`;
        await this.tdb.raw(rawQuery);
      }
    }
    await this.tdb.raw(`SET FOREIGN_KEY_CHECKS = 1`);

    // console.timeEnd("FIXTURE-CleanAndSeed");
  }

  async getChecksum(db: Knex, tableName: string) {
    const [[checksumRow]] = await db.raw(`CHECKSUM TABLE ${tableName}`);
    return checksumRow.Checksum;
  }

  async sync() {
    const frdb = knex(Sonamu.dbConfig.fixture_remote);

    const [tables] = await this.fdb.raw(
      "SHOW TABLE STATUS WHERE Engine IS NOT NULL"
    );
    const tableNames: string[] = tables.map(
      (table: any) => table.Name as string
    );

    console.log(chalk.magenta("SYNC..."));
    await Promise.all(
      tableNames.map(async (tableName) => {
        if (tableName.startsWith("knex_migrations")) {
          return;
        }

        const remoteChecksum = await this.getChecksum(frdb, tableName);
        const localChecksum = await this.getChecksum(this.fdb, tableName);

        if (remoteChecksum !== localChecksum) {
          await this.fdb.transaction(async (transaction) => {
            await transaction.raw(`SET FOREIGN_KEY_CHECKS = 0`);
            await transaction(tableName).truncate();

            const rows = await frdb(tableName);
            console.log(chalk.blue(tableName), rows.length);
            await transaction
              .insert(
                rows.map((row) => {
                  Object.keys(row).map((key) => {
                    if (Array.isArray(row[key])) {
                      row[key] = JSON.stringify(row[key]);
                    }
                  });
                  return row;
                })
              )
              .into(tableName);
            console.log("OK");
            await transaction.raw(`SET FOREIGN_KEY_CHECKS = 1`);
          });
        }
      })
    );
    console.log(chalk.magenta("DONE!"));

    await frdb.destroy();
  }

  async importFixture(entityId: string, ids: number[]) {
    const queries = _.uniq(
      (
        await Promise.all(
          ids.map(async (id) => {
            return await this.getImportQueries(entityId, "id", id);
          })
        )
      ).flat()
    );

    const wdb = BaseModel.getDB("w");
    for (let query of queries) {
      const [rsh] = await wdb.raw(query);
      console.log({
        query,
        info: rsh.info,
      });
    }
  }

  async getImportQueries(
    entityId: string,
    field: string,
    id: number
  ): Promise<string[]> {
    console.log({ entityId, field, id });
    const entity = EntityManager.get(entityId);
    const wdb = BaseModel.getDB("w");

    // 여기서 실DB의 row 가져옴
    const [row] = await wdb(entity.table).where(field, id).limit(1);
    if (row === undefined) {
      throw new Error(`${entityId}#${id} row를 찾을 수 없습니다.`);
    }

    // 픽스쳐DB, 실DB
    const fixtureDatabase = (Sonamu.dbConfig.fixture_remote.connection as any)
      .database;
    const realDatabase = (Sonamu.dbConfig.production_master.connection as any)
      .database;

    const selfQuery = `INSERT IGNORE INTO \`${fixtureDatabase}\`.\`${entity.table}\` (SELECT * FROM \`${realDatabase}\`.\`${entity.table}\` WHERE \`id\` = ${id})`;

    const args = Object.entries(entity.relations)
      .filter(
        ([, relation]) =>
          isBelongsToOneRelationProp(relation) ||
          (isOneToOneRelationProp(relation) &&
            relation.customJoinClause === undefined)
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
          field = `${relation.name}_id`;
          id = row["id"];
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
      })
    );

    return [..._.uniq(relQueries.reverse().flat()), selfQuery];
  }

  async destory() {
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
    dbName: keyof SonamuDBConfig,
    searchOptions: FixtureSearchOptions
  ) {
    const db = knex(Sonamu.dbConfig[dbName]);
    const { entityId, field, value, searchType } = searchOptions;

    const entity = EntityManager.get(entityId);
    const column =
      entity.props.find((prop) => prop.name === field)?.type === "relation"
        ? `${field}_id`
        : field;

    let query = db(entity.table);
    if (searchType === "equals") {
      query = query.where(column, value);
    } else if (searchType === "like") {
      query = query.where(column, "like", `%${value}%`);
    }

    const rows = await query;
    if (rows.length === 0) {
      throw new Error("No records found");
    }

    const visitedEntities = new Set<string>();
    const records: FixtureRecord[] = [];
    for (const row of rows) {
      const initialRecordsLength = records.length;
      await this.createFixtureRecord(entity, row, visitedEntities, records);
      const currentFixtureRecord = records.find(
        (r) => r.fixtureId === `${entityId}#${row.id}`
      );

      if (currentFixtureRecord) {
        // 현재 fixture로부터 생성된 relatedRecords 설정
        currentFixtureRecord.relatedRecords = records
          .filter((r) => r.fixtureId !== currentFixtureRecord.fixtureId)
          .slice(initialRecordsLength)
          .map((r) => r.fixtureId);
      }
    }

    return records;
  }

  async createFixtureRecord(
    entity: Entity,
    row: any,
    visitedEntities: Set<string>,
    records: FixtureRecord[]
  ) {
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
      relatedRecords: [],
    };

    for (const prop of entity.props) {
      if (prop.type === "virtual") {
        continue;
      }

      record.columns[prop.name] = {
        prop: prop,
        value: row[prop.name],
      };

      if (isRelationProp(prop)) {
        if (prop.relationType === "ManyToMany") {
          const wdb = BaseModel.getDB("w");
          const relatedEntity = EntityManager.get(prop.with);
          const throughTable = prop.joinTable;
          const fromColumn = `${inflection.singularize(entity.table)}_id`;
          const toColumn = `${inflection.singularize(relatedEntity.table)}_id`;

          const relatedIds = await wdb(throughTable)
            .where(fromColumn, row.id)
            .pluck(toColumn);
          record.columns[prop.name].value = relatedIds;
        } else if (prop.relationType === "HasMany") {
          const relatedEntity = EntityManager.get(prop.with);
          const wdb = BaseModel.getDB("w");
          const relatedIds = await wdb(relatedEntity.table)
            .where(prop.joinColumn, row.id)
            .pluck("id");
          record.columns[prop.name].value = relatedIds;
        } else if (prop.relationType === "OneToOne" && !prop.hasJoinColumn) {
          const relatedEntity = EntityManager.get(prop.with);
          const relatedProp = relatedEntity.props.find(
            (p) => p.type === "relation" && p.with === entity.id
          );
          if (relatedProp) {
            const wdb = BaseModel.getDB("w");
            const relatedRow = await wdb(relatedEntity.table)
              .where("id", row[`${relatedProp.name}_id`])
              .first();
            record.columns[prop.name].value = relatedRow?.id;
          }
        } else {
          const relatedId = row[`${prop.name}_id`];
          record.columns[prop.name].value = relatedId;
          if (relatedId) {
            const relatedEntity = EntityManager.get(prop.with);
            const relatedRow = await BaseModel.getDB("w")(relatedEntity.table)
              .where("id", relatedId)
              .first();
            if (relatedRow) {
              await this.createFixtureRecord(
                relatedEntity,
                relatedRow,
                visitedEntities,
                records
              );
            }
          }
        }
      }
    }

    records.push(record);
  }

  async insertFixtures(
    dbName: keyof SonamuDBConfig,
    fixtures: FixtureRecord[]
  ) {
    this.buildDependencyGraph(fixtures);
    const insertionOrder = this.getInsertionOrder();
    const idMap = new Map<string, number>();
    const db = knex(Sonamu.dbConfig[dbName]);

    const insertResult: { entityId: string; id: number }[] = [];

    await db.transaction(async (trx) => {
      // 1. 각 fixture를 insert하고, idMap에 fixtureId -> id 매핑 저장
      for (const fixtureId of insertionOrder) {
        const fixture = fixtures.find((f) => f.fixtureId === fixtureId)!;
        const result = await this.insertFixture(trx, fixture, idMap);
        idMap.set(fixtureId, result.id);
        insertResult.push(result);
      }

      // 2. 각 fixture의 relation을 업데이트
      for (const fixtureId of insertionOrder) {
        const fixture = fixtures.find((f) => f.fixtureId === fixtureId)!;
        await this.updateRelations(trx, fixture, idMap);
      }

      // 3. ManyToMany 관계 처리
      for (const fixtureId of insertionOrder) {
        const fixture = fixtures.find((f) => f.fixtureId === fixtureId)!;
        await this.handleManyToManyRelations(trx, fixture, idMap);
      }
    });

    const records: FixtureImportResult[] = [];

    for await (const r of insertResult) {
      const entity = EntityManager.get(r.entityId);
      const record = await db(entity.table).where("id", r.id).first();
      records.push({
        entityId: r.entityId,
        data: record,
      });
    }

    return records;
  }

  private getInsertionOrder() {
    const visited = new Set<string>();
    const order: string[] = [];
    const tempVisited = new Set<string>();

    const visit = (fixtureId: string) => {
      if (visited.has(fixtureId)) return;
      if (tempVisited.has(fixtureId)) {
        console.warn(`Circular dependency detected involving: ${fixtureId}`);
        return;
      }

      tempVisited.add(fixtureId);

      const node = this.dependencyGraph.get(fixtureId)!;
      const entity = EntityManager.get(node.entityId);

      for (const depId of node.dependencies) {
        const depNode = this.dependencyGraph.get(depId)!;

        // BelongsToOne 관계이면서 nullable이 아닌 경우 먼저 방문
        const relationProp = entity.props.find(
          (prop) =>
            isRelationProp(prop) &&
            isBelongsToOneRelationProp(prop) &&
            prop.with === depNode.entityId
        );
        if (relationProp && !relationProp.nullable) {
          visit(depId);
        }
      }

      tempVisited.delete(fixtureId);
      visited.add(fixtureId);
      order.push(fixtureId);
    };

    for (const fixtureId of this.dependencyGraph.keys()) {
      visit(fixtureId);
    }

    // circular dependency로 인해 방문되지 않은 fixtureId 추가
    for (const fixtureId of this.dependencyGraph.keys()) {
      if (!visited.has(fixtureId)) {
        order.push(fixtureId);
      }
    }

    return order;
  }

  private prepareInsertData(
    fixture: FixtureRecord,
    idMap: Map<string, number>
  ) {
    const insertData: any = {};
    for (const [propName, column] of Object.entries(fixture.columns)) {
      if (column.prop.name === "id" || column.prop.type === "virtual") {
        continue;
      }

      const prop = column.prop as EntityProp;
      if (!isRelationProp(prop)) {
        if (prop.type === "json") {
          insertData[propName] = JSON.stringify(column.value);
        } else {
          insertData[propName] = column.value;
        }
      } else if (
        (isBelongsToOneRelationProp(prop) ||
          (isOneToOneRelationProp(prop) && prop.hasJoinColumn)) &&
        !prop.nullable
      ) {
        // non-nullable BelongsToOne 또는 OneToOne 관계 처리
        const relatedFixtureId = `${prop.with}#${column.value}`;
        insertData[`${propName}_id`] =
          idMap.get(relatedFixtureId) ?? column.value;
      }
    }
    return insertData;
  }

  private buildDependencyGraph(fixtures: FixtureRecord[]) {
    this.dependencyGraph.clear();

    // 1. 노드 추가
    for (const fixture of fixtures) {
      this.dependencyGraph.set(fixture.fixtureId, {
        fixtureId: fixture.fixtureId,
        entityId: fixture.entityId,
        dependencies: new Set(),
      });
    }

    // 2. 의존성 추가
    for (const fixture of fixtures) {
      const node = this.dependencyGraph.get(fixture.fixtureId)!;

      for (const [, column] of Object.entries(fixture.columns)) {
        const prop = column.prop as EntityProp;

        if (isRelationProp(prop)) {
          if (
            prop.relationType === "BelongsToOne" ||
            (prop.relationType === "OneToOne" && prop.hasJoinColumn)
          ) {
            const relatedFixtureId = `${prop.with}#${column.value}`;
            if (this.dependencyGraph.has(relatedFixtureId)) {
              node.dependencies.add(relatedFixtureId);
            }
          } else if (prop.relationType === "ManyToMany") {
            // ManyToMany 관계의 경우 양방향 의존성 추가
            const relatedIds = column.value as number[];
            for (const relatedId of relatedIds) {
              const relatedFixtureId = `${prop.with}#${relatedId}`;
              if (this.dependencyGraph.has(relatedFixtureId)) {
                node.dependencies.add(relatedFixtureId);
                this.dependencyGraph
                  .get(relatedFixtureId)!
                  .dependencies.add(fixture.fixtureId);
              }
            }
          }
        }
      }
    }
  }

  private async insertFixture(
    db: Knex,
    fixture: FixtureRecord,
    idMap: Map<string, number>
  ) {
    const insertData = this.prepareInsertData(fixture, idMap);
    const entity = EntityManager.get(fixture.entityId);

    try {
      const [newId] = await db(entity.table).insert(insertData);
      return {
        entityId: fixture.entityId,
        id: newId,
      };
    } catch (err) {
      if (this.isDuplicateEntryError(err)) {
        console.warn(
          `Duplicate entry for ${fixture.fixtureId}, attempting to find existing ID`
        );
        const existingId = await this.findExistingIdByUniqueKeys(
          db,
          entity,
          insertData
        );
        if (existingId) {
          console.log(
            `Found existing ID for ${fixture.fixtureId}: ${existingId}`
          );
          return {
            entityId: fixture.entityId,
            id: existingId,
          };
        } else {
          console.warn(
            `Could not find existing ID for ${fixture.fixtureId}, using original ID`
          );
          return {
            entityId: fixture.entityId,
            id: fixture.id,
          };
        }
      } else {
        throw err;
      }
    }
  }

  private isDuplicateEntryError(error: unknown): error is { code: string } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: unknown }).code === "ER_DUP_ENTRY"
    );
  }

  private async findExistingIdByUniqueKeys(
    db: Knex,
    entity: Entity,
    insertData: Record<string, any>
  ) {
    const uniqueIndexes = entity.indexes.filter(
      (index) => index.type === "unique"
    );
    for (const index of uniqueIndexes) {
      const queryConditions: Record<string, any> = {};
      for (const column of index.columns) {
        if (column in insertData) {
          queryConditions[column] = insertData[column];
        }
      }
      if (Object.keys(queryConditions).length > 0) {
        const result = await db(entity.table).where(queryConditions).first();
        if (result) {
          return result.id;
        }
      }
    }

    return null;
  }

  private async updateRelations(
    db: Knex,
    fixture: FixtureRecord,
    idMap: Map<string, number>
  ) {
    const updates = this.prepareRelatedUpdates(fixture, idMap);
    const entity = EntityManager.get(fixture.entityId);
    if (Object.keys(updates).length > 0) {
      await db(entity.table)
        .where("id", idMap.get(fixture.fixtureId))
        .update(updates);
    }
  }

  private prepareRelatedUpdates(
    fixture: FixtureRecord,
    idMap: Map<string, number>
  ) {
    const updates: any = {};
    for (const [propName, column] of Object.entries(fixture.columns)) {
      const prop = column.prop as EntityProp;
      if (
        isRelationProp(prop) &&
        (isBelongsToOneRelationProp(prop) ||
          (isOneToOneRelationProp(prop) && prop.hasJoinColumn))
      ) {
        const relatedFixtureId = `${prop.with}#${column.value}`;
        const realId = idMap.get(relatedFixtureId);
        if (realId) {
          updates[`${propName}_id`] = realId;
        } else if (prop.nullable) {
          updates[`${propName}_id`] = null;
        }
      }
    }
    return updates;
  }

  private async handleManyToManyRelations(
    db: Knex,
    fixture: FixtureRecord,
    idMap: Map<string, number>
  ) {
    for (const [, column] of Object.entries(fixture.columns)) {
      const prop = column.prop as EntityProp;
      if (isRelationProp(prop) && prop.relationType === "ManyToMany") {
        const joinTable = (prop as ManyToManyRelationProp).joinTable;
        const relatedIds = column.value as number[];
        const currentFixtureId = idMap.get(fixture.fixtureId);

        if (currentFixtureId) {
          for (const relatedId of relatedIds) {
            const relatedFixtureId = `${prop.with}#${relatedId}`;
            const realRelatedId = idMap.get(relatedFixtureId);

            if (realRelatedId) {
              const newIds = await db(joinTable).insert({
                [`${inflection.singularize(fixture.entityId)}_id`]:
                  currentFixtureId,
                [`${inflection.singularize(prop.with)}_id`]: realRelatedId,
              });
              console.log(
                `Inserted into ${joinTable}: ${currentFixtureId} - ${realRelatedId} IDs: ${newIds}`
              );
            } else {
              console.warn(
                `Could not find real ID for fixture ${relatedFixtureId}`
              );
            }
          }
        } else {
          console.warn(
            `Could not find real ID for fixture ${fixture.fixtureId}`
          );
        }
      }
    }
  }

  async addFixtureLoader(code: string) {
    const path = Sonamu.apiRootPath + "/src/testing/fixture.ts";
    let content = readFileSync(path).toString();

    const fixtureLoaderStart = content.indexOf("const fixtureLoader = {");
    const fixtureLoaderEnd = content.indexOf("};", fixtureLoaderStart);

    if (fixtureLoaderStart !== -1 && fixtureLoaderEnd !== -1) {
      const newContent =
        content.slice(0, fixtureLoaderEnd) +
        "  " +
        code +
        "\n" +
        content.slice(fixtureLoaderEnd);

      writeFileSync(path, newContent);
    } else {
      throw new Error("Failed to find fixtureLoader in fixture.ts");
    }
  }
}
export const FixtureManager = new FixtureManagerClass();
