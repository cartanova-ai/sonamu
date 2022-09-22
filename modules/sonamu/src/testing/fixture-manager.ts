import chalk from "chalk";
import { execSync } from "child_process";
import knex, { Knex } from "knex";
import { uniq } from "lodash";
import { BaseModel } from "../database/base-model";
import { DB, SonamuDBConfig } from "../database/db";
import { SMDManager } from "../smd/smd-manager";
import {
  isBelongsToOneRelationProp,
  isOneToOneRelationProp,
} from "../types/types";

export class FixtureManager {
  private config?: {
    tdb: Knex;
    fdb: Knex;
    knexfile: SonamuDBConfig;
  };

  constructor(public usingTables?: string[]) {
    if (process.env.NODE_ENV === "test") {
      beforeAll(async () => {
        await this.init();
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

  async init(): Promise<{
    tdb: Knex;
    fdb: Knex;
    knexfile: SonamuDBConfig;
  }> {
    if (this.config) {
      return this.config;
    }

    const knexfile = await DB.readKnexfile();
    this.config = {
      knexfile,
      tdb: knex(knexfile.test),
      fdb: knex(knexfile.fixture_local),
    };
    return this.config;
  }

  async cleanAndSeed() {
    const { tdb, fdb, knexfile } = await this.init();
    // console.time("FIXTURE-CleanAndSeed");

    let tableNames: string[] = [];

    if (this.usingTables === undefined) {
      const [tables] = await tdb.raw(
        "SHOW TABLE STATUS WHERE Engine IS NOT NULL"
      );
      tableNames = tables.map((tableInfo: any) => tableInfo["Name"]);
    } else {
      tableNames = this.usingTables;
    }

    await tdb.raw(`SET FOREIGN_KEY_CHECKS = 0`);
    for await (let tableName of tableNames) {
      if (tableName == "migrations") {
        continue;
      }

      const [[fdbChecksumRow]] = await fdb.raw(`CHECKSUM TABLE ${tableName}`);
      const fdbChecksum = fdbChecksumRow["Checksum"];

      const [[tdbChecksumRow]] = await tdb.raw(`CHECKSUM TABLE ${tableName}`);
      const tdbChecksum = tdbChecksumRow["Checksum"];

      if (fdbChecksum !== tdbChecksum) {
        await tdb(tableName).truncate();
        const rawQuery = `INSERT INTO ${
          (knexfile.test.connection as Knex.ConnectionConfig).database
        }.${tableName}
            SELECT * FROM ${
              (knexfile.fixture_local.connection as Knex.ConnectionConfig)
                .database
            }.${tableName}`;
        await tdb.raw(rawQuery);
      }
    }
    await tdb.raw(`SET FOREIGN_KEY_CHECKS = 1`);

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
    const { fdb, knexfile } = await this.init();
    const frdb = knex(knexfile.fixture_remote);

    const [tables] = await fdb.raw(
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
        const localChecksum = await this.getChecksum(fdb, tableName);

        if (remoteChecksum !== localChecksum) {
          await fdb.transaction(async (transaction) => {
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
    const { knexfile } = await this.init();

    console.log({ smdId, field, id });
    const smd = SMDManager.get(smdId);
    const wdb = BaseModel.getDB("w");

    // 여기서 실DB의 row 가져옴
    const [row] = await wdb(smd.table).where(field, id).limit(1);
    if (row === undefined) {
      throw new Error(`${smdId}#${id} row를 찾을 수 없습니다.`);
    }

    // 픽스쳐DB, 실DB
    const fixtureDatabase = (knexfile.fixture_remote.connection as any)
      .database;
    const realDatabase = (knexfile.production_master.connection as any)
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
    if (!this.config) {
      return;
    }
    const { tdb, fdb } = await this.init();
    await tdb.destroy();
    await fdb.destroy();
  }
}
