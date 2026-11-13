import { type Knex } from "knex";
import { z } from "zod";

import {
  SearchError,
  type SearchErrorDetail,
  SearchSchemaVersionMismatch,
  SearchStoreMismatch,
} from "../errors";
import { type PgErrorContext } from "./pg-errors";
import { looksLikeTransaction, uuidSchema } from "./rows";
import { executeSql, qualified, schemaIdentifier, sql, type SqlFragment, statement } from "./sql";
import { createSchemaStatementCache } from "./statement-cache";

// Installation records the database origin (system identifier, OID, name). A mismatch blocks remote effects only;
// markChanged and initialize() never check it, so capture continues. A role that cannot call pg_control_system()
// (42501) compares OID and name only.

export interface StoreBindingStatements {
  readonly readSystemIdentifier: SqlFragment;
  readonly recordOrigin: SqlFragment;
  readonly checkBinding: SqlFragment;
  readonly checkBindingWithSystemIdentifier: SqlFragment;
}

function renderStoreBindingStatements(schema: string): StoreBindingStatements {
  const store = qualified(schemaIdentifier(schema), "store");
  return {
    readSystemIdentifier: sql`SELECT (pg_control_system()).system_identifier::text AS system_identifier;`,
    recordOrigin: sql`UPDATE ${store}
SET origin_system_identifier = $1::text,
    origin_database_oid = (SELECT oid::bigint FROM pg_database WHERE datname = current_database()),
    origin_database_name = current_database()::text,
    origin_recorded_at = clock_timestamp()
RETURNING store_id, origin_system_identifier, origin_database_oid, origin_database_name;`,
    checkBinding: sql`SELECT s.store_id,
       s.origin_recorded_at IS NOT NULL AS origin_recorded,
       s.origin_database_oid IS NOT DISTINCT FROM (SELECT oid::bigint FROM pg_database WHERE datname = current_database())
         AND s.origin_database_name IS NOT DISTINCT FROM current_database()::text
         AND (s.origin_system_identifier IS NULL OR $1::text IS NULL OR s.origin_system_identifier = $1::text) AS origin_matches,
       ($2::text IS NULL OR s.instance_name IS NULL OR s.instance_name = $2::text) AS instance_matches
FROM ${store} s;`,
    checkBindingWithSystemIdentifier: sql`SELECT s.store_id,
       s.origin_recorded_at IS NOT NULL AS origin_recorded,
       s.origin_database_oid IS NOT DISTINCT FROM (SELECT oid::bigint FROM pg_database WHERE datname = current_database())
         AND s.origin_database_name IS NOT DISTINCT FROM current_database()::text
         AND (s.origin_system_identifier IS NULL OR s.origin_system_identifier = (pg_control_system()).system_identifier::text) AS origin_matches,
       ($1::text IS NULL OR s.instance_name IS NULL OR s.instance_name = $1::text) AS instance_matches
FROM ${store} s;`,
  };
}

const statementCache = createSchemaStatementCache(renderStoreBindingStatements);

export function storeBindingStatementsFor(schema: string): StoreBindingStatements {
  return statementCache.get(schema);
}

const systemIdentifierRowSchema = z.object({ system_identifier: z.string().regex(/^\d{1,20}$/) });
const bindingRowSchema = z.object({
  store_id: uuidSchema,
  origin_recorded: z.boolean(),
  origin_matches: z.boolean(),
  instance_matches: z.boolean(),
});
export const originRowSchema = z.object({
  store_id: uuidSchema,
  origin_system_identifier: z
    .string()
    .regex(/^\d{1,20}$/)
    .nullable(),
  origin_database_oid: z.union([z.string().regex(/^\d{1,20}$/), z.number().int()]),
  origin_database_name: z.string().min(1),
});

/** Result of the store binding check; a mismatch is returned, not thrown. */
export interface StoreBinding {
  storeId: string;
  originRecorded: boolean;
  originMatches: boolean;
  /** true unless both instance names are set and differ. */
  instanceMatches: boolean;
  systemIdentifierReadable: boolean;
}

function invalidRow(statementId: string): SearchSchemaVersionMismatch {
  return new SearchSchemaVersionMismatch(
    { key: "binding.invalidRow", params: { statement: statementId } },
    { details: { reason: "invalid-row", statement: statementId } },
  );
}

// 42703: store has no origin columns, so schema version 2 is not installed.
function schemaBehind(error: SearchError): SearchSchemaVersionMismatch {
  return new SearchSchemaVersionMismatch(
    { key: "schema.behind", params: { installed: 1, required: 2 } },
    { details: { status: "behind", required: 2 }, cause: error },
  );
}

// Inside a transaction this runs in a savepoint, so the expected 42501 does not abort the caller's transaction.
export async function readSystemIdentifier(
  db: Knex | Knex.Transaction,
  schema: string,
  context: PgErrorContext,
): Promise<string | null> {
  const compiled = statement(storeBindingStatementsFor(schema).readSystemIdentifier);
  try {
    const result = looksLikeTransaction(db)
      ? await db.transaction((savepoint) => executeSql(savepoint, compiled, context))
      : await executeSql(db, compiled, context);
    const row = systemIdentifierRowSchema.safeParse(result.rows[0]);
    if (result.rows.length !== 1 || !row.success) throw invalidRow("readSystemIdentifier");
    return row.data.system_identifier;
  } catch (error) {
    if (error instanceof SearchError && error.details?.sqlstate === "42501") return null;
    throw error;
  }
}

export async function readStoreBinding(
  db: Knex | Knex.Transaction,
  schema: string,
  systemIdentifier: string | null,
  instanceName: string | null,
  context: PgErrorContext,
): Promise<StoreBinding> {
  let result;
  try {
    result = await executeSql(
      db,
      statement(storeBindingStatementsFor(schema).checkBinding, [systemIdentifier, instanceName]),
      context,
    );
  } catch (error) {
    if (error instanceof SearchError && error.details?.sqlstate === "42703") {
      throw schemaBehind(error);
    }
    throw error;
  }
  const row = bindingRowSchema.safeParse(result.rows[0]);
  if (result.rows.length !== 1 || !row.success) throw invalidRow("checkBinding");
  return {
    storeId: row.data.store_id,
    originRecorded: row.data.origin_recorded,
    originMatches: row.data.origin_matches,
    instanceMatches: row.data.instance_matches,
    systemIdentifierReadable: systemIdentifier !== null,
  };
}

// db must not be a transaction: the 42501 this expects would abort it.
export async function readStoreBindingCombined(
  db: Knex,
  schema: string,
  instanceName: string | null,
  context: PgErrorContext,
): Promise<StoreBinding | false> {
  let result;
  try {
    result = await executeSql(
      db,
      statement(storeBindingStatementsFor(schema).checkBindingWithSystemIdentifier, [instanceName]),
      context,
    );
  } catch (error) {
    if (error instanceof SearchError && error.details?.sqlstate === "42501") return false;
    if (error instanceof SearchError && error.details?.sqlstate === "42703") {
      throw schemaBehind(error);
    }
    throw error;
  }
  const row = bindingRowSchema.safeParse(result.rows[0]);
  if (result.rows.length !== 1 || !row.success)
    throw invalidRow("checkBindingWithSystemIdentifier");
  return {
    storeId: row.data.store_id,
    originRecorded: row.data.origin_recorded,
    originMatches: row.data.origin_matches,
    instanceMatches: row.data.instance_matches,
    systemIdentifierReadable: true,
  };
}

export type StoreBindingMismatchReason =
  | "store-origin-unrecorded"
  | "store-origin-changed"
  | "store-instance-mismatch";

export function storeBindingMismatch(
  binding: StoreBinding,
  extra: Readonly<Record<string, SearchErrorDetail>> = {},
): SearchStoreMismatch | undefined {
  const { storeId } = binding;
  const details = { ...extra, storeId };
  if (!binding.originRecorded) {
    return new SearchStoreMismatch(
      { key: "binding.originUnrecorded", params: { storeId } },
      { details: { ...details, reason: "store-origin-unrecorded" } },
    );
  }
  if (!binding.originMatches) {
    return new SearchStoreMismatch(
      { key: "binding.originChanged", params: { storeId } },
      {
        details: {
          ...details,
          reason: "store-origin-changed",
          systemIdentifierReadable: binding.systemIdentifierReadable,
        },
      },
    );
  }
  if (!binding.instanceMatches) {
    return new SearchStoreMismatch(
      { key: "binding.instanceMismatch", params: { storeId } },
      { details: { ...details, reason: "store-instance-mismatch" } },
    );
  }
  return undefined;
}

export interface StoreBindingSource {
  checkBinding(): Promise<StoreBinding>;
}

export async function requireStoreBinding(source: StoreBindingSource): Promise<StoreBinding> {
  const binding = await source.checkBinding();
  const mismatch = storeBindingMismatch(binding);
  if (mismatch !== undefined) throw mismatch;
  return binding;
}

export function remoteStoreMismatch(
  storeId: string,
  targetId: string,
  remoteStoreId: string,
): SearchStoreMismatch {
  return new SearchStoreMismatch(
    { key: "binding.remoteStoreMismatch", params: { targetId, storeId, remoteStoreId } },
    { details: { reason: "remote-store-mismatch", targetId, storeId, remoteStoreId } },
  );
}
