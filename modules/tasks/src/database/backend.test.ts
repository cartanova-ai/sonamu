import { randomUUID } from "node:crypto";

import { KNEX_GLOBAL_CONFIG } from "../testing/connection";
import { BackendPostgres } from "./backend";
import { testBackend } from "./backend.testsuite";

testBackend({
  setup: async () => {
    const backend = new BackendPostgres(KNEX_GLOBAL_CONFIG, {
      namespaceId: randomUUID(),
      runMigrations: false,
    });
    await backend.initialize();
    return backend;
  },
  teardown: async (backend) => {
    await (backend as BackendPostgres).stop();
  },
});
