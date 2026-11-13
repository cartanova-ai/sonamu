import {
  registerSearchMessages,
  SearchCursorExpired,
  type SearchError,
  SearchInTransactionError,
  SearchQueryInvalid,
} from "@sonamu-kit/opensearch";

// Branch on the error class, code, retryable and details.reason, never on the message.
export interface SearchErrorResponse {
  status: number;
  body: { code: string; message: string; retryable: boolean };
}

export function toSearchErrorResponse(error: SearchError, locale: string): SearchErrorResponse {
  const body = { code: error.code, message: error.localize(locale), retryable: error.retryable };
  if (error instanceof SearchQueryInvalid || error instanceof SearchCursorExpired) {
    return { status: 400, body };
  }
  // Searching inside a transaction is a server bug.
  if (error instanceof SearchInTransactionError) return { status: 500, body };
  return { status: error.retryable ? 503 : 500, body };
}

/** Call once at startup; missing keys fall back to English. */
export function registerJapaneseSearchMessages(): void {
  registerSearchMessages("ja", {
    "error.notReady": "検索インデックスはまだ準備できていません。",
    "error.rebuildRequired": "検索インデックスの再構築が必要です。",
    "error.cursorExpired": "検索カーソルの有効期限が切れました。もう一度検索してください。",
  });
}
