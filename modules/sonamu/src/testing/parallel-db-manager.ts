import type { Knex } from "knex";
import { createKnexInstance } from "../database/knex";

/**
 * 병렬 테스트를 위한 Worker별 DB 관리 클래스입니다.
 *
 * Vitest의 globalSetup/globalTeardown에서 사용하여
 * 템플릿 DB에서 worker 수만큼 테스트 DB를 복제/삭제합니다.
 */
export class ParallelDBManager {
  constructor(
    private readonly maxWorkers: number,
    private readonly dbConfig: Knex.Config,
    private readonly templateDb: string,
  ) {}
  /**
   * Worker별 테스트 DB를 템플릿에서 복제하여 생성합니다.
   * globalSetup에서 호출됩니다.
   */
  async createWorkerDatabases(): Promise<void> {
    // postgres DB에 연결하여 CREATE DATABASE 실행
    const adminDb = createKnexInstance({
      ...this.dbConfig,
    });

    try {
      const workerDbNames = Array.from(
        { length: this.maxWorkers },
        (_, i) => `${this.templateDb}_${i + 1}`,
      );

      // 1. 기존 연결 종료 (병렬)
      await Promise.all(
        workerDbNames.map((dbName) =>
          adminDb.raw(
            `
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = ?
            AND pid <> pg_backend_pid()
          `,
            [dbName],
          ),
        ),
      );

      // 2. 기존 DB 삭제 (병렬)
      await Promise.all(
        workerDbNames.map((dbName) => adminDb.raw(`DROP DATABASE IF EXISTS "${dbName}"`)),
      );

      // 3. 템플릿에서 복제 (병렬)
      await Promise.all(
        workerDbNames.map((dbName) =>
          adminDb.raw(`CREATE DATABASE "${dbName}" TEMPLATE "${this.templateDb}"`),
        ),
      );
    } finally {
      await adminDb.destroy();
    }
  }

  /**
   * 생성한 Worker DB들을 삭제합니다.
   * globalTeardown에서 호출됩니다.
   */
  async dropWorkerDatabases(): Promise<void> {
    const adminDb = createKnexInstance({
      ...this.dbConfig,
    });

    try {
      const workerDbNames = Array.from(
        { length: this.maxWorkers },
        (_, i) => `${this.templateDb}_${i + 1}`,
      );

      // 연결 종료 (병렬)
      await Promise.all(
        workerDbNames.map((dbName) =>
          adminDb.raw(
            `
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = ?
            AND pid <> pg_backend_pid()
          `,
            [dbName],
          ),
        ),
      );

      // DB 삭제 (병렬)
      await Promise.all(
        workerDbNames.map((dbName) => adminDb.raw(`DROP DATABASE IF EXISTS "${dbName}"`)),
      );
    } finally {
      await adminDb.destroy();
    }
  }

  /**
   * 현재 Worker의 ID를 반환합니다.
   * Vitest는 VITEST_POOL_ID 환경변수로 worker를 식별합니다.
   */
  getWorkerId(): number {
    // VITEST_POOL_ID는 1부터 시작
    return parseInt(process.env.VITEST_POOL_ID ?? "1", 10);
  }

  /**
   * 병렬 테스트 모드인지 확인합니다.
   */
  isParallelMode(): boolean {
    return process.env.SONAMU_WORKER_DB === "true";
  }
}
