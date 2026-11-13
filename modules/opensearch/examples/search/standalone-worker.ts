import { setInterval } from "node:timers";

import { Client } from "@opensearch-project/opensearch";
import {
  createSearchClient,
  RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  RECOMMENDED_WORKER_LIMITS,
  RECOMMENDED_WORKER_POLL_INTERVAL_MS,
  RECOMMENDED_WORKER_STOP_DEADLINE_MS,
} from "@sonamu-kit/opensearch";
import { createIndexer, createPostgresSynchronization } from "@sonamu-kit/opensearch/postgres";
import knexFactory from "knex";

import { chatMessagesSearch } from "./chat-messages.definition";
import {
  createWorkerEventListener,
  reportWorkerState,
  type SearchLogger,
  type SearchMetrics,
} from "./worker-events";

/** Use defineSearch definitions here (no Sonamu), and set the orchestrator's termination grace longer than the stop deadline. */
export async function runStandaloneWorker(
  log: SearchLogger,
  metrics: SearchMetrics,
): Promise<void> {
  const knex = knexFactory({
    client: "pg",
    connection: process.env.SEARCH_WORKER_DATABASE_URL,
    pool: { min: 0, max: 4 },
  });
  const synchronization = createPostgresSynchronization({
    getPrimaryDatabase: () => knex,
    // Must match the API process namespace (client.ts).
    namespace: process.env.SEARCH_NAMESPACE ?? "chat-production",
  });
  const indexer = createIndexer({
    client: createSearchClient({
      createClient: () =>
        new Client({ node: process.env.OPENSEARCH_URL ?? "http://localhost:9200" }),
      ownsClient: true,
      requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
    }),
    synchronization,
    definitions: [chatMessagesSearch],
    limits: RECOMMENDED_WORKER_LIMITS,
    onEvent: createWorkerEventListener(log, metrics),
  });

  // Fail before starting the loop if the primary or the search schema is unreachable.
  await synchronization.initialize();
  const handle = indexer.start({ pollIntervalMs: RECOMMENDED_WORKER_POLL_INTERVAL_MS });
  const stateTimer = setInterval(() => reportWorkerState(metrics, handle.status().state), 10_000);

  await new Promise<void>((resolve) => {
    process.once("SIGTERM", () => resolve());
    process.once("SIGINT", () => resolve());
  });

  clearInterval(stateTimer);
  // stop also closes the client wrapper; do not close it again.
  const report = await handle.stop({ deadlineMs: RECOMMENDED_WORKER_STOP_DEADLINE_MS });
  log.info("search worker stopped", {
    drained: String(report.drained),
    abortedInFlight: report.abortedInFlight,
    abandonedDrains: report.abandonedDrains,
    elapsedMs: report.elapsedMs,
  });
  await knex.destroy();
}
