import { type PuriTransactionWrapper } from "sonamu";

import { getSearchHandles } from "./index";

export const PROJECTS_SEARCH_KEY = "projects";

/** Call once per transaction with every affected id; with search on and no target yet, it fails the transaction. */
export async function markProjectsChanged(
  trx: PuriTransactionWrapper,
  ids: readonly number[],
): Promise<void> {
  const handles = getSearchHandles();
  if (handles === undefined || ids.length === 0) {
    return;
  }
  // Idempotent; reads on its own pool connection, outside trx.
  await handles.synchronization.initialize();
  const documentIds = [...new Set(ids)].map(String).sort();
  await handles.sonamu.markChangedIn(trx, PROJECTS_SEARCH_KEY, documentIds);
}
