import assert from "assert";
import chalk from "chalk";
import { execSync } from "child_process";
import { mkdir, readdir, unlink, writeFile } from "fs/promises";
import knex, { type Knex } from "knex";
import path from "path";
import { group, sum, unique } from "radashi";
import { Sonamu } from "../api";
import type { SonamuDBConfig } from "../database/db";
import { EntityManager } from "../entity/entity-manager";
import { ServiceUnavailableException } from "../exceptions/so-exceptions";
import { Naite } from "../naite/naite";
import type { GenMigrationCode, MigrationSet } from "../types/types";
import { isTest } from "../utils/controller";
import { exists } from "../utils/fs-utils";
import { generateAlterCode, generateCreateCode } from "./code-generation";
import { getMigrationSetFromDB, getMigrationSetFromEntity } from "./migration-set";
import type { ConnString, MigrationCode, MigrationStatus } from "./types";

export class Migrator {
  targets: {
    compare: Knex;
    shadow: Knex;
  };

  constructor() {
    const { dbConfig } = Sonamu;

    const devDB = knex(dbConfig.development_master);
    const testDB = knex(dbConfig.test);
    const applyDBs = [devDB, testDB];
    if (
      (dbConfig.test.connection as Knex.MySql2ConnectionConfig).host !==
        (dbConfig.fixture_remote.connection as Knex.MySql2ConnectionConfig).host ||
      (dbConfig.test.connection as Knex.MySql2ConnectionConfig).database !==
        (dbConfig.fixture_remote.connection as Knex.MySql2ConnectionConfig).database
    ) {
      const fixtureRemoteDB = knex(dbConfig.fixture_remote);
      applyDBs.push(fixtureRemoteDB);
    }

    this.targets = {
      compare: devDB,
      shadow: testDB,
    };
  }

  private async getMigrationCodes(): Promise<MigrationCode[]> {
    const srcMigrationsDir = path.join(Sonamu.apiRootPath, "src", "migrations"); // 이건 환경에 관계없이 항상 src에서 찾아야 해요.

    if (!(await exists(srcMigrationsDir))) {
      await mkdir(srcMigrationsDir, {
        recursive: true,
      });
    }

    const codes = (await readdir(srcMigrationsDir))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({
        name: f.replace(".ts", ""),
        path: path.join(srcMigrationsDir, f),
      }))
      .sort((a, b) => (a.name < b.name ? 1 : -1)); // 이름 내림차순 정렬(최신순)

    Naite.t("getMigrationCodes:results", codes);
    return codes;
  }

  /**
   * 타겟별 마이그레이션 상태와 코드 생성/준비 상태를 구해옵니다.
   * 실제로 DB에 접근도 하고 마이그레이션 코드 파일도 확인하고,
   * 필요하다면 적용할 수 있는 코드를 생성까지 해옵니다.
   *
   * CLI와 Sonamu UI에서 사용됩니다.
   *
   * @returns
   */
  async getStatus(): Promise<MigrationStatus> {
    const codes = await this.getMigrationCodes();

    const connKeys = Object.keys(Sonamu.dbConfig).filter(
      (key) => key.endsWith("_slave") === false,
    ) as (keyof typeof Sonamu.dbConfig)[];

    const statuses = await Promise.all(
      connKeys.map(async (connKey) => {
        const knexOptions = Sonamu.dbConfig[connKey];
        const tConn = knex(knexOptions);

        const status = await (async () => {
          try {
            return await tConn.migrate.status();
          } catch (err) {
            console.warn(
              chalk.yellow(
                `${connKey}의 마이그레이션 상태를 가져오는 데에 실패하였습니다. 데이터베이스가 올바르게 구성되지 않은 것 같습니다. 확인하시고 다시 시도해주세요.\n시도한 연결 설정:\n${JSON.stringify(knexOptions.connection, null, 2)}\n발생한 에러:\n${err}\n`,
              ),
            );
            return "error"; /*클라이언트에서 에러 체크에 사용하는 리터럴입니다.*/
          }
        })();
        const pending = await (async () => {
          try {
            const [, fdList] = await tConn.migrate.list();
            return fdList.map((fd: { file: string }) => fd.file.replace(".ts", ""));
          } catch (_err) {
            return [];
          }
        })();
        const currentVersion = await (async () => {
          try {
            return await tConn.migrate.currentVersion();
          } catch (_err) {
            return "error";
          }
        })();
        Naite.t("getStatus:status", status);

        const connection = knexOptions.connection as Knex.MySql2ConnectionConfig;

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
      }),
    );

    Naite.t("getStatus:conns", statuses);

    const preparedCodes: GenMigrationCode[] = await (async () => {
      const status0conn = statuses.find((status) => status.status === 0);
      if (status0conn === undefined) {
        console.warn(
          chalk.yellow(
            `While trying to prepare migration codes, we found that there is no database to compare migrations. We need at least one database where every migration is applied(status === 0). You might want to apply your existing migrations to one of the databases.`,
          ),
        );
        return [];
      }

      const compareDBconn = knex(Sonamu.dbConfig[status0conn.connKey]);
      const genCodes = await this.compareMigrations(compareDBconn);

      await compareDBconn.destroy();

      return genCodes;
    })();

    Naite.t("getStatus:preparedCodes", preparedCodes);

    return {
      conns: statuses,
      codes,
      preparedCodes,
    };
  }

  /**
   * 마이그레이션을 적용하거나 롤백합니다.
   * Sonamu UI에서 마이그레이션 작업을 수행할 때 사용됩니다.
   *
   * CLI와 Sonamu UI에서 사용됩니다.
   *
   * @param action 작업 유형 (apply/rollback)
   * @param targets 작업 대상 DB 설정 키 (keyof SonamuDBConfig)
   * @returns 작업 결과
   */
  async runAction(
    action: "apply" | "rollback",
    targets: (keyof SonamuDBConfig)[],
  ): Promise<
    {
      connKey: string;
      batchNo: number;
      applied: string[];
    }[]
  > {
    Naite.t("runAction:action", action);
    Naite.t("runAction:targets", targets);

    // get uniq knex configs
    const configs = unique(
      targets
        .map((target) => ({
          connKey: target,
          options: Sonamu.dbConfig[target as keyof typeof Sonamu.dbConfig],
        }))
        .filter((c) => c.options !== undefined),
      ({ options }) =>
        `${(options.connection as Knex.MySql2ConnectionConfig).host}:${
          (options.connection as Knex.MySql2ConnectionConfig).port ?? 3306
        }/${(options.connection as Knex.MySql2ConnectionConfig).database}`,
    );

    // get connections
    const conns = await Promise.all(
      configs.map(async (config) => ({
        connKey: config.connKey,
        knex: knex(config.options),
      })),
    );
    Naite.t("runAction:conns", conns);

    // action
    const result = await (async () => {
      switch (action) {
        case "apply":
          return Promise.all(
            conns.map(async ({ connKey, knex }) => {
              const [batchNo, applied] = await knex.migrate.latest();
              return {
                connKey,
                batchNo,
                applied, // 이번 latest 호출로 인해 "up"이 적용된 마이그레이션 이름(e.g. "20251124233557_create__companies.ts")들의 배열입니다. 참고: https://github.com/knex/knex/blob/01b177c485d696f1b72858dee728ba143c4fad76/lib/migrations/migrate/Migrator.js#L560
              };
            }),
          );
        case "rollback":
          return Promise.all(
            conns.map(async ({ connKey, knex }) => {
              const [batchNo, applied] = await knex.migrate.rollback();
              return {
                connKey,
                batchNo,
                applied, // 이번 rollback 호출로 인해 "down"이 적용된(=롤백된) 마이그레이션 이름(e.g. "20251124233557_create__companies.ts")들의 배열입니다. 참고: https://github.com/knex/knex/blob/01b177c485d696f1b72858dee728ba143c4fad76/lib/migrations/migrate/Migrator.js#L611
              };
            }),
          );
      }
    })();

    // destroy
    await Promise.all(
      conns.map(({ knex }) => {
        return knex.destroy();
      }),
    );

    Naite.t("runAction:result", result);

    return result;
  }

  /**
   * 마이그레이션 코드 파일을 삭제합니다.
   *
   * Sonamu UI에서 사용됩니다.
   *
   * @param codeNames 삭제할 마이그레이션 코드 파일 이름 배열
   * @returns 삭제된 마이그레이션 코드 파일 개수
   */
  async delCodes(codeNames: string[]): Promise<number> {
    const { conns } = await this.getStatus();

    if (
      conns.some((conn) => {
        return codeNames.some((codeName) => conn.pending.includes(codeName) === false);
      })
    ) {
      throw new Error("You cannot delete a migration file if there is already applied.");
    }

    const delFiles = codeNames.map(
      (codeName) => `${Sonamu.apiRootPath}/src/migrations/${codeName}.ts`,
    );

    const res = await Promise.all(
      delFiles.map(async (delFile) => {
        if (await exists(delFile)) {
          !isTest() && console.log(chalk.red(`DELETE: ${delFile}`));
          await unlink(delFile);
          return delFiles.includes(".ts") ? 1 : 0;
        }
        return 0;
      }),
    );
    return sum(res);
  }

  private genDateTag(index: number, baseDate: Date = new Date()): string {
    const date = new Date(baseDate.getTime() + index * 1000);
    const pad = (num: number, size: number = 2) => num.toString().padStart(size, "0");
    return (
      date.getFullYear().toString() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  /**
   * 마이그레이션 코드 파일을 생성합니다.
   *
   * Sonamu UI에서 사용됩니다.
   *
   * @returns 생성된 마이그레이션 코드 파일 개수
   */
  async generatePreparedCodes(): Promise<number> {
    const { preparedCodes } = await this.getStatus();
    Naite.t("generatePreparedCodes:preparedCodes", preparedCodes);
    if (preparedCodes.length === 0) {
      console.log(chalk.green("\n현재 모두 싱크된 상태입니다."));
      return 0;
    }

    // 실제 코드 생성
    const migrationsDir = `${Sonamu.apiRootPath}/src/migrations`;

    for (const [index, pcode] of preparedCodes.entries()) {
      if (pcode.formatted) {
        const dateTag = this.genDateTag(index);
        const filePath = `${migrationsDir}/${dateTag}_${pcode.title}.ts`;
        await writeFile(filePath, pcode.formatted);
        console.log(chalk.green(`MIGRTAION CREATED ${filePath}`));
      }
    }

    return preparedCodes.length;
  }

  private async compareMigrations(compareDB: Knex): Promise<GenMigrationCode[]> {
    // Entity 순회하여 싱크
    const entityIds = EntityManager.getAllIds();

    // 조인테이블 포함하여 Entity에서 MigrationSet 추출
    const entitySetsWithJoinTable = entityIds
      .filter((entityId) => EntityManager.get(entityId).props.length > 0)
      .map((entityId) => getMigrationSetFromEntity(EntityManager.get(entityId)));

    // 조인테이블만 추출
    const joinTablesWithDup = entitySetsWithJoinTable.flatMap((entitySet) => entitySet.joinTables);
    // 중복 제거 (중복인 경우 indexes를 병합)
    const joinTables = Object.values(group(joinTablesWithDup, (jt) => jt.table)).map((tables) => {
      assert(tables !== undefined, "tables is undefined");
      if (tables.length === 1) {
        return tables[0];
      }
      return {
        ...tables[0],
        indexes: unique(
          tables.flatMap((t) => t.indexes),
          (index) => [index.type, ...index.columns.sort()].join("-"),
        ),
      };
    });

    // 조인테이블 포함하여 MigrationSet 배열
    const entitySets: MigrationSet[] = [...entitySetsWithJoinTable, ...joinTables];

    const codes: GenMigrationCode[] = (
      await Promise.all(
        entitySets.map(async (entitySet) => {
          const dbSet = await getMigrationSetFromDB(compareDB, entitySet.table);

          if (dbSet === null) {
            // 기존 테이블 없음, 새로 테이블 생성
            return await generateCreateCode(entitySet);
          } else {
            // 기존 테이블 존재하는 케이스
            return await generateAlterCode(entitySet, dbSet);
          }
        }),
      )
    ).flat();

    // normal 타입이 앞으로, foreign이 뒤로
    codes.sort((codeA, codeB) => {
      if (codeA.type === "foreign" && codeB.type === "normal") {
        return 1;
      } else if (codeA.type === "normal" && codeB.type === "foreign") {
        return -1;
      } else {
        return 0;
      }
    });

    return codes;
  }

  /**
   * Shadow DB 테스트를 진행합니다.
   *
   * Sonamu UI에서 사용됩니다.
   *
   * @returns Shadow DB 테스트 결과
   */
  async runShadowTest(): Promise<
    {
      connKey: string;
      batchNo: number;
      applied: string[];
    }[]
  > {
    // ShadowDB 생성 후 테스트 진행
    const tdb = knex(Sonamu.dbConfig.test);
    const tdbConn = Sonamu.dbConfig.test.connection as Knex.MySql2ConnectionConfig;
    const shadowDatabase = `${tdbConn.database}__migration_shadow`;
    const tmpSqlPath = `/tmp/${shadowDatabase}.sql`;
    Naite.t("runShadowTest:tmpSqlPath", tmpSqlPath);

    // 테스트DB 덤프 후 Database명 치환
    !isTest() && console.log(chalk.magenta(`${tdbConn.database}의 데이터 ${tmpSqlPath}로 덤프`));
    execSync(
      `mysqldump -h${tdbConn.host} -P${tdbConn.port ?? 3306} -u${tdbConn.user} -p'${tdbConn.password}' ${tdbConn.database} --single-transaction --no-create-db --triggers > ${tmpSqlPath};`,
      { stdio: "ignore" },
    );
    execSync(`sed -i'' -e 's/\`${tdbConn.database}\`/\`${shadowDatabase}\`/g' ${tmpSqlPath};`);

    // 기존 ShadowDB 리셋
    !isTest() && console.log(chalk.magenta(`${shadowDatabase} 리셋`));
    await tdb.raw(`DROP DATABASE IF EXISTS \`${shadowDatabase}\`;`);
    await tdb.raw(`CREATE DATABASE \`${shadowDatabase}\`;`);

    // ShadowDB 테이블 + 데이터 생성
    !isTest() && console.log(chalk.magenta(`${shadowDatabase} 데이터베이스 생성`));
    execSync(
      `mysql -h${tdbConn.host} -P${tdbConn.port ?? 3306} -u${tdbConn.user} -p'${tdbConn.password}' ${shadowDatabase} < ${tmpSqlPath};`,
      { stdio: "ignore" },
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
      !isTest() &&
        console.log(chalk.green("Shadow DB 테스트에 성공했습니다!"), {
          batchNo,
          applied,
        });

      // 생성한 Shadow DB 삭제
      await tdb.raw(`DROP DATABASE IF EXISTS \`${shadowDatabase}\`;`);
      !isTest() && console.log(chalk.magenta(`${shadowDatabase} 삭제`));

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

  /**
   * 마이그레이션 대상 커넥션을 종료합니다.
   *
   * CLI에서 사용됩니다.
   *
   * @returns {Promise<void>} 종료 결과
   */
  async destroy(): Promise<void> {
    this.targets.compare.destroy();
    this.targets.shadow.destroy();
  }
}
