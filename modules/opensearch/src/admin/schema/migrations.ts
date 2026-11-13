import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { type Knex } from "knex";
import { z } from "zod";

import { DEFAULT_SEARCH_SCHEMA } from "../../definition/names";
import {
  SearchConfigurationError,
  SearchInvalidTransaction,
  SearchSchemaMissing,
  SearchSchemaVersionMismatch,
} from "../../errors";
import { type SearchMessage } from "../../i18n";
import { mapPgError } from "../../postgres/pg-errors";
import {
  executeSql,
  qualified,
  renderSql,
  schemaIdentifier,
  sql,
  type SqlExecutor,
  type SqlFragment,
  statement,
  templatePlaceholder,
} from "../../postgres/sql";
import {
  originRowSchema,
  readSystemIdentifier,
  storeBindingStatementsFor,
} from "../../postgres/store-binding";
import { renderSchemaV1, renderSchemaV2 } from "./ddl";

// installSearchSchema runs in one transaction (a savepoint inside a given one): a per-schema advisory xact lock admits
// one installer; a higher version, checksum mismatch or version gap changes nothing; missing versions apply in order.
// The origin is recorded only when this call applied version 2, so rerunning the installer on a copy cannot make the
// copy's origin legitimate. schema_versions is probed with to_regclass because version 1 creates it without IF NOT
// EXISTS.

export const SEARCH_SCHEMA_VERSION = 2;

export interface SearchSchemaOptions {
  schema?: string;
}

export interface SchemaInstallReport {
  schema: string;
  /** Versions applied by this call; empty if already current. */
  applied: readonly number[];
  current: number;
  storeId: string;
}

export type SchemaStatus = "ok" | "missing" | "behind" | "ahead" | "checksum-mismatch";

export interface SchemaCompatibilityReport {
  schema: string;
  installed: number | null;
  required: number;
  status: SchemaStatus;
}

interface SchemaMigration {
  readonly version: number;
  readonly name: string;
  readonly render: (schema: SqlFragment) => SqlFragment;
}

const MIGRATIONS: readonly SchemaMigration[] = [
  { version: 1, name: "initial", render: renderSchemaV1 },
  { version: 2, name: "store-binding", render: renderSchemaV2 },
];

const checksums = new Map<number, string>();

export function schemaChecksum(version: number): string {
  const cached = checksums.get(version);
  if (cached !== undefined) return cached;
  const migration = MIGRATIONS.find((candidate) => candidate.version === version);
  if (migration === undefined) {
    throw new SearchSchemaVersionMismatch(
      { key: "schema.ahead", params: { installed: version, supported: SEARCH_SCHEMA_VERSION } },
      { details: { status: "ahead", installed: version, required: SEARCH_SCHEMA_VERSION } },
    );
  }
  const checksum = createHash("sha256")
    .update(renderSql(migration.render(templatePlaceholder("s"))), "utf8")
    .digest("hex");
  checksums.set(version, checksum);
  return checksum;
}

export function renderSchemaTemplate(): string {
  return MIGRATIONS.map((migration) => renderSql(migration.render(templatePlaceholder("s")))).join(
    "",
  );
}

export function renderSearchSchemaSql(options?: SearchSchemaOptions): string {
  const schema = resolveSchema(options);
  const s = schemaIdentifier(schema);
  return MIGRATIONS.map((migration) => renderSql(migration.render(s))).join("");
}

export const schemaOptionFields = { schema: z.string().optional() };
const schemaOptionsSchema = z.strictObject(schemaOptionFields).optional();

export function parseOptions<T extends z.ZodType, Options>(
  schema: T,
  options: Options,
): z.output<T> {
  const parsed = schema.safeParse(options);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new SearchConfigurationError(
    { key: "schema.invalidOptions" },
    {
      details: {
        reason: "invalid-options",
        issue: issue?.code ?? "unknown",
        path: (issue?.path ?? []).map(String).join(".").slice(0, 120),
      },
    },
  );
}

function resolveSchema(options: SearchSchemaOptions | undefined): string {
  return parseOptions(schemaOptionsSchema, options)?.schema ?? DEFAULT_SEARCH_SCHEMA;
}

const versionRowSchema = z.object({
  version: z.number().int().min(1),
  name: z.string(),
  checksum: z.string(),
  package_version: z.string(),
});
const presenceRowSchema = z.object({ installed: z.boolean() });
const isolationRowSchema = z.object({ isolation: z.string().regex(/^[a-z ]{1,32}$/) });
const storeRowSchema = z.object({
  store_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
});
const packageManifestSchema = z.object({ version: z.string().min(1).max(64) });

let packageVersion: string | undefined;

function readPackageVersion(): string {
  if (packageVersion !== undefined) return packageVersion;
  let manifest: unknown;
  try {
    manifest = createRequire(import.meta.url)("../../../package.json");
  } catch {
    manifest = undefined;
  }
  const parsed = packageManifestSchema.safeParse(manifest);
  packageVersion = parsed.success ? parsed.data.version : "unknown";
  return packageVersion;
}

function invalidRow(table: string): SearchSchemaVersionMismatch {
  return new SearchSchemaVersionMismatch(
    { key: "schema.invalidRow", params: { table } },
    { details: { status: "checksum-mismatch", reason: "invalid-row", table } },
  );
}

interface Evaluation {
  status: SchemaStatus;
  installed: number | null;
  pending: readonly SchemaMigration[];
  version?: number;
  reason?: "ahead" | "checksum" | "gap";
}

function evaluate(rows: readonly z.output<typeof versionRowSchema>[] | null): Evaluation {
  if (rows === null) {
    return { status: "missing", installed: null, pending: MIGRATIONS };
  }
  const highest = rows.at(-1)?.version ?? null;
  if (highest !== null && highest > SEARCH_SCHEMA_VERSION) {
    return { status: "ahead", installed: highest, pending: [], version: highest, reason: "ahead" };
  }
  for (const [position, row] of rows.entries()) {
    if (row.version !== position + 1) {
      return {
        status: "checksum-mismatch",
        installed: highest,
        pending: [],
        version: position + 1,
        reason: "gap",
      };
    }
    if (row.checksum !== schemaChecksum(row.version)) {
      return {
        status: "checksum-mismatch",
        installed: highest,
        pending: [],
        version: row.version,
        reason: "checksum",
      };
    }
  }
  if (highest === null) {
    return { status: "checksum-mismatch", installed: null, pending: [], version: 1, reason: "gap" };
  }
  const pending = MIGRATIONS.filter((migration) => migration.version > highest);
  return { status: pending.length === 0 ? "ok" : "behind", installed: highest, pending };
}

function mismatchError(schema: string, evaluation: Evaluation): SearchSchemaVersionMismatch {
  const version = evaluation.version ?? 0;
  const message: SearchMessage =
    evaluation.reason === "ahead"
      ? { key: "schema.ahead", params: { installed: version, supported: SEARCH_SCHEMA_VERSION } }
      : evaluation.reason === "gap"
        ? { key: "schema.versionGap", params: { version } }
        : { key: "schema.checksumMismatch", params: { version } };
  return new SearchSchemaVersionMismatch(message, {
    details: {
      schema,
      status: evaluation.status,
      installed: evaluation.installed,
      required: SEARCH_SCHEMA_VERSION,
      version,
    },
  });
}

async function readAppliedVersions(
  db: SqlExecutor,
  schema: string,
): Promise<z.output<typeof versionRowSchema>[] | null> {
  const s = schemaIdentifier(schema);
  const presence = await executeSql(
    db,
    statement(
      sql`SELECT to_regclass(format('%I.schema_versions', $1::text)) IS NOT NULL AS installed`,
      [schema],
    ),
    "schema",
  );
  const present = presenceRowSchema.safeParse(presence.rows[0]);
  if (!present.success) throw invalidRow("schema_versions");
  if (!present.data.installed) return null;
  const result = await executeSql(
    db,
    statement(
      sql`SELECT version, name, checksum, package_version FROM ${qualified(s, "schema_versions")} ORDER BY version`,
    ),
    "schema",
  );
  const rows = z.array(versionRowSchema).safeParse(result.rows);
  if (!rows.success) throw invalidRow("schema_versions");
  return rows.data;
}

async function readStoreId(db: SqlExecutor, schema: string): Promise<string> {
  const result = await executeSql(
    db,
    statement(sql`SELECT store_id FROM ${qualified(schemaIdentifier(schema), "store")};`),
    "schema",
  );
  const row = storeRowSchema.safeParse(result.rows[0]);
  if (result.rows.length !== 1 || !row.success) throw invalidRow("store");
  return row.data.store_id;
}

function isTransaction(knex: Knex | Knex.Transaction): knex is Knex.Transaction {
  return knex.isTransaction === true;
}

export async function withSchemaTransaction<T>(
  knex: Knex | Knex.Transaction,
  options: { requireReadCommitted: boolean },
  work: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
  try {
    if (!isTransaction(knex)) {
      return await knex.transaction(work, { isolationLevel: "read committed" });
    }
    if (knex.isCompleted()) {
      throw new SearchInvalidTransaction(
        { key: "error.invalidTransaction" },
        {
          details: { reason: "completed-transaction" },
        },
      );
    }
    if (options.requireReadCommitted) {
      const result = await executeSql(
        knex,
        statement(sql`SELECT current_setting('transaction_isolation') AS isolation`),
        "schema",
      );
      const row = isolationRowSchema.safeParse(result.rows[0]);
      const isolation = row.success ? row.data.isolation : "unknown";
      if (isolation !== "read committed") {
        throw new SearchConfigurationError(
          { key: "schema.isolationNotReadCommitted", params: { isolation } },
          { details: { reason: "isolation-not-read-committed", isolation } },
        );
      }
    }
    return await knex.transaction(work);
  } catch (error) {
    throw mapPgError(error, "schema");
  }
}

export async function assertSchemaUsable(db: SqlExecutor, schema: string): Promise<void> {
  const evaluation = evaluate(await readAppliedVersions(db, schema));
  if (evaluation.status === "ok") return;
  if (evaluation.status === "missing") {
    throw new SearchSchemaMissing(
      { key: "schema.notInstalled", params: { schema } },
      { details: { schema, status: "missing", required: SEARCH_SCHEMA_VERSION } },
    );
  }
  if (evaluation.status === "behind") {
    throw new SearchSchemaVersionMismatch(
      {
        key: "schema.behind",
        params: { installed: evaluation.installed ?? 0, required: SEARCH_SCHEMA_VERSION },
      },
      {
        details: {
          schema,
          status: "behind",
          installed: evaluation.installed,
          required: SEARCH_SCHEMA_VERSION,
        },
      },
    );
  }
  throw mismatchError(schema, evaluation);
}

/** Installs the package schema or applies missing versions; a given transaction must be READ COMMITTED. */
export async function installSearchSchema(
  knex: Knex | Knex.Transaction,
  options?: SearchSchemaOptions,
): Promise<SchemaInstallReport> {
  const schema = resolveSchema(options);
  const s = schemaIdentifier(schema);
  return withSchemaTransaction(knex, { requireReadCommitted: true }, async (trx) => {
    await executeSql(
      trx,
      statement(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('sonamu-search-schema:' || $1, 0))`,
        [schema],
      ),
      "schema",
    );
    const evaluation = evaluate(await readAppliedVersions(trx, schema));
    if (evaluation.status === "ahead" || evaluation.status === "checksum-mismatch") {
      throw mismatchError(schema, evaluation);
    }
    const applied: number[] = [];
    for (const migration of evaluation.pending) {
      await executeSql(trx, statement(migration.render(s)), "schema");
      await executeSql(
        trx,
        statement(
          sql`INSERT INTO ${qualified(s, "schema_versions")} (version, name, checksum, package_version) VALUES ($1, $2, $3, $4)`,
          [
            migration.version,
            migration.name,
            schemaChecksum(migration.version),
            readPackageVersion(),
          ],
        ),
        "schema",
      );
      applied.push(migration.version);
    }
    if (applied.includes(2)) {
      const systemIdentifier = await readSystemIdentifier(trx, schema, "schema");
      const origin = await executeSql(
        trx,
        statement(storeBindingStatementsFor(schema).recordOrigin, [systemIdentifier]),
        "schema",
      );
      if (origin.rows.length !== 1 || !originRowSchema.safeParse(origin.rows[0]).success) {
        throw invalidRow("store");
      }
    }
    const storeId = await readStoreId(trx, schema);
    return { schema, applied, current: SEARCH_SCHEMA_VERSION, storeId };
  });
}

/** Reads the installed schema's compatibility with this package without changing anything. */
export async function checkSearchSchema(
  knex: Knex | Knex.Transaction,
  options?: SearchSchemaOptions,
): Promise<SchemaCompatibilityReport> {
  const schema = resolveSchema(options);
  const evaluation = evaluate(await readAppliedVersions(knex, schema));
  return {
    schema,
    installed: evaluation.installed,
    required: SEARCH_SCHEMA_VERSION,
    status: evaluation.status,
  };
}
