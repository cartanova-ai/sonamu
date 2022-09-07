import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("posts", (table) => {
    // create fk
    table
      .foreign("author_id")
      .references("users.id")
      .onUpdate("CASCADE")
      .onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("posts", (table) => {
    // drop fk
    table.dropForeign(["author_id"]);
  });
}
