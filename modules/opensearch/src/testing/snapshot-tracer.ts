import { AsyncLocalStorage } from "node:async_hooks";

import { type Knex } from "knex";
import { z } from "zod";

import { SearchConfigurationError } from "../errors";

export interface TracedStatement {
  readonly sql: string;
  readonly onSnapshot: boolean;
}

export interface ProjectionConnectionTracer {
  run<T>(snapshot: Knex.Transaction, fn: () => Promise<T>): Promise<T>;
  statements(): readonly TracedStatement[];
  escapes(): readonly { readonly sql: string }[];
  dispose(): void;
}

interface TraceScope {
  readonly connection: string;
}

interface KnexQueryEvent {
  readonly sql?: string;
  readonly __knexUid?: string;
}

const functionSchema = z.instanceof(Function);
const emitterSchema = z.custom<Knex>(
  (value) =>
    functionSchema.safeParse(value).success &&
    functionSchema.safeParse(Object(value).on).success &&
    functionSchema.safeParse(Object(value).removeListener).success,
);
const transactionSchema = z.custom<Knex.Transaction>(
  (value) =>
    functionSchema.safeParse(value).success &&
    Object(value).isTransaction === true &&
    functionSchema.safeParse(Object(value).isCompleted).success &&
    Object(value).isCompleted() === false,
);
// A Knex transaction is a function object that z.object cannot read, so only its client is extracted.
const transactionClientSchema = z.object({ acquireConnection: functionSchema });
const connectionSchema = z.object({ __knexUid: z.string().min(1) });
const queryEventSchema = z.object({
  sql: z.string().optional(),
  __knexUid: z.string().optional(),
});

function invalidSnapshot(): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "tracer.invalidSnapshot" },
    { details: { reason: "tracer-invalid-snapshot" } },
  );
}

async function snapshotConnectionId(snapshot: Knex.Transaction): Promise<string> {
  if (!transactionSchema.safeParse(snapshot).success) throw invalidSnapshot();
  const holder = transactionClientSchema.safeParse(Object(snapshot).client);
  if (!holder.success) throw invalidSnapshot();
  const connection = connectionSchema.safeParse(await holder.data.acquireConnection());
  if (!connection.success) throw invalidSnapshot();
  return connection.data.__knexUid;
}

/** Records statements run inside run() and flags those off the snapshot's connection; unpassed Knex instances are invisible. */
export function traceProjectionConnections(
  knex: Knex | readonly Knex[],
): ProjectionConnectionTracer {
  const instances = Array.isArray(knex) ? [...knex] : [knex];
  if (instances.length === 0 || !instances.every((item) => emitterSchema.safeParse(item).success)) {
    throw new SearchConfigurationError(
      { key: "tracer.invalidKnex" },
      { details: { reason: "tracer-invalid-knex" } },
    );
  }
  const recorded: TracedStatement[] = [];
  let storage: AsyncLocalStorage<TraceScope> | undefined;
  let attached = false;
  let disposed = false;

  const listener = (event: KnexQueryEvent) => {
    const scope = storage?.getStore();
    if (scope === undefined) return;
    const parsed = queryEventSchema.safeParse(event);
    if (!parsed.success) return;
    recorded.push(
      Object.freeze({
        sql: parsed.data.sql ?? "",
        onSnapshot: parsed.data.__knexUid === scope.connection,
      }),
    );
  };

  return Object.freeze({
    async run<T>(snapshot: Knex.Transaction, fn: () => Promise<T>): Promise<T> {
      if (disposed) throw invalidSnapshot();
      const connection = await snapshotConnectionId(snapshot);
      storage ??= new AsyncLocalStorage<TraceScope>();
      if (!attached) {
        for (const instance of instances) instance.on("query", listener);
        attached = true;
      }
      return storage.run({ connection }, fn);
    },
    statements: () => [...recorded],
    escapes: () => recorded.filter((item) => !item.onSnapshot).map(({ sql }) => ({ sql })),
    dispose() {
      if (attached) {
        for (const instance of instances) instance.removeListener("query", listener);
      }
      attached = false;
      disposed = true;
      storage?.disable();
    },
  });
}
