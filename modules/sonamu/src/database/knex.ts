import { type Knex } from "knex";
import knex from "knex";

export function createKnexInstance(config: Knex.Config): Knex {
  if (config.connection && typeof config.connection === "object") {
    const conn = config.connection as Record<string, unknown>;

    if (conn.keepAlive === undefined) {
      conn.keepAlive = true;
      conn.keepAliveInitialDelayMillis = conn.keepAliveInitialDelayMillis ?? 10000;
    }
  }

  config.pool = {
    // 아래는 기본값이며, 호출측이 config.pool로 덮어쓸 수 있다.
    // (예: 마이그레이션 상태 조회는 fail-fast를 위해 짧은 타임아웃 + propagateCreateError를 지정)
    maxConnectionLifetimeMillis: 1800000,
    maxConnectionLifetimeJitterMillis: 300000,
    propagateCreateError: false,
    idleTimeoutMillis: 10000,
    reapIntervalMillis: 1000,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    ...config.pool,
    // validate/afterCreate는 항상 프레임워크 기본값을 사용한다.
    validate: (connection: unknown) => {
      if (typeof connection !== "object" || connection === null) return false;
      const conn = connection as Record<string, unknown>;
      if (conn._ending === true || conn._closed === true) return false;
      return true;
    },
    afterCreate: ((
      conn: Knex.Client & Record<string, unknown>,
      done: (err: Error | null, conn: Knex.Client) => void,
    ) => {
      // pg driver: 소켓 레벨 keepAlive 설정
      const stream = (conn as Record<string, unknown>).connection as
        | { stream?: { setKeepAlive?: (enable: boolean, initialDelay: number) => void } }
        | undefined;
      if (stream?.stream?.setKeepAlive) {
        stream.stream.setKeepAlive(true, 10000);
      }

      done(null, conn);
    }) satisfies Knex.PoolConfig["afterCreate"],
  };

  return knex(config);
}
