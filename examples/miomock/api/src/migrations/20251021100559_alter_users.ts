import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {});
  await knex.raw(
    `ALTER TABLE users ADD FULLTEXT INDEX users_bio_index (bio) WITH PARSER ngram`,
  );
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    table.dropIndex(["bio"]);
  });
}
