import type { Knex } from "knex";
import { BackendPostgres, defineConfig } from "../src/index";

const config: Knex.Config = {
  client: "pg",
  connection: {
    host: "localhost",
    port: 51000,
    user: "postgres",
    password: "postgres",
    database: "postgres",
  },
} as const;

// Use Postgres (configured with Knex config)
const backend = new BackendPostgres(config, {
  runMigrations: false,
});

export default defineConfig({
  backend,
});
