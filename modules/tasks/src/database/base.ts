import path from "node:path";
import type { Knex } from "knex";

export const DEFAULT_SCHEMA = "sonamu_tasks";

/**
 * migrate applies pending migrations to the database. Does nothing if the
 * database is already up to date.
 */
export async function migrate(knex: Knex, schema: string) {
  await knex.schema.createSchemaIfNotExists(schema);
  await knex.migrate.latest({
    directory: path.join(import.meta.dirname, "migrations"),
    schemaName: schema,
  });
}

/**
 * dropSchema drops the specified schema from the database.
 */
export async function dropSchema(knex: Knex, schema: string) {
  await knex.schema.dropSchemaIfExists(schema, true);
}
