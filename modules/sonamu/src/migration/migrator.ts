import assert from "assert";
import { mkdir, readdir, writeFile } from "fs/promises";
import path from "path";

import chalk from "chalk";
import { type Knex } from "knex";
import { group, unique } from "radashi";

import { Sonamu } from "../api/sonamu";
import { DB } from "../database/db";
import { type SonamuDBConfig } from "../database/db";
import { createKnexInstance } from "../database/knex";
import { SD } from "../dict/sd";
import { EntityManager } from "../entity/entity-manager";
import { getSonamuEnvironment } from "../env";
import { ServiceUnavailableException } from "../exceptions/so-exceptions";
import { Naite } from "../naite/naite";
import { type GenMigrationCode, type MigrationSet } from "../types/types";
import { isLocal, isTest } from "../utils/controller";
import { exists } from "../utils/fs-utils";
import { generateAlterCode, generateCreateCode } from "./code-generation";
import { getMigrationSetFromEntity } from "./migration-set";
import { PostgreSQLSchemaReader } from "./postgresql-schema-reader";
import { SlackConfirm } from "./slack-confirm";
import {
  type ConnString,
  type MigrationAction,
  type MigrationCode,
  type MigrationConnectionMeta,
  type MigrationConnectionStatus,
  type MigrationProgressEvent,
  type MigrationRunOptions,
  type MigrationStatus,
  type MigrationTarget,
} from "./types";

export type MigrationResult = {
  connKey: string;
  batchNo: number;
  applied: string[];
}[];

export class MigrationTargetExecutionError extends Error {
  constructor(
    public readonly connKey: MigrationTarget | "shadow",
    caught: unknown,
  ) {
    super(caught instanceof Error ? caught.message : String(caught));
    this.name = "MigrationTargetExecutionError";
  }
}

// 마이그레이션 상태 조회 시 DB 연결 확인 타임아웃(ms).
// createKnexInstance의 커넥션 획득 타임아웃(30초)에 status/list/currentVersion이
// 각각 걸리면 CLI/UI가 최대 수십 초 hang한다. 정상 응답은 수백 ms이므로 5초면 충분하다.
const MIGRATION_CONN_TIMEOUT_MS = 5000;
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/**
 * 주어진 Promise가 ms 안에 완료되지 않으면 onTimeout 에러로 reject한다.
 * 원본 Promise 자체는 계속 진행되므로, 호출측에서 커넥션 정리(destroy)를 책임진다.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class Migrator {
  private isMissingMigrationTableError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false;
    }

    const maybePostgresError = error as { code?: unknown; message?: unknown };
    return (
      maybePostgresError.code === "42P01" &&
      typeof maybePostgresError.message === "string" &&
      maybePostgresError.message.includes("knex_migrations")
    );
  }

  private getMigrationTargetKeys(): MigrationTarget[] {
    const connKeys = Object.keys(Sonamu.dbConfig).filter(
      (key) => !key.endsWith("_readonly"),
    ) as (keyof SonamuDBConfig)[];

    if (isLocal()) {
      return connKeys;
    }

    const environment = getSonamuEnvironment();
    return connKeys.filter((key) => key === environment);
  }

  private async runMigrationsSequentially(
    conns: { connKey: keyof SonamuDBConfig; knex: Knex }[],
    action: "apply" | "rollback",
    options?: MigrationRunOptions,
  ): Promise<MigrationResult> {
    const results: MigrationResult = [];

    for (const { connKey, knex } of conns) {
      const progress = this.createProgressHooks(action, connKey, options);
      let migrationResult: [number, string[]];
      try {
        migrationResult =
          action === "apply"
            ? await knex.migrate.latest(progress)
            : await knex.migrate.rollback(progress);
      } catch (caught) {
        // lifecycle hook 이전의 연결·lock·목록 조회 실패도 실제 대상 DB에 귀속합니다.
        throw new MigrationTargetExecutionError(connKey, caught);
      }
      const [batchNo, applied] = migrationResult;

      results.push({
        connKey,
        batchNo,
        applied,
      });
      this.emitProgress(options, {
        type: "target-complete",
        action,
        connKey,
        batchNo,
        files: applied,
      });
    }

    return results;
  }

  private migrationName(migration: unknown): string {
    if (typeof migration === "string") {
      return path.basename(migration);
    }
    if (typeof migration === "object" && migration !== null) {
      const candidate = migration as { file?: unknown; name?: unknown };
      if (typeof candidate.file === "string") {
        return path.basename(candidate.file);
      }
      if (typeof candidate.name === "string") {
        return path.basename(candidate.name);
      }
    }
    return String(migration);
  }

  private emitProgress(options: MigrationRunOptions | undefined, event: MigrationProgressEvent) {
    try {
      options?.onProgress?.(event);
    } catch (error) {
      // 진행률 소비자의 실패가 이미 시작한 DB 작업과 정리를 방해하면 안 됩니다.
      console.warn("Migration progress observer failed:", error);
    }
  }

  private createProgressHooks(
    action: MigrationAction,
    connKey: MigrationTarget | "shadow",
    options?: MigrationRunOptions,
  ): Knex.MigratorConfigWithLifecycleHooks {
    let files: string[] = [];
    const emitFile = (type: "file-start" | "file-executed", migration: unknown) => {
      const file = this.migrationName(migration);
      const index = Math.max(files.indexOf(file), 0);
      this.emitProgress(options, {
        type,
        action,
        connKey,
        file,
        index,
        total: files.length,
      });
    };

    return {
      beforeAll: async (_knex, migrations) => {
        files = migrations.map((migration) => this.migrationName(migration));
        this.emitProgress(options, { type: "target-start", action, connKey, files });
      },
      beforeEach: async (_knex, migrations) => {
        migrations.forEach((migration) => emitFile("file-start", migration));
      },
      afterEach: async (_knex, migrations) => {
        migrations.forEach((migration) => emitFile("file-executed", migration));
      },
    };
  }

  private assertMigrationTarget(connKey: MigrationTarget): void {
    if (!this.getMigrationTargetKeys().includes(connKey)) {
      throw new Error(
        `Migration target is not allowed in NODE_ENV=${getSonamuEnvironment()}: ${String(connKey)}`,
      );
    }
  }

  /**
   * 마이그레이션 대상 커넥션의 정적 메타데이터를 반환합니다.
   * DB에 연결하지 않으므로 CLI와 Web이 상태 조회 전에 즉시 사용할 수 있습니다.
   *
   * @category 분리형 마이그레이션 API
   */
  getConnections(): MigrationConnectionMeta[] {
    const slackConfirm = new SlackConfirm();
    return this.getMigrationTargetKeys().map((connKey) => {
      const connection = Sonamu.dbConfig[connKey].connection as Knex.PgConnectionConfig;
      const host = connection.host ?? "localhost";
      return {
        connKey,
        name: String(connKey),
        host,
        port: connection.port ?? 5432,
        database: connection.database ?? "",
        remote: !LOCAL_DB_HOSTS.has(host.toLowerCase()),
        requiresApproval: slackConfirm.isTargetRequiresApproval(connKey),
      };
    });
  }

  /**
   * 소스에 존재하는 마이그레이션 파일 목록을 반환합니다.
   *
   * @category 분리형 마이그레이션 API
   */
  async getMigrationCodes(): Promise<MigrationCode[]> {
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
      .toSorted((a, b) => (a.name < b.name ? 1 : -1)); // 이름 내림차순 정렬(최신순)

    Naite.t("migrator:getMigrationCodes:results", codes);
    return codes;
  }

  /**
   * 커넥션 하나의 현재 버전과 pending 목록을 독립적으로 조회합니다.
   * 여러 대상은 호출자가 병렬로 조립할 수 있습니다.
   *
   * @category 분리형 마이그레이션 API
   */
  async getConnectionStatus(connKey: MigrationTarget): Promise<MigrationConnectionStatus> {
    this.assertMigrationTarget(connKey);
    const startedAt = performance.now();
    const codes = await this.getMigrationCodes();
    const knexOptions = Sonamu.dbConfig[connKey];
    const connection = knexOptions.connection as Knex.PgConnectionConfig;
    const tConn = createKnexInstance({
      ...knexOptions,
      connection: {
        ...(connection as Record<string, unknown>),
        connectionTimeoutMillis: MIGRATION_CONN_TIMEOUT_MS,
      },
      pool: {
        ...knexOptions.pool,
        min: 0,
        acquireTimeoutMillis: MIGRATION_CONN_TIMEOUT_MS,
        createTimeoutMillis: MIGRATION_CONN_TIMEOUT_MS,
        propagateCreateError: true,
      },
    });

    try {
      await withTimeout(tConn.raw("select 1"), MIGRATION_CONN_TIMEOUT_MS, () => {
        return new Error(
          `DB 연결 시간 초과 (${MIGRATION_CONN_TIMEOUT_MS}ms) — ${connection.host}:${connection.port}/${connection.database}`,
        );
      });

      let error: string | undefined;
      const status: number | "error" = await tConn.migrate.status().catch((caught) => {
        if (this.isMissingMigrationTableError(caught)) {
          return codes.length;
        }
        error = caught instanceof Error ? caught.message : String(caught);
        return "error" as const;
      });
      const pending: string[] = await tConn.migrate.list().then(
        ([, files]: [unknown[], { file: string }[]]) =>
          files.map(({ file }) => file.replace(/\.ts$/, "")),
        (caught: unknown) => {
          if (this.isMissingMigrationTableError(caught)) {
            return codes.map(({ name }) => name);
          }
          error ??= caught instanceof Error ? caught.message : String(caught);
          return [];
        },
      );
      const currentVersion: string | "none" | "error" = await tConn.migrate
        .currentVersion()
        .catch((caught: unknown) => {
          if (this.isMissingMigrationTableError(caught)) {
            return "none" as const;
          }
          error ??= caught instanceof Error ? caught.message : String(caught);
          return "error" as const;
        });
      Naite.t("migrator:getStatus:status", status);
      return {
        connKey,
        currentVersion,
        status,
        pending,
        latencyMs: performance.now() - startedAt,
        ...(error === undefined ? {} : { error }),
      };
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught);
      console.warn(
        chalk.yellow(
          `${String(connKey)}의 마이그레이션 상태를 가져오는 데에 실패하였습니다.\n${error}`,
        ),
      );
      return {
        connKey,
        currentVersion: "error",
        status: "error",
        pending: [],
        latencyMs: performance.now() - startedAt,
        error,
      };
    } finally {
      await withTimeout(tConn.destroy(), MIGRATION_CONN_TIMEOUT_MS, () => {
        return new Error("connection destroy timeout");
      }).catch(() => {});
    }
  }

  /**
   * 최신 상태인 기준 DB와 엔티티 정의를 비교해 생성 예정 코드를 반환합니다.
   *
   * @category 분리형 마이그레이션 API
   */
  async getPreparedCodes(compareConnKey: MigrationTarget): Promise<GenMigrationCode[]> {
    const status = await this.getConnectionStatus(compareConnKey);
    if (status.status !== 0 || status.error !== undefined) {
      throw new Error(
        `Migration comparison requires an up-to-date database: ${String(compareConnKey)}`,
      );
    }

    return this.compareWithConnection(compareConnKey);
  }

  private async compareWithConnection(compareConnKey: MigrationTarget) {
    const compareDB = createKnexInstance(Sonamu.dbConfig[compareConnKey]);
    try {
      return await this.compareMigrations(compareDB);
    } finally {
      await compareDB.destroy();
    }
  }

  /**
   * @deprecated 신규 UI에서는 커넥션별 조회 API를 사용합니다.
   * 기존 CLI와 스크립트 호환을 위해 전체 상태를 조립합니다.
   * @category 호환용 마이그레이션 API
   */
  async getStatus(): Promise<MigrationStatus> {
    const [codes, connections] = await Promise.all([
      this.getMigrationCodes(),
      Promise.resolve(this.getConnections()),
    ]);
    Naite.t("migrator:getStatus:codes", codes);

    const connectionStatuses = await Promise.all(
      connections.map(({ connKey }) => this.getConnectionStatus(connKey)),
    );
    const conns = connections.map((connection, index) => {
      const status = connectionStatuses[index];
      assert(status !== undefined);
      const configured = Sonamu.dbConfig[connection.connKey].connection as Knex.PgConnectionConfig;
      return {
        name: connection.name,
        connKey: connection.connKey,
        connString:
          `pg://${configured.user ?? ""}@${configured.host}:${configured.port}/${configured.database}` as ConnString,
        currentVersion: status.currentVersion,
        status: status.status,
        pending: status.pending,
      };
    });
    Naite.t("migrator:getStatus:conns", conns);

    const compareConn = connectionStatuses.find(
      ({ status, error }) => status === 0 && error === undefined,
    );
    const preparedCodes =
      compareConn === undefined ? [] : await this.compareWithConnection(compareConn.connKey);
    Naite.t("migrator:getStatus:preparedCodes", preparedCodes);

    return {
      conns,
      codes,
      preparedCodes,
      error: connectionStatuses.find(({ error }) => error !== undefined)?.error,
    };
  }

  /**
   * 대상 DB에 pending 마이그레이션을 적용합니다.
   * CLI와 Web은 같은 메서드를 사용하며, Web은 `onProgress`를 stream으로 변환합니다.
   *
   * @category 분리형 마이그레이션 API
   */
  async apply(targets: MigrationTarget[], options?: MigrationRunOptions): Promise<MigrationResult> {
    return this.runActionWithProgress("apply", targets, options);
  }

  /**
   * 대상 DB에서 가장 최근 migration batch를 롤백합니다.
   * CLI와 Web은 같은 메서드를 사용하며, Web은 `onProgress`를 stream으로 변환합니다.
   *
   * @category 분리형 마이그레이션 API
   */
  async rollback(
    targets: MigrationTarget[],
    options?: MigrationRunOptions,
  ): Promise<MigrationResult> {
    return this.runActionWithProgress("rollback", targets, options);
  }

  /**
   * @deprecated action 문자열 대신 {@link apply} 또는 {@link rollback}을 직접 사용합니다.
   * 기존 외부 호출의 하위 호환만을 위해 유지합니다.
   * @category 호환용 마이그레이션 API
   */
  async runAction(
    action: "apply" | "rollback",
    targets: (keyof SonamuDBConfig)[],
  ): Promise<MigrationResult> {
    return action === "apply" ? this.apply(targets) : this.rollback(targets);
  }

  private async runActionWithProgress(
    action: "apply" | "rollback",
    targets: MigrationTarget[],
    options?: MigrationRunOptions,
  ): Promise<MigrationResult> {
    Naite.t("migrator:runAction:action", action);
    Naite.t("migrator:runAction:targets", targets);

    const allowedTargets = new Set(this.getMigrationTargetKeys());
    const disallowedTargets = targets.filter((target) => !allowedTargets.has(target));
    if (disallowedTargets.length > 0) {
      throw new Error(
        `Migration targets are not allowed in NODE_ENV=${getSonamuEnvironment()}: ${disallowedTargets.join(", ")}`,
      );
    }

    // get uniq knex configs
    const configs = unique(
      targets
        .map((target) => ({
          connKey: target,
          options: Sonamu.dbConfig[target],
        }))
        .filter((c) => c.options !== undefined),
      ({ options }) =>
        `${(options.connection as Knex.PgConnectionConfig).host}:${
          (options.connection as Knex.PgConnectionConfig).port ?? 5432
        }/${(options.connection as Knex.PgConnectionConfig).database}`,
    );

    // get connections
    const conns = await Promise.all(
      configs.map(async (config) => ({
        connKey: config.connKey,
        knex: createKnexInstance(config.options),
      })),
    );

    try {
      const result = await this.runMigrationsSequentially(conns, action, options);

      Naite.t("migrator:runAction:result", result);

      return result;
    } finally {
      await Promise.all(
        conns.map(({ knex }) => {
          return knex.destroy();
        }),
      );
    }
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
  async generatePreparedCodes(compareConnKey?: MigrationTarget): Promise<number> {
    const preparedCodes =
      compareConnKey === undefined
        ? (await this.getStatus()).preparedCodes
        : await this.getPreparedCodes(compareConnKey);
    Naite.t("migrator:generatePreparedCodes:preparedCodes", preparedCodes);
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
        !isTest() && console.log(chalk.green(`MIGRATION CREATED ${filePath}`));
      }
    }

    return preparedCodes.length;
  }

  async compareMigrations(compareDB: Knex): Promise<GenMigrationCode[]> {
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
          (index) => [index.type, ...index.columns].join("-"),
        ),
      };
    });

    // 조인테이블 포함하여 MigrationSet 배열
    const entitySets: MigrationSet[] = [...entitySetsWithJoinTable, ...joinTables];

    const codes: GenMigrationCode[] = [];
    const batchSize = 4;

    for (let i = 0; i < entitySets.length; i += batchSize) {
      const batchCodes = await Promise.all(
        entitySets.slice(i, i + batchSize).map(async (entitySet) => {
          const dbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(
            compareDB,
            entitySet.table,
          );
          Naite.t(`migrator:compareMigrations:entitySet:${entitySet.table}`, entitySet);
          Naite.t(`migrator:compareMigrations:dbSet:${entitySet.table}`, dbSet);

          if (dbSet === null) {
            // 기존 테이블 없음, 새로 테이블 생성
            return await generateCreateCode(entitySet);
          } else {
            // 기존 테이블 존재하는 케이스
            return await generateAlterCode(entitySet, dbSet, compareDB);
          }
        }),
      );

      codes.push(...batchCodes.flat());
    }

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
   * test DB의 snapshot으로 임시 Shadow DB를 만들고 전체 마이그레이션을 검증합니다.
   * CLI와 Web은 `onProgress` 유무만 달리해 같은 실행 의미를 공유할 수 있습니다.
   *
   * @category 분리형 마이그레이션 API
   */
  async runShadowTest(options?: MigrationRunOptions): Promise<MigrationResult> {
    const baseTestConn = Sonamu.dbConfig.test.connection as Knex.PgConnectionConfig;
    const workerId = process.env.SONAMU_WORKER_DB === "true" ? process.env.VITEST_POOL_ID : null;
    const templateDatabase =
      workerId !== null ? `${baseTestConn.database}_${workerId ?? "1"}` : baseTestConn.database;
    const tdbConn = { ...baseTestConn, database: templateDatabase };
    const shadowDatabase = `${templateDatabase}__migration_shadow`;

    // 테스트 상황에서는 트랜잭션을 초기화하고, 새 데이터베이스 커넥션을 가져와야 함
    if (isTest()) {
      await DB.clearTestTransaction();
      await DB.destroy();
    }

    // 기존 Shadow DB 삭제 후 Shadow DB 생성
    const tdb = createKnexInstance({
      ...Sonamu.dbConfig.test,
      connection: {
        ...baseTestConn,
        database: "postgres",
      },
    });
    try {
      !isTest() && console.log(chalk.magenta(`${shadowDatabase} 삭제`));
      await tdb.raw(`DROP DATABASE IF EXISTS ${shadowDatabase}`);
      await tdb.raw(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE datname = '${tdbConn.database}'
          AND pid <> pg_backend_pid();
      `);
      await tdb.raw(`CREATE DATABASE ${shadowDatabase} TEMPLATE ${tdbConn.database}`);

      // Shadow DB에 연결
      const sdb = createKnexInstance({
        ...Sonamu.dbConfig.test,
        connection: {
          ...tdbConn,
          database: shadowDatabase,
          password: tdbConn.password,
        },
      });

      // shadow DB 테스트 진행
      try {
        const progress = this.createProgressHooks("shadow", "shadow", options);
        const [batchNo, applied] = await sdb.migrate.latest(progress);
        !isTest() &&
          console.log(chalk.green("Shadow DB 테스트에 성공했습니다!"), {
            batchNo,
            applied,
          });

        this.emitProgress(options, {
          type: "target-complete",
          action: "shadow",
          connKey: "shadow",
          batchNo,
          files: applied,
        });

        return [
          {
            connKey: "shadow",
            batchNo,
            applied,
          },
        ];
      } catch (e) {
        console.error(e);
        throw new MigrationTargetExecutionError(
          "shadow",
          new ServiceUnavailableException(SD("sonamu.error.shadowDbTestFailed")),
        );
      } finally {
        await sdb.destroy();
      }
    } finally {
      // Shadow DB 삭제
      !isTest() && console.log(chalk.magenta(`${shadowDatabase} 삭제`));
      try {
        await tdb.raw(`DROP DATABASE IF EXISTS ${shadowDatabase}`);
      } catch (e) {
        console.error("Shadow DB 정리 실패:", e); // 이게 없으면 조용히 누수
      } finally {
        await tdb.destroy();
      }
    }
  }
}
