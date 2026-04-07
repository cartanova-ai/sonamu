import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import knex from "knex";
import { type Knex } from "knex";

export const DEFAULT_SCHEMA = "sonamu_tasks";
const MIGRATION_FILE_PATTERN = /\.(?:[cm]?[jt]s)$/;
const TYPE_DECLARATION_FILE_PATTERN = /\.d\.[cm]?[jt]s$/;

type MigrationModule = {
  up: (knex: Knex) => Promise<void>;
  down: (knex: Knex) => Promise<void>;
};

type MigrationEntry = {
  canonicalName: string;
  fileName: string;
};

function toCanonicalMigrationName(fileName: string): string {
  return fileName.replace(/\.(?:[cm]?[jt]s)$/, ".ts");
}

async function listMigrationEntries(directory: string): Promise<MigrationEntry[]> {
  const dirents = await readdir(directory, { withFileTypes: true });

  return dirents
    .filter(
      (dirent) =>
        dirent.isFile() &&
        MIGRATION_FILE_PATTERN.test(dirent.name) &&
        !TYPE_DECLARATION_FILE_PATTERN.test(dirent.name),
    )
    .map((dirent) => ({
      canonicalName: toCanonicalMigrationName(dirent.name),
      fileName: dirent.name,
    }))
    .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));
}

export function createMigrationSource(directory: string): Knex.MigrationSource<MigrationEntry> {
  return {
    getMigrations: async (_loadExtensions) => listMigrationEntries(directory),
    getMigrationName: (migration) => migration.fileName,
    getMigration: async (migration): Promise<MigrationModule> => {
      const migrationUrl = pathToFileURL(path.join(directory, migration.fileName)).href;
      return import(migrationUrl) as Promise<MigrationModule>;
    },
  };
}

/**
 * migrate applies pending migrations to the database. Does nothing if the
 * database is already up to date.
 */
export async function migrate(config: Knex.Config, schema: string) {
  const instance = knex({ ...config, pool: { min: 1, max: 1 } });
  try {
    const migrationDirectory = path.join(import.meta.dirname, "migrations");
    await instance.schema.createSchemaIfNotExists(schema);
    await instance.migrate.latest({
      migrationSource: createMigrationSource(migrationDirectory),
      schemaName: schema,
    });
  } finally {
    await instance.destroy();
  }
}

/**
 * dropSchema drops the specified schema from the database.
 */
export async function dropSchema(knex: Knex, schema: string) {
  await knex.schema.dropSchemaIfExists(schema, true);
}
