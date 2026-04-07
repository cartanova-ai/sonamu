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
    ...config.pool,
    propagateCreateError: false,
    idleTimeoutMillis: 10000,
    reapIntervalMillis: 1000,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
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

      conn.on("error", (err: Error) => {
        Object.defineProperty(conn, "__knex__disposed", {
          value: err,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      });

      done(null, conn);
    }) satisfies Knex.PoolConfig["afterCreate"],
  };

  const knexInstance = knex(config);
  knexInstance.client.validateConnection = (connection: unknown) => {
    if (typeof connection !== "object" || connection === null) return false;
    if ("__knex__disposed" in connection) return false;
    const conn = connection as Record<string, unknown>;
    if (conn._ending === true || conn._closed === true) return false;
    return true;
  };

  return knexInstance;
}
