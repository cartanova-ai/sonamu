import { randomUUID } from "node:crypto";

import type { Knex } from "knex";

import { BackendPostgres } from "../database/backend";
import { migrate as baseMigrate, DEFAULT_SCHEMA } from "../database/base";

let backend: BackendPostgres | null = null;

export const KNEX_GLOBAL_CONFIG: Knex.Config = {
  client: "pg",
  connection: {
    host: "127.0.0.1",
    port: 5432,
    user: "postgres",
    password: "miomock123",
    database: "postgres",
  },
  pool: {
    max: 50,
  },
} as const;

export async function migrate(): Promise<void> {
  await baseMigrate(KNEX_GLOBAL_CONFIG, DEFAULT_SCHEMA);
}

export async function createBackend(): Promise<BackendPostgres> {
  if (backend) {
    return backend;
  }

  backend = new BackendPostgres(KNEX_GLOBAL_CONFIG, {
    namespaceId: randomUUID(),
    runMigrations: false,
  });
  await backend.initialize();

  return backend;
}

export async function stopBackend(): Promise<void> {
  if (backend) {
    await backend.stop();
  }

  backend = null;
}
