// Messages come from catalogue keys and parameters (src/i18n); parameters and details never carry document bodies,
// query bodies or credentials. retryable: the same call may succeed later without changing code or configuration.
import {
  formatSearchMessage,
  type SearchMessage,
  type SearchMessageKey,
  type SearchMessageParamValue,
} from "./i18n";

export const SEARCH_ERROR_CODES = [
  "SEARCH_NOT_CONFIGURED",
  "SEARCH_UNAVAILABLE",
  "SEARCH_TIMEOUT",
  "SEARCH_QUERY_INVALID",
  "SEARCH_DEFINITION_MISMATCH",
  "SEARCH_REBUILD_REQUIRED",
  "SEARCH_NOT_READY",
  "SEARCH_STOPPING",
  "SEARCH_IN_TRANSACTION",
  "SEARCH_CATALOG_UNAVAILABLE",
  "SEARCH_CURSOR_EXPIRED",
  "SEARCH_CONFIGURATION_ERROR",
  "SEARCH_SCHEMA_MISSING",
  "SEARCH_SCHEMA_VERSION_MISMATCH",
  "SEARCH_INVALID_TRANSACTION",
  "SEARCH_STORE_MISMATCH",
  "SEARCH_NO_WRITE_TARGET",
  "SEARCH_INVALID_DOCUMENT_ID",
  "SEARCH_REVISION_OVERFLOW",
  "SEARCH_REVISION_DIVERGENCE",
  "SEARCH_PROJECTION_ERROR",
  "SEARCH_TARGET_UNAVAILABLE",
  "SEARCH_ADMIN_BUSY",
  "SEARCH_ADMIN_LEASE_LOST",
  "SEARCH_ADMIN_PRECONDITION_FAILED",
] as const;

export type SearchErrorCode = (typeof SEARCH_ERROR_CODES)[number];

export type SearchErrorDetail = string | number | boolean | null;

export interface SearchErrorOptions {
  cause?: unknown;
  retryable?: boolean;
  details?: Readonly<Record<string, SearchErrorDetail>>;
}

export abstract class SearchError extends Error {
  abstract readonly code: SearchErrorCode;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, SearchErrorDetail>> | undefined;
  readonly messageKey: SearchMessageKey;
  readonly messageParams: Readonly<Record<string, SearchMessageParamValue>> | undefined;
  readonly #message: SearchMessage;

  protected constructor(
    message: SearchMessage,
    defaultRetryable: boolean,
    options: SearchErrorOptions = {},
  ) {
    super(
      formatSearchMessage(message),
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = new.target.name;
    this.retryable = options.retryable ?? defaultRetryable;
    this.details =
      options.details === undefined ? undefined : Object.freeze({ ...options.details });
    const params = message.params === undefined ? undefined : Object.freeze({ ...message.params });
    // SAFETY: the parameters were only replaced by a frozen copy; the key and parameters still pair.
    this.#message = { key: message.key, params } as SearchMessage;
    this.messageKey = message.key;
    this.messageParams = params;
  }

  /** Re-renders the message in locale; message itself uses the package locale at construction. */
  localize(locale: string): string {
    return formatSearchMessage(this.#message, locale);
  }
}

/** A logical key or target that is not configured. */
export class SearchNotConfigured extends SearchError {
  readonly code = "SEARCH_NOT_CONFIGURED" as const;

  constructor(
    message: SearchMessage = { key: "error.notConfigured" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

export class SearchUnavailable extends SearchError {
  readonly code = "SEARCH_UNAVAILABLE" as const;

  constructor(message: SearchMessage = { key: "error.unavailable" }, options?: SearchErrorOptions) {
    super(message, true, options);
  }
}

export class SearchTimeout extends SearchError {
  readonly code = "SEARCH_TIMEOUT" as const;

  constructor(message: SearchMessage = { key: "error.timeout" }, options?: SearchErrorOptions) {
    super(message, true, options);
  }
}

/** A search body outside the allowlist, or a request beyond its limits. */
export class SearchQueryInvalid extends SearchError {
  readonly code = "SEARCH_QUERY_INVALID" as const;

  constructor(
    message: SearchMessage = { key: "error.queryInvalid" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

/** This process does not support the read target's fingerprint. */
export class SearchDefinitionMismatch extends SearchError {
  readonly code = "SEARCH_DEFINITION_MISMATCH" as const;

  constructor(
    message: SearchMessage = { key: "error.definitionMismatch" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

/** Capture is suspended; search is unavailable until a new target is created and cut over. */
export class SearchRebuildRequired extends SearchError {
  readonly code = "SEARCH_REBUILD_REQUIRED" as const;

  constructor(
    message: SearchMessage = { key: "error.rebuildRequired" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

/** There is no read target yet (before the first cutover). */
export class SearchNotReady extends SearchError {
  readonly code = "SEARCH_NOT_READY" as const;

  constructor(message: SearchMessage = { key: "error.notReady" }, options?: SearchErrorOptions) {
    super(message, true, options);
  }
}

export class SearchStopping extends SearchError {
  readonly code = "SEARCH_STOPPING" as const;

  constructor(message: SearchMessage = { key: "error.stopping" }, options?: SearchErrorOptions) {
    super(message, false, options);
  }
}

export class SearchInTransactionError extends SearchError {
  readonly code = "SEARCH_IN_TRANSACTION" as const;

  constructor(
    message: SearchMessage = { key: "error.inTransaction" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

/** The catalog lookup failed; a cached pointer is never used instead. */
export class SearchCatalogUnavailable extends SearchError {
  readonly code = "SEARCH_CATALOG_UNAVAILABLE" as const;

  constructor(
    message: SearchMessage = { key: "error.catalogUnavailable" },
    options?: SearchErrorOptions,
  ) {
    super(message, true, options);
  }
}

/** The cursor expired, or its signature, query hash or target state does not match. */
export class SearchCursorExpired extends SearchError {
  readonly code = "SEARCH_CURSOR_EXPIRED" as const;

  constructor(
    message: SearchMessage = { key: "error.cursorExpired" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

/** Invalid configuration, as opposed to a transient failure. */
export class SearchConfigurationError extends SearchError {
  readonly code = "SEARCH_CONFIGURATION_ERROR" as const;

  constructor(
    message: SearchMessage = { key: "error.configuration" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

export class SearchSchemaMissing extends SearchError {
  readonly code = "SEARCH_SCHEMA_MISSING" as const;

  constructor(
    message: SearchMessage = { key: "error.schemaMissing" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

export class SearchSchemaVersionMismatch extends SearchError {
  readonly code = "SEARCH_SCHEMA_VERSION_MISMATCH" as const;

  constructor(
    message: SearchMessage = { key: "error.schemaVersionMismatch" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

/** Not a transaction, or already finished; no new transaction is opened. */
export class SearchInvalidTransaction extends SearchError {
  readonly code = "SEARCH_INVALID_TRANSACTION" as const;

  constructor(
    message: SearchMessage = { key: "error.invalidTransaction" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

/** The transaction's database belongs to a different store than the configured or pinned one. */
export class SearchStoreMismatch extends SearchError {
  readonly code = "SEARCH_STORE_MISMATCH" as const;

  constructor(
    message: SearchMessage = { key: "error.storeMismatch" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

export class SearchNoWriteTarget extends SearchError {
  readonly code = "SEARCH_NO_WRITE_TARGET" as const;

  constructor(
    message: SearchMessage = { key: "error.noWriteTarget" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

export class SearchInvalidDocumentId extends SearchError {
  readonly code = "SEARCH_INVALID_DOCUMENT_ID" as const;

  constructor(
    message: SearchMessage = { key: "error.invalidDocumentId" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

export class SearchRevisionOverflow extends SearchError {
  readonly code = "SEARCH_REVISION_OVERFLOW" as const;

  constructor(
    message: SearchMessage = { key: "error.revisionOverflow" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

/** The indexed version is above the ledger, or the same version has a different hash. */
export class SearchRevisionDivergence extends SearchError {
  readonly code = "SEARCH_REVISION_DIVERGENCE" as const;

  constructor(
    message: SearchMessage = { key: "error.revisionDivergence" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

export class SearchProjectionError extends SearchError {
  readonly code = "SEARCH_PROJECTION_ERROR" as const;

  constructor(message: SearchMessage = { key: "error.projection" }, options?: SearchErrorOptions) {
    super(message, false, options);
  }
}

export class SearchTargetUnavailable extends SearchError {
  readonly code = "SEARCH_TARGET_UNAVAILABLE" as const;

  constructor(
    message: SearchMessage = { key: "error.targetUnavailable" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}

/** Another admin operation holds the lease, or a lock was not acquired in time. */
export class SearchAdminBusy extends SearchError {
  readonly code = "SEARCH_ADMIN_BUSY" as const;

  constructor(message: SearchMessage = { key: "error.adminBusy" }, options?: SearchErrorOptions) {
    super(message, true, options);
  }
}

/** The admin lease expired or passed to another operation, so the work stopped. */
export class SearchAdminLeaseLost extends SearchError {
  readonly code = "SEARCH_ADMIN_LEASE_LOST" as const;

  constructor(
    message: SearchMessage = { key: "error.adminLeaseLost" },
    options?: SearchErrorOptions,
  ) {
    super(message, true, options);
  }
}

/** An admin precondition (build phase, epoch, read target CAS) does not hold. */
export class SearchAdminPreconditionFailed extends SearchError {
  readonly code = "SEARCH_ADMIN_PRECONDITION_FAILED" as const;

  constructor(
    message: SearchMessage = { key: "error.adminPreconditionFailed" },
    options?: SearchErrorOptions,
  ) {
    super(message, false, options);
  }
}
