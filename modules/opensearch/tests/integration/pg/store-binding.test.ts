import { Client } from "@opensearch-project/opensearch";
import knexFactory, { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { installSearchSchema } from "../../../src/admin";
import { renderSchemaV1 } from "../../../src/admin/schema/ddl";
import { schemaChecksum } from "../../../src/admin/schema/migrations";
import { createSearchClient } from "../../../src/client/search-client";
import { SearchSchemaVersionMismatch, SearchStoreMismatch } from "../../../src/errors";
import { createIndexer, createPostgresSynchronization } from "../../../src/postgres";
import { renderSql, schemaIdentifier } from "../../../src/postgres/sql";
import { requireStoreBinding } from "../../../src/postgres/store-binding";
import { createTestDefinition } from "../../../src/testing";
import { useIntegrationHarness } from "../../helpers/harness";
import { rejectionOf } from "../../helpers/read-path-fixture";
import { identifier, qualified, sql } from "../../helpers/sql";
import {
  createTarget,
  openAdminClient,
  resetSearchSchema,
  type StatementRunner,
} from "../../helpers/test-targets";
import { TEST_LIMITS } from "../../helpers/worker-fixture";

/**
 * Store binding. checkBinding is one statement per call; a role that cannot call pg_control_system() gets 42501 once
 * and then uses the variant without the system identifier. A binding mismatch blocks only remote effects: markChanged
 * and initialize() behave the same and cost the same statements. instanceName mismatches only when both sides are set
 * and differ.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const KEY = "messages";

let admin: { run: StatementRunner; close(): Promise<void> };

interface CountingKnex {
  knex: Knex;
  statements: () => number;
  log: string[];
}

function countingKnex(url: string): CountingKnex {
  const knex = knexFactory({ client: "pg", connection: url, pool: { min: 0, max: 2 } });
  let count = 0;
  const log: string[] = [];
  knex.on("query", (query: { sql: string }) => {
    count += 1;
    log.push(query.sql);
  });
  return { knex, statements: () => count, log };
}

function synchronization(knex: Knex, instanceName?: string, schema = h.searchSchema) {
  return createPostgresSynchronization({
    getPrimaryDatabase: () => knex,
    schema,
    namespace: h.namespace,
    instanceName,
  });
}

const storeTable = () => qualified(h.searchSchema, "store");

beforeAll(async () => {
  admin = await openAdminClient(h);
});
afterAll(async () => {
  await admin.close();
});
beforeEach(async () => {
  await resetSearchSchema(h);
  await createTarget(admin.run, {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey: KEY,
  });
});

/** Result and statement counts of one initialize and one markChanged. */
async function markOnce(knex: Knex, statements: () => number, instanceName?: string) {
  const sync = synchronization(knex, instanceName);
  const before = statements();
  await sync.initialize();
  const afterInitialize = statements();
  const result = await knex.transaction((trx) => sync.markChanged(trx, KEY, ["d1"]));
  return {
    result,
    initialize: afterInitialize - before,
    mark: statements() - afterInitialize,
  };
}

describe("결속 불일치는 캡처를 막지 않는다", () => {
  it("markChanged와 initialize는 원점과 instanceName이 맞지 않아도 같은 결과와 같은 문장 수로 동작한다", async () => {
    const { knex, statements } = countingKnex(h.connectionString("count"));
    try {
      const baseline = await markOnce(knex, statements);
      expect(baseline.result).toBe("recorded");

      await h.knex.raw(
        sql`UPDATE ${qualified(h.searchSchema, "store")} SET origin_database_oid = origin_database_oid + 1, instance_name = 'prod'`,
      );
      const binding = await synchronization(knex, "staging").checkBinding();
      expect(binding).toMatchObject({ originMatches: false, instanceMatches: false });

      const mismatched = await markOnce(knex, statements, "staging");
      expect(mismatched).toEqual(baseline);
    } finally {
      await knex.destroy();
    }
  });
});

describe("checkBinding", () => {
  it("방금 설치한 저장소는 결속이 맞고, 확인은 호출마다 문장 하나다", async () => {
    const { knex, statements } = countingKnex(h.connectionString("count"));
    try {
      const sync = synchronization(knex);
      for (let call = 0; call < 3; call += 1) {
        const before = statements();
        expect(await sync.checkBinding()).toMatchObject({
          originRecorded: true,
          originMatches: true,
          instanceMatches: true,
          systemIdentifierReadable: true,
        });
        expect(statements() - before).toBe(1);
      }
    } finally {
      await knex.destroy();
    }
  });

  it.each([
    { configured: "staging", recorded: null, matches: true },
    { configured: undefined, recorded: "prod", matches: true },
    { configured: "prod", recorded: "prod", matches: true },
    { configured: "staging", recorded: "prod", matches: false },
  ])(
    "instanceName: 설정 $configured, 기록 $recorded ⇒ 일치 $matches",
    async ({ configured, recorded, matches }) => {
      await h.knex.raw(sql`UPDATE ${storeTable()} SET instance_name = ?`, [recorded]);
      const sync = synchronization(h.knex, configured);
      expect((await sync.checkBinding()).instanceMatches).toBe(matches);
      const outcome = await requireStoreBinding(sync).then(
        () => "allowed",
        (error: Error) =>
          error instanceof SearchStoreMismatch ? String(error.details?.reason) : error.message,
      );
      expect(outcome).toBe(matches ? "allowed" : "store-instance-mismatch");
    },
  );

  it("원점이 기록되지 않았으면 store-origin-unrecorded, 이름이나 OID가 다르면 store-origin-changed", async () => {
    const sync = synchronization(h.knex);
    await h.knex.raw(sql`UPDATE ${storeTable()} SET origin_recorded_at = NULL`);
    expect((await rejectionOf(requireStoreBinding(sync))).details?.reason).toBe(
      "store-origin-unrecorded",
    );
    await h.knex.raw(
      sql`UPDATE ${qualified(h.searchSchema, "store")} SET origin_recorded_at = clock_timestamp(), origin_database_name = 'elsewhere'`,
    );
    expect((await rejectionOf(requireStoreBinding(sync))).details?.reason).toBe(
      "store-origin-changed",
    );
    await h.knex.raw(
      sql`UPDATE ${qualified(h.searchSchema, "store")} SET origin_database_name = current_database(), origin_system_identifier = '1'`,
    );
    expect((await rejectionOf(requireStoreBinding(sync))).details?.reason).toBe(
      "store-origin-changed",
    );
  });

  it("버전 1 스키마에서는 SearchSchemaVersionMismatch(behind)로 거부한다", async () => {
    const schema = `${h.searchSchema}_v1`;
    h.onCleanup(async () => {
      await h.knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);
    });
    await h.knex.transaction(async (trx) => {
      await trx.raw(renderSql(renderSchemaV1(schemaIdentifier(schema))));
      await trx.raw(
        sql`INSERT INTO ${qualified(schema, "schema_versions")} (version, name, checksum, package_version) VALUES (1, 'initial', ?, '0.0.0')`,
        [schemaChecksum(1)],
      );
    });
    const error = await rejectionOf(synchronization(h.knex, undefined, schema).checkBinding());
    expect(error).toBeInstanceOf(SearchSchemaVersionMismatch);
    expect(error.details).toMatchObject({ status: "behind", required: 2 });
  });
});

describe("pg_control_system()을 부를 수 없는 역할", () => {
  it("슈퍼유저가 아닌 소유자가 설치하면 시스템 식별자 없이 원점을 기록하고, OID와 이름으로 결속과 복사본을 판정한다", async () => {
    const database = `nosysid_${h.id}`;
    const copy = `nosysid_copy_${h.id}`;
    const owner = await h.createRole("installer");
    h.onCleanup(async () => {
      for (const name of [copy, database]) {
        await h.knex.raw(sql`DROP DATABASE IF EXISTS ${identifier(name)} WITH (FORCE)`);
      }
    });
    await h.knex.raw(sql`CREATE DATABASE ${identifier(database)}`);
    const url = (name: string, user?: { name: string; password: string }) => {
      const parsed = new URL(h.connectionString("nosysid"));
      parsed.pathname = `/${name}`;
      if (user !== undefined) {
        parsed.username = user.name;
        parsed.password = user.password;
      }
      return parsed.toString();
    };
    const superuser = knexFactory({
      client: "pg",
      connection: url(database),
      pool: { min: 0, max: 1 },
    });
    try {
      // Function privileges are per database, so this revoke affects only the new database.
      await superuser.raw("REVOKE EXECUTE ON FUNCTION pg_control_system() FROM PUBLIC");
      await superuser.raw(
        sql`GRANT CREATE ON DATABASE ${identifier(database)} TO ${identifier(owner.name)}`,
      );
    } finally {
      await superuser.destroy();
    }
    const { knex, statements, log } = countingKnex(url(database, owner));
    try {
      await expect(knex.raw("SELECT pg_control_system()")).rejects.toMatchObject({ code: "42501" });
      const report = await installSearchSchema(knex);
      expect(report.applied).toEqual([1, 2]);
      const { rows } = await knex.raw<{ rows: unknown[] }>(
        "SELECT origin_system_identifier, origin_database_name, origin_database_oid = (SELECT oid FROM pg_database WHERE datname = current_database()) AS oid_recorded FROM sonamu_search.store",
      );
      expect(rows).toEqual([
        { origin_system_identifier: null, origin_database_name: database, oid_recorded: true },
      ]);
      // Storage parameters are applied by a non-superuser owner too.
      const { rows: options } = await knex.raw<{
        rows: { relname: string; reloptions: string[] }[];
      }>(
        "SELECT c.relname, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'sonamu_search' AND c.relname IN ('deliveries', 'documents') ORDER BY 1",
      );
      expect(options.map((row) => [row.relname, row.reloptions.includes("fillfactor=80")])).toEqual(
        [
          ["deliveries", true],
          ["documents", true],
        ],
      );

      const sync = createPostgresSynchronization({
        getPrimaryDatabase: () => knex,
        namespace: h.namespace,
      });
      // First check: the combined statement fails with 42501 and the fallback runs (two statements); then one.
      let before = statements();
      expect(await sync.checkBinding()).toMatchObject({
        originMatches: true,
        systemIdentifierReadable: false,
      });
      expect(statements() - before).toBe(2);
      before = statements();
      expect((await sync.checkBinding()).originMatches).toBe(true);
      expect(statements() - before).toBe(1);

      // Worker: only the first drain tries the discovery with the system identifier; later drains use the fallback only.
      const counting: CountingKnex = { knex, statements, log };
      const indexer = idleIndexer(knex, "sonamu_search");
      const first = await drainStatements(counting, () => indexer.drainOnce());
      expect(first).toMatchObject({ bound: 1, unbound: 1, separate: 0 });
      const next = await drainStatements(counting, () => indexer.drainOnce());
      expect(next).toMatchObject({ bound: 0, unbound: 1, separate: 0 });
      expect(next.total).toBe(first.total - 1);
    } finally {
      await knex.destroy();
    }

    // A TEMPLATE copy is detected by database OID and name even without the system identifier.
    await h.knex.raw(sql`CREATE DATABASE ${identifier(copy)} TEMPLATE ${identifier(database)}`);
    const copied = knexFactory({
      client: "pg",
      connection: url(copy, owner),
      pool: { min: 0, max: 1 },
    });
    try {
      const sync = createPostgresSynchronization({
        getPrimaryDatabase: () => copied,
        namespace: h.namespace,
      });
      expect((await rejectionOf(requireStoreBinding(sync))).details).toMatchObject({
        reason: "store-origin-changed",
        systemIdentifierReadable: false,
      });
    } finally {
      await copied.destroy();
    }
  });
});

/** An indexer whose client cannot reach any host; drains with nothing to send make no remote request. */
function idleIndexer(knex: Knex, schema: string) {
  return createIndexer({
    client: createSearchClient({
      createClient: () => new Client({ node: "http://127.0.0.1:9" }),
      ownsClient: true,
      requestTimeoutMs: 1_000,
    }),
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => knex,
      namespace: h.namespace,
      schema,
    }),
    definitions: [
      createTestDefinition({
        key: KEY,
        schema: z.object({ body: z.string() }),
        properties: { body: { type: "text" } },
      }),
    ],
    limits: TEST_LIMITS,
  });
}

/**
 * Counts one drain's statements by kind. bound and unbound are the target discovery statements that also check the
 * binding, with and without the system identifier.
 */
async function drainStatements(counting: CountingKnex, drain: () => Promise<object>) {
  const from = counting.log.length;
  await drain().catch(() => undefined);
  const ran = counting.log.slice(from);
  return {
    total: ran.length,
    bound: ran.filter(
      (text) => text.includes("LEFT JOIN LATERAL") && text.includes("pg_control_system"),
    ).length,
    unbound: ran.filter(
      (text) => text.includes("LEFT JOIN LATERAL") && !text.includes("pg_control_system"),
    ).length,
    // A separate binding check or a separate target discovery must not appear.
    separate: ran.filter(
      (text) =>
        !text.includes("LEFT JOIN LATERAL") &&
        /pg_control_system|origin_recorded_at|t\.state = 'active' AND t\.write_enabled/.test(text),
    ).length,
  };
}

describe("워커의 결속 확인 비용", () => {
  it("대상 탐색이 결속도 확인하므로 drain마다 더하는 문장과 왕복은 없다. 불일치면 대상 탐색 하나로 끝나고 아무것도 쓰지 않는다", async () => {
    const counting = countingKnex(h.connectionString("count"));
    const indexer = idleIndexer(counting.knex, h.searchSchema);
    try {
      // Freshly renewed fences, so an empty drain has no fence work to add.
      await h.knex.raw(
        sql`INSERT INTO ${qualified(h.searchSchema, "target_fences")} (target_id, epoch, nonce, renewed_at)
SELECT target_id, 1, gen_random_uuid(), clock_timestamp() FROM ${qualified(h.searchSchema, "targets")}
ON CONFLICT (target_id) DO NOTHING`,
      );
      const idle = await drainStatements(counting, () => indexer.drainOnce());
      expect(idle).toMatchObject({ bound: 1, unbound: 0, separate: 0 });
      expect(await drainStatements(counting, () => indexer.drainOnce())).toEqual(idle);

      await h.knex.raw(
        sql`UPDATE ${qualified(h.searchSchema, "store")} SET origin_database_name = 'elsewhere'`,
      );
      const refused = await indexer.drainOnce().then(
        () => undefined,
        (error: Error) => error,
      );
      expect(refused).toBeInstanceOf(SearchStoreMismatch);
      const mismatch = await drainStatements(counting, () => indexer.drainOnce());
      // On a mismatch nothing runs after the discovery statement: no heartbeat, no lease.
      expect(mismatch).toEqual({ total: 1, bound: 1, unbound: 0, separate: 0 });
    } finally {
      await counting.knex.destroy();
    }
  });
});
