import { type SearchCliSetup } from "@sonamu-kit/opensearch/sonamu";

import { MIOMOCK_SEARCH_ADMIN_SETTINGS } from "./admin";
import { miomockSearchClientOptions } from "./client";
import { createMiomockSynchronization, requireOpenSearchUrl } from "./index";
import { projectsSearchDefinitions } from "./projects.definition";
import { searchWorkerLimits } from "./worker-limits";

/** Loaded by sonamu.config.ts only when a `sonamu search` command runs; works regardless of MIOMOCK_SEARCH_ENABLED. */
export function loadSearchCliSetup(): SearchCliSetup {
  return {
    definitions: projectsSearchDefinitions,
    synchronization: createMiomockSynchronization(),
    // Read per command, so PostgreSQL-only commands still run without OPENSEARCH_URL.
    client: () => miomockSearchClientOptions(requireOpenSearchUrl()),
    admin: MIOMOCK_SEARCH_ADMIN_SETTINGS,
    workerLimits: searchWorkerLimits(),
  };
}
