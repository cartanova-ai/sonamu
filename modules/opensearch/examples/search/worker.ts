import { Client } from "@opensearch-project/opensearch";
import {
  RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  RECOMMENDED_WORKER_LIMITS,
  RECOMMENDED_WORKER_POLL_INTERVAL_MS,
  RECOMMENDED_WORKER_STOP_DEADLINE_MS,
} from "@sonamu-kit/opensearch";
import {
  createSearchLifecycle,
  getSearchLifecycleStatus,
  type SearchLifecycleStatus,
} from "@sonamu-kit/opensearch/sonamu";

import { chatMessagesSearch } from "./chat-messages.definition";
import { searchClient, searchSynchronization } from "./client";

// Keep the name stable: HMR replaces the lifecycle of the same name, so only one loop runs.
const LIFECYCLE_NAME = "chat-search";

export const searchLifecycle = createSearchLifecycle({
  name: LIFECYCLE_NAME,
  synchronization: searchSynchronization,
  worker: {
    enabled: process.env.SEARCH_WORKER === "1",
    // Worker-only client: the lifecycle creates and closes it.
    client: {
      createClient: () =>
        new Client({ node: process.env.OPENSEARCH_URL ?? "http://localhost:9200" }),
      ownsClient: true,
      requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
    },
    definitions: [chatMessagesSearch],
    limits: RECOMMENDED_WORKER_LIMITS,
    pollIntervalMs: RECOMMENDED_WORKER_POLL_INTERVAL_MS,
  },
  // onShutdown does not close these; the application closes them at process exit (shutdownSearch).
  clients: [searchClient],
  stopDeadlineMs: RECOMMENDED_WORKER_STOP_DEADLINE_MS,
});

export async function shutdownSearch(): Promise<void> {
  await searchLifecycle.onShutdown();
  await searchClient.close();
}

export interface SearchHealth {
  readonly ready: boolean;
  readonly state: SearchLifecycleStatus["state"] | "absent";
  /** Not empty means an operator must act. */
  readonly fenceLostTargets: readonly string[];
}

export function searchHealth(): SearchHealth {
  const status = getSearchLifecycleStatus(LIFECYCLE_NAME);
  if (status === undefined) return { ready: false, state: "absent", fenceLostTargets: [] };
  return {
    ready: status.state === "running",
    state: status.state,
    fenceLostTargets: status.worker?.fenceLostTargets ?? [],
  };
}
