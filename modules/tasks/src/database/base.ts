import path from "node:path";
import knex, { type Knex } from "knex";

export const DEFAULT_SCHEMA = "sonamu_tasks";

/**
 * migrate applies pending migrations to the database. Does nothing if the
 * database is already up to date.
 */
export async function migrate(config: Knex.Config, schema: string) {
  const instance = knex({ ...config, pool: { min: 1, max: 1 } });
  try {
    await instance.schema.createSchemaIfNotExists(schema);
    await instance.migrate.latest({
      directory: path.join(import.meta.dirname, "migrations"),
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
