import chalk from "chalk";
import _ from "lodash";
import { Sonamu } from "../api";
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
import { readFileSync, writeFileSync } from "fs";
import { RelationGraph } from "./_relation-graph";
import { SonamuDBConfig, WhereClause } from "../database/types";
import { DB } from "../database/db";
import { KyselyClient } from "../database/drivers/kysely/client";
import { KnexClient } from "../database/drivers/knex/client";

export class FixtureManagerClass {
  private relationGraph = new RelationGraph();

  init() {
    DB.testInit();
  }

  async cleanAndSeed(usingTables?: string[]) {
    const tableNames = await (async () => {
      if (usingTables) {
        return usingTables;
      }

      const tables = await DB.tdb.raw<{ Name: string }>(
        `SHOW TABLE STATUS WHERE Engine IS NOT NULL`
      );
      return tables.map((tableInfo: any) => tableInfo["Name"] as string);
    })();

    await DB.tdb.raw(`SET FOREIGN_KEY_CHECKS = 0`);
    for await (let tableName of tableNames) {
      if (tableName == "migrations") {
        continue;
      }

      const [fdbChecksumRow] = await DB.fdb.raw<{ Checksum: string }>(
        `CHECKSUM TABLE ${tableName}`
      );
      const fdbChecksum = fdbChecksumRow["Checksum"];

      const [tdbChecksumRow] = await DB.tdb.raw<{ Checksum: string }>(
        `CHECKSUM TABLE ${tableName}`
      );
      const tdbChecksum = tdbChecksumRow["Checksum"];

      if (fdbChecksum !== tdbChecksum) {
        await DB.tdb.truncate(tableName);
        const rawQuery = `INSERT INTO ${DB.connectionInfo.test.database}.${tableName}
            SELECT * FROM ${DB.connectionInfo.fixture_local.database}.${tableName}`;
        await DB.tdb.raw(rawQuery);
      }
    }
    await DB.tdb.raw(`SET FOREIGN_KEY_CHECKS = 1`);

    // console.timeEnd("FIXTURE-CleanAndSeed");
  }

  async getChecksum(db: KnexClient | KyselyClient, tableName: string) {
    const [checksumRow] = await db.raw<{ Checksum: string }>(
      `CHECKSUM TABLE ${tableName}`
    );
    return checksumRow.Checksum;
  }

  async sync() {
    const frdb = DB.getClient("fixture_remote");

    const tables = await DB.fdb.raw<{ Name: string }>(
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
        const localChecksum = await this.getChecksum(DB.fdb, tableName);

        if (remoteChecksum !== localChecksum) {
          await DB.fdb.trx(async (transaction) => {
            await transaction.raw(`SET FOREIGN_KEY_CHECKS = 0`);
            await transaction.truncate(tableName);

            const rows = await frdb.raw(`SELECT * FROM ${tableName}`);
            if (rows.length === 0) {
              return;
            }

            console.log(chalk.blue(tableName), rows.length);
            await transaction.raw(
              `INSERT INTO ${tableName} (${Object.keys(rows[0] as any).join(
                ","
              )}) VALUES ?`,
              [rows.map((row: any) => Object.values(row))]
            );
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

    const wdb = DB._wdb;
    for (let query of queries) {
      const [rsh] = await wdb.raw<{ info: any }>(query);
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
    const wdb = DB._wdb;

    // 여기서 실DB의 row 가져옴
    const [row] = await wdb.raw<any>(
      `SELECT * FROM ${entity.table} WHERE ${field} = ${id} LIMIT 1`
    );
    if (row === undefined) {
      throw new Error(`${entityId}#${id} row를 찾을 수 없습니다.`);
    }

    // 픽스쳐DB, 실DB
    const fixtureDatabase = DB.connectionInfo.fixture_remote.database;
    const realDatabase = DB.connectionInfo.production_master.database;

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
    await DB.testDestroy();
    await DB.destroy();
  }

  async getFixtures(
    sourceDBName: keyof SonamuDBConfig,
    targetDBName: keyof SonamuDBConfig,
    searchOptions: FixtureSearchOptions
  ) {
    const sourceDB = DB.getClient(sourceDBName);
    const targetDB = DB.getClient(targetDBName);
    const { entityId, field, value, searchType } = searchOptions;

    const entity = EntityManager.get(entityId);
    const column =
      entity.props.find((prop) => prop.name === field)?.type === "relation"
        ? `${field}_id`
        : field;

    let query = sourceDB.from(entity.table);
    if (searchType === "equals") {
      query = query.where([column, "=", value]);
    } else if (searchType === "like") {
      query = query.where([column, "like", `%${value}%`]);
    }

    const rows = await query.execute();
    if (rows.length === 0) {
      throw new Error("No records found");
    }

    const fixtures: FixtureRecord[] = [];
    for (const row of rows) {
      const initialRecordsLength = fixtures.length;
      const newRecords = await this.createFixtureRecord(entity, row);
      fixtures.push(...newRecords);
      const currentFixtureRecord = fixtures.find(
        (r) => r.fixtureId === `${entityId}#${row.id}`
      );

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

      // ID를 이용하여 targetDB에 레코드가 존재하는지 확인
      const [row] = await targetDB
        .from(entity.table)
        .where(["id", "=", fixture.id])
        .first()
        .execute();
      if (row) {
        const [record] = await this.createFixtureRecord(entity, row, {
          singleRecord: true,
          _db: targetDB,
        });
        fixture.target = record;
        continue;
      }

      // ID를 이용하여 targetDB에서 조회되지 않는 경우, unique 제약을 위반하는지 확인
      const uniqueRow = await this.checkUniqueViolation(
        targetDB,
        entity,
        fixture
      );
      if (uniqueRow) {
        const [record] = await this.createFixtureRecord(entity, uniqueRow, {
          singleRecord: true,
          _db: targetDB,
        });
        fixture.unique = record;
      }
    }

    return fixtures;
  }

  async createFixtureRecord(
    entity: Entity,
    row: any,
    options?: {
      singleRecord?: boolean;
      _db?: KnexClient | KyselyClient;
    }
  ): Promise<FixtureRecord[]> {
    const records: FixtureRecord[] = [];
    const visitedEntities = new Set<string>();

    const create = async (entity: Entity, row: any) => {
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

        const db = options?._db ?? DB._wdb;
        if (isManyToManyRelationProp(prop)) {
          const relatedEntity = EntityManager.get(prop.with);
          const throughTable = prop.joinTable;
          const fromColumn = `${inflection.singularize(entity.table)}_id`;
          const toColumn = `${inflection.singularize(relatedEntity.table)}_id`;

          const _relatedIds = await db.raw<{ id: string }>(
            `SELECT ${toColumn} FROM ${throughTable} WHERE ${fromColumn} = ${row.id}`
          );
          const relatedIds = _relatedIds.map((r) => parseInt(r.id));

          record.columns[prop.name].value = relatedIds;
        } else if (isHasManyRelationProp(prop)) {
          const relatedEntity = EntityManager.get(prop.with);
          const relatedIds = await db
            .from(relatedEntity.table)
            .select("id")
            .where([prop.joinColumn, "=", row.id])
            .pluck("id");
          record.columns[prop.name].value = relatedIds;
        } else if (isOneToOneRelationProp(prop) && !prop.hasJoinColumn) {
          const relatedEntity = EntityManager.get(prop.with);
          const relatedProp = relatedEntity.props.find(
            (p) => isRelationProp(p) && p.with === entity.id
          );
          if (relatedProp) {
            const [relatedRow] = await db
              .from(relatedEntity.table)
              .where([relatedProp.name, "=", row.id])
              .first()
              .execute();

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
            const relatedRow = await db
              .from(relatedEntity.table)
              .where(["id", "=", relatedId])
              .first()
              .execute();
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

  async insertFixtures(
    dbName: keyof SonamuDBConfig,
    _fixtures: FixtureRecord[]
  ) {
    const fixtures = _.uniqBy(_fixtures, (f) => f.fixtureId);

    this.relationGraph.buildGraph(fixtures);
    const insertionOrder = this.relationGraph.getInsertionOrder();
    const db = DB.getClient(dbName);

    await db.trx(async (trx) => {
      await trx.raw(`SET FOREIGN_KEY_CHECKS = 0`);

      for (const fixtureId of insertionOrder) {
        const fixture = fixtures.find((f) => f.fixtureId === fixtureId)!;
        const result = await this.insertFixture(trx as any, fixture);
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
        await this.handleManyToManyRelations(trx as any, fixture, fixtures);
      }
      await trx.raw(`SET FOREIGN_KEY_CHECKS = 1`);
    });

    const records: FixtureImportResult[] = [];

    for await (const r of fixtures) {
      const entity = EntityManager.get(r.entityId);
      const record = await db
        .from(entity.table)
        .where(["id", "=", r.id])
        .first()
        .execute();
      records.push({
        entityId: r.entityId,
        data: record,
      });
    }

    return _.uniqBy(records, (r) => `${r.entityId}#${r.data.id}`);
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

  private async insertFixture(
    db: KnexClient | KyselyClient,
    fixture: FixtureRecord
  ) {
    const insertData = this.prepareInsertData(fixture);
    const entity = EntityManager.get(fixture.entityId);

    try {
      const uniqueFound = await this.checkUniqueViolation(db, entity, fixture);
      if (uniqueFound) {
        return {
          entityId: fixture.entityId,
          id: uniqueFound.id,
        };
      }

      const [found] = await db
        .from(entity.table)
        .where(["id", "", fixture.id])
        .first()
        .execute();
      if (found && !fixture.override) {
        return {
          entityId: fixture.entityId,
          id: found.id,
        };
      }

      await db.raw(
        `INSERT INTO ${entity.table} SET ${insertData} ON DUPLICATE KEY UPDATE ${Object.keys(
          insertData
        )
          .map((key) => `${key}=VALUES(${key})`)
          .join(", ")}`
      );
      // const q = db.insert(insertData).into(entity.table);
      // await q.onDuplicateUpdate.apply(q, Object.keys(insertData));
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
    db: KnexClient | KyselyClient,
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

          const [found] = await db
            .from(joinTable)
            .where([
              [`${inflection.singularize(entity.table)}_id`, "=", fixture.id],
              [
                `${inflection.singularize(relatedEntity.table)}_id`,
                "=",
                relatedId,
              ],
            ])
            .first()
            .execute();
          if (found) {
            continue;
          }

          const newIds = await db.insert(joinTable, [
            {
              [`${inflection.singularize(entity.table)}_id`]: fixture.id,
              [`${inflection.singularize(relatedEntity.table)}_id`]: relatedId,
            },
          ]);
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

  // 해당 픽스쳐의 값으로 유니크 제약에 위배되는 레코드가 있는지 확인
  private async checkUniqueViolation(
    db: KnexClient | KyselyClient,
    entity: Entity,
    fixture: FixtureRecord
  ) {
    const _uniqueIndexes = entity.indexes.filter((i) => i.type === "unique");

    // ManyToMany 관계 테이블의 유니크 제약은 제외
    const uniqueIndexes = _uniqueIndexes.filter((index) =>
      index.columns.every((column) => !column.startsWith(`${entity.table}__`))
    );
    if (uniqueIndexes.length === 0) {
      return null;
    }

    let uniqueQuery = db.from(entity.table);
    const whereClauses = uniqueIndexes
      .map((index) => {
        // 컬럼 중 하나라도 null이면 유니크 제약을 위반하지 않기 때문에 해당 인덱스는 무시
        const containsNull = index.columns.some((column) => {
          const field = column.split("_id")[0];
          return fixture.columns[field].value === null;
        });
        if (containsNull) {
          return;
        }

        return index.columns.map((c) => {
          const field = c.split("_id")[0];
          if (Array.isArray(fixture.columns[field].value)) {
            return [c, "in", fixture.columns[field].value];
          } else {
            return [c, "=", fixture.columns[field].value];
          }
        });
      })
      .filter(Boolean) as WhereClause[];

    for (const clauses of whereClauses) {
      uniqueQuery = uniqueQuery.orWhere(clauses);
    }

    const [uniqueFound] = await uniqueQuery.execute();
    return uniqueFound;
  }
}
export const FixtureManager = new FixtureManagerClass();
