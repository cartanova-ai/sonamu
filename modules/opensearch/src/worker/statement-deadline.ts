import { type Knex } from "knex";
import { z } from "zod";

import { SearchTimeout } from "../errors";
import { type SqlExecutor } from "../postgres/sql";

// Knex .timeout(ms, { cancel: true }) sends pg_cancel_backend at the deadline (lock waits too) and the JS side
// rejects at the same deadline on its own, so a lost cancel still frees the caller. SET LOCAL statement_timeout would
// add three round trips per statement; a session setting would leak into the application's shared pool.

const knexTimeoutSchema = z.looseObject({ name: z.literal("KnexTimeoutError") });
const timeoutCapableSchema = z.looseObject({ timeout: z.instanceof(Function) });

export function statementTimeoutError(timeoutMs: number): SearchTimeout {
  return new SearchTimeout(
    { key: "worker.statementTimeout", params: { timeoutMs } },
    { details: { reason: "statement-timeout", timeoutMs } },
  );
}

type RawResult = Awaited<ReturnType<SqlExecutor["raw"]>>;

export function boundedExecutor(db: SqlExecutor, timeoutMs: number): SqlExecutor {
  const raw = (text: string, bindings: readonly Knex.RawBinding[]): Promise<RawResult> => {
    const builder = db.raw(text, [...bindings]);
    const running = timeoutCapableSchema.safeParse(builder).success
      ? builder.timeout(timeoutMs, { cancel: true })
      : builder;
    return new Promise<RawResult>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(statementTimeoutError(timeoutMs));
      }, timeoutMs);
      Promise.resolve(running)
        .then((value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(
            knexTimeoutSchema.safeParse(error).success ? statementTimeoutError(timeoutMs) : error,
          );
        });
    });
  };
  return new Proxy(db, { get: (_target, property) => (property === "raw" ? raw : undefined) });
}
