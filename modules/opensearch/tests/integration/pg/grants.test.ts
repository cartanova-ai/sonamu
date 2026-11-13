import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { Client as PgClient, DatabaseError, type QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  applySearchGrants,
  createSearchAdmin,
  installSearchSchema,
  renderSearchGrantsSql,
  type SearchAdmin,
} from "../../../src/admin";
import { createSearchClient, type SearchClient } from "../../../src/client/search-client";
import { buildPhysicalIndexName, buildWriteAliasName } from "../../../src/definition/names";
import {
  SearchConfigurationError,
  SearchError,
  SearchSchemaVersionMismatch,
} from "../../../src/errors";
import {
  createIndexer,
  createPostgresCatalogReader,
  createPostgresSynchronization,
  type PostgresSynchronization,
} from "../../../src/postgres";
import { createSearchQueries } from "../../../src/query/search-queries";
import { createTestDefinition } from "../../../src/testing";
import { type TestRole, useIntegrationHarness } from "../../helpers/harness";
import { type RecordedRequest, requestRecorder } from "../../helpers/request-recorder";
import { identifier, qualified, quoteIdentifier, sql } from "../../helpers/sql";
import { TEST_LIMITS } from "../../helpers/worker-fixture";

/**
 * Least privilege of the four roles. Every verdict comes from connecting as the role and running a statement, never
 * from catalogue functions such as has_table_privilege: allowed work must succeed and everything else fail with 42501.
 * The last block runs every real handle operation under every role.
 */

const h = useIntegrationHarness({ sampleDomain: false });
type Group = "capture" | "worker" | "query" | "admin";
type Privilege = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

const TABLES = [
  "schema_versions",
  "store",
  "indexes",
  "targets",
  "read_heads",
  "admin_controls",
  "admin_operations",
  "documents",
  "deliveries",
  "delivery_runtime",
  "builds",
  "worker_heartbeats",
  "target_fences",
] as const;
type Table = (typeof TABLES)[number];

/** true grants the whole table, an array only those columns; a missing privilege must be refused. */
type TableGrant = { [P in Privilege]?: true | readonly string[] };

const READ_VERSIONS = [
  ["schema_versions", { SELECT: true }],
  ["store", { SELECT: true }],
] as const;
const FULL = { SELECT: true, INSERT: true, UPDATE: true, DELETE: true } satisfies TableGrant;

function grantTable(
  entries: readonly (readonly [Table, TableGrant])[],
): ReadonlyMap<Table, TableGrant> {
  return new Map(entries);
}

// The documented grant table; every (role, table, privilege, column) not listed must be refused.
const EXPECTED = new Map<Group, ReadonlyMap<Table, TableGrant>>([
  [
    "capture",
    grantTable([
      ...READ_VERSIONS,
      ["indexes", { SELECT: true, UPDATE: ["lock_marker"] }],
      ["targets", { SELECT: true }],
      ["documents", { SELECT: true, INSERT: true, UPDATE: true }],
      ["deliveries", { SELECT: true, INSERT: true, UPDATE: true }],
    ]),
  ],
  [
    "worker",
    grantTable([
      ...READ_VERSIONS,
      ["indexes", { SELECT: true }],
      ["targets", { SELECT: true, UPDATE: ["state", "pause_reason", "paused_at"] }],
      ["documents", { SELECT: true }],
      ["deliveries", { SELECT: true, DELETE: true, UPDATE: ["updated_at"] }],
      ["delivery_runtime", FULL],
      ["worker_heartbeats", FULL],
      ["target_fences", { SELECT: true, INSERT: true, UPDATE: true }],
    ]),
  ],
  [
    "query",
    grantTable([
      ...READ_VERSIONS,
      ["read_heads", { SELECT: true }],
      ["targets", { SELECT: true }],
      ["indexes", { SELECT: ["namespace", "definition", "capture_epoch"] }],
    ]),
  ],
  [
    "admin",
    grantTable([
      ["schema_versions", { SELECT: true }],
      // Only the columns adoptCopiedStore and confirmStoreOwnership change; never singleton or created_at.
      [
        "store",
        {
          SELECT: true,
          UPDATE: [
            "store_id",
            "origin_system_identifier",
            "origin_database_oid",
            "origin_database_name",
            "origin_recorded_at",
            "instance_name",
          ],
        },
      ],
      ...TABLES.filter((table) => table !== "schema_versions" && table !== "store").map(
        (table) => [table, FULL] as const,
      ),
    ]),
  ],
]);

const GROUPS: readonly Group[] = ["capture", "worker", "query", "admin"];

function allows(group: Group, table: Table, privilege: Privilege, column?: string): boolean {
  const grant = EXPECTED.get(group)?.get(table)?.[privilege];
  if (grant === undefined) return false;
  if (grant === true) return true;
  return column !== undefined && grant.includes(column);
}

type Outcome = { ok: true; rows: QueryResultRow[]; rowCount: number } | { ok: false; code: string };

/** A connection as one role; each statement runs inside BEGIN/ROLLBACK so the fixture stays unchanged. */
class RoleConnection {
  constructor(
    readonly group: Group | "outsider",
    private readonly client: PgClient,
  ) {}

  static async open(group: Group | "outsider", role: TestRole): Promise<RoleConnection> {
    const client = new PgClient({ connectionString: role.url });
    client.on("error", () => {});
    await client.connect();
    return new RoleConnection(group, client);
  }

  /** Errors are returned as their SQLSTATE. */
  async attempt(
    text: string,
    values: readonly unknown[] = [],
    options: { rollback?: boolean } = {},
  ): Promise<Outcome> {
    const rollback = options.rollback ?? true;
    if (rollback) await this.client.query("BEGIN");
    try {
      const result = await this.client.query(text, [...values]);
      return { ok: true, rows: result.rows, rowCount: result.rowCount ?? 0 };
    } catch (error) {
      if (error instanceof DatabaseError && error.code !== undefined) {
        return { ok: false, code: error.code };
      }
      throw error;
    } finally {
      if (rollback) await this.client.query("ROLLBACK");
    }
  }

  async query(text: string, values: readonly unknown[] = []): Promise<QueryResultRow[]> {
    const result = await this.client.query(text, [...values]);
    return result.rows;
  }

  async end(): Promise<void> {
    await this.client.end();
  }
}

const schema = h.searchSchema + "_g";
type Member = Group | "outsider";
const roleByMember = new Map<Member, TestRole>();
const connectionByMember = new Map<Member, RoleConnection>();

function roleOf(member: Member): TestRole {
  const role = roleByMember.get(member);
  if (role === undefined) throw new Error("역할이 아직 없습니다: " + member);
  return role;
}

function connectionOf(member: Member): RoleConnection {
  const connection = connectionByMember.get(member);
  if (connection === undefined) throw new Error("연결이 아직 없습니다: " + member);
  return connection;
}
const fixture = {
  targetId: randomUUID(),
  spareTargetId: randomUUID(),
  buildId: randomUUID(),
  workerId: randomUUID(),
  intentId: "",
  operationSeq: 0,
};

function physicalName(targetId: string): string {
  return "snm-n-d-" + targetId.replaceAll("-", "");
}

const readStoreId = () => sql`SELECT store_id FROM ${qualified(schema, "store")}`;

beforeAll(async () => {
  const report = await installSearchSchema(h.knex, { schema });
  for (const group of [...GROUPS, "outsider"] as const) {
    roleByMember.set(group, await h.createRole(group));
  }
  await applySearchGrants(h.knex, {
    schema,
    roles: {
      capture: [roleOf("capture").name],
      worker: [roleOf("worker").name],
      query: [roleOf("query").name],
      admin: [roleOf("admin").name],
    },
  });
  // Drop this schema before the harness drops the roles that hold privileges on it.
  h.onCleanup(async () => {
    await h.knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);
  });

  // At least one row per table, so column UPDATEs and DELETEs touch real rows.
  const q = (table: string) => qualified(schema, table);
  const db = h.knex;
  await db.raw(
    sql`INSERT INTO ${q("indexes")} (namespace, definition, store_id) VALUES ('n', 'd', ?), ('n', 'spare', ?)`,
    [report.storeId, report.storeId],
  );
  for (const [targetId, state, remote, enabled] of [
    [fixture.targetId, "active", "verified", true],
    [fixture.spareTargetId, "failed", "abandoned", false],
  ] as const) {
    await db.raw(
      sql`INSERT INTO ${q("targets")} (target_id, namespace, definition, physical_index, write_alias, fingerprint, hash_version, capture_epoch, state, write_enabled, create_operation_id, remote_create_state) VALUES (?, 'n', 'd', ?, ?, 'fp', 'sonamu-c14n-v1', 1, ?, ?, 'op-create', ?)`,
      [targetId, physicalName(targetId), physicalName(targetId) + "-w", state, enabled, remote],
    );
  }
  await db.raw(
    sql`INSERT INTO ${q("read_heads")} (namespace, definition, target_id, generation, max_search_lifetime_ms, max_cursor_lifetime_ms, max_pit_keep_alive_ms, retirement_safety_margin_ms) VALUES ('n', 'd', ?, 1, 30000, 600000, 300000, 60000)`,
    [fixture.targetId],
  );
  await db.raw(sql`INSERT INTO ${q("admin_controls")} (namespace, definition) VALUES ('n', 'd')`);
  const operation = await db.raw<{ rows: { operation_seq: string }[] }>(
    sql`INSERT INTO ${q("admin_operations")} (operation_id, namespace, definition, kind, actor, reason, outcome) VALUES ('op', 'n', 'd', 'create', 'tester', 'fixture', 'started') RETURNING operation_seq`,
  );
  fixture.operationSeq = Number(operation.rows[0]?.operation_seq);
  await db.raw(
    sql`INSERT INTO ${q("documents")} (namespace, definition, document_id, revision) VALUES ('n', 'd', 'a', 1)`,
  );
  const intent = await db.raw<{ rows: { intent_id: string }[] }>(
    sql`INSERT INTO ${q("deliveries")} (target_id, document_id, desired_revision) VALUES (?, 'a', 1) RETURNING intent_id`,
    [fixture.targetId],
  );
  fixture.intentId = intent.rows[0]?.intent_id ?? "";
  await db.raw(
    sql`INSERT INTO ${q("delivery_runtime")} (target_id, document_id, intent_id) VALUES (?, 'a', ?)`,
    [fixture.targetId, fixture.intentId],
  );
  await db.raw(
    sql`INSERT INTO ${q("builds")} (build_id, namespace, definition, kind, new_target_id, expected_read_generation, capture_epoch, phase, operation_id) VALUES (?, 'n', 'd', 'initial', ?, 0, 1, 'failed', 'op-build')`,
    [fixture.buildId, fixture.targetId],
  );
  await db.raw(
    sql`INSERT INTO ${q("worker_heartbeats")} (worker_id, namespace, capabilities, state, started_at) VALUES (?, 'n', ARRAY['d@fp'], 'running', clock_timestamp())`,
    [fixture.workerId],
  );
  await db.raw(sql`INSERT INTO ${q("target_fences")} (target_id, epoch) VALUES (?, 1)`, [
    fixture.targetId,
  ]);

  for (const group of [...GROUPS, "outsider"] as const) {
    connectionByMember.set(group, await RoleConnection.open(group, roleOf(group)));
  }
});

afterAll(async () => {
  await Promise.allSettled([...connectionByMember.values()].map((connection) => connection.end()));
});

interface AttemptStatement {
  text: string;
  values: unknown[];
}

/** An INSERT per table that can succeed, with a fresh key each time. */
function insertFor(table: Table): AttemptStatement {
  const t = qualified(schema, table);
  const fresh = randomUUID();
  switch (table) {
    case "schema_versions":
      return {
        text: sql`INSERT INTO ${t} (version, name, checksum, package_version) VALUES ($1, 'x', 'x', 'x')`,
        values: [99],
      };
    case "store":
      return {
        text: sql`INSERT INTO ${t} (singleton) VALUES ($1) ON CONFLICT DO NOTHING`,
        values: [true],
      };
    case "indexes":
      return {
        text: sql`INSERT INTO ${t} (namespace, definition, store_id) VALUES ('n', $1, gen_random_uuid())`,
        values: ["new-def"],
      };
    case "targets":
      return {
        text: sql`INSERT INTO ${t} (target_id, namespace, definition, physical_index, write_alias, fingerprint, hash_version, capture_epoch, state, create_operation_id) VALUES ($1, 'n', 'd', $2, $3, 'fp', 'sonamu-c14n-v1', 1, 'creating', 'op')`,
        values: [fresh, physicalName(fresh), physicalName(fresh) + "-w"],
      };
    case "read_heads":
      return {
        text: sql`INSERT INTO ${t} (namespace, definition, max_search_lifetime_ms, max_cursor_lifetime_ms, max_pit_keep_alive_ms, retirement_safety_margin_ms) VALUES ('n', $1, 1, 1, 1, 1)`,
        values: ["spare"],
      };
    case "admin_controls":
      return {
        text: sql`INSERT INTO ${t} (namespace, definition) VALUES ('n', $1)`,
        values: ["spare"],
      };
    case "admin_operations":
      return {
        text: sql`INSERT INTO ${t} (operation_id, namespace, definition, kind, actor, reason, outcome) VALUES ($1, 'n', 'd', 'k', 'a', 'r', 'started')`,
        values: ["op-new"],
      };
    case "documents":
      return {
        text: sql`INSERT INTO ${t} (namespace, definition, document_id, revision) VALUES ('n', 'd', $1, 1)`,
        values: [fresh],
      };
    case "deliveries":
      return {
        text: sql`INSERT INTO ${t} (target_id, document_id, desired_revision) VALUES ($1, $2, 1)`,
        values: [fixture.targetId, fresh],
      };
    case "delivery_runtime":
      return {
        text: sql`INSERT INTO ${t} (target_id, document_id, intent_id) VALUES ($1, $2, gen_random_uuid())`,
        values: [fixture.targetId, fresh],
      };
    case "builds":
      return {
        text: sql`INSERT INTO ${t} (build_id, namespace, definition, kind, new_target_id, expected_read_generation, capture_epoch, phase, operation_id) VALUES ($1, 'n', 'd', 'rebuild', $2, 0, 1, 'failed', 'op')`,
        values: [fresh, fixture.targetId],
      };
    case "worker_heartbeats":
      return {
        text: sql`INSERT INTO ${t} (worker_id, namespace, capabilities, state, started_at) VALUES ($1, 'n', ARRAY['x'], 'running', clock_timestamp())`,
        values: [fresh],
      };
    case "target_fences":
      return { text: sql`INSERT INTO ${t} (target_id, epoch) VALUES ($1, 1)`, values: [fresh] };
  }
}

/** A DELETE per table of one row nothing else references. */
function deleteFor(table: Table): AttemptStatement {
  const t = qualified(schema, table);
  switch (table) {
    case "schema_versions":
      return { text: sql`DELETE FROM ${t} WHERE version = $1`, values: [1] };
    case "store":
      return { text: sql`DELETE FROM ${t} WHERE singleton = $1`, values: [true] };
    case "indexes":
    case "admin_controls":
      return {
        text: sql`DELETE FROM ${t} WHERE namespace = 'n' AND definition = $1`,
        values: [table === "indexes" ? "spare" : "d"],
      };
    case "targets":
      return { text: sql`DELETE FROM ${t} WHERE target_id = $1`, values: [fixture.spareTargetId] };
    case "read_heads":
      return {
        text: sql`DELETE FROM ${t} WHERE namespace = 'n' AND definition = $1`,
        values: ["d"],
      };
    case "admin_operations":
      return {
        text: sql`DELETE FROM ${t} WHERE operation_seq = $1`,
        values: [fixture.operationSeq],
      };
    case "documents":
      return { text: sql`DELETE FROM ${t} WHERE document_id = $1`, values: ["a"] };
    case "deliveries":
    case "delivery_runtime":
      return { text: sql`DELETE FROM ${t} WHERE intent_id = $1`, values: [fixture.intentId] };
    case "builds":
      return { text: sql`DELETE FROM ${t} WHERE build_id = $1`, values: [fixture.buildId] };
    case "worker_heartbeats":
      return { text: sql`DELETE FROM ${t} WHERE worker_id = $1`, values: [fixture.workerId] };
    case "target_fences":
      return { text: sql`DELETE FROM ${t} WHERE target_id = $1`, values: [fixture.targetId] };
  }
}

async function columnsOf(table: Table): Promise<{ name: string; identity: boolean }[]> {
  const result = await h.knex.raw<{ rows: { name: string; identity: boolean }[] }>(
    "SELECT column_name AS name, is_identity = 'YES' AS identity FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
    [schema, table],
  );
  return result.rows;
}

/** Any error other than 42501 is reported as such, so it fails the comparison. */
function verdict(outcome: Outcome): "allowed" | "denied" | string {
  if (outcome.ok) return "allowed";
  return outcome.code === "42501" ? "denied" : "error " + outcome.code;
}

describe("GRANT 렌더링", () => {
  it("비운 묶음의 GRANT는 만들지 않고, 여러 역할은 쉼표로 잇는다", () => {
    const rendered = renderSearchGrantsSql({ schema, roles: { query: ["q1", "q2"] } });
    const q = quoteIdentifier(schema);
    expect(rendered).toBe(
      "GRANT USAGE ON SCHEMA " +
        q +
        ' TO "q1", "q2";\n' +
        "GRANT SELECT ON " +
        q +
        ".schema_versions, " +
        q +
        '.store TO "q1", "q2";\n' +
        "GRANT SELECT ON " +
        q +
        ".read_heads, " +
        q +
        '.targets TO "q1", "q2";\n' +
        "GRANT SELECT (namespace, definition, capture_epoch) ON " +
        q +
        '.indexes TO "q1", "q2";\n',
    );
  });

  it("잘못되거나 예약되거나 중복된 역할, 빈 역할 목록은 거부한다", () => {
    const cases: [Parameters<typeof renderSearchGrantsSql>[0]["roles"], string][] = [
      [{}, "grants.noRoles"],
      [{ capture: [] }, "grants.noRoles"],
      [{ capture: ["public"] }, "grants.reservedRole"],
      [{ admin: ["pg_write_all_data"] }, "grants.reservedRole"],
      [{ capture: ["app"], worker: ["app"] }, "grants.duplicateRole"],
      [{ capture: ["app", "app"] }, "grants.duplicateRole"],
      [{ capture: ['app"; DROP ROLE x; --'] }, "sql.invalidIdentifier"],
      [{ capture: ["App"] }, "sql.invalidIdentifier"],
    ];
    for (const [roleGrants, key] of cases) {
      let caught: SearchError | undefined;
      try {
        renderSearchGrantsSql({ schema, roles: roleGrants });
      } catch (error) {
        if (!(error instanceof SearchError)) throw error;
        caught = error;
      }
      expect(caught, key).toBeInstanceOf(SearchConfigurationError);
      expect(caught?.messageKey).toBe(key);
    }
    // SAFETY: bypasses the type check to prove the runtime check refuses an unknown role group.
    expect(() => renderSearchGrantsSql({ schema, roles: { reader: ["x"] } } as never)).toThrow(
      SearchConfigurationError,
    );
  });
});

describe("최소 권한: 각 역할로 접속해 실제로 시도한다", () => {
  it("모든 역할은 스키마 USAGE와 schema_versions, store 읽기만 공통으로 가진다; 권한 없는 역할은 아무것도 못 한다", async () => {
    for (const group of GROUPS) {
      const versions = await connectionOf(group).attempt(
        sql`SELECT version FROM ${qualified(schema, "schema_versions")} ORDER BY version`,
      );
      expect(versions, group).toMatchObject({ ok: true, rows: [{ version: 1 }, { version: 2 }] });
      const [row] = (await connectionOf(group).attempt(readStoreId())).ok ? [true] : [false];
      expect(row, group).toBe(true);
    }
    const outsider = connectionOf("outsider");
    for (const table of TABLES) {
      expect(
        verdict(await outsider.attempt(sql`SELECT 1 FROM ${qualified(schema, table)}`)),
        table,
      ).toBe("denied");
    }
    expect(verdict(await outsider.attempt(readStoreId()))).toBe("denied");
  });

  for (const group of GROUPS) {
    it(
      group +
        ": 열마다 SELECT와 UPDATE, 테이블마다 INSERT와 DELETE가 표와 정확히 같게 허용되거나 거부된다",
      async () => {
        const connection = connectionOf(group);
        const mismatches: string[] = [];
        const check = (label: string, expected: boolean, outcome: Outcome): void => {
          const actual = verdict(outcome);
          const wanted = expected ? "allowed" : "denied";
          if (actual !== wanted)
            mismatches.push(label + ": expected " + wanted + ", got " + actual);
        };
        for (const table of TABLES) {
          const t = qualified(schema, table);
          for (const column of await columnsOf(table)) {
            const c = identifier(column.name);
            check(
              table + "." + column.name + " SELECT",
              allows(group, table, "SELECT", column.name),
              await connection.attempt(sql`SELECT ${c} FROM ${t}`),
            );
            const update = column.identity
              ? sql`UPDATE ${t} SET ${c} = DEFAULT`
              : sql`UPDATE ${t} SET ${c} = ${c}`;
            const updateOutcome = await connection.attempt(update);
            check(
              table + "." + column.name + " UPDATE",
              allows(group, table, "UPDATE", column.name),
              updateOutcome,
            );
            // Success on an empty table proves nothing, so an allowed UPDATE must touch a row.
            if (updateOutcome.ok && updateOutcome.rowCount === 0)
              mismatches.push(table + "." + column.name + " UPDATE touched no row");
          }
          const insert = insertFor(table);
          const insertOutcome = await connection.attempt(insert.text, insert.values);
          check(table + " INSERT", allows(group, table, "INSERT"), insertOutcome);
          if (insertOutcome.ok && insertOutcome.rowCount !== 1)
            mismatches.push(table + " INSERT wrote " + insertOutcome.rowCount + " rows");
          const remove = deleteFor(table);
          const deleteOutcome = await connection.attempt(remove.text, remove.values);
          check(table + " DELETE", allows(group, table, "DELETE"), deleteOutcome);
          if (deleteOutcome.ok && deleteOutcome.rowCount !== 1)
            mismatches.push(table + " DELETE removed " + deleteOutcome.rowCount + " rows");
          // No role, admin included, may TRUNCATE or create objects in the schema.
          check(table + " TRUNCATE", false, await connection.attempt(sql`TRUNCATE ${t}`));
        }
        check(
          "CREATE TABLE",
          false,
          await connection.attempt(sql`CREATE TABLE ${qualified(schema, "intruder")} (id integer)`),
        );
        expect(mismatches).toEqual([]);
      },
    );
  }

  it("행 잠금: capture는 장벽 행 FOR SHARE, worker는 intent FOR UPDATE만 할 수 있다", async () => {
    const indexes = qualified(schema, "indexes");
    const deliveries = qualified(schema, "deliveries");
    const runtime = qualified(schema, "delivery_runtime");
    const store = qualified(schema, "store");
    const forShare = sql`SELECT 1 FROM ${indexes} WHERE namespace = 'n' AND definition = 'd' FOR SHARE`;
    const forUpdate = sql`SELECT 1 FROM ${deliveries} WHERE target_id = $1 FOR UPDATE`;
    const runtimeLock = sql`SELECT 1 FROM ${runtime} FOR UPDATE`;
    const storeLock = sql`SELECT 1 FROM ${store} FOR UPDATE`;
    const expected = new Map<Group, readonly [boolean, boolean, boolean]>([
      ["capture", [true, true, false]],
      ["worker", [false, true, true]],
      ["query", [false, false, false]],
      ["admin", [true, true, true]],
    ]);
    for (const group of GROUPS) {
      const connection = connectionOf(group);
      const [share, update, runtimeAllowed] = expected.get(group) ?? [false, false, false];
      expect(verdict(await connection.attempt(forShare)), group + " FOR SHARE indexes").toBe(
        share ? "allowed" : "denied",
      );
      expect(
        verdict(await connection.attempt(forUpdate, [fixture.targetId])),
        group + " FOR UPDATE deliveries",
      ).toBe(update ? "allowed" : "denied");
      expect(
        verdict(await connection.attempt(runtimeLock)),
        group + " FOR UPDATE delivery_runtime",
      ).toBe(runtimeAllowed ? "allowed" : "denied");
      // Only admin may lock the store row, which adoptCopiedStore needs.
      expect(verdict(await connection.attempt(storeLock)), group + " FOR UPDATE store").toBe(
        group === "admin" ? "allowed" : "denied",
      );
    }
  });
});

describe("applySearchGrants", () => {
  it("다시 실행해도 같은 권한이며, 없는 역할은 SearchConfigurationError(42704)로 아무것도 바꾸지 않는다", async () => {
    const before = await h.knex.raw<{ rows: unknown[] }>(
      "SELECT c.relname, c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ? ORDER BY 1",
      [schema],
    );
    await applySearchGrants(h.knex, {
      schema,
      roles: {
        capture: [roleOf("capture").name],
        worker: [roleOf("worker").name],
        query: [roleOf("query").name],
        admin: [roleOf("admin").name],
      },
    });
    let caught: SearchError | undefined;
    try {
      await applySearchGrants(h.knex, {
        schema,
        roles: { capture: [roleOf("outsider").name], worker: ["h_" + h.id + "_does_not_exist"] },
      });
    } catch (error) {
      if (!(error instanceof SearchError)) throw error;
      caught = error;
    }
    expect(caught).toBeInstanceOf(SearchConfigurationError);
    expect(caught?.details).toMatchObject({
      sqlstate: "42704",
      reason: "undefined-object",
    });
    const after = await h.knex.raw<{ rows: unknown[] }>(
      "SELECT c.relname, c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ? ORDER BY 1",
      [schema],
    );
    // The grant the failed call gave the outsider was rolled back too.
    expect(after.rows).toEqual(before.rows);
    expect(verdict(await connectionOf("outsider").attempt(readStoreId()))).toBe("denied");
  });

  it("소유자가 아닌 admin 역할의 GRANT는 아무 권한도 넘기지 못한다", async () => {
    // PostgreSQL only warns on a GRANT without grant option, so check real access instead of the result.
    const text = renderSearchGrantsSql({ schema, roles: { capture: [roleOf("outsider").name] } });
    expect(verdict(await connectionOf("admin").attempt(text, [], { rollback: false }))).toBe(
      "allowed",
    );
    expect(verdict(await connectionOf("outsider").attempt(readStoreId()))).toBe("denied");
    expect(
      verdict(
        await connectionOf("outsider").attempt(
          sql`SELECT 1 FROM ${qualified(schema, "documents")}`,
        ),
      ),
    ).toBe("denied");
  });

  it("스키마 버전이 맞지 않으면 GRANT하지 않는다", async () => {
    const other = h.searchSchema + "_gx";
    await installSearchSchema(h.knex, { schema: other });
    try {
      await h.knex.raw(sql`UPDATE ${qualified(other, "schema_versions")} SET checksum = ?`, [
        "0".repeat(64),
      ]);
      await expect(
        applySearchGrants(h.knex, { schema: other, roles: { query: [roleOf("outsider").name] } }),
      ).rejects.toBeInstanceOf(SearchSchemaVersionMismatch);
    } finally {
      await h.knex.raw(sql`DROP SCHEMA ${identifier(other)} CASCADE`);
    }
  });
});

describe("실제 핸들 작업: 각 작업을 자기 역할과 다른 모든 역할로 실행한다", () => {
  const MEMBERS: readonly Member[] = [...GROUPS, "outsider"];
  const KEY = "notes";
  const docs = new Map<string, { body: string }>();
  const noteSchema = z.object({ body: z.string() });
  const V1 = createTestDefinition({
    key: KEY,
    schema: noteSchema,
    properties: { body: { type: "text" } },
    documents: () => docs,
  });
  const V2 = createTestDefinition({
    key: KEY,
    projectionVersion: "2",
    schema: noteSchema,
    properties: { body: { type: "text" } },
    documents: () => docs,
  });
  // Short retirement grace (cursor + search + margin = 4.1s); query handle limits cannot exceed these.
  const LIFETIMES = {
    maxSearchLifetimeMs: 3_000,
    maxCursorLifetimeMs: 1_000,
    maxPitKeepAliveMs: 1_000,
    retirementSafetyMarginMs: 100,
  };

  interface Handles {
    pool: Knex;
    sync: PostgresSynchronization;
    admin: SearchAdmin;
    /** Admin handle with only the first version, since planCreate needs one definition per key. */
    creator: SearchAdmin;
    requests: RecordedRequest[];
    clients: SearchClient[];
  }

  function audit(): AdminContext {
    return { operationId: `op-${randomUUID()}`, actor: "tester", reason: "grants" };
  }

  function open(member: Member, storeId: string): Handles {
    const pool = knexFactory({
      client: "pg",
      connection: roleOf(member).url,
      pool: { min: 0, max: 3 },
    });
    const recorder = requestRecorder(h.opensearch);
    const client = createSearchClient({
      createClient: () => recorder.client,
      ownsClient: false,
      requestTimeoutMs: 20_000,
    });
    const synchronization = () =>
      createPostgresSynchronization({
        getPrimaryDatabase: () => pool,
        schema: h.searchSchema,
        namespace: h.namespace,
        expectedStoreId: storeId,
      });
    const adminWith = (definitions: readonly (typeof V1)[]) =>
      createSearchAdmin({
        client,
        synchronization: synchronization(),
        definitions,
        lifetimes: LIFETIMES,
        timeouts: {
          lockTimeoutMs: 10_000,
          statementTimeoutMs: 20_000,
          idleInTransactionTimeoutMs: 60_000,
          adminLeaseMs: 120_000,
        },
        cutover: { maxPendingDocuments: 0, sampleSize: 0 },
        workerBounds: { leaseDurationMs: 200, requestTimeoutMs: 200 },
      });
    return {
      pool,
      sync: synchronization(),
      admin: adminWith([V1, V2]),
      creator: adminWith([V1]),
      requests: recorder.requests,
      clients: [client],
    };
  }

  /** Hash of every row per table; a refused operation must leave it unchanged. */
  async function digest(): Promise<string> {
    const parts: string[] = [];
    for (const table of TABLES) {
      const { rows } = await h.knex.raw<{ rows: { d: string }[] }>(
        sql`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS d FROM ${qualified(h.searchSchema, table)} t`,
      );
      parts.push(`${table}=${rows[0].d}`);
    }
    return parts.join(",");
  }

  /** allowed, denied (details.sqlstate 42501), or any other error. */
  async function settle<T>(
    pending: Promise<T>,
  ): Promise<{ verdict: string; value: T | undefined }> {
    try {
      return { verdict: "allowed", value: await pending };
    } catch (error) {
      if (error instanceof SearchError) {
        const verdictOf =
          error.details?.sqlstate === "42501"
            ? "denied"
            : `error ${error.code}/${String(error.details?.reason)}`;
        return { verdict: verdictOf, value: undefined };
      }
      throw error;
    }
  }

  it("동기화, 워커, 조회, 관리의 모든 작업은 자기 역할(과 admin)로만 실행되고, 거부된 시도는 아무것도 바꾸거나 보내지 않는다", async () => {
    await h.knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(h.searchSchema)} CASCADE`);
    const report = await installSearchSchema(h.knex, { schema: h.searchSchema });
    await applySearchGrants(h.knex, {
      schema: h.searchSchema,
      roles: {
        capture: [roleOf("capture").name],
        worker: [roleOf("worker").name],
        query: [roleOf("query").name],
        admin: [roleOf("admin").name],
      },
    });
    docs.clear();
    docs.set("a", { body: "에이" });
    docs.set("b", { body: "비" });
    const handles = new Map(MEMBERS.map((member) => [member, open(member, report.storeId)]));
    const H = (member: Member): Handles => {
      const found = handles.get(member);
      if (found === undefined) throw new Error("핸들이 없습니다: " + member);
      return found;
    };
    const indexerOf = (member: Member) =>
      createIndexer({
        client: (() => {
          const client = createSearchClient({
            createClient: () => h.opensearch,
            ownsClient: false,
            requestTimeoutMs: 10_000,
          });
          H(member).clients.push(client);
          return client;
        })(),
        synchronization: H(member).sync,
        definitions: [V1, V2],
        // Worker leases outlast the admin handle's workerBounds; every drain here acknowledges fully and leaves no
        // lease, so verification's and retirement's "no live lease" checks still hold.
        limits: TEST_LIMITS,
      });
    const queriesOf = (member: Member) => {
      const client = createSearchClient({
        createClient: () => h.opensearch,
        ownsClient: false,
        requestTimeoutMs: 10_000,
      });
      H(member).clients.push(client);
      return createSearchQueries({
        client,
        catalog: createPostgresCatalogReader({
          getPrimaryDatabase: () => H(member).pool,
          schema: h.searchSchema,
          namespace: h.namespace,
        }),
        logicalKey: KEY,
        supportedFingerprints: [V1.fingerprint, V2.fingerprint],
        limits: {
          maxPageSize: 10,
          timeoutMs: 3_000,
          maxSearchLifetimeMs: LIFETIMES.maxSearchLifetimeMs,
          maxCursorLifetimeMs: LIFETIMES.maxCursorLifetimeMs,
          maxPitKeepAliveMs: LIFETIMES.maxPitKeepAliveMs,
        },
      });
    };
    const catalogOf = (member: Member) =>
      createPostgresCatalogReader({
        getPrimaryDatabase: () => H(member).pool,
        schema: h.searchSchema,
        namespace: h.namespace,
      });

    /**
     * Roles outside allowed must be denied with state and remote requests unchanged; allowed roles run in order and
     * the last value is returned.
     */
    const matrix = async <T>(
      name: string,
      attempt: (member: Member) => Promise<T>,
      allowed: readonly Member[],
    ): Promise<T | undefined> => {
      for (const member of MEMBERS.filter((candidate) => !allowed.includes(candidate))) {
        const before = await digest();
        const sent = H(member).requests.length;
        expect((await settle(attempt(member))).verdict, `${name} (${member})`).toBe("denied");
        expect(await digest(), `${name} (${member})이 상태를 바꿨습니다`).toBe(before);
        expect(H(member).requests.length, `${name} (${member})이 원격 요청을 보냈습니다`).toBe(
          sent,
        );
      }
      let last: T | undefined;
      for (const member of allowed) {
        const outcome = await settle(attempt(member));
        expect(outcome.verdict, `${name} (${member})`).toBe("allowed");
        last = outcome.value;
      }
      return last;
    };
    const required = <T>(value: T | undefined): T => {
      if (value === undefined) throw new Error("허용된 실행이 값을 돌려주지 않았습니다.");
      return value;
    };
    const waitForDatabase = async (what: string, predicate: string, values: readonly string[]) => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const { rows } = await h.knex.raw<{ rows: { ok: boolean | null }[] }>(predicate, [
          ...values,
        ]);
        if (rows[0]?.ok === true) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(what + ": 조건이 참이 되지 않았습니다.");
    };
    const t = (name: string) => qualified(h.searchSchema, name);

    try {
      // Every role can read store.
      await matrix("initialize", (m) => H(m).sync.initialize(), [
        "capture",
        "worker",
        "admin",
        "query",
      ]);
      await matrix("checkBinding", (m) => H(m).sync.checkBinding(), [
        "capture",
        "worker",
        "admin",
        "query",
      ]);
      // Planning is read-only; query cannot read indexes.capture_mode.
      const plan = required(
        await matrix("planCreate", (m) => H(m).creator.planCreate(KEY), [
          "capture",
          "worker",
          "admin",
        ]),
      );
      const first = required(
        await matrix("executeCreate", (m) => H(m).creator.executeCreate(plan, audit()), ["admin"]),
      );
      const inspection = required(
        await matrix("inspect", (m) => H(m).admin.inspect(KEY), ["admin"]),
      );
      const buildId = inspection.openBuild?.buildId ?? "";
      await matrix("inspectBuild", (m) => H(m).admin.inspectBuild(buildId), ["admin"]);
      await matrix("runBackfillPage", (m) => H(m).admin.runBackfillPage(buildId, { limit: 10 }), [
        "admin",
      ]);
      while (!(await H("admin").admin.runBackfillPage(buildId, { limit: 10 })).done) {}
      docs.set("c", { body: "씨" });
      await matrix(
        "markChanged",
        (m) => H(m).pool.transaction((trx) => H(m).sync.markChanged(trx, KEY, ["c"])),
        ["admin", "capture"],
      );
      await matrix("drainOnce", (m) => indexerOf(m).drainOnce(), ["admin", "worker"]);
      expect(await indexerOf("worker").drainOnce()).toMatchObject({ claimed: 0 });
      await h.opensearch.indices.refresh({ index: first.physicalIndex });
      await matrix("cutover", (m) => H(m).admin.cutover(buildId, audit()), ["admin"]);
      await matrix(
        "resolveReadHeads",
        (m) => catalogOf(m).resolveReadHeads([KEY], { timeoutMs: 5_000 }),
        ["admin", "query"],
      );
      await matrix(
        "resolveTarget",
        (m) => catalogOf(m).resolveTarget(first.targetId, { timeoutMs: 5_000 }),
        ["admin", "query"],
      );

      // A login role that is a member of both capture and query (INHERIT) can do both; worker work stays denied.
      const both = await h.createRole("app_both");
      await h.knex.raw(
        sql`GRANT ${identifier(roleOf("capture").name)}, ${identifier(roleOf("query").name)} TO ${identifier(both.name)}`,
      );
      const bothPool = knexFactory({
        client: "pg",
        connection: both.url,
        pool: { min: 0, max: 2 },
      });
      try {
        const bothSync = createPostgresSynchronization({
          getPrimaryDatabase: () => bothPool,
          schema: h.searchSchema,
          namespace: h.namespace,
          expectedStoreId: report.storeId,
        });
        docs.set("d", { body: "디" });
        expect(await bothPool.transaction((trx) => bothSync.markChanged(trx, KEY, ["d"]))).toBe(
          "recorded",
        );
        const bothCatalog = createPostgresCatalogReader({
          getPrimaryDatabase: () => bothPool,
          schema: h.searchSchema,
          namespace: h.namespace,
        });
        const heads = await bothCatalog.resolveReadHeads([KEY], { timeoutMs: 5_000 });
        expect(heads.heads.get(KEY)?.target?.targetId).toBe(first.targetId);
        const workerOnly = await bothPool
          .raw(sql`DELETE FROM ${t("delivery_runtime")} WHERE false`)
          .then(
            () => "allowed",
            (error: Error) => (error instanceof DatabaseError ? error.code : "other"),
          );
        expect(workerOnly).toBe("42501");
      } finally {
        await bothPool.destroy();
      }
      await indexerOf("worker").drainOnce();
      // Explicit refresh: relying on the 1s periodic refresh would make seeing d timing-dependent.
      await h.opensearch.indices.refresh({ index: first.physicalIndex });
      const found = required(
        await matrix(
          "search",
          (m) => queriesOf(m).search({ body: { query: { match_all: {} }, size: 10 } }),
          ["admin", "query"],
        ),
      );
      expect(found.hits.map((hit) => hit.id).toSorted()).toEqual(["a", "b", "c", "d"]);
      await matrix("remark", (m) => H(m).admin.remark({ logicalKey: KEY, ids: ["a"] }, audit()), [
        "admin",
      ]);
      await matrix(
        "retryQuarantined",
        (m) => H(m).admin.retryQuarantined({ targetId: first.targetId, limit: 10 }, audit()),
        ["admin"],
      );
      await indexerOf("worker").drainOnce();

      const second = required(
        await matrix(
          "beginRebuild",
          (m) => H(m).admin.beginRebuild({ logicalKey: KEY, fingerprint: V2.fingerprint }, audit()),
          ["admin"],
        ),
      );
      while (!(await H("admin").admin.runBackfillPage(second.buildId, { limit: 10 })).done) {}
      await indexerOf("worker").drainOnce();
      await H("admin").admin.cutover(second.buildId, audit());
      await matrix("rollback", (m) => H(m).admin.rollback(second.buildId, audit()), ["admin"]);
      await H("admin").admin.cutover(second.buildId, audit());

      // The worker role pauses the target with the worker's own statement.
      const paused = await H("worker").pool.raw<{ rows: unknown[] }>(
        sql`UPDATE ${t("targets")} SET state = 'paused', pause_reason = ?::jsonb, paused_at = clock_timestamp()
WHERE target_id = ? AND state = 'active' RETURNING target_id`,
        [JSON.stringify({ class: "revision_divergence", documents: [] }), second.target.targetId],
      );
      expect(paused.rows).toHaveLength(1);
      await waitForDatabase(
        "정지 이후 in-flight 상한",
        sql`SELECT clock_timestamp() >= paused_at + interval '500 milliseconds' AS ok FROM ${t("targets")} WHERE target_id = ?`,
        [second.target.targetId],
      );
      const progress = required(
        await matrix(
          "runTargetVerificationPage",
          (m) => H(m).admin.runTargetVerificationPage(second.target.targetId, { limit: 100 }),
          ["admin"],
        ),
      );
      expect(progress).toMatchObject({ done: true, violations: 0 });
      await matrix(
        "resumeTarget",
        (m) => H(m).admin.resumeTarget(second.target.targetId, audit()),
        ["admin"],
      );

      // Reconcile a creation attempt with an unknown outcome (fixture row).
      const pendingId = randomUUID();
      const physical = buildPhysicalIndexName(h.namespace, KEY, pendingId);
      await h.knex.raw(
        sql`INSERT INTO ${t("targets")} (target_id, namespace, definition, physical_index, write_alias, fingerprint, hash_version, capture_epoch, state, create_operation_id, remote_create_state)
VALUES (?, ?, ?, ?, ?, ?, 'sonamu-c14n-v1', 1, 'creating', 'op-pending', 'ambiguous')`,
        [pendingId, h.namespace, KEY, physical, buildWriteAliasName(physical), V2.fingerprint],
      );
      const reconciled = required(
        await matrix(
          "reconcileCreate",
          (m) => H(m).admin.reconcileCreate(pendingId, { confirmQuiescent: true }, audit()),
          ["admin"],
        ),
      );
      expect(reconciled.remoteCreateState).toBe("abandoned");

      await matrix("suspendCapture", (m) => H(m).admin.suspendCapture(KEY, audit()), ["admin"]);
      await matrix(
        "resumeCaptureForRebuild",
        (m) => H(m).creator.resumeCaptureForRebuild(KEY, audit()),
        ["admin"],
      );

      // Retirement once the grace period since the first target's confirmed deselection has passed.
      await waitForDatabase(
        "읽기 유예",
        sql`SELECT clock_timestamp() >= deselect_confirmed_at + interval '4200 milliseconds' AS ok FROM ${t("targets")} WHERE target_id = ?`,
        [first.targetId],
      );
      await matrix("retireTarget", (m) => H(m).admin.retireTarget(first.targetId, audit()), [
        "admin",
      ]);
      const { rows } = await h.knex.raw<{ rows: { state: string }[] }>(
        sql`SELECT state FROM ${t("targets")} WHERE target_id = ?`,
        [first.targetId],
      );
      expect(rows[0]?.state).toBe("retired");

      // confirm keeps store_id, so the pinned handles stay usable; adopt replaces it and therefore runs last.
      await matrix(
        "confirmStoreOwnership",
        (m) => H(m).admin.confirmStoreOwnership({ confirmSoleOwner: true }, audit()),
        ["admin"],
      );
      const sentBeforeAdopt = H("admin").requests.length;
      const adopted = required(
        await matrix(
          "adoptCopiedStore",
          (m) => H(m).admin.adoptCopiedStore({ confirmCopy: true }, audit()),
          ["admin"],
        ),
      );
      expect(adopted.storeId).not.toBe(report.storeId);
      // Adoption sends no remote command.
      expect(H("admin").requests.length).toBe(sentBeforeAdopt);
    } finally {
      for (const handle of handles.values()) {
        await Promise.allSettled(handle.clients.map((client) => client.close()));
        await handle.pool.destroy();
      }
    }
  });
});

describe("examples/search/administration.ts의 grantSearchRoles", () => {
  it("실제 데이터베이스에서 그대로 실행되고, 네 역할이 서로 다른 그룹 권한을 받는다", async () => {
    const schemaName = h.searchSchema + "_ex";
    const exampleRoles = [
      "chat_search_capture",
      "chat_search_worker",
      "chat_search_query",
      "chat_search_admin",
    ];
    // The example's role names are fixed; leftovers from an earlier run are reused.
    for (const name of exampleRoles) {
      await h.knex.raw(
        sql`DO $$ BEGIN CREATE ROLE ${identifier(name)} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      );
    }
    await installSearchSchema(h.knex, { schema: schemaName });
    // Importing the example builds a query handle at module evaluation, which needs a cursor signing key of at least
    // 32 bytes in SEARCH_CURSOR_SECRET; set it and import dynamically.
    const previousSecret = process.env.SEARCH_CURSOR_SECRET;
    process.env.SEARCH_CURSOR_SECRET = Buffer.alloc(32, 7).toString("base64");
    const { grantSearchRoles } = await import("../../../examples/search/administration");
    if (previousSecret === undefined) delete process.env.SEARCH_CURSOR_SECRET;
    else process.env.SEARCH_CURSOR_SECRET = previousSecret;
    try {
      await grantSearchRoles(h.knex, schemaName);
      const as = async (role: string, text: string) =>
        h.knex.transaction(async (trx) => {
          await trx.raw(sql`SET LOCAL ROLE ${identifier(role)}`);
          return trx.raw(text).then(
            () => "allowed",
            (error: Error) => (error instanceof DatabaseError ? error.code : "other"),
          );
        });
      const readHeads = sql`SELECT 1 FROM ${qualified(schemaName, "read_heads")}`;
      const ledgerWrite = sql`UPDATE ${qualified(schemaName, "documents")} SET revision = revision WHERE false`;
      const runtime = sql`DELETE FROM ${qualified(schemaName, "delivery_runtime")} WHERE false`;
      expect(await as("chat_search_query", readHeads)).toBe("allowed");
      expect(await as("chat_search_query", ledgerWrite)).toBe("42501");
      expect(await as("chat_search_capture", ledgerWrite)).toBe("allowed");
      expect(await as("chat_search_capture", readHeads)).toBe("42501");
      expect(await as("chat_search_worker", runtime)).toBe("allowed");
      expect(await as("chat_search_capture", runtime)).toBe("42501");
      expect(await as("chat_search_admin", runtime)).toBe("allowed");
    } finally {
      await h.knex.raw(sql`DROP SCHEMA ${identifier(schemaName)} CASCADE`);
      for (const name of exampleRoles) {
        await h.knex.raw(sql`DROP ROLE IF EXISTS ${identifier(name)}`);
      }
    }
  });
});
