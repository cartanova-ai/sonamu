import _, {
  difference,
  differenceBy,
  differenceWith,
  groupBy,
  intersectionBy,
  pick,
  sortBy,
  uniq,
  uniqBy,
} from "lodash";
import knex, { Knex } from "knex";
import prettier from "prettier";
import chalk from "chalk";
import { DateTime } from "luxon";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import equal from "fast-deep-equal";
import { capitalize, pluralize, singularize, underscore } from "inflection";
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
  isTextProp,
  isEnumProp,
  isIntegerProp,
} from "../types/types";
import { propIf } from "../utils/lodash-able";
import { SMDManager } from "./smd-manager";
import { SMD } from "./smd";
import { Sonamu } from "../api";

type MigratorMode = "dev" | "deploy";
export type MigratorOptions = {
  readonly mode: MigratorMode;
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
        (dbConfig.fixture_remote.connection as Knex.MySql2ConnectionConfig).host
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
      const productionDB = knex(Sonamu.dbConfig.production_master);
      const testDB = knex(Sonamu.dbConfig.test);

      this.targets = {
        pending: productionDB,
        shadow: testDB,
        apply: [productionDB],
      };
    } else {
      throw new Error(`잘못된 모드 ${this.mode} 입력`);
    }
  }

  async clearPendingList(): Promise<void> {
    const [, pendingList] = (await this.targets.pending.migrate.list()) as [
      unknown,
      {
        file: string;
        directory: string;
      }[]
    ];
    const migrationsDir = `${Sonamu.apiRootPath}/src/migrations`;
    const delList = pendingList.map((df) => {
      return path.join(migrationsDir, df.file).replace(".js", ".ts");
    });
    for (let p of delList) {
      if (existsSync(p)) {
        unlinkSync(p);
      }
    }
    await this.cleanUpDist(true);
  }

  async check(): Promise<void> {
    const codes = await this.compareMigrations();
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
      const result = await this.runShadowTest();
      console.timeEnd(chalk.blue("Migrator - runShadowTest"));
      if (result === true) {
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
      return;
    }

    // MD-DB간 비교하여 코드 생성 리턴
    const codes = await this.compareMigrations();
    if (codes.length === 0) {
      console.log(chalk.green("\n현재 모두 싱크된 상태입니다."));
      return;
    }

    // 현재 생성된 코드 표기
    console.table(codes, ["type", "title"]);

    /* 디버깅용 코드
    console.log(codes[0].formatted);
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
        writeFileSync(filePath, code.formatted!);
        console.log(chalk.green(`MIGRTAION CRETATED ${filePath}`));
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
        if (existsSync(migrationPath) === false) {
          mkdirSync(migrationPath, {
            recursive: true,
          });
        }
        const files = readdirSync(migrationPath).filter(
          (filename) => filename.startsWith(".") === false
        );
        r[which] = files;
        return r;
      },
      {
        src: [] as string[],
        dist: [] as string[],
      }
    );

    const diffOnSrc = differenceBy(
      files.src,
      files.dist,
      (filename) => filename.split(".")[0]
    );
    if (diffOnSrc.length > 0) {
      throw new Error(
        "컴파일 되지 않은 파일이 있습니다.\n" + diffOnSrc.join("\n")
      );
    }

    const diffOnDist = differenceBy(
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
        unlinkSync(filePath);
      });
      console.log(chalk.green(`${filesToRm.length}건 삭제되었습니다!`));
    }
  }

  async runShadowTest(): Promise<boolean> {
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
    await tdb.raw(`DROP DATABASE IF EXISTS ${shadowDatabase};`);
    await tdb.raw(`CREATE DATABASE ${shadowDatabase};`);

    // ShadowDB 테이블 + 데이터 생성
    console.log(chalk.magenta(`${shadowDatabase} 데이터베이스 생성`));
    execSync(
      `mysql -h${tdbConn.host} -u${tdbConn.user} -p'${tdbConn.password}' ${shadowDatabase} < ${tmpSqlPath};`
    );

    // tdb 연결 종료
    await tdb.destroy();

    // shadow db 테스트 진행
    const sdb = knex({
      ...Sonamu.dbConfig.test,
      connection: {
        ...tdbConn,
        database: shadowDatabase,
      },
    });

    try {
      const [batchNo, log] = await sdb.migrate.latest();
      console.log(chalk.green("Shadow DB 테스트에 성공했습니다!"), {
        batchNo,
        log,
      });

      // 생성한 Shadow DB 삭제
      console.log(chalk.magenta(`${shadowDatabase} 삭제`));
      await sdb.raw(`DROP DATABASE IF EXISTS ${shadowDatabase};`);

      return true;
    } catch (e) {
      console.error(chalk.red("Shadow DB 테스트 진행 중 에러"), e);
      return false;
    } finally {
      await sdb.destroy();
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

  async compareMigrations(): Promise<GenMigrationCode[]> {
    // MD 순회하여 싱크
    const smdIds = SMDManager.getAllIds();

    // 조인테이블 포함하여 MD에서 MigrationSet 추출
    const smdSetsWithJoinTable = smdIds
      .filter((smdId) => {
        const smd = SMDManager.get(smdId);
        return smd.props.length > 0;
      })
      .map((smdId) => {
        const smd = SMDManager.get(smdId);
        return this.getMigrationSetFromMD(smd);
      });

    // 조인테이블만 추출
    const joinTables = uniqBy(
      smdSetsWithJoinTable.map((smdSet) => smdSet.joinTables).flat(),
      (joinTable) => {
        return joinTable.table;
      }
    );

    // 조인테이블 포함하여 MigrationSet 배열
    const smdSets: MigrationSet[] = [...smdSetsWithJoinTable, ...joinTables];

    let codes: GenMigrationCode[] = (
      await Promise.all(
        smdSets.map(async (smdSet) => {
          const dbSet = await this.getMigrationSetFromDB(smdSet.table);
          if (dbSet === null) {
            // 기존 테이블 없음, 새로 테이블 생성
            return [
              this.generateCreateCode_ColumnAndIndexes(
                smdSet.table,
                smdSet.columns,
                smdSet.indexes
              ),
              ...this.generateCreateCode_Foreign(smdSet.table, smdSet.foreigns),
            ];
          }

          // 기존 테이블 존재하는 케이스
          const alterCodes: (GenMigrationCode | GenMigrationCode[] | null)[] = (
            ["columnsAndIndexes", "foreigns"] as const
          ).map((key) => {
            // 배열 원소의 순서가 달라서 불일치가 발생하는걸 방지하기 위해 각 항목별로 정렬 처리 후 비교
            if (key === "columnsAndIndexes") {
              const smdColumns = sortBy(
                smdSet.columns,
                (a: any) => (a as MigrationColumn).name
              );
              const dbColumns = sortBy(
                dbSet.columns,
                (a: any) => (a as MigrationColumn).name
              );

              /* 디버깅용 코드, 특정 컬럼에서 불일치 발생할 때 확인
              const smdCreatedAt = smdSet.columns.find(
                (col) => col.name === "created_at"
              );
              const dbCreatedAt = dbSet.columns.find(
                (col) => col.name === "created_at"
              );
              console.debug({ smdCreatedAt, dbCreatedAt });
              */

              const smdIndexes = sortBy(smdSet.indexes, (a) =>
                (a as MigrationIndex).columns.join("-")
              );
              const dbIndexes = sortBy(dbSet.indexes, (a) =>
                (a as MigrationIndex).columns.join("-")
              );

              const isEqualColumns = equal(smdColumns, dbColumns);
              const isEqualIndexes = equal(smdIndexes, dbIndexes);
              if (isEqualColumns && isEqualIndexes) {
                return null;
              } else {
                // this.showMigrationSet("MD", smdSet);
                // this.showMigrationSet("DB", dbSet);
                return this.generateAlterCode_ColumnAndIndexes(
                  smdSet.table,
                  smdColumns,
                  smdIndexes,
                  dbColumns,
                  dbIndexes
                );
              }
            } else {
              const smdForeigns = sortBy(smdSet.foreigns, (a: any) =>
                (a as MigrationForeign).columns.join("-")
              );
              const dbForeigns = sortBy(dbSet.foreigns, (a: any) =>
                (a as MigrationForeign).columns.join("-")
              );

              if (equal(smdForeigns, dbForeigns) === false) {
                // TODO FK alter
                console.log(chalk.red(`FK 다름! ${smdSet.table}`));
                // console.dir({ smdForeigns, dbForeigns }, { depth: null });
                return this.generateAlterCode_Foreigns(
                  smdSet.table,
                  smdForeigns,
                  dbForeigns
                );
              }
            }
            return null;
          });
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
  async getMigrationSetFromDB(table: string): Promise<MigrationSet | null> {
    let dbColumns: any[], dbIndexes: any[], dbForeigns: any[];
    try {
      [dbColumns, dbIndexes, dbForeigns] = await this.readTable(table);
    } catch (e) {
      return null;
    }

    const columns: MigrationColumn[] = dbColumns.map((dbColumn) => {
      const dbColType = this.resolveDBColType(dbColumn.Type, dbColumn.Field);
      return {
        name: dbColumn.Field,
        nullable: dbColumn.Null !== "NO",
        ...dbColType,
        ...propIf(dbColumn.Default !== null, {
          defaultTo:
            dbColType.type === "float"
              ? parseFloat(dbColumn.Default).toString()
              : dbColumn.Default,
        }),
      };
    });

    const dbIndexesGroup = groupBy(
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
        onUpdate: dbForeign.onUpdate,
        onDelete: dbForeign.onDelete,
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
  ): Pick<MigrationColumn, "type" | "unsigned" | "length"> {
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
        ...propIf(length !== undefined, {}),
      };
    }

    switch (rawType) {
      case "int":
        return {
          type: "integer",
          unsigned: unsigned === "unsigned",
        };
      case "float(8,2)":
        return {
          type: "float",
          ...propIf(unsigned === "unsigned", {
            unsigned: true,
          }),
        };
      case "decimal(8,2)":
        return {
          type: "decimal",
          ...propIf(unsigned === "unsigned", {
            unsigned: true,
          }),
        };
      case "varchar":
        // case "char":
        return {
          type: "string",
          ...propIf(length !== undefined, {
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
          type: "dateTime",
        };
      case "tinyint":
        return {
          type: "boolean",
        };
      default:
        throw new Error(`resolve 불가능한 DB컬럼 타입 ${colType} ${rawType}`);
    }
  }

  /*
    기존 테이블 읽어서 cols, indexes 반환
  */
  async readTable(tableName: string): Promise<[any, any, any]> {
    // 테이블 정보
    try {
      const [cols] = await this.targets.compare!.raw(
        `SHOW FIELDS FROM ${tableName}`
      );
      const [indexes] = await this.targets.compare!.raw(
        `SHOW INDEX FROM ${tableName}`
      );
      const [[row]] = await this.targets.compare!.raw(
        `SHOW CREATE TABLE ${tableName}`
      );
      const ddl = row["Create Table"];
      const matched = ddl.match(/CONSTRAINT .+/g);
      const foreignKeys = (matched ?? []).map((line: string) => {
        const matched = line.match(
          /CONSTRAINT `(.+)` FOREIGN KEY \(`(.+)`\) REFERENCES `(.+)` \(`(.+)`\) ON DELETE ([A-Z ]+) ON UPDATE ([A-Z ]+)/
        );
        if (!matched) {
          throw new Error(`인식할 수 없는 FOREIGN KEY CONSTRAINT ${line}`);
        }
        const [
          ,
          keyName,
          from,
          referencesTable,
          referencesField,
          onDelete,
          onUpdate,
        ] = matched;
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
    MD 내용 읽어서 MigrationSetAndJoinTable 추출
  */
  getMigrationSetFromMD(smd: SMD): MigrationSetAndJoinTable {
    const migrationSet: MigrationSetAndJoinTable = smd.props.reduce(
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
            ...(isIntegerProp(prop)
              ? { unsigned: prop.unsigned === true }
              : {}),
            ...(isStringProp(prop) || isEnumProp(prop)
              ? { length: prop.length }
              : {}),
            nullable: prop.nullable === true,
            // DB에선 무조건 string으로 리턴되므로 반드시 string 처리
            ...propIf(prop.dbDefault !== undefined, {
              defaultTo: "" + prop.dbDefault,
            }),
          };

          r.columns.push(column);
        }

        if (isManyToManyRelationProp(prop)) {
          // ManyToMany 케이스
          const relMd = SMDManager.get(prop.with);
          const [table1, table2] = prop.joinTable.split("__");
          const join = {
            from: `${smd.table}.id`,
            through: {
              from: `${prop.joinTable}.${singularize(table1)}_id`,
              to: `${prop.joinTable}.${singularize(table2)}_id`,
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
              return {
                columns: [field.split(".")[1]],
                to: through.to.includes(field) ? join.to : join.from,
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
            to: `${underscore(pluralize(prop.with)).toLowerCase()}.id`,
            onUpdate: prop.onUpdate,
            onDelete: prop.onDelete,
          });
        }

        return r;
      },
      {
        table: smd.table,
        columns: [] as MigrationColumn[],
        indexes: [] as MigrationIndex[],
        foreigns: [] as MigrationForeign[],
        joinTables: [] as MigrationJoinTable[],
      }
    );

    // indexes
    migrationSet.indexes = smd.indexes;

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
      if (column.unsigned) {
        chains.push("unsigned()");
      }

      // nullable
      chains.push(column.nullable ? "nullable()" : "notNullable()");

      // defaultTo
      if (column.defaultTo !== undefined) {
        chains.push(`defaultTo(knex.raw('${column.defaultTo}'))`);
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
    const lines = uniq(
      indexes.reduce((r, index) => {
        r.push(
          `table.${index.type}([${index.columns
            .map((col) => `'${col}'`)
            .join(",")}])`
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
  generateCreateCode_ColumnAndIndexes(
    table: string,
    columns: MigrationColumn[],
    indexes: MigrationIndex[]
  ): GenMigrationCode {
    // 컬럼, 인덱스 처리
    const lines: string[] = [
      'import { Knex } from "knex";',
      "",
      "export async function up(knex: Knex): Promise<void> {",
      `return knex.schema.createTable("${table}", (table) => {`,
      "// columns",
      ...this.genColumnDefinitions(columns),
      "",
      "// indexes",
      ...this.genIndexDefinitions(indexes),
      "});",
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
      formatted: prettier.format(lines.join("\n"), {
        parser: "typescript",
      }),
    };
  }
  /*
  테이블 생성하는 케이스 - FK 생성
*/
  generateCreateCode_Foreign(
    table: string,
    foreigns: MigrationForeign[]
  ): GenMigrationCode[] {
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
        formatted: prettier.format(lines.join("\n"), {
          parser: "typescript",
        }),
      },
    ];
  }

  /*
    마이그레이션 컬럼 배열 비교용 코드
  */
  showMigrationSet(which: string, migrationSet: MigrationSet): void {
    const { columns, indexes, foreigns } = migrationSet;
    const styledChalk =
      which === "MD" ? chalk.bgGreen.black : chalk.bgBlue.black;
    console.log(
      styledChalk(
        `${which} ${migrationSet.table} Columns\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`
      )
    );
    console.table(
      columns.map((column) => {
        return {
          ...pick(column, [
            "name",
            "type",
            "nullable",
            "unsigned",
            "length",
            "defaultTo",
          ]),
        };
      }),
      ["name", "type", "nullable", "unsigned", "length", "defaultTo"]
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
            ...pick(index, ["type", "columns", "name"]),
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
            ...pick(foreign, ["columns", "to", "onUpdate", "onDelete"]),
          };
        })
      );
    }
  }

  generateAlterCode_ColumnAndIndexes(
    table: string,
    smdColumns: MigrationColumn[],
    smdIndexes: MigrationIndex[],
    dbColumns: MigrationColumn[],
    dbIndexes: MigrationIndex[]
  ): GenMigrationCode[] {
    // console.log(chalk.cyan("MigrationColumns from DB"));
    // showMigrationSet(dbColumns);
    // console.log(chalk.cyan("MigrationColumns from MD"));
    // showMigrationSet(smdColumns);

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
    const alterColumnsTo = this.getAlterColumnsTo(smdColumns, dbColumns);

    // 추출된 컬럼들을 기준으로 각각 라인 생성
    const alterColumnLinesTo = this.getAlterColumnLinesTo(
      alterColumnsTo,
      smdColumns
    );

    // 인덱스의 add, drop 여부 확인
    const alterIndexesTo = this.getAlterIndexesTo(smdIndexes, dbIndexes);

    // 추출된 인덱스들을 기준으로 각각 라인 생성
    const alterIndexLinesTo = this.getAlterIndexLinesTo(
      alterIndexesTo,
      alterColumnsTo
    );

    const lines: string[] = [
      'import { Knex } from "knex";',
      "",
      "export async function up(knex: Knex): Promise<void> {",
      `return knex.schema.alterTable("${table}", (table) => {`,
      ...(alterColumnsTo.add.length > 0 ? alterColumnLinesTo.add.up : []),
      ...(alterColumnsTo.drop.length > 0 ? alterColumnLinesTo.drop.up : []),
      ...(alterColumnsTo.alter.length > 0 ? alterColumnLinesTo.alter.up : []),
      ...(alterIndexesTo.add.length > 0 ? alterIndexLinesTo.add.up : []),
      ...(alterIndexesTo.drop.length > 0 ? alterIndexLinesTo.drop.up : []),
      "})",
      "}",
      "",
      "export async function down(knex: Knex): Promise<void> {",
      `return knex.schema.alterTable("${table}", (table) => {`,
      ...(alterColumnsTo.add.length > 0 ? alterColumnLinesTo.add.down : []),
      ...(alterColumnsTo.drop.length > 0 ? alterColumnLinesTo.drop.down : []),
      ...(alterColumnsTo.alter.length > 0 ? alterColumnLinesTo.alter.down : []),
      ...(alterIndexLinesTo.add.down.length > 1
        ? alterIndexLinesTo.add.down
        : []),
      ...(alterIndexLinesTo.drop.down.length > 1
        ? alterIndexLinesTo.drop.down
        : []),
      "})",
      "}",
    ];

    const formatted = prettier.format(lines.join("\n"), {
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
    smdColumns: MigrationColumn[],
    dbColumns: MigrationColumn[]
  ) {
    const columnsTo = {
      add: [] as MigrationColumn[],
      drop: [] as MigrationColumn[],
      alter: [] as MigrationColumn[],
    };

    // 컬럼명 기준 비교
    const extraColumns = {
      db: differenceBy(dbColumns, smdColumns, (col) => col.name),
      smd: differenceBy(smdColumns, dbColumns, (col) => col.name),
    };
    if (extraColumns.smd.length > 0) {
      columnsTo.add = columnsTo.add.concat(extraColumns.smd);
    }
    if (extraColumns.db.length > 0) {
      columnsTo.drop = columnsTo.drop.concat(extraColumns.db);
    }

    // 동일 컬럼명의 세부 필드 비교
    const sameDbColumns = intersectionBy(
      dbColumns,
      smdColumns,
      (col) => col.name
    );
    const sameMdColumns = intersectionBy(
      smdColumns,
      dbColumns,
      (col) => col.name
    );
    columnsTo.alter = differenceWith(sameDbColumns, sameMdColumns, (a, b) =>
      equal(a, b)
    );

    return columnsTo;
  }

  getAlterColumnLinesTo(
    columnsTo: ReturnType<Migrator["getAlterColumnsTo"]>,
    smdColumns: MigrationColumn[]
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
    linesTo.drop = {
      up: [
        "// drop",
        `table.dropColumns(${columnsTo.drop
          .map((col) => `'${col.name}'`)
          .join(", ")})`,
      ],
      down: [
        "// rollback - drop",
        ...this.genColumnDefinitions(columnsTo.drop),
      ],
    };
    linesTo.alter = columnsTo.alter.reduce(
      (r, dbColumn) => {
        const smdColumn = smdColumns.find((col) => col.name == dbColumn.name);
        if (smdColumn === undefined) {
          return r;
        }

        // 컬럼 변경사항
        const columnDiffUp = difference(
          this.genColumnDefinitions([smdColumn]),
          this.genColumnDefinitions([dbColumn])
        );
        const columnDiffDown = difference(
          this.genColumnDefinitions([dbColumn]),
          this.genColumnDefinitions([smdColumn])
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

  getAlterIndexesTo(smdIndexes: MigrationIndex[], dbIndexes: MigrationIndex[]) {
    // 인덱스 비교
    let indexesTo = {
      add: [] as MigrationIndex[],
      drop: [] as MigrationIndex[],
    };
    const extraIndexes = {
      db: differenceBy(dbIndexes, smdIndexes, (col) =>
        [col.type, col.columns.join("-")].join("//")
      ),
      smd: differenceBy(smdIndexes, dbIndexes, (col) =>
        [col.type, col.columns.join("-")].join("//")
      ),
    };
    if (extraIndexes.smd.length > 0) {
      indexesTo.add = indexesTo.add.concat(extraIndexes.smd);
    }
    if (extraIndexes.db.length > 0) {
      indexesTo.drop = indexesTo.drop.concat(extraIndexes.db);
    }

    return indexesTo;
  }

  getAlterIndexLinesTo(
    indexesTo: ReturnType<Migrator["getAlterIndexesTo"]>,
    columnsTo: ReturnType<Migrator["getAlterColumnsTo"]>
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
    };

    // 인덱스가 추가되는 경우, 컬럼과 같이 추가된 케이스에는 drop에서 제외해야함!
    linesTo.add = {
      up: ["// add indexes", ...this.genIndexDefinitions(indexesTo.add)],
      down: [
        "// rollback - add indexes",
        ...indexesTo.add
          .filter(
            (index) =>
              index.columns.every((colName) =>
                columnsTo.add.map((col) => col.name).includes(colName)
              ) === false
          )
          .map(
            (index) =>
              `table.drop${capitalize(index.type)}([${index.columns
                .map((columnName) => `'${columnName}'`)
                .join(",")}])`
          ),
      ],
    };
    // 인덱스가 삭제되는 경우, 컬럼과 같이 삭제된 케이스에는 drop에서 제외해야함!
    linesTo.drop = {
      up: [
        ...indexesTo.drop
          .filter(
            (index) =>
              index.columns.every((colName) =>
                columnsTo.drop.map((col) => col.name).includes(colName)
              ) === false
          )
          .map(
            (index) =>
              `table.drop${capitalize(index.type)}([${index.columns
                .map((columnName) => `'${columnName}'`)
                .join(",")}])`
          ),
      ],
      down: [
        "// rollback - drop indexes",
        ...this.genIndexDefinitions(indexesTo.drop),
      ],
    };

    return linesTo;
  }

  generateAlterCode_Foreigns(
    table: string,
    smdForeigns: MigrationForeign[],
    dbForeigns: MigrationForeign[]
  ): GenMigrationCode[] {
    // console.log({ smdForeigns, dbForeigns });

    const getKey = (mf: MigrationForeign): string => {
      return [mf.columns.join("-"), mf.to].join("///");
    };
    const fkTo = smdForeigns.reduce(
      (result, smdF) => {
        const matchingDbF = dbForeigns.find(
          (dbF) => getKey(smdF) === getKey(dbF)
        );
        if (!matchingDbF) {
          result.add.push(smdF);
          return result;
        }

        if (equal(smdF, matchingDbF) === false) {
          result.alterSrc.push(matchingDbF);
          result.alterDst.push(smdF);
          return result;
        }
        return result;
      },
      {
        add: [] as MigrationForeign[],
        alterSrc: [] as MigrationForeign[],
        alterDst: [] as MigrationForeign[],
      }
    );

    const linesTo = {
      add: this.genForeignDefinitions(table, fkTo.add),
      alterSrc: this.genForeignDefinitions(table, fkTo.alterSrc),
      alterDst: this.genForeignDefinitions(table, fkTo.alterDst),
    };

    const lines: string[] = [
      'import { Knex } from "knex";',
      "",
      "export async function up(knex: Knex): Promise<void> {",
      `return knex.schema.alterTable("${table}", (table) => {`,
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
      "})",
      "}",
    ];

    const formatted = prettier.format(lines.join("\n"), {
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
