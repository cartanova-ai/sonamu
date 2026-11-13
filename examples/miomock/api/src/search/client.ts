import { Client } from "@opensearch-project/opensearch";
import {
  createSearchClient,
  RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  type SearchClient,
  type SearchClientOptions,
} from "@sonamu-kit/opensearch";

/** Options, not a client: the worker lifecycle creates and closes its own client per generation. */
export function miomockSearchClientOptions(url: string): SearchClientOptions {
  return {
    createClient: () => new Client({ node: url }),
    ownsClient: true,
    requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  };
}

export function createMiomockSearchClient(url: string): SearchClient {
  return createSearchClient(miomockSearchClientOptions(url));
}
