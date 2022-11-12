import chalk from "chalk";
import { execSync } from "child_process";
import knex, { Knex } from "knex";
import { uniq } from "lodash";
import { Sonamu } from "../api";
import { BaseModel } from "../database/base-model";
import { SMDManager } from "../smd/smd-manager";
import {
  isBelongsToOneRelationProp,
  isOneToOneRelationProp,
} from "../types/types";

export class FixtureManager {
  private _tdb: Knex | null = null;
  set tdb(tdb: Knex) {
    this._tdb = tdb;
  }
  get tdb(): Knex {
    return this._tdb!;
  }

  private _fdb: Knex | null = null;
  set fdb(fdb: Knex) {
    this._fdb = fdb;
  }
  get fdb(): Knex {
    return this._fdb!;
  }

  constructor(public usingTables?: string[]) {
    this.tdb = knex(Sonamu.dbConfig.test);
    this.fdb = knex(Sonamu.dbConfig.fixture_local);

    if (process.env.NODE_ENV === "test") {
      beforeAll(async () => {
        await Sonamu.init();
      });

      beforeEach(async () => {
        await this.cleanAndSeed();
      });

      afterAll(async () => {
        await this.destory();
        await BaseModel.destroy();
      });
    }
  }

  async cleanAndSeed() {
    let tableNames: string[] = [];

    if (this.usingTables === undefined) {
      const [tables] = await this.tdb.raw(
        "SHOW TABLE STATUS WHERE Engine IS NOT NULL"
      );
      tableNames = tables.map((tableInfo: any) => tableInfo["Name"]);
    } else {
      tableNames = this.usingTables;
    }

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

  // TODO: 추후 작업
  async initFixtureDB() {
    const connectArgs = `-uDB_USER -pDB_PASS`;

    console.log("DUMP...");
    execSync(
      `mysqldump -hwdb.closedshops.com ${connectArgs} --single-transaction -d --no-create-db --triggers --ignore-table=closedshops.pm_backup closedshops > /tmp/closedshops_scheme.sql`
    );
    console.log("SYNC to (TESTING) LOCAL closedshops...");
    execSync(
      `mysql -hlocal.closedshops.com ${connectArgs} -e 'DROP DATABASE closedshops'`
    );
    execSync(
      `mysql -hlocal.closedshops.com ${connectArgs} -e 'CREATE DATABASE closedshops'`
    );
    execSync(
      `mysql -hlocal.closedshops.com ${connectArgs} closedshops < /tmp/closedshops_scheme.sql;`
    );
    console.log("SED database names...");
    execSync(
      `sed -i'' -e 's/\`closedshops\`/\`closedshops_fixture\`/g' /tmp/closedshops_scheme.sql`
    );
    console.log("SYNC to (REMOTE FIXTURE) REMOTE closedshops_fixture...");
    execSync(
      `mysql -hwdb.closedshops.com ${connectArgs} -e 'DROP DATABASE closedshops_fixture'`
    );
    execSync(
      `mysql -hwdb.closedshops.com ${connectArgs} -e 'CREATE DATABASE closedshops_fixture'`
    );
    execSync(
      `mysql -hwdb.closedshops.com ${connectArgs} closedshops_fixture < /tmp/closedshops_scheme.sql;`
    );
    console.log("SYNC to (LOCAL FIXTURE) closedshops_fixture...");
    execSync(
      `mysql -hlocal.closedshops.com ${connectArgs} -e 'DROP DATABASE closedshops_fixture'`
    );
    execSync(
      `mysql -hlocal.closedshops.com ${connectArgs} -e 'CREATE DATABASE closedshops_fixture'`
    );
    execSync(
      `mysql -hlocal.closedshops.com ${connectArgs} closedshops_fixture < /tmp/closedshops_scheme.sql;`
    );
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
            await transaction.raw(`SET FOREIGN_KEY_CHECKS = 0`);
          });
        }
      })
    );
    console.log(chalk.magenta("DONE!"));

    await frdb.destroy();
  }

  async importFixture(smdId: string, ids: number[]) {
    const queries = uniq(
      (
        await Promise.all(
          ids.map(async (id) => {
            return await this.getImportQueries(smdId, "id", id);
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
    smdId: string,
    field: string,
    id: number
  ): Promise<string[]> {
    console.log({ smdId, field, id });
    const smd = SMDManager.get(smdId);
    const wdb = BaseModel.getDB("w");

    // 여기서 실DB의 row 가져옴
    const [row] = await wdb(smd.table).where(field, id).limit(1);
    if (row === undefined) {
      throw new Error(`${smdId}#${id} row를 찾을 수 없습니다.`);
    }

    // 픽스쳐DB, 실DB
    const fixtureDatabase = (Sonamu.dbConfig.fixture_remote.connection as any)
      .database;
    const realDatabase = (Sonamu.dbConfig.production_master.connection as any)
      .database;

    const selfQuery = `INSERT IGNORE INTO \`${fixtureDatabase}\`.\`${smd.table}\` (SELECT * FROM \`${realDatabase}\`.\`${smd.table}\` WHERE \`id\` = ${id})`;

    const args = Object.entries(smd.relations)
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
          smdId: relation.with,
          field,
          id,
        };
      })
      .filter((arg) => arg.id !== null);

    const relQueries = await Promise.all(
      args.map(async (args) => {
        return this.getImportQueries(args.smdId, args.field, args.id);
      })
    );

    return [...uniq(relQueries.reverse().flat()), selfQuery];
  }

  async destory() {
    await this.tdb.destroy();
    await this.fdb.destroy();
  }
}
