import { DB } from "sonamu";
import { z } from "zod";

import { type JsonObject } from "../definition/canonical-json";
import { SearchConfigurationError, SearchInTransactionError } from "../errors";
import { createPostgresCatalogReader } from "../postgres/catalog-reader";
import { type SearchCatalogReader } from "../query/catalog";
import {
  createGuardedSearchQueries,
  type SearchQueries,
  type SearchQueriesOptions,
} from "../query/search-queries";
import { applySonamuDefaultLocale } from "./locale";
import { resolveSonamuPrimary } from "./primary";

export interface SonamuCatalogSource {
  namespace: string;
  /** Default "sonamu_search". */
  schema?: string;
}

export type SonamuSearchQueriesOptions = Omit<SearchQueriesOptions, "catalog"> & {
  catalog: SearchCatalogReader | SonamuCatalogSource;
};

const functionSchema = z.instanceof(Function);
const catalogReaderSchema = z.custom<SearchCatalogReader>(
  (value) =>
    z
      .looseObject({ resolveReadHeads: functionSchema, resolveTarget: functionSchema })
      .safeParse(value).success,
);
const catalogSourceSchema = z.strictObject({
  namespace: z.string(),
  schema: z.string().optional(),
});

function resolveCatalog(catalog: SonamuSearchQueriesOptions["catalog"]): SearchCatalogReader {
  const reader = catalogReaderSchema.safeParse(catalog);
  if (reader.success) return reader.data;
  const source = catalogSourceSchema.safeParse(catalog);
  if (!source.success) {
    throw new SearchConfigurationError(
      { key: "query.invalidOptions", params: { path: "catalog" } },
      { details: { reason: "invalid-query-option", path: "catalog" } },
    );
  }
  const readerOptions: Parameters<typeof createPostgresCatalogReader>[0] = {
    getPrimaryDatabase: resolveSonamuPrimary,
    namespace: source.data.namespace,
  };
  if (source.data.schema !== undefined) readerOptions.schema = source.data.schema;
  return createPostgresCatalogReader(readerOptions);
}

/** Search handle that refuses calls inside an active transaction and reads the catalog from the Sonamu primary. */
export function createSonamuSearchQueries<TDocument extends JsonObject>(
  options: SonamuSearchQueriesOptions,
): SearchQueries<TDocument> {
  const catalog = resolveCatalog(options.catalog);
  return createGuardedSearchQueries<TDocument>(
    { ...options, catalog },
    {
      assertNoAmbientTransaction() {
        applySonamuDefaultLocale();
        if (DB.getTransactionContext().getActiveTransaction() !== undefined) {
          throw new SearchInTransactionError(
            { key: "error.inTransaction" },
            { details: { reason: "ambient-transaction" } },
          );
        }
      },
    },
  );
}
