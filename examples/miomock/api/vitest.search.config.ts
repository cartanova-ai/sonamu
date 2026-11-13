import { defineConfig } from "vitest/config";

import { PrioritySequencer } from "./custom-sequencer";
import { SEARCH_IT_DATABASE } from "./src/search/testing/constants";

/*
  The worker reads committed rows on other connections, so these tests use neither the Sonamu test transaction nor
  test mode. The files share one database and index and run one at a time in file name order.
*/
export default defineConfig({
  test: {
    include: ["src/**/*.search.test.ts"],
    globalSetup: ["./src/search/testing/global-setup.ignore.ts"],
    setupFiles: ["./src/search/testing/setup-env.ts"],
    env: {
      NODE_ENV: "development",
      SONAMU_DB_NAME: SEARCH_IT_DATABASE,
      MIOMOCK_SEARCH_ENABLED: "true",
      MIOMOCK_SEARCH_WORKER: "true",
      // Shortens INDEXING_WAIT_MS (testing/helpers.ts) to 41 s.
      MIOMOCK_SEARCH_WORKER_STAGE_TIMEOUT_MS: "10000",
    },
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { sequencer: PrioritySequencer },
    // Leaves room for the verification wait in resume-target-cli.search.test.ts and a failing indexing wait's diagnostics.
    testTimeout: 240_000,
    hookTimeout: 300_000,
  },
});
