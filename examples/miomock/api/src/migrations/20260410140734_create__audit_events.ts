import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("audit_events", (table) => {
    table.increments().primary();
    table.string("source", 32).notNullable();
    table.string("source_version", 96).nullable();
    table.text("category").notNullable();
    table.string("event_type", 64).notNullable();
    table.string("event_key", 191).notNullable();
    table.string("dedupe_key", 64).notNullable();
    table.string("actor_user_id", 191).nullable();
    table.string("subject_user_id", 191).nullable();
    table.string("organization_id", 191).nullable();
    table.string("team_id", 191).nullable();
    table.string("session_id", 191).nullable();
    table.string("provider_id", 64).nullable();
    table.string("login_method", 64).nullable();
    table.string("identifier", 255).nullable();
    table.string("visitor_id", 191).nullable();
    table.string("reason", 128).nullable();
    table.string("action", 64).nullable();
    table.string("trigger_context", 64).nullable();
    table.string("ip_address", 45).nullable();
    table.string("country_code", 8).nullable();
    table.string("country", 100).nullable();
    table.string("city", 100).nullable();
    table.text("user_agent").nullable();
    table.jsonb("payload_json").notNullable();
    table.timestamp("occurred_at", { useTz: true, precision: 3 }).notNullable();
    table
      .timestamp("ingested_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
  });
  await knex.raw(
    `CREATE UNIQUE INDEX audit_events_dedupe_key_unique ON audit_events (dedupe_key);`,
  );
  await knex.raw(`CREATE INDEX audit_events_occurred_at_index ON audit_events (occurred_at);`);
  await knex.raw(
    `CREATE INDEX audit_events_event_type_occurred_at_index ON audit_events (event_type, occurred_at);`,
  );
  await knex.raw(
    `CREATE INDEX audit_events_subject_user_id_occurred_at_index ON audit_events (subject_user_id, occurred_at);`,
  );
  await knex.raw(
    `CREATE INDEX audit_events_actor_user_id_occurred_at_index ON audit_events (actor_user_id, occurred_at);`,
  );
  await knex.raw(
    `CREATE INDEX audit_events_organization_id_occurred_at_index ON audit_events (organization_id, occurred_at);`,
  );
  await knex.raw(
    `CREATE INDEX audit_events_team_id_occurred_at_index ON audit_events (team_id, occurred_at);`,
  );
  await knex.raw(`CREATE INDEX audit_events_session_id_index ON audit_events (session_id);`);
  await knex.raw(
    `CREATE INDEX audit_events_reason_occurred_at_index ON audit_events (reason, occurred_at);`,
  );
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("audit_events");
}
