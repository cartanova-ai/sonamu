import type { Knex } from "knex";
import knex from "knex";

export function createKnexInstance(config: Knex.Config): Knex {
  config.pool = {
    ...(config.pool ?? {}),
    propagateCreateError: false,
    idleTimeoutMillis: 10000,
    reapIntervalMillis: 1000,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    afterCreate: ((conn: Knex.Client, done: (err: Error | null, conn: Knex.Client) => void) => {
      conn.on("error", (err: Error) => {
        Object.defineProperty(conn, "__knex__disposed", {
          value: err,
          writable: false,
          configurable: false,
          enumerable: false,
        });
      });

      done(null, conn);
    }) satisfies Knex.PoolConfig["afterCreate"],
  };

  const knexInstance = knex(config);
  knexInstance.client.validateConnection = (connection: unknown) => {
    return (
      typeof connection === "object" && connection !== null && !("__knex__disposed" in connection)
    );
  };

  return knexInstance;
}
