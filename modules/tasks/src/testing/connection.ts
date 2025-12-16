import { randomUUID } from "node:crypto";
import knex, { type Knex } from "knex";
import { BackendPostgres } from "../database/backend";
import { migrate as baseMigrate, DEFAULT_SCHEMA } from "../database/base";

let backend: BackendPostgres | null = null;

export const KNEX_GLOBAL_CONFIG: Knex.Config = {
  client: "pg",
  connection: {
    host: "localhost",
    port: 51000,
    user: "postgres",
    password: "postgres",
    database: "postgres",
  },
  pool: {
    max: 50,
  },
} as const;

export async function migrate(): Promise<void> {
  await baseMigrate(knex(KNEX_GLOBAL_CONFIG), DEFAULT_SCHEMA);
}

export async function createBackend(): Promise<BackendPostgres> {
  if (backend) {
    return backend;
  }

  backend = await BackendPostgres.connect(KNEX_GLOBAL_CONFIG, {
    namespaceId: randomUUID(),
    runMigrations: false,
  });

  return backend;
}

export async function stopBackend(): Promise<void> {
  if (backend) {
    await backend.stop();
  }

  backend = null;
}
