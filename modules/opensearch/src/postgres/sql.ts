import { type Knex } from "knex";
import { z } from "zod";

import { assertSchemaName } from "../definition/names";
import { SearchConfigurationError } from "../errors";
import { mapPgError, type PgErrorContext } from "./pg-errors";

// The only path for identifiers into SQL. A SqlFragment can be built only here (private constructor plus a
// module-private token, since TypeScript does not enforce private at runtime), throws when stringified outside the sql
// tag, and the tag accepts only fragments, so values always travel as bind parameters.

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const PLACEHOLDER_PATTERN = /^[a-z]{1,16}$/;
const MAX_ECHOED_NAME_LENGTH = 80;

let createFragment: (text: string) => SqlFragment;
let readFragment: (fragment: SqlFragment) => string;
let isFragment: <Value>(value: Value) => boolean;
const CONSTRUCTION_TOKEN = Symbol("SqlFragment");

export class SqlFragment {
  readonly #text: string;

  private constructor(token: symbol, text: string) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw new SearchConfigurationError({ key: "sql.invalidFragment" });
    }
    this.#text = String(text);
  }

  static {
    createFragment = (text) => new SqlFragment(CONSTRUCTION_TOKEN, text);
    readFragment = (fragment) => fragment.#text;
    // instanceof alone accepts Object.create(SqlFragment.prototype), so the private field is checked too.
    isFragment = (value) => value instanceof SqlFragment && #text in value;
  }

  toString(): string {
    throw new SearchConfigurationError({ key: "sql.invalidFragment" });
  }

  toJSON(): never {
    throw new SearchConfigurationError({ key: "sql.invalidFragment" });
  }
}

function describeName(value: string): string {
  return value.length > MAX_ECHOED_NAME_LENGTH
    ? `${value.slice(0, MAX_ECHOED_NAME_LENGTH)}…`
    : value;
}

const identifierSchema = z.string().regex(IDENTIFIER_PATTERN);

export function identifier(name: string): SqlFragment {
  const parsed = identifierSchema.safeParse(name);
  if (!parsed.success) {
    throw new SearchConfigurationError({
      key: "sql.invalidIdentifier",
      params: { name: describeName(String(name)) },
    });
  }
  return createFragment(`"${parsed.data}"`);
}

export function schemaIdentifier(schema: string): SqlFragment {
  return identifier(assertSchemaName(schema));
}

export function qualified(schema: SqlFragment, name: string): SqlFragment {
  if (!isFragment(schema)) {
    throw new SearchConfigurationError({ key: "sql.invalidFragment" });
  }
  return createFragment(`${readFragment(schema)}.${readFragment(identifier(name))}`);
}

export function templatePlaceholder(name: string): SqlFragment {
  if (!PLACEHOLDER_PATTERN.test(name)) {
    throw new SearchConfigurationError({
      key: "sql.invalidIdentifier",
      params: { name: describeName(String(name)) },
    });
  }
  return createFragment(`<${name}>`);
}

export function fragmentList(fragments: readonly SqlFragment[]): SqlFragment {
  if (fragments.length === 0 || !fragments.every((fragment) => isFragment(fragment))) {
    throw new SearchConfigurationError({ key: "sql.invalidFragment" });
  }
  return createFragment(fragments.map((fragment) => readFragment(fragment)).join(", "));
}

function isTemplateObject(strings: TemplateStringsArray): boolean {
  return (
    Array.isArray(strings) &&
    Object.isFrozen(strings) &&
    Array.isArray(strings.raw) &&
    Object.isFrozen(strings.raw) &&
    strings.raw.length === strings.length
  );
}

export function sql(
  strings: TemplateStringsArray,
  ...fragments: readonly SqlFragment[]
): SqlFragment {
  if (!isTemplateObject(strings) || strings.length !== fragments.length + 1) {
    throw new SearchConfigurationError({ key: "sql.invalidFragment" });
  }
  let text = strings[0];
  fragments.forEach((fragment, position) => {
    if (!isFragment(fragment)) {
      throw new SearchConfigurationError({ key: "sql.invalidFragment" });
    }
    text += readFragment(fragment) + strings[position + 1];
  });
  return createFragment(text);
}

export function renderSql(fragment: SqlFragment): string {
  if (!isFragment(fragment)) {
    throw new SearchConfigurationError({ key: "sql.invalidFragment" });
  }
  return readFragment(fragment);
}

export type SqlScalar = string | number | boolean | null;
export type SqlValue = SqlScalar | readonly SqlScalar[];

export interface SqlStatement {
  readonly text: string;
  readonly values: readonly SqlValue[];
}

const PLACEHOLDER_REFERENCE = /\$(\d+)/g;

// Never put $<digit> or \\? inside a string literal of the text: the Knex conversion treats it as a placeholder.
export function statement(fragment: SqlFragment, values: readonly SqlValue[] = []): SqlStatement {
  const text = renderSql(fragment);
  if (values.length > 0) {
    const referenced = new Set<number>();
    for (const match of text.matchAll(PLACEHOLDER_REFERENCE)) {
      referenced.add(Number(match[1]));
    }
    const valid =
      [...referenced].every((index) => index >= 1 && index <= values.length) &&
      referenced.size === values.length &&
      !text.includes("\\?");
    if (!valid) {
      throw new SearchConfigurationError({
        key: "sql.invalidPlaceholders",
        params: { placeholders: referenced.size, values: values.length },
      });
    }
  }
  return Object.freeze({ text, values: Object.freeze([...values]) });
}

const timeoutMsSchema = z.number().int().min(1).max(2_147_483_647);
const timeoutSettingsSchema = z.strictObject({
  lockTimeoutMs: timeoutMsSchema,
  statementTimeoutMs: timeoutMsSchema,
  idleInTransactionTimeoutMs: timeoutMsSchema,
});
export type TimeoutSettings = z.infer<typeof timeoutSettingsSchema>;

// Outside a transaction these apply to that one statement only.
export function timeoutStatement(settings: TimeoutSettings): SqlStatement {
  const parsed = timeoutSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    const setting = z.string().safeParse(parsed.error.issues[0]?.path[0]);
    throw new SearchConfigurationError({
      key: "sql.invalidTimeout",
      params: { setting: setting.success ? setting.data : "settings" },
    });
  }
  const { lockTimeoutMs, statementTimeoutMs, idleInTransactionTimeoutMs } = parsed.data;
  return statement(
    sql`SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true),
       set_config('idle_in_transaction_session_timeout', $3, true);`,
    [`${lockTimeoutMs}ms`, `${statementTimeoutMs}ms`, `${idleInTransactionTimeoutMs}ms`],
  );
}

export type SqlExecutor = Pick<Knex, "raw">;

interface KnexRawCall {
  readonly text: string;
  readonly bindings: Knex.RawBinding[];
}

function isValueList(value: SqlValue): value is readonly SqlScalar[] {
  return Array.isArray(value);
}

function toBinding(value: SqlValue): Knex.RawBinding {
  // SAFETY: Knex's RawBinding lists only single-element-type arrays, but pg also serializes arrays containing null.
  return (isValueList(value) ? [...value] : value) as Knex.RawBinding;
}

function toKnexRaw(compiled: SqlStatement): KnexRawCall {
  if (compiled.values.length === 0) {
    // Without values Knex leaves the text alone and sends a simple query (multiple statements allowed).
    return { text: compiled.text, bindings: [] };
  }
  const bindings: Knex.RawBinding[] = [];
  const text = compiled.text.replace(/\?|\$(\d+)/g, (_match, index: string | undefined) => {
    if (index === undefined) return "\\?";
    bindings.push(toBinding(compiled.values[Number(index) - 1] ?? null));
    return "?";
  });
  return { text, bindings };
}

const rawResultSchema = z.object({
  rows: z.array(z.unknown()),
  rowCount: z.number().nullable().optional(),
});
const multiResultSchema = z.array(rawResultSchema);

export interface SqlResult {
  readonly rows: readonly unknown[];
  readonly rowCount: number;
}

export async function executeSql(
  db: SqlExecutor,
  compiled: SqlStatement,
  context: PgErrorContext,
): Promise<SqlResult> {
  const { text, bindings } = toKnexRaw(compiled);
  let raw: unknown;
  try {
    raw = await db.raw(text, bindings);
  } catch (error) {
    throw mapPgError(error, context);
  }
  const single = rawResultSchema.safeParse(raw);
  if (single.success) {
    return { rows: single.data.rows, rowCount: single.data.rowCount ?? single.data.rows.length };
  }
  const multiple = multiResultSchema.safeParse(raw);
  const last = multiple.success ? multiple.data.at(-1) : undefined;
  return { rows: last?.rows ?? [], rowCount: last?.rowCount ?? last?.rows.length ?? 0 };
}
