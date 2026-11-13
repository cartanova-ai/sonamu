import { Client } from "@opensearch-project/opensearch";
import {
  RECOMMENDED_ADMIN_LIFETIMES,
  RECOMMENDED_ADMIN_TIMEOUTS,
  RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  RECOMMENDED_CUTOVER,
  RECOMMENDED_WORKER_LIMITS,
} from "@sonamu-kit/opensearch";
import { type SearchCliSetup } from "@sonamu-kit/opensearch/sonamu";

import { chatMessagesSearch } from "./chat-messages.definition";
import { searchSynchronization } from "./client";

/** Imported by sonamu.config.ts only when a `sonamu search` command runs. */
export function chatSearchCliSetup(): SearchCliSetup {
  return {
    // During a rebuild, list the new definition first and keep the old one until its target is retired.
    definitions: [chatMessagesSearch],
    synchronization: searchSynchronization,
    // Admin credentials; the plugin creates a client per command and closes it.
    client: () => ({
      createClient: () =>
        new Client({ node: process.env.OPENSEARCH_ADMIN_URL ?? "http://localhost:9200" }),
      ownsClient: true,
      requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
    }),
    // The same values as the application's admin handle and query handles.
    admin: {
      lifetimes: RECOMMENDED_ADMIN_LIFETIMES,
      timeouts: RECOMMENDED_ADMIN_TIMEOUTS,
      cutover: RECOMMENDED_CUTOVER,
    },
    // The worker's limits (examples/search/worker.ts); retirement waits by them.
    workerLimits: RECOMMENDED_WORKER_LIMITS,
  };
}
