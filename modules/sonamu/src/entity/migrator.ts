import _ from "lodash";
import knex, { Knex } from "knex";
import prettier from "prettier";
import chalk from "chalk";
import { DateTime } from "luxon";
import fs from "fs";
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
    compare?: Knex;
    pending: Knex;
    shadow: Knex;
    apply: Knex[];
  };

  constructor(options: MigratorOptions) {
    this.mode = options.mode;
    const { dbConfig } = Sonamu;

    if (this.mode === "dev") {
      const devDB = knex(dbConfig.development_master);
      const testDB = knex(dbConfig.test);
      const fixtureLocalDB = knex(dbConfig.fixture_local);

      const applyDBs = [devDB, testDB, fixtureLocalDB];
      if (
        (dbConfig.fixture_local.connection as Knex.MySql2ConnectionConfig)
          .host !==
          (dbConfig.fixture_remote.connection as Knex.MySql2ConnectionConfig)
            .host ||
        (dbConfig.fixture_local.connection as Knex.MySql2ConnectionConfig)
          .database !==
          (dbConfig.fixture_remote.connection as Knex.MySql2ConnectionConfig)
            .database
      ) {
        const fixtureRemoteDB = knex(dbConfig.fixture_remote);
        applyDBs.push(fixtureRemoteDB);
      }

      this.targets = {
        compare: devDB,
        pending: devDB,
        shadow: testDB,
        apply: applyDBs,
      };
    } else if (this.mode === "deploy") {
      const productionDB = knex(dbConfig.production_master);
      const testDB = knex(dbConfig.test);

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
        `There are un-compiled TS migration files.\nPlease compile them first.\n\n${onlyTs
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

    const connKeys = Object.keys(Sonamu.dbConfig).filter(
      (key) => key.endsWith("_slave") === false
    ) as (keyof typeof Sonamu.dbConfig)[];

    const statuses = await Promise.all(
      connKeys.map(async (connKey) => {
        const knexOptions = Sonamu.dbConfig[connKey];
        const tConn = knex(knexOptions);

        const status = await (async () => {
          try {
            return await tConn.migrate.status();
          } catch (err) {
            return "error";
          }
        })();
        const pending = await (async () => {
          try {
            const [, fdList] = await tConn.migrate.list();
            return fdList.map((fd: { file: string }) =>
              fd.file.replace(".js", "")
            );
          } catch (err) {
            return [];
          }
        })();
        const currentVersion = await (async () => {
          try {
            return tConn.migrate.currentVersion();
          } catch (err) {
            return "error";
          }
        })();

        const connection =
          knexOptions.connection as Knex.MySql2ConnectionConfig;

        await tConn.destroy();

        return {
          name: connKey.replace("_master", ""),
          connKey,
          connString: `mysql2://${connection.user ?? ""}@${connection.host}:${
            connection.port
          }/${connection.database}` as ConnString,
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

      const compareDBconn = knex(Sonamu.dbConfig[status0conn.connKey]);
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
    const configs = _.uniqBy(
      targets
        .map((target) => ({
          connKey: target,
          options: Sonamu.dbConfig[target as keyof typeof Sonamu.dbConfig],
        }))
        .filter((c) => c.options !== undefined),
      ({ options }) =>
        `${(options.connection as Knex.MySql2ConnectionConfig).host}:${
          (options.connection as Knex.MySql2ConnectionConfig).port ?? 3306
        }/${(options.connection as Knex.MySql2ConnectionConfig).database}`
    );

    // get connections
    const conns = await Promise.all(
      configs.map(async (config) => ({
        connKey: config.connKey,
        knex: knex(config.options),
      }))
    );

    // action
    const result = await (async () => {
      switch (action) {
        case "latest":
          return Promise.all(
            conns.map(async ({ connKey, knex }) => {
              const [batchNo, applied] = await knex.migrate.latest();
              return {
                connKey,
                batchNo,
                applied,
              };
            })
          );
        case "rollback":
          return Promise.all(
            conns.map(async ({ connKey, knex }) => {
              const [batchNo, applied] = await knex.migrate.rollback();
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
      conns.map(({ knex }) => {
        return knex.destroy();
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
    const [, pendingList] = (await this.targets.pending.migrate.list()) as [
      unknown,
      {
        file: string;
        directory: string;
      }[],
    ];
    const migrationsDir = `${Sonamu.apiRootPath}/src/migrations`;
    const delList = pendingList.map((df) => {
      return path.join(migrationsDir, df.file).replace(".js", ".ts");
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
    const [, pendingList] = await this.targets.pending.migrate.list();
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
          const label = chalk.green(
            `APPLIED ${
              applyDb.client.connectionSettings.host
            } ${applyDb.client.database()}`
          );
          console.time(label);
          const [,] = await applyDb.migrate.latest();
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
        await db.migrate.forceFreeMigrationsLock();
        return db.migrate.rollback(undefined, false);
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
    const tdb = knex(Sonamu.dbConfig.test);
    const tdbConn = Sonamu.dbConfig.test.connection as Knex.ConnectionConfig;
    const shadowDatabase = tdbConn.database + "__migration_shadow";
    const tmpSqlPath = `/tmp/${shadowDatabase}.sql`;

    // 테스트DB 덤프 후 Database명 치환
    console.log(
      chalk.magenta(`${tdbConn.database}의 데이터 ${tmpSqlPath}로 덤프`)
    );
    execSync(
      `mysqldump -h${tdbConn.host} -u${tdbConn.user} -p'${tdbConn.password}' ${tdbConn.database} --single-transaction --no-create-db --triggers > ${tmpSqlPath};`
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
      `mysql -h${tdbConn.host} -u${tdbConn.user} -p'${tdbConn.password}' ${shadowDatabase} < ${tmpSqlPath};`
    );

    // shadow db 테스트 진행
    const sdb = knex({
      ...Sonamu.dbConfig.test,
      connection: {
        ...tdbConn,
        database: shadowDatabase,
        password: tdbConn.password,
      },
    });

    // shadow db 테스트 진행
    try {
      const [batchNo, applied] = await sdb.migrate.latest();
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
        await db.migrate.forceFreeMigrationsLock();
        return db.migrate.rollback(undefined, true);
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

  async compareMigrations(compareDB: Knex): Promise<GenMigrationCode[]> {
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
              await this.generateCreateCode_ColumnAndIndexes(
                entitySet.table,
                entitySet.columns,
                entitySet.indexes
              ),
              ...(await this.generateCreateCode_Foreign(
                entitySet.table,
                entitySet.foreigns
              )),
            ];
          }

          // 기존 테이블 존재하는 케이스
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
            // boolean인 경우 기본값 정규화 (MySQL에서는 TINYINT(1)로 저장되므로 0 또는 1로 정규화)
            // TODO: db.ts에 typeCase 설정 확인하여 처리하도록 수정 필요
            if (col.type === "boolean" && col.defaultTo !== undefined) {
              if (col.defaultTo === "0" || col.defaultTo === "false") {
                col.defaultTo = "0";
              } else if (col.defaultTo === "1" || col.defaultTo === "true") {
                col.defaultTo = "1";
              }
            }
            return col;
          };
          const entityColumns = _.sortBy(entitySet.columns, (a) => a.name).map(
            replaceColumnDefaultTo
          );
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
            [a.type, ...a.columns.sort((c1, c2) => (c1 > c2 ? 1 : -1))].join(
              "-"
            )
          );
          const dbIndexes = _.sortBy(dbSet.indexes, (a) =>
            [a.type, ...a.columns.sort((c1, c2) => (c1 > c2 ? 1 : -1))].join(
              "-"
            )
          );

          const replaceNoActionOnMySQL = (f: MigrationForeign) => {
            // MySQL에서 RESTRICT와 NO ACTION은 동일함
            const { onDelete, onUpdate } = f;
            return {
              ...f,
              onUpdate: onUpdate === "RESTRICT" ? "NO ACTION" : onUpdate,
              onDelete: onDelete === "RESTRICT" ? "NO ACTION" : onDelete,
            };
          };

          const entityForeigns = _.sortBy(entitySet.foreigns, (a) =>
            [a.to, ...a.columns].join("-")
          ).map((f) => replaceNoActionOnMySQL(f));
          const dbForeigns = _.sortBy(dbSet.foreigns, (a) =>
            [a.to, ...a.columns].join("-")
          ).map((f) => replaceNoActionOnMySQL(f));

          // 삭제될 컬럼 목록 계산
          const droppingColumns = _.differenceBy(
            dbColumns,
            entityColumns,
            (col) => col.name
          );

          const alterCodes: (GenMigrationCode | GenMigrationCode[] | null)[] =
            [];

          // 1. columnsAndIndexes 처리
          const isEqualColumns = equal(entityColumns, dbColumns);
          const isEqualIndexes = equal(
            entityIndexes.map((index) => _.omit(index, ["parser"])),
            dbIndexes
          );
          if (!isEqualColumns || !isEqualIndexes) {
            alterCodes.push(
              await this.generateAlterCode_ColumnAndIndexes(
                entitySet.table,
                entityColumns,
                entityIndexes,
                dbColumns,
                dbIndexes,
                dbSet.foreigns
              )
            );
          }

          // 2. foreigns 처리 (삭제될 컬럼 정보 전달)
          if (equal(entityForeigns, dbForeigns) === false) {
            alterCodes.push(
              await this.generateAlterCode_Foreigns(
                entitySet.table,
                entityForeigns,
                dbForeigns,
                droppingColumns
              )
            );
          }

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
    compareDB: Knex,
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

    const parseIndexType = (index: DBIndex) => {
      if (index.Index_type === "FULLTEXT") {
        return "fulltext";
      }
      return index.Non_unique === 1 ? "index" : "unique";
    };

    // indexes 처리
    const indexes: MigrationIndex[] = Object.keys(dbIndexesGroup).map(
      (keyName) => {
        const currentIndexes = dbIndexesGroup[keyName];
        return {
          type: parseIndexType(currentIndexes[0]),
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
    compareDB: Knex,
    tableName: string
  ): Promise<[DBColumn[], DBIndex[], DBForeign[]]> {
    // 테이블 정보
    try {
      const [_cols] = (await compareDB.raw(
        `SHOW FIELDS FROM ${tableName}`
      )) as [DBColumn[]];
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

      const [indexes] = await compareDB.raw(`SHOW INDEX FROM ${tableName}`);
      const [[row]] = await compareDB.raw(`SHOW CREATE TABLE ${tableName}`);
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
          if ((prop.useConstraint ?? true) === true) {
            r.foreigns.push({
              columns: [idColumnName],
              to: `${inflection
                .underscore(inflection.pluralize(prop.with))
                .toLowerCase()}.id`,
              onUpdate: prop.onUpdate ?? "RESTRICT",
              onDelete: prop.onDelete ?? "RESTRICT",
            });
          }
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
    MigrationColumn[] 읽어서 컬럼 정의하는 구문 생성
  */
  genColumnDefinitions(columns: MigrationColumn[]): string[] {
    return columns.map((column) => {
      const chains: string[] = [];
      if (column.name === "id") {
        return `table.increments().primary();`;
      }

      // FIXME: float(M,D) deprecated -> decimal(M,D) 이용하도록 하고, float/double 처리 추가
      if (column.type === "float" || column.type === "decimal") {
        chains.push(
          `${column.type}('${column.name}', ${column.precision}, ${column.scale})`
        );
      } else {
        // type, length
        let columnType = column.type;
        let extraType: string | undefined;
        if (columnType.includes("text") && columnType !== "text") {
          extraType = columnType;
          columnType = "text";
        }
        chains.push(
          `${column.type}('${column.name}'${
            column.length ? `, ${column.length}` : ""
          }${extraType ? `, '${extraType}'` : ""})`
        );
      }
      if (column.unsigned) {
        chains.push("unsigned()");
      }

      // nullable
      chains.push(column.nullable ? "nullable()" : "notNullable()");

      // defaultTo
      if (column.defaultTo !== undefined) {
        if (
          typeof column.defaultTo === "string" &&
          column.defaultTo.startsWith(`"`)
        ) {
          chains.push(`defaultTo(${column.defaultTo})`);
        } else {
          chains.push(`defaultTo(knex.raw('${column.defaultTo}'))`);
        }
      }

      return `table.${chains.join(".")};`;
    });
  }

  /*
    MigrationIndex[] 읽어서 인덱스/유니크 정의하는 구문 생성
  */
  genIndexDefinitions(indexes: MigrationIndex[]): string[] {
    if (indexes.length === 0) {
      return [];
    }

    const methodMap = {
      index: "index",
      fulltext: "index",
      unique: "unique",
    };

    const lines = _.uniq(
      indexes.reduce((r, index) => {
        r.push(
          `table.${methodMap[index.type]}([${index.columns
            .map((col) => `'${col}'`)
            .join(",")}], ${
            index.type === "fulltext"
              ? "undefined, { indexType: 'FULLTEXT' }"
              : ""
          })`
        );
        return r;
      }, [] as string[])
    );
    return lines;
  }

  /*
    MigrationForeign[] 읽어서 외부키 constraint 정의하는 구문 생성
  */
  genForeignDefinitions(
    table: string,
    foreigns: MigrationForeign[]
  ): { up: string[]; down: string[] } {
    return foreigns.reduce(
      (r, foreign) => {
        const columnsStringQuote = foreign.columns
          .map((col) => `'${col.replace(`${table}.`, "")}'`)
          .join(",");
        r.up.push(
          `table.foreign('${foreign.columns.join(",")}')
              .references('${foreign.to}')
              .onUpdate('${foreign.onUpdate}')
              .onDelete('${foreign.onDelete}')`
        );
        r.down.push(`table.dropForeign([${columnsStringQuote}])`);
        return r;
      },
      {
        up: [] as string[],
        down: [] as string[],
      }
    );
  }

  /*
    테이블 생성하는 케이스 - 컬럼/인덱스 생성
  */
  async generateCreateCode_ColumnAndIndexes(
    table: string,
    columns: MigrationColumn[],
    indexes: MigrationIndex[]
  ): Promise<GenMigrationCode> {
    // fulltext index 분리
    const [ngramIndexes, standardIndexes] = _.partition(
      indexes,
      (i) => i.type === "fulltext" && i.parser === "ngram"
    );

    // 컬럼, 인덱스 처리
    const lines: string[] = [
      'import { Knex } from "knex";',
      "",
      "export async function up(knex: Knex): Promise<void> {",
      `await knex.schema.createTable("${table}", (table) => {`,
      "// columns",
      ...this.genColumnDefinitions(columns),
      "",
      "// indexes",
      ...standardIndexes.map((index) => this.genIndexDefinition(index, table)),
      "});",
      // ngram은 knex.raw로 처리하므로 createTable 밖에서 실행
      ...ngramIndexes.map((index) => this.genIndexDefinition(index, table)),
      "}",
      "",
      "export async function down(knex: Knex): Promise<void> {",
      ` return knex.schema.dropTable("${table}");`,
      "}",
    ];
    return {
      table,
      type: "normal",
      title: `create__${table}`,
      formatted: await prettier.format(lines.join("\n"), {
        parser: "typescript",
      }),
    };
  }

  /*
    테이블 생성하는 케이스 - FK 생성
  */
  async generateCreateCode_Foreign(
    table: string,
    foreigns: MigrationForeign[]
  ): Promise<GenMigrationCode[]> {
    if (foreigns.length === 0) {
      return [];
    }

    const { up, down } = this.genForeignDefinitions(table, foreigns);
    if (up.length === 0 && down.length === 0) {
      console.log("fk 가 뭔가 다릅니다");
      return [];
    }

    const lines: string[] = [
      'import { Knex } from "knex";',
      "",
      "export async function up(knex: Knex): Promise<void> {",
      `return knex.schema.alterTable("${table}", (table) => {`,
      "// create fk",
      ...up,
      "});",
      "}",
      "",
      "export async function down(knex: Knex): Promise<void> {",
      `return knex.schema.alterTable("${table}", (table) => {`,
      "// drop fk",
      ...down,
      "});",
      "}",
    ];

    const foreignKeysString = foreigns
      .map((foreign) => foreign.columns.join("_"))
      .join("_");
    return [
      {
        table,
        type: "foreign",
        title: `foreign__${table}__${foreignKeysString}`,
        formatted: await prettier.format(lines.join("\n"), {
          parser: "typescript",
        }),
      },
    ];
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

  async generateAlterCode_ColumnAndIndexes(
    table: string,
    entityColumns: MigrationColumn[],
    entityIndexes: MigrationIndex[],
    dbColumns: MigrationColumn[],
    dbIndexes: MigrationIndex[],
    dbForeigns: MigrationForeign[]
  ): Promise<GenMigrationCode[]> {
    /*
      세부 비교 후 다른점 찾아서 코드 생성

      1. 컬럼갯수 다름: MD에 있으나, DB에 없다면 추가
      2. 컬럼갯수 다름: MD에 없으나, DB에 있다면 삭제
      3. 그외 컬럼(컬럼 갯수가 동일하거나, 다른 경우 동일한 컬럼끼리) => alter
      4. 다른거 다 동일하고 index만 변경되는 경우

      ** 컬럼명을 변경하는 경우는 따로 핸들링하지 않음
      => drop/add 형태의 마이그레이션 코드가 생성되는데, 수동으로 rename 코드로 수정하여 처리
    */

    // 각 컬럼 이름 기준으로 add, drop, alter 여부 확인
    const alterColumnsTo = this.getAlterColumnsTo(entityColumns, dbColumns);

    // 추출된 컬럼들을 기준으로 각각 라인 생성
    const alterColumnLinesTo = this.getAlterColumnLinesTo(
      alterColumnsTo,
      entityColumns,
      table,
      dbForeigns
    );

    // 인덱스의 add, drop 여부 확인
    const alterIndexesTo = this.getAlterIndexesTo(entityIndexes, dbIndexes);

    // fulltext index 분리
    const [ngramIndexes, standardIndexes] = _.partition(
      alterIndexesTo.add,
      (i) => i.type === "fulltext" && i.parser === "ngram"
    );

    // 인덱스가 삭제되는 경우, 컬럼과 같이 삭제된 케이스에는 drop에서 제외해야함!
    const indexNeedsToDrop = alterIndexesTo.drop.filter(
      (index) =>
        index.columns.every((colName) =>
          alterColumnsTo.drop.map((col) => col.name).includes(colName)
        ) === false
    );

    const lines: string[] = [
      'import { Knex } from "knex";',
      "",
      "export async function up(knex: Knex): Promise<void> {",
      `await knex.schema.alterTable("${table}", (table) => {`,
      // 1. add column
      ...(alterColumnsTo.add.length > 0 ? alterColumnLinesTo.add.up : []),
      // 2. drop column
      ...(alterColumnsTo.drop.length > 0 ? alterColumnLinesTo.drop.up : []),
      // 3. alter column
      ...(alterColumnsTo.alter.length > 0 ? alterColumnLinesTo.alter.up : []),
      // 4. add index
      ...standardIndexes.map((index) => this.genIndexDefinition(index, table)),
      // 5. drop index
      ...indexNeedsToDrop.map(this.genIndexDropDefinition),
      "});",
      // ngram은 knex.raw로 처리하므로 alterTable 밖에서 실행
      ...ngramIndexes.map((index) => this.genIndexDefinition(index, table)),
      "}",
      "",
      "export async function down(knex: Knex): Promise<void> {",
      `return knex.schema.alterTable("${table}", (table) => {`,
      ...(alterColumnsTo.add.length > 0 ? alterColumnLinesTo.add.down : []),
      ...(alterColumnsTo.drop.length > 0 ? alterColumnLinesTo.drop.down : []),
      ...(alterColumnsTo.alter.length > 0 ? alterColumnLinesTo.alter.down : []),
      ...alterIndexesTo.add
        .filter(
          (index) =>
            index.columns.every((colName) =>
              alterColumnsTo.add.map((col) => col.name).includes(colName)
            ) === false
        )
        .map(this.genIndexDropDefinition),
      ...indexNeedsToDrop.map((index) => this.genIndexDefinition(index, table)),
      "});",
      "}",
    ];

    const formatted = await prettier.format(lines.join("\n"), {
      parser: "typescript",
    });

    const title = [
      "alter",
      table,
      ...(["add", "drop", "alter"] as const)
        .map((action) => {
          const len = alterColumnsTo[action].length;
          if (len > 0) {
            return action + len;
          }
          return null;
        })
        .filter((part) => part !== null),
    ].join("_");

    return [
      {
        table,
        title,
        formatted,
        type: "normal",
      },
    ];
  }

  getAlterColumnsTo(
    entityColumns: MigrationColumn[],
    dbColumns: MigrationColumn[]
  ) {
    const columnsTo = {
      add: [] as MigrationColumn[],
      drop: [] as MigrationColumn[],
      alter: [] as MigrationColumn[],
    };

    // 컬럼명 기준 비교
    const extraColumns = {
      db: _.differenceBy(dbColumns, entityColumns, (col) => col.name),
      entity: _.differenceBy(entityColumns, dbColumns, (col) => col.name),
    };
    if (extraColumns.entity.length > 0) {
      columnsTo.add = columnsTo.add.concat(extraColumns.entity);
    }
    if (extraColumns.db.length > 0) {
      columnsTo.drop = columnsTo.drop.concat(extraColumns.db);
    }

    // 동일 컬럼명의 세부 필드 비교
    const sameDbColumns = _.intersectionBy(
      dbColumns,
      entityColumns,
      (col) => col.name
    );
    const sameMdColumns = _.intersectionBy(
      entityColumns,
      dbColumns,
      (col) => col.name
    );
    columnsTo.alter = _.differenceWith(sameDbColumns, sameMdColumns, (a, b) =>
      equal(a, b)
    );

    return columnsTo;
  }

  getAlterColumnLinesTo(
    columnsTo: ReturnType<Migrator["getAlterColumnsTo"]>,
    entityColumns: MigrationColumn[],
    table: string,
    dbForeigns: MigrationForeign[]
  ) {
    let linesTo = {
      add: {
        up: [] as string[],
        down: [] as string[],
      },
      drop: {
        up: [] as string[],
        down: [] as string[],
      },
      alter: {
        up: [] as string[],
        down: [] as string[],
      },
    };

    linesTo.add = {
      up: ["// add", ...this.genColumnDefinitions(columnsTo.add)],
      down: [
        "// rollback - add",
        `table.dropColumns(${columnsTo.add
          .map((col) => `'${col.name}'`)
          .join(", ")})`,
      ],
    };

    // drop할 컬럼에 걸린 FK 찾기
    const dropColumnNames = columnsTo.drop.map((col) => col.name);
    const fkToDropBeforeColumn = dbForeigns.filter((fk) =>
      fk.columns.some((col) => dropColumnNames.includes(col))
    );

    const dropFkLines = fkToDropBeforeColumn.map((fk) => {
      const columnsStringQuote = fk.columns.map((col) => `'${col}'`).join(",");
      return `table.dropForeign([${columnsStringQuote}])`;
    });

    const restoreFkLines = this.genForeignDefinitions(
      table,
      fkToDropBeforeColumn
    ).up;

    linesTo.drop = {
      up: [
        ...(dropFkLines.length > 0
          ? ["// drop foreign keys on columns to be dropped", ...dropFkLines]
          : []),
        "// drop columns",
        `table.dropColumns(${columnsTo.drop
          .map((col) => `'${col.name}'`)
          .join(", ")})`,
      ],
      down: [
        "// rollback - drop columns",
        ...this.genColumnDefinitions(columnsTo.drop),
        ...(restoreFkLines.length > 0
          ? ["// restore foreign keys", ...restoreFkLines]
          : []),
      ],
    };
    linesTo.alter = columnsTo.alter.reduce(
      (r, dbColumn) => {
        const entityColumn = entityColumns.find(
          (col) => col.name == dbColumn.name
        );
        if (entityColumn === undefined) {
          return r;
        }

        // 컬럼 변경사항
        const columnDiffUp = _.difference(
          this.genColumnDefinitions([entityColumn]),
          this.genColumnDefinitions([dbColumn])
        );
        const columnDiffDown = _.difference(
          this.genColumnDefinitions([dbColumn]),
          this.genColumnDefinitions([entityColumn])
        );
        if (columnDiffUp.length > 0) {
          r.up = [
            ...r.up,
            "// alter column",
            ...columnDiffUp.map((l) => l.replace(";", "") + ".alter();"),
          ];
          r.down = [
            ...r.down,
            "// rollback - alter column",
            ...columnDiffDown.map((l) => l.replace(";", "") + ".alter();"),
          ];
        }

        return r;
      },
      {
        up: [] as string[],
        down: [] as string[],
      }
    );

    return linesTo;
  }

  getAlterIndexesTo(
    entityIndexes: MigrationIndex[],
    dbIndexes: MigrationIndex[]
  ) {
    // 인덱스 비교
    let indexesTo = {
      add: [] as MigrationIndex[],
      drop: [] as MigrationIndex[],
    };
    const extraIndexes = {
      db: _.differenceBy(dbIndexes, entityIndexes, (col) =>
        [col.type, col.columns.join("-")].join("//")
      ),
      entity: _.differenceBy(entityIndexes, dbIndexes, (col) =>
        [col.type, col.columns.join("-")].join("//")
      ),
    };
    if (extraIndexes.entity.length > 0) {
      indexesTo.add = indexesTo.add.concat(extraIndexes.entity);
    }
    if (extraIndexes.db.length > 0) {
      indexesTo.drop = indexesTo.drop.concat(extraIndexes.db);
    }

    return indexesTo;
  }

  genIndexDefinition(index: MigrationIndex, table: string) {
    const methodMap = {
      index: "index",
      fulltext: "index",
      unique: "unique",
    };

    if (index.type === "fulltext" && index.parser === "ngram") {
      const indexName = `${table}_${index.columns.join("_")}_index`;
      return `await knex.raw(\`ALTER TABLE ${table} ADD FULLTEXT INDEX ${indexName} (${index.columns.join(
        ", "
      )}) WITH PARSER ngram\`);`;
    }

    return `table.${methodMap[index.type]}([${index.columns
      .map((col) => `'${col}'`)
      .join(",")}]${
      index.type === "fulltext" ? ", undefined, 'FULLTEXT'" : ""
    })`;
  }

  genIndexDropDefinition(index: MigrationIndex) {
    const methodMap = {
      index: "Index",
      fulltext: "Index",
      unique: "Unique",
    };

    return `table.drop${methodMap[index.type]}([${index.columns
      .map((columnName) => `'${columnName}'`)
      .join(",")}])`;
  }

  async generateAlterCode_Foreigns(
    table: string,
    entityForeigns: MigrationForeign[],
    dbForeigns: MigrationForeign[],
    droppingColumns: MigrationColumn[] = []
  ): Promise<GenMigrationCode[]> {
    // console.log({ entityForeigns, dbForeigns });

    const getKey = (mf: MigrationForeign): string => {
      return [mf.columns.join("-"), mf.to].join("///");
    };

    // 삭제될 컬럼명 목록
    const droppingColumnNames = droppingColumns.map((col) => col.name);

    const fkTo = entityForeigns.reduce(
      (result, entityF) => {
        const matchingDbF = dbForeigns.find(
          (dbF) => getKey(entityF) === getKey(dbF)
        );
        if (!matchingDbF) {
          result.add.push(entityF);
          return result;
        }

        if (equal(entityF, matchingDbF) === false) {
          result.alterSrc.push(matchingDbF);
          result.alterDst.push(entityF);
          return result;
        }
        return result;
      },
      {
        add: [] as MigrationForeign[],
        drop: [] as MigrationForeign[],
        alterSrc: [] as MigrationForeign[],
        alterDst: [] as MigrationForeign[],
      }
    );

    // dbForeigns에는 있지만 entityForeigns에는 없는 경우 (삭제된 FK)
    // 단, 삭제될 컬럼의 FK는 제외 (generateAlterCode_ColumnAndIndexes에서 처리)
    dbForeigns.forEach((dbF) => {
      const matchingEntityF = entityForeigns.find(
        (entityF) => getKey(entityF) === getKey(dbF)
      );
      if (!matchingEntityF) {
        // 이 FK의 컬럼이 삭제될 컬럼 목록에 있는지 확인
        const isColumnDropping = dbF.columns.some((col) =>
          droppingColumnNames.includes(col)
        );
        // 컬럼이 삭제되지 않는 경우에만 FK drop 목록에 추가
        if (!isColumnDropping) {
          fkTo.drop.push(dbF);
        }
      }
    });

    const linesTo = {
      add: this.genForeignDefinitions(table, fkTo.add),
      drop: this.genForeignDefinitions(table, fkTo.drop),
      alterSrc: this.genForeignDefinitions(table, fkTo.alterSrc),
      alterDst: this.genForeignDefinitions(table, fkTo.alterDst),
    };

    // drop fk columns인 경우(생성될 코드 없는 경우) 패스
    const hasLines = Object.values(linesTo).some(
      (l) => l.up.length > 0 || l.down.length > 0
    );
    if (!hasLines) {
      return [];
    }

    const lines: string[] = [
      'import { Knex } from "knex";',
      "",
      "export async function up(knex: Knex): Promise<void> {",
      `return knex.schema.alterTable("${table}", (table) => {`,
      ...linesTo.drop.down,
      ...linesTo.add.up,
      ...linesTo.alterSrc.down,
      ...linesTo.alterDst.up,
      "})",
      "}",
      "",
      "export async function down(knex: Knex): Promise<void> {",
      `return knex.schema.alterTable("${table}", (table) => {`,
      ...linesTo.add.down,
      ...linesTo.alterDst.down,
      ...linesTo.alterSrc.up,
      ...linesTo.drop.up,
      "})",
      "}",
    ];

    const formatted = await prettier.format(lines.join("\n"), {
      parser: "typescript",
    });

    const title = [
      "alter",
      table,
      "foreigns",
      // TODO 바뀌는 부분
    ].join("_");

    return [
      {
        table,
        title,
        formatted,
        type: "normal",
      },
    ];
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
