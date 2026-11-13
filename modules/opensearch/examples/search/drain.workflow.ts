import { Client } from "@opensearch-project/opensearch";
import {
  RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  RECOMMENDED_WORKER_LIMITS,
} from "@sonamu-kit/opensearch";
import { createSearchClient } from "@sonamu-kit/opensearch";
import { createIndexer } from "@sonamu-kit/opensearch/postgres";
import { workflow } from "sonamu";

import { chatMessagesSearch } from "./chat-messages.definition";
import { searchSynchronization } from "./client";

// Create one indexer per module and reuse it, so overlapping runs return "busy" instead of doubling the load.
const MAX_DRAINS_PER_RUN = 20;

const drainClient = createSearchClient({
  createClient: () => new Client({ node: process.env.OPENSEARCH_URL ?? "http://localhost:9200" }),
  ownsClient: true,
  requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
});
const drainIndexer = createIndexer({
  client: drainClient,
  synchronization: searchSynchronization,
  definitions: [chatMessagesSearch],
  limits: RECOMMENDED_WORKER_LIMITS,
});

export const searchDrainWorkflow = workflow(
  { name: "search_drain", schedules: [{ expression: "* * * * *" }] },
  async ({ step }) => {
    await step
      .define({ name: "drain" }, async () => {
        let indexed = 0;
        for (let round = 0; round < MAX_DRAINS_PER_RUN; round += 1) {
          const report = await drainIndexer.drainOnce();
          indexed += report.indexed;
          if (report.outcome === "busy" || report.claimed === 0 || report.cooldownRemainingMs > 0) {
            break;
          }
        }
        return { indexed };
      })
      .run();
  },
);
