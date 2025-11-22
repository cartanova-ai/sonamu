import assert from "assert";
import chalk from "chalk";
import { execSync } from "child_process";
import { mkdir, readdir, unlink, writeFile } from "fs/promises";
import knex, { type Knex } from "knex";
import groupBy from "lodash-es/groupBy.js";
import sum from "lodash-es/sum.js";
import uniqBy from "lodash-es/uniqBy.js";
import path from "path";
import prompts from "prompts";
import { Sonamu } from "../api";
import type { SonamuDBConfig } from "../database/db";
import { EntityManager } from "../entity/entity-manager";
import { ServiceUnavailableException } from "../exceptions/so-exceptions";
import type { GenMigrationCode, MigrationSet } from "../types/types";
import { exists } from "../utils/fs-utils";
import { generateAlterCode, generateCreateCode } from "./code-generation";
import { getMigrationSetFromDB, getMigrationSetFromEntity } from "./migration-set";
import type { ConnString, MigrationCode, MigrationStatus } from "./types";

type MigratorMode = "dev" | "deploy";
export type MigratorOptions = {
  readonly mode: MigratorMode;
};

export class Migrator {
  targets: {
    compare?: Knex;
    pending: Knex;
    shadow: Knex;
    apply: Knex[];
  };

  constructor(private readonly options: MigratorOptions) {
    const { dbConfig } = Sonamu;

    if (this.options.mode === "dev") {
      const devDB = knex(dbConfig.development_master);
      const testDB = knex(dbConfig.test);
      const fixtureLocalDB = knex(dbConfig.fixture_local);

      const applyDBs = [devDB, testDB, fixtureLocalDB];
      if (
        (dbConfig.fixture_local.connection as Knex.MySql2ConnectionConfig).host !==
          (dbConfig.fixture_remote.connection as Knex.MySql2ConnectionConfig).host ||
        (dbConfig.fixture_local.connection as Knex.MySql2ConnectionConfig).database !==
          (dbConfig.fixture_remote.connection as Knex.MySql2ConnectionConfig).database
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
    } else if (this.options.mode === "deploy") {
      const productionDB = knex(dbConfig.production_master);
      const testDB = knex(dbConfig.test);

      this.targets = {
        pending: productionDB,
        shadow: testDB,
        apply: [productionDB],
      };
    } else {
      throw new Error(`잘못된 모드 ${this.options.mode} 입력`);
    }
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

    return {
      conns: statuses,
      codes,
      preparedCodes,
    };
    /*
    DB 마이그레이션 상태 확인
    1. 전체 DB설정에 대해서 현재 마이그레이션 상태 확인
    - connKey: string
    - status: number
    - currentVersion: string
    - list: { file: string; directory: string }[]
    
    */
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
    // get uniq knex configs
    const configs = uniqBy(
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
                applied,
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
                applied,
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
          console.log(chalk.red(`DELETE: ${delFile}`));
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

  /**
   * pending 마이그레이션 목록을 삭제합니다.
   *
   * CLI에서 사용됩니다.
   */
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
      return path.join(migrationsDir, df.file);
    });
    for (const p of delList) {
      if (await exists(p)) {
        await unlink(p);
      }
    }
  }

  /**
   * 마이그레이션 코드 파일을 확인합니다.
   *
   * CLI에서 사용됩니다.
   */
  async check(): Promise<void> {
    assert(this.targets.compare, "compare is not defined");
    const codes = await this.compareMigrations(this.targets.compare);
    if (codes.length === 0) {
      console.log(chalk.green("\n현재 모두 싱크된 상태입니다."));
      return;
    }

    // 현재 생성된 코드 표기
    console.table(codes, ["type", "title"]);
    console.log(codes[0]);
  }

  /**
   * 마이그레이션을 수행합니다.
   *
   * runAction이 인자로 들어온 타겟들에 대해 주어진 동작(apply/rollback)을 수행한다면,
   * 이 함수는 생성자로 들어온 connection(knex)들에 대해 마이그레이션을 수행합니다.
   *
   * CLI에서 사용됩니다.
   */
  async run(): Promise<void> {
    // pending 마이그레이션 확인
    const [, pendingList] = await this.targets.pending.migrate.list();
    if (pendingList.length > 0) {
      console.log(
        chalk.red("pending 된 마이그레이션이 존재합니다."),
        pendingList.map((pending: { file: string }) => pending.file),
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
            `APPLIED ${applyDb.client.connectionSettings.host} ${applyDb.client.database()}`,
          );
          console.time(label);
          const [,] = await applyDb.migrate.latest();
          console.timeEnd(label);
        }),
      );
    }

    // Entity-DB간 비교하여 코드 생성 리턴
    assert(this.targets.compare, "compare is not defined");
    const codes = await this.compareMigrations(this.targets.compare);
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

    for (const [index, code] of codes.entries()) {
      if (code.formatted) {
        const dateTag = this.genDateTag(index);
        const filePath = `${migrationsDir}/${dateTag}_${code.title}.ts`;
        await writeFile(filePath, code.formatted);
        console.log(chalk.green(`MIGRTAION CREATED ${filePath}`));
      }
    }
  }

  /**
   * 타겟으로 지정된 DB를 롤백합니다.
   *
   * runAction이 인자로 들어온 타겟들에 대해 주어진 동작(apply/rollback)을 수행한다면,
   * 이 함수는 생성자로 들어온 connection(knex)들에 대해 롤백을 수행합니다.
   *
   * CLI에서 사용됩니다.
   */
  async rollback() {
    console.time(chalk.red("rollback:"));
    const rollbackAllResult = await Promise.all(
      this.targets.apply.map(async (db) => {
        await db.migrate.forceFreeMigrationsLock();
        return db.migrate.rollback(undefined, false);
      }),
    );
    console.dir({ rollbackAllResult }, { depth: null });
    console.timeEnd(chalk.red("rollback:"));
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

    // 테스트DB 덤프 후 Database명 치환
    console.log(chalk.magenta(`${tdbConn.database}의 데이터 ${tmpSqlPath}로 덤프`));
    execSync(
      `mysqldump -h${tdbConn.host} -P${tdbConn.port ?? 3306} -u${tdbConn.user} -p'${tdbConn.password}' ${tdbConn.database} --single-transaction --no-create-db --triggers > ${tmpSqlPath};`,
    );
    execSync(`sed -i'' -e 's/\`${tdbConn.database}\`/\`${shadowDatabase}\`/g' ${tmpSqlPath};`);

    // 기존 ShadowDB 리셋
    console.log(chalk.magenta(`${shadowDatabase} 리셋`));
    await tdb.raw(`DROP DATABASE IF EXISTS \`${shadowDatabase}\`;`);
    await tdb.raw(`CREATE DATABASE \`${shadowDatabase}\`;`);

    // ShadowDB 테이블 + 데이터 생성
    console.log(chalk.magenta(`${shadowDatabase} 데이터베이스 생성`));
    execSync(
      `mysql -h${tdbConn.host} -P${tdbConn.port ?? 3306} -u${tdbConn.user} -p'${tdbConn.password}' ${shadowDatabase} < ${tmpSqlPath};`,
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

  /**
   * 모든 DB를 롤백하고 전체 마이그레이션 파일을 삭제합니다.
   *
   * CLI에서 사용됩니다.
   *
   * @returns
   */
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
      }),
    );
    console.log({ rollbackAllResult });
    console.timeEnd(chalk.red("rollback-all:"));

    const migrationsDir = `${Sonamu.apiRootPath}/src/migrations`;
    console.time(chalk.red("delete migration files"));
    execSync(`rm -f ${migrationsDir}/*`);
    execSync(`rm -f ${migrationsDir.replace("/src/", "/dist/")}/*`);
    console.timeEnd(chalk.red("delete migration files"));
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
    const joinTables = Object.values(groupBy(joinTablesWithDup, (jt) => jt.table)).map((tables) => {
      if (tables.length === 1) {
        return tables[0];
      }
      return {
        ...tables[0],
        indexes: uniqBy(
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
   * 마이그레이션 대상 커넥션을 종료합니다.
   *
   * CLI에서 사용됩니다.
   *
   * @returns {Promise<void>} 종료 결과
   */
  async destroy(): Promise<void> {
    await Promise.all(
      this.targets.apply.map((db) => {
        return db.destroy();
      }),
    );
  }
}
