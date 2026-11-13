import {
  SearchCursorExpired,
  SearchDefinitionMismatch,
  type SearchError,
  SearchInTransactionError,
  SearchNotConfigured,
  SearchNotReady,
  SearchQueryInvalid,
  SearchRebuildRequired,
} from "@sonamu-kit/opensearch";
import { ServiceUnavailableException } from "sonamu";
import { z } from "zod";

import { SD } from "../i18n/sd.generated";

export const SEARCH_DISABLED_CODE = "SearchDisabled";

/** The generated web client drops code and reason, so the screen branches on these; keep web/src/routes/admin/projects/search.tsx in sync. */
export const SEARCH_HTTP_STATUS = {
  invalidQuery: 400,
  unauthorized: 401,
  /** No readable index yet or a rebuild is required: only an operator can fix it. */
  notReady: 409,
  cursorExpired: 410,
  internal: 500,
  disabled: 501,
  unavailable: 503,
} as const;

/** Answered with SEARCH_HTTP_STATUS.disabled by onError in sonamu.config.ts. */
export class SearchDisabledException extends ServiceUnavailableException {
  readonly code = SEARCH_DISABLED_CODE;

  constructor() {
    super(SD("search.disabled"));
  }
}

export interface SearchErrorResponse {
  status: number;
  body: { name: string; code: string; reason: string | null; message: string; retryable: boolean };
}

export function toSearchErrorResponse(error: SearchError, locale: string): SearchErrorResponse {
  // Only a string reason leaves the server; the rest of details stays internal.
  const reason = z.string().safeParse(error.details?.reason);
  const body = {
    name: error.name,
    code: error.code,
    reason: reason.success ? reason.data : null,
    message: error.localize(locale),
    retryable: error.retryable,
  };
  if (error instanceof SearchQueryInvalid) {
    return { status: SEARCH_HTTP_STATUS.invalidQuery, body };
  }
  if (error instanceof SearchCursorExpired) {
    return { status: SEARCH_HTTP_STATUS.cursorExpired, body };
  }
  if (
    error instanceof SearchNotReady ||
    error instanceof SearchNotConfigured ||
    error instanceof SearchRebuildRequired ||
    error instanceof SearchDefinitionMismatch
  ) {
    return { status: SEARCH_HTTP_STATUS.notReady, body };
  }
  if (error instanceof SearchInTransactionError) {
    return { status: SEARCH_HTTP_STATUS.internal, body };
  }
  return { status: SEARCH_HTTP_STATUS.unavailable, body };
}
