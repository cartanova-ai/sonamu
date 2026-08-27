import { type Knex } from "knex";
import knex from "knex";

import { isObjectValue } from "../utils/runtime-value";

type KnexClientWithConnection = Knex.Client & {
  connection?: {
    stream?: {
      setKeepAlive?: (enable: boolean, initialDelay: number) => void;
    };
  };
};

export function createKnexInstance(config: Knex.Config): Knex {
  if (config.connection && isObjectValue(config.connection)) {
    const keepAlive = "keepAlive" in config.connection ? config.connection.keepAlive : undefined;
    const initialDelay =
      "keepAliveInitialDelayMillis" in config.connection
        ? config.connection.keepAliveInitialDelayMillis
        : undefined;

    if (keepAlive === undefined) {
      Object.assign(config.connection, {
        keepAlive: true,
        keepAliveInitialDelayMillis: initialDelay ?? 10000,
      });
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
    validate: <Connection>(connection: Connection) => {
      if (!isObjectValue(connection)) return false;
      const isEnding = "_ending" in connection && connection["_ending"] === true;
      const isClosed = "_closed" in connection && connection["_closed"] === true;
      return !isEnding && !isClosed;
    },
    afterCreate: ((
      conn: KnexClientWithConnection,
      done: (err: Error | null, conn: Knex.Client) => void,
    ) => {
      // pg driver 소켓에 keepAlive를 적용해 유휴 연결 단절을 줄입니다.
      if (conn.connection?.stream?.setKeepAlive) {
        conn.connection.stream.setKeepAlive(true, 10000);
      }

      done(null, conn);
    }) satisfies Knex.PoolConfig["afterCreate"],
  };

  return knex(config);
}
