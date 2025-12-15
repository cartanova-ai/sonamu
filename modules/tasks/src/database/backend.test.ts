import { randomUUID } from "node:crypto";
import { KNEX_GLOBAL_CONFIG } from "../testing/connection";
import { BackendPostgres } from "./backend";
import { testBackend } from "./backend.testsuite";

testBackend({
  setup: async () => {
    return await BackendPostgres.connect(KNEX_GLOBAL_CONFIG, {
      namespaceId: randomUUID(),
    });
  },
  teardown: async (backend) => {
    await (backend as BackendPostgres).stop();
  },
});
