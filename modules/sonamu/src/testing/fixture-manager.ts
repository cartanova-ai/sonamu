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
  isHasManyRelationProp,
  isManyToManyRelationProp,
  isOneToOneRelationProp,
  isRelationProp,
  isVirtualProp,
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
    sourceDBName: keyof SonamuDBConfig,
    targetDBName: keyof SonamuDBConfig,
    searchOptions: FixtureSearchOptions
  ) {
    const sourceDB = knex(Sonamu.dbConfig[sourceDBName]);
    const targetDB = knex(Sonamu.dbConfig[targetDBName]);
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

    const visitedEntities = new Set<string>();
    const records: FixtureRecord[] = [];
    for (const row of rows) {
      const initialRecordsLength = records.length;
      await this.createFixtureRecord(entity, row, visitedEntities, records);
      const currentFixtureRecord = records.find(
        (r) => r.fixtureId === `${entityId}#${row.id}`
      );

      if (currentFixtureRecord) {
        // 현재 fixture로부터 생성된 fetchedRecords 설정
        currentFixtureRecord.fetchedRecords = records
          .filter((r) => r.fixtureId !== currentFixtureRecord.fixtureId)
          .slice(initialRecordsLength)
          .map((r) => r.fixtureId);
      }
    }

    for await (const record of records) {
      const entity = EntityManager.get(record.entityId);
      const rows: FixtureRecord[] = [];
      const row = await targetDB(entity.table).where("id", record.id).first();
      if (row) {
        await this.createFixtureRecord(
          entity,
          row,
          new Set(),
          rows,
          true,
          targetDB
        );
        record.target = rows[0];
      }
    }

    return records;
  }

  async createFixtureRecord(
    entity: Entity,
    row: any,
    visitedEntities: Set<string>,
    records: FixtureRecord[],
    singleRecord = false,
    _db?: Knex
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

      const db = _db ?? BaseModel.getDB("w");
      if (isManyToManyRelationProp(prop)) {
        const relatedEntity = EntityManager.get(prop.with);
        const throughTable = prop.joinTable;
        const fromColumn = `${inflection.singularize(entity.table)}_id`;
        const toColumn = `${inflection.singularize(relatedEntity.table)}_id`;

        const relatedIds = await db(throughTable)
          .where(fromColumn, row.id)
          .pluck(toColumn);
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
          (p) => p.type === "relation" && p.with === entity.id
        );
        if (relatedProp) {
          const relatedRow = await db(relatedEntity.table)
            .where("id", row.id)
            .first();
          record.columns[prop.name].value = relatedRow?.id;
        }
      } else if (isRelationProp(prop)) {
        const relatedId = row[`${prop.name}_id`];
        record.columns[prop.name].value = relatedId;
        if (relatedId) {
          record.belongsRecords.push(`${prop.with}#${relatedId}`);
        }
        if (!singleRecord && relatedId) {
          const relatedEntity = EntityManager.get(prop.with);
          const relatedRow = await db(relatedEntity.table)
            .where("id", relatedId)
            .first();
          if (relatedRow) {
            await this.createFixtureRecord(
              relatedEntity,
              relatedRow,
              visitedEntities,
              records,
              singleRecord,
              _db
            );
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
    const db = knex(Sonamu.dbConfig[dbName]);

    await db.transaction(async (trx) => {
      await trx.raw(`SET FOREIGN_KEY_CHECKS = 0`);

      for (const fixtureId of insertionOrder) {
        const fixture = fixtures.find((f) => f.fixtureId === fixtureId)!;
        const result = await this.insertFixture(trx, fixture);
        if (result.id !== fixture.id) {
          // ID가 변경된 경우, 다른 fixture에서 참조하는 경우가 찾아서 수정
          console.log(
            chalk.yellow(
              `Unique constraint violation: ${fixture.entityId}#${fixture.id} -> ${fixture.entityId}#${result.id}`
            )
          );
          fixtures.forEach((f) => {
            Object.values(f.columns).forEach((column) => {
              if (
                column.prop.type === "relation" &&
                column.prop.with === result.entityId &&
                column.value === fixture.id
              ) {
                column.value = result.id;
              }
            });
          });
          fixture.id = result.id;
        }
      }

      for (const fixtureId of insertionOrder) {
        const fixture = fixtures.find((f) => f.fixtureId === fixtureId)!;
        await this.handleManyToManyRelations(trx, fixture, fixtures);
      }
      await trx.raw(`SET FOREIGN_KEY_CHECKS = 1`);
    });

    const records: FixtureImportResult[] = [];

    for await (const r of fixtures) {
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
            (isBelongsToOneRelationProp(prop) ||
              (isOneToOneRelationProp(prop) && prop.hasJoinColumn)) &&
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

  private prepareInsertData(fixture: FixtureRecord) {
    const insertData: any = {};
    for (const [propName, column] of Object.entries(fixture.columns)) {
      if (isVirtualProp(column.prop)) {
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
        isBelongsToOneRelationProp(prop) ||
        (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
      ) {
        insertData[`${propName}_id`] = column.value;
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
            isBelongsToOneRelationProp(prop) ||
            (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
          ) {
            const relatedFixtureId = `${prop.with}#${column.value}`;
            if (this.dependencyGraph.has(relatedFixtureId)) {
              node.dependencies.add(relatedFixtureId);
            }
          } else if (isManyToManyRelationProp(prop)) {
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

  private async insertFixture(db: Knex, fixture: FixtureRecord) {
    const insertData = this.prepareInsertData(fixture);
    const entity = EntityManager.get(fixture.entityId);

    try {
      const found = await db(entity.table).where("id", fixture.id).first();

      // 유니크 제약이 있는 경우, 해당 컬럼 조합으로 검색하여 이미 존재하는 레코드인지 확인
      const uniqueIndexes = entity.indexes.filter((i) => i.type === "unique");
      if (uniqueIndexes.length > 0) {
        let uniqueQuery = db(entity.table);
        for (const index of uniqueIndexes) {
          uniqueQuery = uniqueQuery.where((qb) => {
            for (const column of index.columns) {
              qb.andWhere(column, insertData[column]);
            }
          });
        }
        const [uniqueFound] = await uniqueQuery;
        if (uniqueFound) {
          return {
            entityId: fixture.entityId,
            id: uniqueFound.id,
          };
        }
      }

      if (found && !fixture.override) {
        return {
          entityId: fixture.entityId,
          id: found.id,
        };
      }

      const q = db.insert(insertData).into(entity.table);
      await q.onDuplicateUpdate.apply(q, Object.keys(insertData));
      return {
        entityId: fixture.entityId,
        id: fixture.id,
      };
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  private async handleManyToManyRelations(
    db: Knex,
    fixture: FixtureRecord,
    fixtures: FixtureRecord[]
  ) {
    for (const [, column] of Object.entries(fixture.columns)) {
      const prop = column.prop as EntityProp;
      if (isManyToManyRelationProp(prop)) {
        const joinTable = (prop as ManyToManyRelationProp).joinTable;
        const relatedIds = column.value as number[];

        for (const relatedId of relatedIds) {
          if (
            !fixtures.find((f) => f.fixtureId === `${prop.with}#${relatedId}`)
          ) {
            continue;
          }

          const entity = EntityManager.get(fixture.entityId);
          const relatedEntity = EntityManager.get(prop.with);
          if (!entity || !relatedEntity) {
            throw new Error(
              `Entity not found: ${fixture.entityId}, ${prop.with}`
            );
          }

          const [found] = await db(joinTable)
            .where({
              [`${inflection.singularize(entity.table)}_id`]: fixture.id,
              [`${inflection.singularize(relatedEntity.table)}_id`]: relatedId,
            })
            .limit(1);
          if (found) {
            continue;
          }

          const newIds = await db(joinTable).insert({
            [`${inflection.singularize(entity.table)}_id`]: fixture.id,
            [`${inflection.singularize(relatedEntity.table)}_id`]: relatedId,
          });
          console.log(
            chalk.green(
              `Inserted into ${joinTable}: ${entity.table}(${fixture.id}) - ${relatedEntity.table}(${relatedId}) ID: ${newIds}`
            )
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
