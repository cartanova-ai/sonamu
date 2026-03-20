import type { Knex } from "knex";
import knex from "knex";

/**
 * connection 객체를 libpq 연결 문자열로 변환합니다.
 * pg-native는 libpq를 사용하므로, keepalive 등 libpq 파라미터를
 * 연결 문자열로 전달해야 합니다.
 */
function buildLibpqConnectionString(conn: Record<string, unknown>): string {
  const mapping: Array<[string, string]> = [
    ["host", "host"],
    ["port", "port"],
    ["user", "user"],
    ["password", "password"],
    ["database", "dbname"],
  ];

  const parts: string[] = [];
  for (const [jsKey, pqKey] of mapping) {
    if (conn[jsKey] != null) {
      const escaped = String(conn[jsKey]).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      parts.push(`${pqKey}='${escaped}'`);
    }
  }

  // TCP keepAlive (libpq parameters)
  parts.push("keepalives=1");
  parts.push("keepalives_idle=10");
  parts.push("keepalives_interval=10");
  parts.push("keepalives_count=5");

  return parts.join(" ");
}

export function createKnexInstance(config: Knex.Config): Knex {
  if (config.connection && typeof config.connection === "object") {
    const conn = config.connection as Record<string, unknown>;

    if (config.client === "pgnative" || config.client === "pg-native") {
      // pg-native: libpq 연결 문자열로 변환하여 keepalive 파라미터 포함
      config.connection = buildLibpqConnectionString(conn);
    } else {
      // pg: keepAlive 설정 (Node.js TCP socket level)
      if (conn.keepAlive === undefined) {
        conn.keepAlive = true;
        conn.keepAliveInitialDelayMillis = conn.keepAliveInitialDelayMillis ?? 10000;
      }
    }
  }

  config.pool = {
    ...(config.pool ?? {}),
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
