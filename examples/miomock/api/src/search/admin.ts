import {
  type DefinedSearch,
  RECOMMENDED_ADMIN_LIFETIMES,
  RECOMMENDED_ADMIN_TIMEOUTS,
  RECOMMENDED_CUTOVER,
  type SearchClient,
  workerBoundsFrom,
} from "@sonamu-kit/opensearch";
import { createSearchAdmin, type SearchAdmin } from "@sonamu-kit/opensearch/admin";
import { type PostgresSynchronization } from "@sonamu-kit/opensearch/postgres";

import { projectsSearchDefinitions } from "./projects.definition";
import { searchWorkerLimits } from "./worker-limits";

/** Shared with the search CLI setup, so both handles record and enforce the same values. */
export const MIOMOCK_SEARCH_ADMIN_SETTINGS = {
  lifetimes: RECOMMENDED_ADMIN_LIFETIMES,
  timeouts: RECOMMENDED_ADMIN_TIMEOUTS,
  cutover: RECOMMENDED_CUTOVER,
};

/** lifetimes are recorded with the first target and can never be lowered; workerBounds must match the real worker limits. */
export function createMiomockSearchAdmin(options: {
  client: SearchClient;
  synchronization: PostgresSynchronization;
  definitions?: readonly DefinedSearch[];
}): SearchAdmin {
  return createSearchAdmin({
    client: options.client,
    synchronization: options.synchronization,
    definitions: options.definitions ?? projectsSearchDefinitions,
    ...MIOMOCK_SEARCH_ADMIN_SETTINGS,
    workerBounds: workerBoundsFrom(searchWorkerLimits()),
  });
}
