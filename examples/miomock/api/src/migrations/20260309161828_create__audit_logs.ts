import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("audit_logs", (table) => {
    table.increments().primary();
    table
      .timestamp("created_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.string("actor_id", 255).nullable();
    table.text("action").notNullable();
    table.string("entity_type", 100).notNullable();
    table.integer("entity_id").notNullable();
    table.jsonb("old_value").nullable();
    table.jsonb("new_value").nullable();
  });
  await knex.raw(
    `CREATE INDEX audit_logs_entity_type_entity_id_index ON audit_logs (entity_type, entity_id);`,
  );
  await knex.raw(`CREATE INDEX audit_logs_actor_id_index ON audit_logs (actor_id);`);
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("audit_logs");
}
