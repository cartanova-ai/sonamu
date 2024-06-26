import chalk from "chalk";
import knex, { Knex } from "knex";
import _ from "lodash";
import { Sonamu } from "../api";
import { BaseModel } from "../database/base-model";
import { EntityManager } from "../entity/entity-manager";
import {
  isBelongsToOneRelationProp,
  isOneToOneRelationProp,
} from "../types/types";

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
}
export const FixtureManager = new FixtureManagerClass();
