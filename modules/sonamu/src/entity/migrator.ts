import _ from "lodash";
import chalk from "chalk";
import { DateTime } from "luxon";
import fs from "fs-extra";
import equal from "fast-deep-equal";
import inflection from "inflection";
import prompts from "prompts";
import { execSync } from "child_process";
import path from "path";

import {
  GenMigrationCode,
  isBelongsToOneRelationProp,
  isHasManyRelationProp,
  isManyToManyRelationProp,
  isOneToOneRelationProp,
  isRelationProp,
  isVirtualProp,
  isStringProp,
  KnexColumnType,
  MigrationColumn,
  MigrationForeign,
  MigrationIndex,
  MigrationJoinTable,
  MigrationSet,
  MigrationSetAndJoinTable,
  isDecimalProp,
  isFloatProp,
  isTextProp,
  isEnumProp,
  isIntegerProp,
  isKnexError,
  RelationOn,
} from "../types/types";
import { EntityManager } from "./entity-manager";
import { Entity } from "./entity";
import { Sonamu } from "../api";
import { ServiceUnavailableException } from "../exceptions/so-exceptions";
import { DB } from "../database/db";
import { KnexClient } from "../database/drivers/knex/client";
import { KyselyClient } from "../database/drivers/kysely/client";

type MigratorMode = "dev" | "deploy";
export type MigratorOptions = {
  readonly mode: MigratorMode;
};
type MigrationCode = {
  name: string;
  path: string;
};
type ConnString = `${"mysql2"}://${string}@${string}:${number}/${string}`; // mysql2://account@host:port/database
export type MigrationStatus = {
  codes: MigrationCode[];
  conns: {
    name: string;
    connKey: string;
    connString: ConnString;
    currentVersion: string;
    status: string | number;
    pending: string[];
  }[];
  preparedCodes: GenMigrationCode[];
};

export class Migrator {
  readonly mode: MigratorMode;

  targets: {
    compare?: KnexClient | KyselyClient;
    pending: KnexClient | KyselyClient;
    shadow: KnexClient | KyselyClient;
    apply: (KnexClient | KyselyClient)[];
  };

  constructor(options: MigratorOptions) {
    this.mode = options.mode;

    if (this.mode === "dev") {
      const devDB = DB.getClient("development_master");
      const testDB = DB.getClient("test");
      const fixtureLocalDB = DB.getClient("fixture_local");

      const uniqConfigs = DB.getUniqueConfigs([
        "development_master",
        "test",
        "fixture_local",
        "fixture_remote",
      ]);
      const applyDBs = [devDB, testDB, fixtureLocalDB];
      if (uniqConfigs.length === 4) {
        const fixtureRemoteDB = DB.getClient("fixture_remote");
        applyDBs.push(fixtureRemoteDB);
      }

      this.targets = {
        compare: devDB,
        pending: devDB,
        shadow: testDB,
        apply: applyDBs,
      };
    } else if (this.mode === "deploy") {
      const productionDB = DB.getClient("production_master");
      const testDB = DB.getClient("test");

      this.targets = {
        pending: productionDB,
        shadow: testDB,
        apply: [productionDB],
      };
    } else {
      throw new Error(`잘못된 모드 ${this.mode} 입력`);
    }
  }

  async getMigrationCodes(): Promise<{
    normal: MigrationCode[];
    onlyTs: MigrationCode[];
    onlyJs: MigrationCode[];
  }> {
    const srcMigrationsDir = `${Sonamu.apiRootPath}/src/migrations`;
    const distMigrationsDir = `${Sonamu.apiRootPath}/dist/migrations`;

    if (fs.existsSync(srcMigrationsDir) === false) {
      fs.mkdirSync(srcMigrationsDir, {
        recursive: true,
      });
    }
    if (fs.existsSync(distMigrationsDir) === false) {
      fs.mkdirSync(distMigrationsDir, {
        recursive: true,
      });
    }
    const srcMigrations = fs
      .readdirSync(srcMigrationsDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => f.split(".")[0]);
    const distMigrations = fs
      .readdirSync(distMigrationsDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => f.split(".")[0]);

    const normal = _.intersection(srcMigrations, distMigrations)
      .map((filename) => {
        return {
          name: filename,
          path: path.join(srcMigrationsDir, filename) + ".ts",
        };
      })
      .sort((a, b) => (a > b ? 1 : -1));

    const onlyTs = _.difference(srcMigrations, distMigrations).map(
      (filename) => {
        return {
          name: filename,
          path: path.join(srcMigrationsDir, filename) + ".ts",
        };
      }
    );

    const onlyJs = _.difference(distMigrations, srcMigrations).map(
      (filename) => {
        return {
          name: filename,
          path: path.join(distMigrationsDir, filename) + ".js",
        };
      }
    );

    return {
      normal,
      onlyTs,
      onlyJs,
    };
  }

  async getStatus(): Promise<MigrationStatus> {
    const { normal, onlyTs, onlyJs } = await this.getMigrationCodes();
    if (onlyTs.length > 0) {
      console.debug({ onlyTs });
      throw new ServiceUnavailableException(
        `There is an un-compiled TS migration files.\nPlease compile them first.\n\n${onlyTs
          .map((f) => f.name)
          .join("\n")}`
      );
    }
    if (onlyJs.length > 0) {
      console.debug({ onlyJs });
      await Promise.all(
        onlyJs.map(async (f) => {
          execSync(
            `rm -f ${f.path.replace("/src/", "/dist/").replace(".ts", ".js")}`
          );
        })
      );
    }

    const connKeys = Object.keys(DB.fullConfig).filter(
      (key) => key.endsWith("_slave") === false
    ) as (keyof typeof DB.fullConfig)[];

    const statuses = await Promise.all(
      connKeys.map(async (connKey) => {
        const tConn = DB.getClient(connKey);

        const status = await (async () => {
          try {
            return await tConn.status();
          } catch (err) {
            console.error(err);
            return "error";
          }
        })();
        const pending = await (async () => {
          try {
            return await tConn.getMigrations();
          } catch (err) {
            console.error(err);
            return [];
          }
        })();
        const currentVersion = await (async () => {
          // try {
          // return tConn.migrate.currentVersion();
          // } catch (err) {
          return "error";
          // }
        })();

        const info = tConn.connectionInfo;

        await tConn.destroy();

        return {
          name: connKey.replace("_master", ""),
          connKey,
          connString: `mysql2://${info.user ?? ""}@${
            info.host
          }:${info.port}/${info.database}` as ConnString,
          currentVersion,
          status,
          pending,
        };
      })
    );

    const preparedCodes: GenMigrationCode[] = await (async () => {
      const status0conn = statuses.find((status) => status.status === 0);
      if (status0conn === undefined) {
        return [];
      }

      const compareDBconn = DB.getClient(status0conn.connKey);
      const genCodes = await this.compareMigrations(compareDBconn);

      await compareDBconn.destroy();

      return genCodes;
    })();

    return {
      conns: statuses,
      codes: normal,
      preparedCodes,
    };
    /*
    TS/JS 코드 컴파일 상태 확인
    1. 원본 파일 없는 JS파일이 존재하는 경우: 삭제
    2. 컴파일 되지 않은 TS파일이 존재하는 경우: throw 쳐서 데브 서버 오픈 요청
    
    DB 마이그레이션 상태 확인
    1. 전체 DB설정에 대해서 현재 마이그레이션 상태 확인
    - connKey: string
    - status: number
    - currentVersion: string
    - list: { file: string; directory: string }[]
    
    */
  }

  async runAction(
    action: "latest" | "rollback",
    targets: string[]
  ): Promise<
    {
      connKey: string;
      batchNo: number;
      applied: string[];
    }[]
  > {
    // get uniq knex configs
    const configs = DB.getUniqueConfigs(targets as any);

    // get connections
    const conns = await Promise.all(
      configs.map(async (config) => ({
        connKey: config.connKey,
        db: DB.getClient(config.connKey),
      }))
    );

    // action
    // TODO: 마이그레이션 결과 리턴값 정리해야됨(kysely/knex)
    const result = await (async () => {
      switch (action) {
        case "latest":
          return Promise.all(
            conns.map(async ({ connKey, db }) => {
              const [batchNo, applied] = await db.migrate();
              return {
                connKey,
                batchNo,
                applied,
              };
            })
          );
        case "rollback":
          return Promise.all(
            conns.map(async ({ connKey, db }) => {
              const [batchNo, applied] = await db.rollback();
              return {
                connKey,
                batchNo,
                applied,
              };
            })
          );
      }
    })();

    // destroy
    await Promise.all(
      conns.map(({ db }) => {
        return db.destroy();
      })
    );

    return result;
  }

  async delCodes(codeNames: string[]): Promise<number> {
    const { conns } = await this.getStatus();
    if (
      conns.some((conn) => {
        return codeNames.some(
          (codeName) => conn.pending.includes(codeName) === false
        );
      })
    ) {
      throw new Error(
        "You cannot delete a migration file if there is already applied."
      );
    }

    const delFiles = codeNames
      .map((codeName) => [
        `${Sonamu.apiRootPath}/src/migrations/${codeName}.ts`,
        `${Sonamu.apiRootPath}/dist/migrations/${codeName}.js`,
      ])
      .flat();

    const res = await Promise.all(
      delFiles.map((delFile) => {
        if (fs.existsSync(delFile)) {
          console.log(chalk.red(`DELETE: ${delFile}`));
          fs.unlinkSync(delFile);
          return delFiles.includes(".ts") ? 1 : 0;
        }
        return 0;
      })
    );
    return _.sum(res);
  }

  async generatePreparedCodes(): Promise<number> {
    const { preparedCodes } = await this.getStatus();
    if (preparedCodes.length === 0) {
      console.log(chalk.green("\n현재 모두 싱크된 상태입니다."));
      return 0;
    }

    // 실제 코드 생성
    const migrationsDir = `${Sonamu.apiRootPath}/src/migrations`;
    preparedCodes
      .filter((pcode) => pcode.formatted)
      .map((pcode, index) => {
        const dateTag = DateTime.local()
          .plus({ seconds: index })
          .toFormat("yyyyMMddHHmmss");
        const filePath = `${migrationsDir}/${dateTag}_${pcode.title}.ts`;
        fs.writeFileSync(filePath, pcode.formatted!);
        console.log(chalk.green(`MIGRTAION CREATED ${filePath}`));
      });

    return preparedCodes.length;
  }

  async clearPendingList(): Promise<void> {
    const pendingList = await this.targets.pending.getMigrations();
    const migrationsDir = `${Sonamu.apiRootPath}/src/migrations`;
    const delList = pendingList.map((df) => {
      return path.join(migrationsDir, `${df}.ts`);
    });
    for (let p of delList) {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
    await this.cleanUpDist(true);
  }

  async check(): Promise<void> {
    const codes = await this.compareMigrations(this.targets.compare!);
    if (codes.length === 0) {
      console.log(chalk.green("\n현재 모두 싱크된 상태입니다."));
      return;
    }

    // 현재 생성된 코드 표기
    console.table(codes, ["type", "title"]);
    console.log(codes[0]);
  }

  async run(): Promise<void> {
    // pending 마이그레이션 확인
    const pendingList = await this.targets.pending.getMigrations();
    if (pendingList.length > 0) {
      console.log(
        chalk.red("pending 된 마이그레이션이 존재합니다."),
        pendingList.map((pending: any) => pending.file)
      );

      // pending이 있는 경우 Shadow DB 테스트 진행 여부 컨펌
      const answer = await prompts({
        type: "confirm",
        name: "value",
        message: "Shadow DB 테스트를 진행하시겠습니까?",
        initial: true,
      });
      if (answer.value === false) {
        return;
      }

      console.time(chalk.blue("Migrator - runShadowTest"));
      await this.runShadowTest();
      console.timeEnd(chalk.blue("Migrator - runShadowTest"));
      await Promise.all(
        this.targets.apply.map(async (applyDb) => {
          const info = applyDb.connectionInfo;
          const label = chalk.green(`APPLIED ${info.host} ${info.database}`);
          console.time(label);
          await applyDb.migrate();
          console.timeEnd(label);
        })
      );
    }

    // Entity-DB간 비교하여 코드 생성 리턴
    const codes = await this.compareMigrations(this.targets.compare!);
    if (codes.length === 0) {
      console.log(chalk.green("\n현재 모두 싱크된 상태입니다."));
      return;
    }

    // 현재 생성된 코드 표기
    console.table(codes, ["type", "title"]);

    /* DEBUG: 디버깅용 코드
    codes.map((code) => console.log(code.formatted));
    process.exit();
     */

    // 실제 파일 생성 프롬프트
    const answer = await prompts({
      type: "confirm",
      name: "value",
      message: "마이그레이션 코드를 생성하시겠습니까?",
      initial: false,
    });
    if (answer.value === false) {
      return;
    }

    // 실제 코드 생성
    const migrationsDir = `${Sonamu.apiRootPath}/src/migrations`;
    codes
      .filter((code) => code.formatted)
      .map((code, index) => {
        const dateTag = DateTime.local()
          .plus({ seconds: index })
          .toFormat("yyyyMMddHHmmss");
        const filePath = `${migrationsDir}/${dateTag}_${code.title}.ts`;
        fs.writeFileSync(filePath, code.formatted!);
        console.log(chalk.green(`MIGRTAION CREATED ${filePath}`));
      });
  }

  async rollback() {
    console.time(chalk.red("rollback:"));
    const rollbackAllResult = await Promise.all(
      this.targets.apply.map(async (db) => {
        // await db.migrate.forceFreeMigrationsLock();
        return db.rollback();
      })
    );
    console.dir({ rollbackAllResult }, { depth: null });
    console.timeEnd(chalk.red("rollback:"));
  }

  async cleanUpDist(force: boolean = false): Promise<void> {
    const files = (["src", "dist"] as const).reduce(
      (r, which) => {
        const migrationPath = path.join(
          Sonamu.apiRootPath,
          which,
          "migrations"
        );
        if (fs.existsSync(migrationPath) === false) {
          fs.mkdirSync(migrationPath, {
            recursive: true,
          });
        }
        const files = fs
          .readdirSync(migrationPath)
          .filter((filename) => filename.startsWith(".") === false);
        r[which] = files;
        return r;
      },
      {
        src: [] as string[],
        dist: [] as string[],
      }
    );

    const diffOnSrc = _.differenceBy(
      files.src,
      files.dist,
      (filename) => filename.split(".")[0]
    );
    if (diffOnSrc.length > 0) {
      throw new Error(
        "컴파일 되지 않은 파일이 있습니다.\n" + diffOnSrc.join("\n")
      );
    }

    const diffOnDist = _.differenceBy(
      files.dist,
      files.src,
      (filename) => filename.split(".")[0]
    );
    if (diffOnDist.length > 0) {
      console.log(chalk.red("원본 ts파일을 찾을 수 없는 js파일이 있습니다."));
      console.log(diffOnDist);

      if (!force) {
        const answer = await prompts({
          type: "confirm",
          name: "value",
          message: "삭제를 진행하시겠습니까?",
          initial: true,
        });
        if (answer.value === false) {
          return;
        }
      }

      const filesToRm = diffOnDist.map((filename) => {
        return path.join(Sonamu.apiRootPath, "dist", "migrations", filename);
      });
      filesToRm.map((filePath) => {
        fs.unlinkSync(filePath);
      });
      console.log(chalk.green(`${filesToRm.length}건 삭제되었습니다!`));
    }
  }

  async runShadowTest(): Promise<
    {
      connKey: string;
      batchNo: number;
      applied: string[];
    }[]
  > {
    // ShadowDB 생성 후 테스트 진행
    const tdb = DB.getClient("test");
    const tdbConn = tdb.connectionInfo;
    const shadowDatabase = tdbConn.database + "__migration_shadow";
    const tmpSqlPath = `/tmp/${shadowDatabase}.sql`;

    // 테스트DB 덤프 후 Database명 치환
    console.log(
      chalk.magenta(`${tdbConn.database}의 데이터 ${tmpSqlPath}로 덤프`)
    );
    execSync(
      `mysqldump -h${tdbConn.host} -P${tdbConn.port} -u${tdbConn.user} -p'${tdbConn.password}' ${tdbConn.database} --single-transaction --no-create-db --triggers > ${tmpSqlPath};`
    );
    execSync(
      `sed -i'' -e 's/\`${tdbConn.database}\`/\`${shadowDatabase}\`/g' ${tmpSqlPath};`
    );

    // 기존 ShadowDB 리셋
    console.log(chalk.magenta(`${shadowDatabase} 리셋`));
    await tdb.raw(`DROP DATABASE IF EXISTS \`${shadowDatabase}\`;`);
    await tdb.raw(`CREATE DATABASE \`${shadowDatabase}\`;`);

    // ShadowDB 테이블 + 데이터 생성
    console.log(chalk.magenta(`${shadowDatabase} 데이터베이스 생성`));
    execSync(
      `mysql -h${tdbConn.host} -P${tdbConn.port} -u${tdbConn.user} -p'${tdbConn.password}' ${shadowDatabase} < ${tmpSqlPath};`
    );

    // shadow db 테스트 진행
    try {
      await tdb.raw(`USE \`${shadowDatabase}\`;`);
      const [batchNo, applied] = await tdb.migrate();
      console.log(chalk.green("Shadow DB 테스트에 성공했습니다!"), {
        batchNo,
        applied,
      });

      // 생성한 Shadow DB 삭제
      console.log(chalk.magenta(`${shadowDatabase} 삭제`));
      await tdb.raw(`DROP DATABASE IF EXISTS \`${shadowDatabase}\`;`);

      return [
        {
          connKey: "shadow",
          batchNo,
          applied,
        },
      ];
    } catch (e) {
      console.error(e);
      throw new ServiceUnavailableException("Shadow DB 테스트 진행 중 에러");
    } finally {
      await tdb.destroy();
    }
  }

  async resetAll() {
    const answer = await prompts({
      type: "confirm",
      name: "value",
      message: "모든 DB를 롤백하고 전체 마이그레이션 파일을 삭제하시겠습니까?",
      initial: false,
    });
    if (answer.value === false) {
      return;
    }

    console.time(chalk.red("rollback-all:"));
    const rollbackAllResult = await Promise.all(
      this.targets.apply.map(async (db) => {
        // await db.migrate.forceFreeMigrationsLock();
        return db.rollbackAll();
      })
    );
    console.log({ rollbackAllResult });
    console.timeEnd(chalk.red("rollback-all:"));

    const migrationsDir = `${Sonamu.apiRootPath}/src/migrations`;
    console.time(chalk.red("delete migration files"));
    execSync(`rm -f ${migrationsDir}/*`);
    execSync(`rm -f ${migrationsDir.replace("/src/", "/dist/")}/*`);
    console.timeEnd(chalk.red("delete migration files"));
  }

  async compareMigrations(
    compareDB: KnexClient | KyselyClient
  ): Promise<GenMigrationCode[]> {
    // Entity 순회하여 싱크
    const entityIds = EntityManager.getAllIds();

    // 조인테이블 포함하여 Entity에서 MigrationSet 추출
    const entitySetsWithJoinTable = entityIds
      .filter((entityId) => {
        const entity = EntityManager.get(entityId);
        return entity.props.length > 0;
      })
      .map((entityId) => {
        const entity = EntityManager.get(entityId);
        return this.getMigrationSetFromEntity(entity);
      });

    // 조인테이블만 추출
    const joinTablesWithDup = entitySetsWithJoinTable
      .map((entitySet) => entitySet.joinTables)
      .flat();
    // 중복 제거 (중복인 경우 indexes를 병합)
    const joinTables = Object.values(
      _.groupBy(joinTablesWithDup, (jt) => jt.table)
    ).map((tables) => {
      if (tables.length === 1) {
        return tables[0];
      }
      return {
        ...tables[0],
        indexes: _.uniqBy(
          tables.flatMap((t) => t.indexes),
          (index) => [index.type, ...index.columns.sort()].join("-")
        ),
      };
    });

    // 조인테이블 포함하여 MigrationSet 배열
    const entitySets: MigrationSet[] = [
      ...entitySetsWithJoinTable,
      ...joinTables,
    ];

    const codes: GenMigrationCode[] = (
      await Promise.all(
        entitySets.map(async (entitySet) => {
          const dbSet = await this.getMigrationSetFromDB(
            compareDB,
            entitySet.table
          );
          if (dbSet === null) {
            // 기존 테이블 없음, 새로 테이블 생성
            return [
              await DB.generator.generateCreateCode_ColumnAndIndexes(
                entitySet.table,
                entitySet.columns,
                entitySet.indexes
              ),
              ...(await DB.generator.generateCreateCode_Foreign(
                entitySet.table,
                entitySet.foreigns
              )),
            ];
          }

          // 기존 테이블 존재하는 케이스
          const alterCodes: (GenMigrationCode | GenMigrationCode[] | null)[] =
            await Promise.all(
              (["columnsAndIndexes", "foreigns"] as const).map((key) => {
                // 배열 원소의 순서가 달라서 불일치가 발생하는걸 방지하기 위해 각 항목별로 정렬 처리 후 비교
                if (key === "columnsAndIndexes") {
                  const replaceColumnDefaultTo = (col: MigrationColumn) => {
                    // float인 경우 기본값을 0으로 지정하는 경우 "0.00"으로 변환되는 케이스 대응
                    if (
                      col.type === "float" &&
                      col.defaultTo &&
                      String(col.defaultTo).includes('"') === false
                    ) {
                      col.defaultTo = `"${Number(col.defaultTo).toFixed(
                        col.scale ?? 2
                      )}"`;
                    }
                    // string인 경우 기본값이 빈 스트링인 경우 대응
                    if (col.type === "string" && col.defaultTo === "") {
                      col.defaultTo = '""';
                    }
                    return col;
                  };
                  const entityColumns = _.sortBy(
                    entitySet.columns,
                    (a) => a.name
                  ).map(replaceColumnDefaultTo);
                  const dbColumns = _.sortBy(dbSet.columns, (a) => a.name).map(
                    replaceColumnDefaultTo
                  );

                  /* 디버깅용 코드, 특정 컬럼에서 불일치 발생할 때 확인
              const entityColumn = entitySet.columns.find(
                (col) => col.name === "price_krw"
              );
              const dbColumn = dbSet.columns.find(
                (col) => col.name === "price_krw"
              );
              console.debug({ entityColumn, dbColumn });
               */

                  const entityIndexes = _.sortBy(entitySet.indexes, (a) =>
                    [
                      a.type,
                      ...a.columns.sort((c1, c2) => (c1 > c2 ? 1 : -1)),
                    ].join("-")
                  );
                  const dbIndexes = _.sortBy(dbSet.indexes, (a) =>
                    [
                      a.type,
                      ...a.columns.sort((c1, c2) => (c1 > c2 ? 1 : -1)),
                    ].join("-")
                  );

                  const isEqualColumns = equal(entityColumns, dbColumns);
                  const isEqualIndexes = equal(entityIndexes, dbIndexes);
                  if (isEqualColumns && isEqualIndexes) {
                    return null;
                  } else {
                    // this.showMigrationSet("Entity", entitySet);
                    // this.showMigrationSet("DB", dbSet);
                    return DB.generator.generateAlterCode_ColumnAndIndexes(
                      entitySet.table,
                      entityColumns,
                      entityIndexes,
                      dbColumns,
                      dbIndexes
                    );
                  }
                } else {
                  const replaceNoActionOnMySQL = (f: MigrationForeign) => {
                    // MySQL에서 RESTRICT와 NO ACTION은 동일함
                    const { onDelete, onUpdate } = f;
                    return {
                      ...f,
                      onUpdate:
                        onUpdate === "RESTRICT" ? "NO ACTION" : onUpdate,
                      onDelete:
                        onDelete === "RESTRICT" ? "NO ACTION" : onDelete,
                    };
                  };

                  const entityForeigns = _.sortBy(entitySet.foreigns, (a) =>
                    [a.to, ...a.columns].join("-")
                  ).map((f) => replaceNoActionOnMySQL(f));
                  const dbForeigns = _.sortBy(dbSet.foreigns, (a) =>
                    [a.to, ...a.columns].join("-")
                  ).map((f) => replaceNoActionOnMySQL(f));

                  if (equal(entityForeigns, dbForeigns) === false) {
                    // console.dir(
                    //   {
                    //     debugOn: "foreign",
                    //     table: entitySet.table,
                    //     entityForeigns,
                    //     dbForeigns,
                    //   },
                    //   { depth: null }
                    // );
                    return DB.generator.generateAlterCode_Foreigns(
                      entitySet.table,
                      entityForeigns,
                      dbForeigns
                    );
                  }
                }
                return null;
              })
            );
          if (alterCodes.every((alterCode) => alterCode === null)) {
            return null;
          } else {
            return alterCodes.filter((alterCode) => alterCode !== null).flat();
          }
        })
      )
    )
      .flat()
      .filter((code) => code !== null) as GenMigrationCode[];

    /*
      normal 타입이 앞으로, foreign 이 뒤로
    */
    codes.sort((codeA, codeB) => {
      if (codeA.type === "foreign" && codeB.type == "normal") {
        return 1;
      } else if (codeA.type === "normal" && codeB.type === "foreign") {
        return -1;
      } else {
        return 0;
      }
    });

    return codes;
  }

  /*
    기존 테이블 정보 읽어서 MigrationSet 형식으로 리턴
  */
  async getMigrationSetFromDB(
    compareDB: KnexClient | KyselyClient,
    table: string
  ): Promise<MigrationSet | null> {
    let dbColumns: DBColumn[], dbIndexes: DBIndex[], dbForeigns: DBForeign[];
    try {
      [dbColumns, dbIndexes, dbForeigns] = await this.readTable(
        compareDB,
        table
      );
    } catch (e: unknown) {
      if (isKnexError(e) && e.code === "ER_NO_SUCH_TABLE") {
        return null;
      }
      console.error(e);
      return null;
    }

    const columns: MigrationColumn[] = dbColumns.map((dbColumn) => {
      const dbColType = this.resolveDBColType(dbColumn.Type, dbColumn.Field);
      return {
        name: dbColumn.Field,
        nullable: dbColumn.Null !== "NO",
        ...dbColType,
        ...(() => {
          if (dbColumn.Default !== null) {
            return {
              defaultTo: dbColumn.Default,
            };
          }
          return {};
        })(),
      };
    });

    const dbIndexesGroup = _.groupBy(
      dbIndexes.filter(
        (dbIndex) =>
          dbIndex.Key_name !== "PRIMARY" &&
          !dbForeigns.find(
            (dbForeign) => dbForeign.keyName === dbIndex.Key_name
          )
      ),
      (dbIndex) => dbIndex.Key_name
    );

    // indexes 처리
    const indexes: MigrationIndex[] = Object.keys(dbIndexesGroup).map(
      (keyName) => {
        const currentIndexes = dbIndexesGroup[keyName];
        return {
          type: currentIndexes[0].Non_unique === 1 ? "index" : "unique",
          columns: currentIndexes.map(
            (currentIndex) => currentIndex.Column_name
          ),
        };
      }
    );
    // console.log(table);
    // console.table(dbIndexes);
    // console.table(dbForeigns);

    // foreigns 처리
    const foreigns: MigrationForeign[] = dbForeigns.map((dbForeign) => {
      return {
        columns: [dbForeign.from],
        to: `${dbForeign.referencesTable}.${dbForeign.referencesField}`,
        onUpdate: dbForeign.onUpdate as RelationOn,
        onDelete: dbForeign.onDelete as RelationOn,
      };
    });

    return {
      table,
      columns,
      indexes,
      foreigns,
    };
  }

  resolveDBColType(
    colType: string,
    colField: string
  ): Pick<
    MigrationColumn,
    "type" | "unsigned" | "length" | "precision" | "scale"
  > {
    let [rawType, unsigned] = colType.split(" ");
    const matched = rawType.match(/\(([0-9]+)\)/);
    let length;
    if (matched !== null && matched[1]) {
      rawType = rawType.replace(/\(([0-9]+)\)/, "");
      length = parseInt(matched[1]);
    }

    if (rawType === "char" && colField === "uuid") {
      return {
        type: "uuid",
      };
    }

    switch (rawType) {
      case "int":
        return {
          type: "integer",
          unsigned: unsigned === "unsigned",
        };
      case "varchar":
        // case "char":
        return {
          type: "string",
          ...(length !== undefined && {
            length,
          }),
        };
      case "text":
      case "mediumtext":
      case "longtext":
      case "timestamp":
      case "json":
      case "date":
      case "time":
        return {
          type: rawType,
        };
      case "datetime":
        return {
          type: "datetime",
        };
      case "tinyint":
        return {
          type: "boolean",
        };
      default:
        // decimal 처리
        if (rawType.startsWith("decimal")) {
          const [, precision, scale] =
            rawType.match(/decimal\(([0-9]+),([0-9]+)\)/) ?? [];
          return {
            type: "decimal",
            precision: parseInt(precision),
            scale: parseInt(scale),
            ...(unsigned === "unsigned" && {
              unsigned: true,
            }),
          };
        } else if (rawType.startsWith("float")) {
          const [, precision, scale] =
            rawType.match(/float\(([0-9]+),([0-9]+)\)/) ?? [];
          return {
            type: "float",
            precision: parseInt(precision),
            scale: parseInt(scale),
            ...(unsigned === "unsigned" && {
              unsigned: true,
            }),
          };
        }
        throw new Error(`resolve 불가능한 DB컬럼 타입 ${colType} ${rawType}`);
    }
  }

  /*
    기존 테이블 읽어서 cols, indexes 반환
  */
  async readTable(
    compareDB: KnexClient | KyselyClient,
    tableName: string
  ): Promise<[DBColumn[], DBIndex[], DBForeign[]]> {
    // 테이블 정보
    try {
      const _cols = await compareDB.raw<DBColumn>(
        `SHOW FIELDS FROM ${tableName}`
      );

      const cols = _cols.map((col) => ({
        ...col,
        // Default 값은 숫자나 MySQL Expression이 아닌 경우 ""로 감싸줌
        ...(col.Default !== null && {
          Default:
            col.Default.replace(/[0-9]+/g, "").length > 0 &&
            col.Extra !== "DEFAULT_GENERATED"
              ? `"${col.Default}"`
              : col.Default,
        }),
      }));

      const indexes = await compareDB.raw<DBIndex>(
        `SHOW INDEX FROM ${tableName}`
      );
      const [row] = await compareDB.raw<{
        "Create Table": string;
      }>(`SHOW CREATE TABLE ${tableName}`);
      const ddl = row["Create Table"];
      const matched = ddl.match(/CONSTRAINT .+/g);
      const foreignKeys = (matched ?? []).map((line: string) => {
        // 해당 라인을 정규식으로 파싱
        const matched = line.match(
          /CONSTRAINT `(.+)` FOREIGN KEY \(`(.+)`\) REFERENCES `(.+)` \(`(.+)`\)( ON [A-Z ]+)*/
        );
        if (!matched) {
          throw new Error(`인식할 수 없는 FOREIGN KEY CONSTRAINT ${line}`);
        }
        const [, keyName, from, referencesTable, referencesField, onClause] =
          matched;
        // console.debug({ tableName, line, onClause });

        const [onUpdateFull, _onUpdate] =
          (onClause ?? "").match(/ON UPDATE ([A-Z ]+)$/) ?? [];
        const onUpdate = _onUpdate ?? "NO ACTION";

        const onDelete =
          (onClause ?? "")
            .replace(onUpdateFull ?? "", "")
            .match(/ON DELETE ([A-Z ]+)/)?.[1]
            ?.trim() ?? "NO ACTION";

        return {
          keyName,
          from,
          referencesTable,
          referencesField,
          onDelete,
          onUpdate,
        };
      });
      return [cols, indexes, foreignKeys];
    } catch (e) {
      throw e;
    }
  }

  /*
    Entity 내용 읽어서 MigrationSetAndJoinTable 추출
  */
  getMigrationSetFromEntity(entity: Entity): MigrationSetAndJoinTable {
    const migrationSet: MigrationSetAndJoinTable = entity.props.reduce(
      (r, prop) => {
        // virtual 필드 제외
        if (isVirtualProp(prop)) {
          return r;
        }
        // HasMany 케이스는 아무 처리도 하지 않음
        if (isHasManyRelationProp(prop)) {
          return r;
        }

        // 일반 컬럼
        if (!isRelationProp(prop)) {
          // type resolve
          let type: KnexColumnType;
          if (isTextProp(prop)) {
            type = prop.textType;
          } else if (isEnumProp(prop)) {
            type = "string";
          } else {
            type = prop.type as KnexColumnType;
          }

          const column = {
            name: prop.name,
            type,
            ...(isIntegerProp(prop) && { unsigned: prop.unsigned === true }),
            ...((isStringProp(prop) || isEnumProp(prop)) && {
              length: prop.length,
            }),
            nullable: prop.nullable === true,
            ...(() => {
              if (prop.dbDefault !== undefined) {
                return {
                  defaultTo: prop.dbDefault,
                };
              }
              return {};
            })(),
            // FIXME: float(N, M) deprecated
            // Decimal, Float 타입의 경우 precision, scale 추가
            ...((isDecimalProp(prop) || isFloatProp(prop)) && {
              precision: prop.precision ?? 8,
              scale: prop.scale ?? 2,
            }),
          };

          r.columns.push(column);
        }

        if (isManyToManyRelationProp(prop)) {
          // ManyToMany 케이스
          const relMd = EntityManager.get(prop.with);
          const [table1, table2] = prop.joinTable.split("__");
          const join = {
            from: `${entity.table}.id`,
            through: {
              from: `${prop.joinTable}.${inflection.singularize(table1)}_id`,
              to: `${prop.joinTable}.${inflection.singularize(table2)}_id`,
              onUpdate: prop.onUpdate,
              onDelete: prop.onDelete,
            },
            to: `${relMd.table}.id`,
          };
          const through = join.through;
          const fields = [through.from, through.to];
          r.joinTables.push({
            table: through.from.split(".")[0],
            indexes: [
              {
                type: "unique",
                columns: ["uuid"],
              },
              // 조인 테이블에 걸린 인덱스 찾아와서 연결
              ...entity.indexes
                .filter((index) =>
                  index.columns.find((col) =>
                    col.includes(prop.joinTable + ".")
                  )
                )
                .map((index) => ({
                  ...index,
                  columns: index.columns.map((col) =>
                    col.replace(prop.joinTable + ".", "")
                  ),
                })),
            ],
            columns: [
              {
                name: "id",
                type: "integer",
                nullable: false,
                unsigned: true,
              },
              ...fields.map((field) => {
                return {
                  name: field.split(".")[1],
                  type: "integer",
                  nullable: false,
                  unsigned: true,
                } as MigrationColumn;
              }),
              {
                name: "uuid",
                nullable: true,
                type: "uuid",
              },
            ],
            foreigns: fields.map((field) => {
              // 현재 필드가 어떤 테이블에 속하는지 판단
              const col = field.split(".")[1];
              const to = (() => {
                if (
                  inflection.singularize(join.to.split(".")[0]) + "_id" ===
                  col
                ) {
                  return join.to;
                } else {
                  return join.from;
                }
              })();
              return {
                columns: [col],
                to,
                onUpdate: through.onUpdate,
                onDelete: through.onDelete,
              };
            }),
          });
          return r;
        } else if (
          isBelongsToOneRelationProp(prop) ||
          (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
        ) {
          // -OneRelation 케이스
          const idColumnName = prop.name + "_id";
          r.columns.push({
            name: idColumnName,
            type: "integer",
            unsigned: true,
            nullable: prop.nullable ?? false,
          });
          r.foreigns.push({
            columns: [idColumnName],
            to: `${inflection.underscore(inflection.pluralize(prop.with)).toLowerCase()}.id`,
            onUpdate: prop.onUpdate,
            onDelete: prop.onDelete,
          });
        }

        return r;
      },
      {
        table: entity.table,
        columns: [] as MigrationColumn[],
        indexes: [] as MigrationIndex[],
        foreigns: [] as MigrationForeign[],
        joinTables: [] as MigrationJoinTable[],
      }
    );

    // indexes
    migrationSet.indexes = entity.indexes.filter((index) =>
      index.columns.find((col) => col.includes(".") === false)
    );

    // uuid
    migrationSet.columns = migrationSet.columns.concat({
      name: "uuid",
      nullable: true,
      type: "uuid",
    } as MigrationColumn);
    migrationSet.indexes = migrationSet.indexes.concat({
      type: "unique",
      columns: ["uuid"],
    } as MigrationIndex);

    return migrationSet;
  }

  /*
    마이그레이션 컬럼 배열 비교용 코드
  */
  showMigrationSet(which: "Entity" | "DB", migrationSet: MigrationSet): void {
    const { columns, indexes, foreigns } = migrationSet;
    const styledChalk =
      which === "Entity" ? chalk.bgGreen.black : chalk.bgBlue.black;
    console.log(
      styledChalk(
        `${which} ${migrationSet.table} Columns\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`
      )
    );
    console.table(
      columns.map((column) => {
        return {
          ..._.pick(column, [
            "name",
            "type",
            "nullable",
            "unsigned",
            "length",
            "defaultTo",
            "precision",
            "scale",
          ]),
        };
      }),
      [
        "name",
        "type",
        "nullable",
        "unsigned",
        "length",
        "defaultTo",
        "precision",
        "scale",
      ]
    );

    if (indexes.length > 0) {
      console.log(
        styledChalk(
          `${which} ${migrationSet.table} Indexes\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`
        )
      );
      console.table(
        indexes.map((index) => {
          return {
            ..._.pick(index, ["type", "columns", "name"]),
          };
        })
      );
    }

    if (foreigns.length > 0) {
      console.log(
        chalk.bgMagenta.black(
          `${which} ${migrationSet.table} Foreigns\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`
        )
      );
      console.table(
        foreigns.map((foreign) => {
          return {
            ..._.pick(foreign, ["columns", "to", "onUpdate", "onDelete"]),
          };
        })
      );
    }
  }

  async destroy(): Promise<void> {
    await Promise.all(
      this.targets.apply.map((db) => {
        return db.destroy();
      })
    );
  }
}

type DBColumn = {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
};
type DBIndex = {
  Table: string;
  Non_unique: number;
  Key_name: string;
  Seq_in_index: number;
  Column_name: string;
  Collation: string | null;
  Cardinality: number | null;
  Sub_part: number | null;
  Packed: string | null;
  Null: string;
  Index_type: string;
  Comment: string;
  Index_comment: string;
  Visible: string;
  Expression: string | null;
};
type DBForeign = {
  keyName: string;
  from: string;
  referencesTable: string;
  referencesField: string;
  onDelete: string;
  onUpdate: string;
};
