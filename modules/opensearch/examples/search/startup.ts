import {
  type PostgresSynchronization,
  createPostgresSynchronization,
} from "@sonamu-kit/opensearch/postgres";
import { resolveSonamuPrimary } from "@sonamu-kit/opensearch/sonamu";

import { SEARCH_NAMESPACE, searchSynchronization } from "./client";

/** Await before the server accepts requests (onReady, not onStart): marking fails until the store identity is fixed. */
export async function initializeSearchStore(): Promise<void> {
  await searchSynchronization.initialize();
}

/** Use this instead of searchSynchronization in client.ts, never both. */
export function createPinnedSearchSynchronization(
  expectedStoreId: string,
): PostgresSynchronization {
  return createPostgresSynchronization({
    getPrimaryDatabase: resolveSonamuPrimary,
    namespace: SEARCH_NAMESPACE,
    expectedStoreId,
  });
}
