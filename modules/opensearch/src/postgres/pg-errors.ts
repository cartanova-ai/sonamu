import { z } from "zod";

import {
  SearchAdminBusy,
  SearchCatalogUnavailable,
  SearchConfigurationError,
  SearchError,
  type SearchErrorDetail,
  SearchInvalidTransaction,
  SearchRevisionOverflow,
  SearchSchemaMissing,
  SearchTimeout,
  SearchUnavailable,
} from "../errors";

// pg and Knex message text can contain values or SQL and is never used, nor is the original error attached as cause;
// only the SQLSTATE and identifier-shaped fields reach details.

export type PgErrorContext = "schema" | "capture" | "worker" | "catalog" | "admin";

export type PgErrorReason =
  | "serialization-failure"
  | "deadlock"
  | "lock-timeout"
  | "statement-canceled"
  | "undefined-table"
  | "undefined-schema"
  | "check-violation"
  | "read-only-transaction"
  | "failed-transaction"
  | "insufficient-privilege"
  | "duplicate-object"
  | "undefined-object"
  | "connection"
  | "unclassified"
  | "driver-error";

// pg's DatabaseError always carries the SQLSTATE (code) and severity; requiring severity tells it apart from Node
// system errors with five-letter codes such as EPIPE.
const databaseErrorSchema = z.object({
  code: z.string().regex(/^[0-9A-Z]{5}$/),
  severity: z.string().min(1),
  constraint: z.string().optional(),
  table: z.string().optional(),
  column: z.string().optional(),
});
const namedErrorSchema = z.object({
  name: z.string().optional(),
  code: z.string().optional(),
});

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
]);
const REVISION_CONSTRAINTS = new Set([
  "documents_revision_safe_integer",
  "deliveries_desired_revision_check",
]);

export interface PgErrorInfo {
  readonly sqlstate: string;
  readonly constraint?: string;
  readonly table?: string;
  readonly column?: string;
}

function safeIdentifier(value: string | undefined): string | undefined {
  return value !== undefined && SAFE_IDENTIFIER.test(value) ? value : undefined;
}

export function readPgError<Thrown>(error: Thrown): PgErrorInfo | undefined {
  const parsed = databaseErrorSchema.safeParse(error);
  if (!parsed.success) return undefined;
  return {
    sqlstate: parsed.data.code,
    constraint: safeIdentifier(parsed.data.constraint),
    table: safeIdentifier(parsed.data.table),
    column: safeIdentifier(parsed.data.column),
  };
}

function classify(sqlstate: string): PgErrorReason {
  switch (sqlstate) {
    case "40001":
      return "serialization-failure";
    case "40P01":
      return "deadlock";
    case "55P03":
      return "lock-timeout";
    case "57014":
      return "statement-canceled";
    case "42P01":
      return "undefined-table";
    case "3F000":
      return "undefined-schema";
    case "23514":
      return "check-violation";
    case "25006":
      return "read-only-transaction";
    case "25P02":
      return "failed-transaction";
    case "42501":
      return "insufficient-privilege";
    case "42P06":
    case "42P07":
    case "42710":
      return "duplicate-object";
    case "42704":
      return "undefined-object";
    default:
      break;
  }
  // 08 connection, 53 insufficient resources, 57P0x server shutdown or restart, 58 system error.
  if (/^(08|53|58)/.test(sqlstate) || /^57P0[1-5]$/.test(sqlstate)) {
    return "connection";
  }
  return "unclassified";
}

type Details = Readonly<Record<string, SearchErrorDetail>>;

function unavailable(context: PgErrorContext, details: Details, sqlstate: string): SearchError {
  const message = { key: "pg.unavailable", params: { sqlstate } } as const;
  return context === "catalog"
    ? new SearchCatalogUnavailable(message, { details })
    : new SearchUnavailable(message, { details });
}

function fromDatabaseError(info: PgErrorInfo, context: PgErrorContext): SearchError {
  const { sqlstate } = info;
  const reason = classify(sqlstate);
  const identifiers = (["constraint", "table", "column"] as const).flatMap((field) => {
    const value = info[field];
    return value === undefined ? [] : [[field, value] as const];
  });
  const details = Object.fromEntries([["sqlstate", sqlstate], ["reason", reason], ...identifiers]);

  switch (reason) {
    case "serialization-failure":
    case "deadlock": {
      const message = { key: "pg.transactionConflict", params: { sqlstate } } as const;
      if (context === "admin") return new SearchAdminBusy(message, { details });
      if (context === "catalog") return new SearchCatalogUnavailable(message, { details });
      return new SearchUnavailable(message, { details });
    }
    case "lock-timeout":
    case "statement-canceled": {
      const message = { key: "pg.lockTimeout", params: { sqlstate } } as const;
      return context === "admin"
        ? new SearchAdminBusy(message, { details })
        : new SearchTimeout(message, { details });
    }
    case "undefined-table":
    case "undefined-schema":
      return new SearchSchemaMissing(
        { key: "pg.schemaMissing", params: { sqlstate } },
        { details },
      );
    case "check-violation":
      if (info.constraint !== undefined && REVISION_CONSTRAINTS.has(info.constraint)) {
        return new SearchRevisionOverflow(
          { key: "pg.revisionOutOfRange", params: { constraint: info.constraint } },
          { details },
        );
      }
      return new SearchConfigurationError(
        { key: "pg.checkViolation", params: { constraint: info.constraint ?? "" } },
        { details },
      );
    case "read-only-transaction":
      return new SearchInvalidTransaction({ key: "pg.readOnlyTransaction" }, { details });
    case "failed-transaction":
      return new SearchInvalidTransaction({ key: "pg.failedTransaction" }, { details });
    case "insufficient-privilege":
      return new SearchConfigurationError(
        { key: "pg.insufficientPrivilege", params: { sqlstate } },
        { details },
      );
    case "duplicate-object":
      return new SearchConfigurationError(
        { key: "pg.duplicateObject", params: { sqlstate } },
        { details },
      );
    case "undefined-object":
      return new SearchConfigurationError(
        { key: "pg.undefinedObject", params: { sqlstate } },
        { details },
      );
    case "connection":
      return unavailable(context, details, sqlstate);
    default: {
      const message = { key: "pg.statementFailed", params: { sqlstate } } as const;
      return context === "catalog"
        ? new SearchCatalogUnavailable(message, { details, retryable: false })
        : new SearchUnavailable(message, { details, retryable: false });
    }
  }
}

export function mapPgError<Thrown>(error: Thrown, context: PgErrorContext): SearchError {
  if (error instanceof SearchError) return error;
  const info = readPgError(error);
  if (info !== undefined) return fromDatabaseError(info, context);

  const named = namedErrorSchema.safeParse(error);
  const name = named.success ? named.data.name : undefined;
  const code = named.success ? named.data.code : undefined;
  const connectionCode = code !== undefined && CONNECTION_ERROR_CODES.has(code) ? code : undefined;
  const details = Object.fromEntries([
    ["reason", connectionCode === undefined ? "driver-error" : "connection"],
    ...(name !== undefined && SAFE_ERROR_NAME.test(name) ? [["errorName", name] as const] : []),
    ...(connectionCode === undefined ? [] : [["errorCode", connectionCode] as const]),
  ]);
  const message = { key: "pg.driverError" } as const;
  return context === "catalog"
    ? new SearchCatalogUnavailable(message, { details })
    : new SearchUnavailable(message, { details });
}
