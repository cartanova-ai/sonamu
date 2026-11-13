import { type Knex } from "knex";
import { DB, PuriTransactionWrapper, UpsertBuilder } from "sonamu";

import { type JsonObject } from "../definition/canonical-json";
import {
  type DefinedSearch,
  defineSearch,
  type ProjectionReadContext,
  type SearchDefinition,
} from "../definition/define-search";
import { SearchInvalidTransaction } from "../errors";
import { isLiveTransaction } from "../postgres/rows";
import { applySonamuDefaultLocale } from "./locale";

/** Runs callback with trx bound to the "w" and "r" presets; getDB(), named presets and other Knex instances bypass it. */
export function withProjectionScope<T>(
  trx: Knex.Transaction,
  callback: () => Promise<T>,
): Promise<T> {
  if (!isLiveTransaction(trx)) {
    throw new SearchInvalidTransaction(
      { key: "sonamu.projectionScopeNotTransaction" },
      { details: { reason: "projection-scope-not-transaction" } },
    );
  }
  const wrapper = new PuriTransactionWrapper(trx, new UpsertBuilder());
  return DB.runWithTransactionScope("w", wrapper, () =>
    DB.runWithTransactionScope("r", wrapper, callback),
  );
}

/** defineSearch with its functions run in withProjectionScope; the fingerprint is unchanged. */
export function defineSonamuSearch<TDocument extends JsonObject>(
  definition: SearchDefinition<TDocument>,
): DefinedSearch<TDocument> {
  const defined = defineSearch(definition);
  const scoped = <Args extends readonly unknown[], Result>(
    run: (context: ProjectionReadContext, ...args: Args) => Promise<Result>,
  ) =>
    function (context: ProjectionReadContext, ...args: Args): Promise<Result> {
      applySonamuDefaultLocale();
      return withProjectionScope(context.trx, () => run.call(defined, context, ...args));
    };
  return Object.freeze({
    ...defined,
    materialize: scoped(defined.materialize),
    captureScanBoundary: scoped(defined.captureScanBoundary),
    scanSourceIds: scoped(defined.scanSourceIds),
  });
}
