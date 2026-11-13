import { describe, expect, it } from "vitest";
import { z } from "zod";

import { installSearchSchema } from "../../../src/admin";
import { renderSchemaV1 } from "../../../src/admin/schema/ddl";
import { schemaChecksum } from "../../../src/admin/schema/migrations";
import { renderDeliveryStatements } from "../../../src/postgres/delivery-store";
import { renderSql, schemaIdentifier } from "../../../src/postgres/sql";
import { renderSynchronizationStatements } from "../../../src/postgres/synchronization";
import { useIntegrationHarness } from "../../helpers/harness";
import { identifier, qualified, sql } from "../../helpers/sql";
import {
  createTarget,
  openAdminClient,
  resetSearchSchema,
  targetStatements,
} from "../../helpers/test-targets";

/**
 * The marker's target lookup, the worker's target discovery and registration filter on write_enabled, which matches
 * the predicate of the partial index targets_writable_idx. Retired and detached targets can never be write_enabled
 * (CHECK), so a key with thousands of them still reads only its writable targets.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const KEY = "messages";

type PlanNode = {
  "Relation Name"?: string;
  "Index Name"?: string;
  "Node Type": string;
  Plans?: PlanNode[];
};
const planNodeSchema: z.ZodType<PlanNode> = z.lazy(() =>
  z.looseObject({
    "Node Type": z.string(),
    "Relation Name": z.string().optional(),
    "Index Name": z.string().optional(),
    Plans: z.array(planNodeSchema).optional(),
  }),
);
const explainSchema = z.array(z.object({ Plan: planNodeSchema }));

/** (node type, index name) of every plan node that reads targets. */
function targetAccess(node: PlanNode): [string, string | null][] {
  const own: [string, string | null][] =
    node["Relation Name"] === "targets" ? [[node["Node Type"], node["Index Name"] ?? null]] : [];
  return [...own, ...(node.Plans ?? []).flatMap(targetAccess)];
}

describe("쓰기 가능 대상 부분 인덱스", () => {
  it("쓰기 대상 둘과 은퇴·떼어 낸 대상 수천 개가 있는 키에서 마커, 워커의 대상 탐색, 등록 문장은 부분 인덱스를 쓴다", async () => {
    await resetSearchSchema(h);
    const admin = await openAdminClient(h);
    try {
      await createTarget(admin.run, {
        schema: h.searchSchema,
        namespace: h.namespace,
        logicalKey: KEY,
      });
      const targets = qualified(h.searchSchema, "targets");
      const insertTargets = (state: string, writable: boolean, rows: number) =>
        h.knex.raw(
          sql`INSERT INTO ${targets} (target_id, namespace, definition, physical_index, write_alias, fingerprint, hash_version,
  capture_epoch, state, write_enabled, create_operation_id, remote_create_state)
SELECT gen_random_uuid(), ?, ?, 'p-' || g || '-' || ?, 'w-' || g || '-' || ?, repeat('a', 64), 'sonamu-c14n-v1', 1, ?, ?, 'op-' || g, 'verified'
FROM generate_series(1, ?) AS g`,
          [h.namespace, KEY, state, state, state, writable, rows],
        );
      await insertTargets("paused", true, 1);
      await insertTargets("retired", false, 3_000);
      await insertTargets("detached", false, 200);
      await insertTargets("failed", false, 200);
      await expect(
        h.knex.raw(sql`UPDATE ${targets} SET write_enabled = true WHERE state = 'detached'`),
      ).rejects.toMatchObject({ code: "23514" });
      await h.knex.raw(sql`ANALYZE ${targets}`);
      const { rows: counted } = await h.knex.raw<{ rows: { writable: string; total: string }[] }>(
        sql`SELECT count(*) FILTER (WHERE write_enabled) AS writable, count(*) AS total FROM ${targets}`,
      );
      expect(counted).toEqual([{ writable: "2", total: "3402" }]);

      const explain = async (text: string, params: readonly (string | number | null)[]) => {
        const result = await admin.run<{ "QUERY PLAN": unknown }>(`EXPLAIN (FORMAT JSON) ${text}`, [
          ...params,
        ]);
        return targetAccess(explainSchema.parse(result.rows[0]?.["QUERY PLAN"])[0].Plan);
      };
      const delivery = renderDeliveryStatements(schemaIdentifier(h.searchSchema));
      const plans = {
        markerTargets: await explain(
          renderSql(renderSynchronizationStatements(h.searchSchema).readCaptureTargets),
          [h.namespace, KEY],
        ),
        claimableTargets: await explain(renderSql(delivery.listClaimableTargets), [h.namespace]),
        boundTargets: await explain(renderSql(delivery.listBoundTargets), [
          h.namespace,
          null,
          30_000,
        ]),
        boundTargetsWithoutSystemIdentifier: await explain(
          renderSql(delivery.listBoundTargetsWithoutSystemIdentifier),
          [h.namespace, null, 30_000],
        ),
        registration: await explain(targetStatements(h.searchSchema).countWriteTargets, [
          h.namespace,
          KEY,
          1,
        ]),
      };
      for (const [name, accesses] of Object.entries(plans)) {
        expect([name, accesses.map(([, index]) => index)]).toEqual([
          name,
          accesses.map(() => "targets_writable_idx"),
        ]);
        expect(accesses.length).toBeGreaterThan(0);
      }
    } finally {
      await admin.close();
    }
  });
});

/** Final shape of one schema, with the schema name replaced by <s>. */
async function describeSchema(schema: string) {
  const strip = (text: string) =>
    text.replaceAll(`"${schema}".`, "<s>.").replaceAll(`${schema}.`, "<s>.");
  const { rows: relations } = await h.knex.raw<{
    rows: { relname: string; relkind: string; reloptions: string[] | null }[];
  }>(
    "SELECT c.relname, c.relkind, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ? ORDER BY 1",
    [schema],
  );
  const { rows: indexes } = await h.knex.raw<{ rows: { indexname: string; indexdef: string }[] }>(
    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = ? ORDER BY 1",
    [schema],
  );
  const { rows: constraints } = await h.knex.raw<{
    rows: { relname: string; conname: string; definition: string }[];
  }>(
    "SELECT r.relname, c.conname, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = ? ORDER BY 1, 2",
    [schema],
  );
  const { rows: columns } = await h.knex.raw<{
    rows: {
      table_name: string;
      column_name: string;
      ordinal_position: number;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }[];
  }>(
    "SELECT table_name, column_name, ordinal_position, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = ? ORDER BY 1, 3",
    [schema],
  );
  return {
    relations,
    indexes: indexes.map((row) => ({ ...row, indexdef: strip(row.indexdef) })),
    constraints: constraints.map((row) => ({ ...row, definition: strip(row.definition) })),
    columns: columns.map((row) => ({
      ...row,
      column_default: row.column_default === null ? null : strip(row.column_default),
    })),
  };
}

describe("저장 매개변수와 업그레이드 경로의 최종 모양", () => {
  it("새 설치와 버전 1에서 올린 설치는 열, 제약, 인덱스, reloptions가 같다", async () => {
    const fresh = `${h.searchSchema}_fresh`;
    const upgraded = `${h.searchSchema}_up`;
    h.onCleanup(async () => {
      for (const schema of [fresh, upgraded]) {
        await h.knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);
      }
    });
    expect((await installSearchSchema(h.knex, { schema: fresh })).applied).toEqual([1, 2]);
    await h.knex.transaction(async (trx) => {
      await trx.raw(renderSql(renderSchemaV1(schemaIdentifier(upgraded))));
      await trx.raw(
        sql`INSERT INTO ${qualified(upgraded, "schema_versions")} (version, name, checksum, package_version) VALUES (1, 'initial', ?, '0.0.0')`,
        [schemaChecksum(1)],
      );
    });
    expect((await installSearchSchema(h.knex, { schema: upgraded })).applied).toEqual([2]);

    const a = await describeSchema(fresh);
    const b = await describeSchema(upgraded);
    expect(b).toEqual(a);
    const options = Object.fromEntries(a.relations.map((row) => [row.relname, row.reloptions]));
    expect(options).toMatchObject({
      deliveries: [
        "fillfactor=80",
        "autovacuum_vacuum_scale_factor=0.01",
        "autovacuum_vacuum_threshold=5000",
        "autovacuum_analyze_scale_factor=0.005",
        "autovacuum_analyze_threshold=1000",
      ],
      delivery_runtime: [
        "autovacuum_vacuum_scale_factor=0.01",
        "autovacuum_vacuum_threshold=5000",
        "autovacuum_analyze_scale_factor=0.005",
        "autovacuum_analyze_threshold=1000",
      ],
      documents: ["fillfactor=80"],
      indexes: ["fillfactor=50"],
    });
    expect(a.indexes).toContainEqual({
      indexname: "targets_writable_idx",
      indexdef:
        "CREATE INDEX targets_writable_idx ON <s>.targets USING btree (namespace, definition, capture_epoch) WHERE write_enabled",
    });
  });
});
