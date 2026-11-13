import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { installSearchSchema } from "../../src/admin";
import { DEFAULT_SEARCH_SCHEMA } from "../../src/definition/names";
import { useIntegrationHarness } from "../helpers/harness";
import { configureSonamuDatabase } from "../helpers/sonamu-app";
import { identifier, qualified, sql } from "../helpers/sql";
import { closedPortUrl } from "../helpers/tcp-proxy";
import { createTarget, openAdminClient } from "../helpers/test-targets";

/**
 * Runs examples/search/drain.workflow.ts several times and checks that every run removes the heartbeat row it inserted.
 *
 * The example uses the default schema and SEARCH_NAMESPACE, so this file installs that schema itself and drops it at the
 * end. No workflow runner is started: the fn returned by sonamu's workflow() is called with a step stand-in whose
 * define(...).run() runs the function directly. The queue is empty and OPENSEARCH_URL points at a closed port.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const schema = DEFAULT_SEARCH_SCHEMA;
const heartbeats = qualified(schema, "worker_heartbeats");
const log = qualified(schema, "test_hb_log");
const logFunction = qualified(schema, "test_hb_log_fn");
const RUNS = 4;

beforeAll(async () => {
  configureSonamuDatabase(h, "drain-workflow");
  process.env.SEARCH_NAMESPACE = h.namespace;
  process.env.SEARCH_CURSOR_SECRET = Buffer.alloc(32, 7).toString("base64");
  process.env.OPENSEARCH_URL = await closedPortUrl();
  await h.knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);
  await installSearchSchema(h.knex, { schema });
});
afterAll(async () => {
  await h.knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);
});

const logRowSchema = z.array(z.object({ op: z.enum(["insert", "delete"]), worker_id: z.string() }));

describe("examples/search/drain.workflow.ts", () => {
  it("여러 번 연달아 실행해도 실행마다 heartbeat 행이 생겼다가 지워져, 끝나면 행이 하나도 없다", async () => {
    const { chatMessagesSearch } = await import("../../examples/search/chat-messages.definition");
    const admin = await openAdminClient(h);
    try {
      await createTarget(admin.run, {
        schema,
        namespace: h.namespace,
        logicalKey: chatMessagesSearch.key,
        fingerprint: chatMessagesSearch.fingerprint,
      });
    } finally {
      await admin.close();
    }
    // Idle targets renew their fence, which writes to the engine. A freshly renewed fence keeps the empty drain off the
    // closed port; a failed request would start a cooldown and later runs would end without a heartbeat.
    await h.knex.raw(
      sql`INSERT INTO ${qualified(schema, "target_fences")} (target_id, epoch, nonce, renewed_at)
SELECT target_id, 1, gen_random_uuid(), clock_timestamp() FROM ${qualified(schema, "targets")}`,
    );
    await h.knex.raw(
      sql`CREATE TABLE ${log} (seq bigserial PRIMARY KEY, op text NOT NULL, worker_id uuid NOT NULL)`,
    );
    await h.knex.raw(sql`CREATE FUNCTION ${logFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO ${log} (op, worker_id) VALUES ('delete', OLD.worker_id);
  ELSE
    INSERT INTO ${log} (op, worker_id) VALUES ('insert', NEW.worker_id);
  END IF;
  RETURN NULL;
END
$$`);
    await h.knex.raw(
      sql`CREATE TRIGGER test_hb_log AFTER INSERT OR DELETE ON ${heartbeats} FOR EACH ROW EXECUTE FUNCTION ${logFunction}()`,
    );

    const { searchDrainWorkflow } = await import("../../examples/search/drain.workflow");
    type WorkflowParams = Parameters<typeof searchDrainWorkflow.fn>[0];
    const step = {
      define: <T>(_options: { name: string }, run: () => Promise<T>) => ({ run }),
    };
    // SAFETY: the example calls only params.step.define(...).run(); it reads neither StepWrapper (a class with private
    // fields) nor the logger.
    const params: WorkflowParams = { step, input: undefined, version: null } as never;

    for (let run = 1; run <= RUNS; run += 1) {
      await searchDrainWorkflow.fn(params);
      const { rows } = await h.knex.raw<{ rows: { n: number }[] }>(
        sql`SELECT count(*)::integer AS n FROM ${heartbeats}`,
      );
      expect({ run, rows: rows[0].n }).toEqual({ run, rows: 0 });
    }

    const { rows } = await h.knex.raw<{ rows: unknown[] }>(
      sql`SELECT op, worker_id::text FROM ${log} ORDER BY seq`,
    );
    const entries = logRowSchema.parse(rows);
    // Each run deletes the row it inserted. The example reuses one module-level indexer, so every run has the same
    // worker ID.
    expect(entries.map((entry) => entry.op)).toEqual(
      Array.from({ length: RUNS }, () => ["insert", "delete"]).flat(),
    );
    for (let run = 0; run < RUNS; run += 1) {
      expect(entries[2 * run + 1].worker_id).toBe(entries[2 * run].worker_id);
    }
    expect(new Set(entries.map((entry) => entry.worker_id)).size).toBe(1);
  });
});
