import { Client } from "@opensearch-project/opensearch";
import {
  createSearchClient,
  RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  RECOMMENDED_QUERY_LIMITS,
} from "@sonamu-kit/opensearch";
import { createPostgresSynchronization } from "@sonamu-kit/opensearch/postgres";
import {
  createSonamuSearchQueries,
  createSonamuSynchronization,
  resolveSonamuPrimary,
} from "@sonamu-kit/opensearch/sonamu";

import { type ChatMessageDocument, chatMessagesSearch } from "./chat-messages.definition";

// The application owns these handles; keep credentials and signing keys out of code.
export const SEARCH_NAMESPACE = process.env.SEARCH_NAMESPACE ?? "chat-production";

/** Shared by the query handle and the worker; the application closes it at shutdown. */
export const searchClient = createSearchClient({
  createClient: () => new Client({ node: process.env.OPENSEARCH_URL ?? "http://localhost:9200" }),
  ownsClient: true,
  requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
});

export const searchSynchronization = createPostgresSynchronization({
  getPrimaryDatabase: resolveSonamuPrimary,
  namespace: SEARCH_NAMESPACE,
});
export const chatSearchSync = createSonamuSynchronization(searchSynchronization);

/** At least 32 bytes; when rotating, put the new key first and the old one after it. */
function cursorSigningSecret(): Uint8Array {
  return Buffer.from(process.env.SEARCH_CURSOR_SECRET ?? "", "base64");
}

/** Never call inside a transaction: it refuses with SearchInTransactionError. */
export const chatMessageQueries = createSonamuSearchQueries<ChatMessageDocument>({
  client: searchClient,
  catalog: { namespace: SEARCH_NAMESPACE },
  logicalKey: chatMessagesSearch.key,
  supportedFingerprints: [chatMessagesSearch.fingerprint],
  limits: RECOMMENDED_QUERY_LIMITS,
  cursor: { signingKeys: [{ id: "k1", secret: cursorSigningSecret() }] },
  // Do not load the body from the index; it is read again from the primary.
  policy: { sourceIncludes: ["updated_at"] },
});
