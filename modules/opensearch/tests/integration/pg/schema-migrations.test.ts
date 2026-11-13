import knexFactory, { type Knex } from "knex";
import { afterAll, describe, expect, it } from "vitest";

import {
  checkSearchSchema,
  installSearchSchema,
  renderSearchSchemaSql,
  SEARCH_SCHEMA_VERSION,
} from "../../../src/admin";
import { renderSchemaV1 } from "../../../src/admin/schema/ddl";
import { applySearchGrants } from "../../../src/admin/schema/grants";
import { schemaChecksum } from "../../../src/admin/schema/migrations";
import {
  SearchAdminBusy,
  SearchCatalogUnavailable,
  SearchConfigurationError,
  SearchError,
  SearchInvalidTransaction,
  SearchRevisionOverflow,
  SearchSchemaMissing,
  SearchSchemaVersionMismatch,
  SearchTimeout,
  SearchUnavailable,
} from "../../../src/errors";
import { formatSearchMessage, type SearchMessage } from "../../../src/i18n";
import { mapPgError } from "../../../src/postgres/pg-errors";
import {
  executeSql,
  identifier,
  qualified,
  renderSql,
  schemaIdentifier,
  sql,
  SqlFragment,
  statement,
  timeoutStatement,
} from "../../../src/postgres/sql";
import { useIntegrationHarness } from "../../helpers/harness";
import {
  identifier as testIdentifier,
  qualified as testQualified,
  sql as testSql,
} from "../../helpers/sql";

/**
 * Schema DDL and checksums, the explicit install helper, the SQL identifier path and SQLSTATE mapping. Each test uses
 * its own ss_<id>_<n> schema, dropped in afterAll.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });

let schemaCounter = 0;
const createdSchemas: string[] = [];

function reserveSchema(): string {
  schemaCounter += 1;
  const schema = h.searchSchema + "_" + String(schemaCounter);
  createdSchemas.push(schema);
  return schema;
}

afterAll(async () => {
  for (const schema of createdSchemas) {
    await h.knex.raw(testSql`DROP SCHEMA IF EXISTS ${testIdentifier(schema)} CASCADE`);
  }
});

type RelationRow = { relname: string; relkind: string; acl: string };
type NamespaceRow = { nspname: string; acl: string };

type Snapshot = {
  relations: RelationRow[];
  constraints: unknown[];
  columns: unknown[];
  namespace: NamespaceRow[];
  versions: unknown[];
  store: unknown[];
};

/** Catalogue, version and store rows of a schema, for "nothing changed" comparisons. */
async function snapshot(schema: string): Promise<Snapshot> {
  const relations = await h.knex.raw<{ rows: RelationRow[] }>(
    "SELECT c.relname, c.relkind, coalesce(c.relacl::text, '') AS acl FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ? ORDER BY 1",
    [schema],
  );
  const constraints = await h.knex.raw<{ rows: unknown[] }>(
    "SELECT con.conname, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace WHERE n.nspname = ? ORDER BY 1",
    [schema],
  );
  const columns = await h.knex.raw<{ rows: unknown[] }>(
    "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = ? ORDER BY 1, 2",
    [schema],
  );
  const namespace = await h.knex.raw<{ rows: NamespaceRow[] }>(
    "SELECT nspname, coalesce(nspacl::text, '') AS acl FROM pg_namespace WHERE nspname = ?",
    [schema],
  );
  const present = await h.knex.raw<{ rows: { versions: boolean; store: boolean }[] }>(
    "SELECT to_regclass(format('%I.schema_versions', ?::text)) IS NOT NULL AS versions, to_regclass(format('%I.store', ?::text)) IS NOT NULL AS store",
    [schema, schema],
  );
  const versions = present.rows[0]?.versions
    ? (
        await h.knex.raw<{ rows: unknown[] }>(
          testSql`SELECT version, name, checksum, package_version, applied_at FROM ${testQualified(schema, "schema_versions")} ORDER BY version`,
        )
      ).rows
    : [];
  const store = present.rows[0]?.store
    ? (
        await h.knex.raw<{ rows: unknown[] }>(
          testSql`SELECT singleton, store_id, created_at FROM ${testQualified(schema, "store")}`,
        )
      ).rows
    : [];
  return {
    relations: relations.rows,
    constraints: constraints.rows,
    columns: columns.rows,
    namespace: namespace.rows,
    versions,
    store,
  };
}

async function publicRelations(): Promise<unknown[]> {
  const result = await h.knex.raw<{ rows: unknown[] }>(
    "SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' ORDER BY 1",
  );
  return result.rows;
}

/** Returns the package error; success or a non-package error fails the test. */
async function capture<Result>(work: () => Promise<Result>): Promise<SearchError> {
  try {
    await work();
  } catch (error) {
    if (error instanceof SearchError) return error;
    throw error;
  }
  throw new Error("오류가 나야 했지만 성공했습니다.");
}

function expectMessageKey(
  error: SearchError,
  ErrorClass: new (...args: never[]) => SearchError,
  key: string,
): SearchError {
  expect(error).toBeInstanceOf(ErrorClass);
  expect(error.messageKey).toBe(key);
  return error;
}

/** The mapped error carries only the catalogue message, never the driver's text. */
function expectNoDriverText(mapped: SearchError, driverMessage: string): void {
  // SAFETY: messageKey and messageParams come from the same error object.
  const rendered = formatSearchMessage(
    { key: mapped.messageKey, params: mapped.messageParams } as SearchMessage,
    "en",
  );
  expect(mapped.message).toBe(rendered);
  expect(mapped.message).not.toContain(driverMessage);
  expect(mapped.cause).toBeUndefined();
  for (const value of Object.values(mapped.details ?? {})) {
    expect(String(value)).not.toContain(driverMessage);
  }
}

async function waitForAdvisoryWaiters(count: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await h.knex.raw<{ rows: { waiting: number }[] }>(
      "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'advisory' AND application_name LIKE ?",
      ["h:" + h.id + ":%"],
    );
    if ((result.rows[0]?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("advisory lock을 기다리는 설치자가 관찰되지 않았습니다.");
}

describe("스키마 DDL", () => {
  // Installed databases verify these checksums, so the DDL text of a released version must never change.
  it("버전마다 체크섬이 고정되어 있어 이미 나간 버전의 DDL 텍스트는 바뀌지 않는다", () => {
    expect(schemaChecksum(1)).toBe(
      "e76b33079ec9ced3239beca7ce85b157136e5ce5eba83b0bf700265fb555fd4c",
    );
    expect(schemaChecksum(2)).toBe(
      "6ff737eb98a1f140ea4e857ded51680741b33affd40e0beb1436e2cfded10992",
    );
  });

  it("잘못되거나 예약된 스키마 이름은 렌더링 전에 거부한다", () => {
    for (const schema of ["public", "pg_search", "Bad", 'x"; DROP SCHEMA public; --', ""]) {
      expect(() => renderSearchSchemaSql({ schema })).toThrow(SearchConfigurationError);
    }
    // SAFETY: bypasses the type check to prove the runtime check refuses an unknown option.
    expect(() => renderSearchSchemaSql({ schema: "ok", extra: true } as never)).toThrow(
      SearchConfigurationError,
    );
  });
});

describe("설치 도우미", () => {
  it("명시적으로 부르기 전에는 아무것도 설치되지 않고 checkSearchSchema는 missing이다", async () => {
    const schema = reserveSchema();
    expect(await checkSearchSchema(h.knex, { schema })).toEqual({
      schema,
      installed: null,
      required: SEARCH_SCHEMA_VERSION,
      status: "missing",
    });
    // Checking must not create the schema.
    expect((await snapshot(schema)).namespace).toEqual([]);
  });

  it("두 번 설치해도 변화가 없다", async () => {
    const schema = reserveSchema();
    const publicBefore = await publicRelations();
    const first = await installSearchSchema(h.knex, { schema });
    expect(first.schema).toBe(schema);
    expect(first.applied).toEqual([1, 2]);
    expect(first.current).toBe(SEARCH_SCHEMA_VERSION);
    expect(first.storeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const afterFirst = await snapshot(schema);
    expect(afterFirst.versions).toEqual([
      expect.objectContaining({ version: 1, name: "initial", checksum: schemaChecksum(1) }),
      expect.objectContaining({ version: 2, name: "store-binding", checksum: schemaChecksum(2) }),
    ]);
    expect(afterFirst.store).toEqual([
      expect.objectContaining({ singleton: true, store_id: first.storeId }),
    ]);

    const second = await installSearchSchema(h.knex, { schema });
    expect(second).toEqual({ ...first, applied: [] });
    expect(await snapshot(schema)).toEqual(afterFirst);
    expect(await checkSearchSchema(h.knex, { schema })).toMatchObject({
      installed: 2,
      status: "ok",
    });
    // Nothing goes into public, the only schema Sonamu's migrator reads.
    expect(await publicRelations()).toEqual(publicBefore);
  });

  it("설치한 스키마는 PUBLIC의 권한을 회수하고 13개 테이블을 가진다", async () => {
    const schema = reserveSchema();
    await installSearchSchema(h.knex, { schema });
    const { relations, namespace } = await snapshot(schema);
    const tables = relations
      .filter((relation) => relation.relkind === "r")
      .map((relation) => relation.relname);
    expect(tables).toEqual([
      "admin_controls",
      "admin_operations",
      "builds",
      "deliveries",
      "delivery_runtime",
      "documents",
      "indexes",
      "read_heads",
      "schema_versions",
      "store",
      "target_fences",
      "targets",
      "worker_heartbeats",
    ]);
    // An explicit ACL with no PUBLIC (=...) entry.
    const acl = namespace[0]?.acl ?? "";
    expect(acl).not.toBe("");
    expect(acl).not.toMatch(/[{,]=/);
  });

  it("넘겨받은 트랜잭션에 합류해 그 트랜잭션과 함께 롤백되거나 커밋된다", async () => {
    const schema = reserveSchema();
    const rolledBack = await h.knex.transaction();
    const report = await installSearchSchema(rolledBack, { schema });
    expect(report.applied).toEqual([1, 2]);
    await rolledBack.rollback();
    expect((await snapshot(schema)).namespace).toEqual([]);

    await h.knex.transaction(async (trx) => {
      expect((await installSearchSchema(trx, { schema })).applied).toEqual([1, 2]);
    });
    expect(await checkSearchSchema(h.knex, { schema })).toMatchObject({ status: "ok" });
  });

  it("READ COMMITTED가 아닌 트랜잭션과 끝난 트랜잭션은 아무것도 바꾸지 않고 거부한다", async () => {
    const schema = reserveSchema();
    const repeatable = await h.knex.transaction({ isolationLevel: "repeatable read" });
    try {
      const error = await capture(() => installSearchSchema(repeatable, { schema }));
      expectMessageKey(error, SearchConfigurationError, "schema.isolationNotReadCommitted");
    } finally {
      await repeatable.rollback();
    }
    const completed = await h.knex.transaction();
    await completed.commit();
    expectMessageKey(
      await capture(() => installSearchSchema(completed, { schema })),
      SearchInvalidTransaction,
      "error.invalidTransaction",
    );
    expect((await snapshot(schema)).namespace).toEqual([]);
  });

  it("체크섬이 다르면 아무것도 바꾸지 않고 실패한다", async () => {
    const schema = reserveSchema();
    await installSearchSchema(h.knex, { schema });
    await h.knex.raw(testSql`UPDATE ${testQualified(schema, "schema_versions")} SET checksum = ?`, [
      "0".repeat(64),
    ]);
    const before = await snapshot(schema);
    const error = expectMessageKey(
      await capture(() => installSearchSchema(h.knex, { schema })),
      SearchSchemaVersionMismatch,
      "schema.checksumMismatch",
    );
    expect(error.details).toMatchObject({
      status: "checksum-mismatch",
      installed: 2,
      required: 2,
      version: 1,
    });
    expect(await snapshot(schema)).toEqual(before);
    expect(await checkSearchSchema(h.knex, { schema })).toMatchObject({
      installed: 2,
      status: "checksum-mismatch",
    });
  });

  it("더 높은 버전이 설치돼 있으면 거부한다", async () => {
    const schema = reserveSchema();
    await installSearchSchema(h.knex, { schema });
    await h.knex.raw(
      testSql`INSERT INTO ${testQualified(schema, "schema_versions")} (version, name, checksum, package_version) VALUES (?, ?, ?, ?)`,
      [3, "future", "f".repeat(64), "99.0.0"],
    );
    const before = await snapshot(schema);
    const error = expectMessageKey(
      await capture(() => installSearchSchema(h.knex, { schema })),
      SearchSchemaVersionMismatch,
      "schema.ahead",
    );
    expect(error.messageParams).toEqual({ installed: 3, supported: SEARCH_SCHEMA_VERSION });
    expect(error.details).toMatchObject({ status: "ahead", installed: 3 });
    expect(await snapshot(schema)).toEqual(before);
    expect(await checkSearchSchema(h.knex, { schema })).toMatchObject({
      installed: 3,
      status: "ahead",
    });
    // Granting is refused for the same reason.
    const role = await h.createRole("ahead_capture");
    expectMessageKey(
      await capture(() => applySearchGrants(h.knex, { schema, roles: { capture: [role.name] } })),
      SearchSchemaVersionMismatch,
      "schema.ahead",
    );
  });

  it("버전 행이 비어 있으면 이 패키지가 만든 스키마가 아니므로 거부한다", async () => {
    const schema = reserveSchema();
    await installSearchSchema(h.knex, { schema });
    await h.knex.raw(testSql`DELETE FROM ${testQualified(schema, "schema_versions")}`);
    const before = await snapshot(schema);
    expectMessageKey(
      await capture(() => installSearchSchema(h.knex, { schema })),
      SearchSchemaVersionMismatch,
      "schema.versionGap",
    );
    expect(await snapshot(schema)).toEqual(before);
    expect(await checkSearchSchema(h.knex, { schema })).toMatchObject({
      installed: null,
      status: "checksum-mismatch",
    });
  });

  it("동시 설치자: 두 번째 설치자는 advisory lock을 기다렸다가 아무것도 적용하지 않는다", async () => {
    const schema = reserveSchema();
    const first = await h.knex.transaction();
    let second: Promise<unknown> | null = null;
    try {
      expect((await installSearchSchema(first, { schema })).applied).toEqual([1, 2]);
      second = installSearchSchema(h.knex, { schema });
      await waitForAdvisoryWaiters(1);
      await first.commit();
    } catch (error) {
      await first.rollback();
      throw error;
    }
    expect(await second).toMatchObject({ applied: [] });
    const { versions, store } = await snapshot(schema);
    expect(versions).toHaveLength(2);
    expect(store).toHaveLength(1);
  });

  it("동시 설치자: 먼저 잡은 설치자가 롤백하면 기다리던 설치자가 적용한다", async () => {
    const schema = reserveSchema();
    const first = await h.knex.transaction();
    expect((await installSearchSchema(first, { schema })).applied).toEqual([1, 2]);
    const second = installSearchSchema(h.knex, { schema });
    await waitForAdvisoryWaiters(1);
    await first.rollback();
    expect(await second).toMatchObject({ applied: [1, 2] });
    expect((await snapshot(schema)).versions).toHaveLength(2);
  });

  it("설치 도중 실패하면 일부만 설치된 상태가 남지 않는다", async () => {
    const schema = reserveSchema();
    // A pre-existing table named like the DDL's last table makes the last CREATE TABLE fail with 42P07.
    await h.knex.raw(testSql`CREATE SCHEMA ${testIdentifier(schema)}`);
    await h.knex.raw(
      testSql`CREATE TABLE ${testQualified(schema, "worker_heartbeats")} (id integer)`,
    );
    const before = await snapshot(schema);
    const error = expectMessageKey(
      await capture(() => installSearchSchema(h.knex, { schema })),
      SearchConfigurationError,
      "pg.duplicateObject",
    );
    expect(error.details).toMatchObject({ sqlstate: "42P07", reason: "duplicate-object" });
    expect(await snapshot(schema)).toEqual(before);

    // In a caller's transaction only the savepoint is rolled back; the transaction stays usable.
    await h.knex.transaction(async (trx) => {
      await expect(installSearchSchema(trx, { schema })).rejects.toBeInstanceOf(
        SearchConfigurationError,
      );
      await trx.raw(
        testSql`INSERT INTO ${testQualified(schema, "worker_heartbeats")} (id) VALUES (?)`,
        [7],
      );
    });
    const after = await snapshot(schema);
    expect(after.relations).toEqual(before.relations);
    expect(after.versions).toEqual([]);
    const rows = await h.knex.raw<{ rows: { id: number }[] }>(
      testSql`SELECT id FROM ${testQualified(schema, "worker_heartbeats")}`,
    );
    expect(rows.rows).toEqual([{ id: 7 }]);
  });

  it("스키마가 없으면 런타임 호출은 SearchSchemaMissing", async () => {
    const schema = reserveSchema();
    const s = schemaIdentifier(schema);
    // A runtime statement against a missing schema gets 42P01.
    const missingSchema = expectMessageKey(
      await capture(() =>
        executeSql(
          h.knex,
          statement(sql`SELECT store_id FROM ${qualified(s, "store")};`),
          "capture",
        ),
      ),
      SearchSchemaMissing,
      "pg.schemaMissing",
    );
    expect(missingSchema.details).toMatchObject({ sqlstate: "42P01", reason: "undefined-table" });
    // A statement naming the schema itself gets 3F000.
    const undefinedSchema = expectMessageKey(
      await capture(() =>
        executeSql(h.knex, statement(sql`GRANT USAGE ON SCHEMA ${s} TO CURRENT_USER`), "worker"),
      ),
      SearchSchemaMissing,
      "pg.schemaMissing",
    );
    expect(undefinedSchema.details).toMatchObject({
      sqlstate: "3F000",
      reason: "undefined-schema",
    });
    // Same when the schema exists without the tables.
    await h.knex.raw(testSql`CREATE SCHEMA ${testIdentifier(schema)}`);
    expectMessageKey(
      await capture(() =>
        executeSql(
          h.knex,
          statement(sql`SELECT store_id FROM ${qualified(s, "store")};`),
          "catalog",
        ),
      ),
      SearchSchemaMissing,
      "pg.schemaMissing",
    );
    const role = await h.createRole("missing_query");
    expectMessageKey(
      await capture(() => applySearchGrants(h.knex, { schema, roles: { query: [role.name] } })),
      SearchSchemaMissing,
      "schema.notInstalled",
    );
  });
});

/** A schema at version 1, as the version 1 installer left it: its DDL and its schema_versions row. */
async function installVersion1(schema: string): Promise<void> {
  await h.knex.transaction(async (trx) => {
    await trx.raw(renderSql(renderSchemaV1(schemaIdentifier(schema))));
    await trx.raw(
      testSql`INSERT INTO ${testQualified(schema, "schema_versions")} (version, name, checksum, package_version) VALUES (?, ?, ?, ?)`,
      [1, "initial", schemaChecksum(1), "0.0.0-v1"],
    );
  });
}

type OriginRow = {
  store_id: string;
  origin_system_identifier: string | null;
  origin_database_oid: string | null;
  origin_database_name: string | null;
  origin_recorded_at: Date | null;
  instance_name: string | null;
};

async function originOf(schema: string): Promise<OriginRow | undefined> {
  const result = await h.knex.raw<{ rows: OriginRow[] }>(
    testSql`SELECT store_id::text, origin_system_identifier, origin_database_oid::text, origin_database_name, origin_recorded_at, instance_name FROM ${testQualified(schema, "store")}`,
  );
  return result.rows[0];
}

async function currentOrigin(): Promise<{ sysid: string; oid: string; name: string }> {
  const result = await h.knex.raw<{ rows: { sysid: string; oid: string; name: string }[] }>(
    "SELECT (pg_control_system()).system_identifier::text AS sysid, (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS oid, current_database()::text AS name",
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("현재 원점을 읽지 못했습니다.");
  return row;
}

describe("스키마 버전 2: 저장소 원점과 업그레이드", () => {
  it("새 설치는 버전 2에서 끝나고 이 데이터베이스의 원점을 기록하며, 다시 설치해도 원점을 다시 기록하지 않는다", async () => {
    const schema = reserveSchema();
    const report = await installSearchSchema(h.knex, { schema });
    expect(report).toMatchObject({ applied: [1, 2], current: 2 });
    const now = await currentOrigin();
    const origin = await originOf(schema);
    expect(origin).toMatchObject({
      store_id: report.storeId,
      origin_system_identifier: now.sysid,
      origin_database_oid: now.oid,
      origin_database_name: now.name,
      instance_name: null,
    });
    expect(origin?.origin_recorded_at).toBeInstanceOf(Date);
    expect((await installSearchSchema(h.knex, { schema })).applied).toEqual([]);
    expect(await originOf(schema)).toEqual(origin);
  });

  it("버전 1 설치는 제자리에서 버전 2로 올라가고 store_id와 기존 행을 보존하며 원점을 기록한다", async () => {
    const schema = reserveSchema();
    await installVersion1(schema);
    expect(await checkSearchSchema(h.knex, { schema })).toMatchObject({
      installed: 1,
      required: 2,
      status: "behind",
    });
    // Version 1's store has no origin columns.
    const before = (
      await h.knex.raw<{ rows: { store_id: string }[] }>(
        testSql`SELECT store_id::text FROM ${testQualified(schema, "store")}`,
      )
    ).rows[0];
    const targetId = "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
    await h.knex.raw(
      testSql`INSERT INTO ${testQualified(schema, "indexes")} (namespace, definition, store_id) SELECT 'n', 'd', store_id FROM ${testQualified(schema, "store")}`,
    );
    await h.knex.raw(
      testSql`INSERT INTO ${testQualified(schema, "targets")} (target_id, namespace, definition, physical_index, write_alias, fingerprint, hash_version, capture_epoch, state, create_operation_id) VALUES (?, 'n', 'd', 'p', 'w', 'fp', 'h', 1, 'creating', 'op')`,
      [targetId],
    );
    // Version 1's CHECK does not allow detached.
    await expect(
      h.knex.raw(testSql`UPDATE ${testQualified(schema, "targets")} SET state = 'detached'`),
    ).rejects.toMatchObject({ code: "23514" });

    const report = await installSearchSchema(h.knex, { schema });
    expect(report).toMatchObject({ applied: [2], current: 2, storeId: before?.store_id });
    const now = await currentOrigin();
    expect(await originOf(schema)).toMatchObject({
      store_id: before?.store_id,
      origin_system_identifier: now.sysid,
      origin_database_oid: now.oid,
      origin_database_name: now.name,
    });
    const { versions } = await snapshot(schema);
    expect(versions).toEqual([
      expect.objectContaining({ version: 1, package_version: "0.0.0-v1" }),
      expect.objectContaining({ version: 2, checksum: schemaChecksum(2) }),
    ]);
    await h.knex.raw(
      testSql`UPDATE ${testQualified(schema, "targets")} SET state = 'detached', detached_at = clock_timestamp()`,
    );
    await h.knex.raw(
      testSql`INSERT INTO ${testQualified(schema, "target_fences")} (target_id) VALUES (?)`,
      [targetId],
    );
    expect(await checkSearchSchema(h.knex, { schema })).toMatchObject({ status: "ok" });
  });

  it("버전 2 적용이 실패하면 버전 1이 그대로 남고, 원인을 치우면 다시 올릴 수 있다", async () => {
    const schema = reserveSchema();
    await installVersion1(schema);
    // A pre-existing target_fences makes CREATE TABLE fail with 42P07 after both ALTERs already ran.
    await h.knex.raw(testSql`CREATE TABLE ${testQualified(schema, "target_fences")} (id integer)`);
    const before = await snapshot(schema);
    const error = expectMessageKey(
      await capture(() => installSearchSchema(h.knex, { schema })),
      SearchConfigurationError,
      "pg.duplicateObject",
    );
    expect(error.details).toMatchObject({ sqlstate: "42P07" });
    // Both ALTERs were rolled back and only the version 1 row remains.
    expect(await snapshot(schema)).toEqual(before);
    expect(await checkSearchSchema(h.knex, { schema })).toMatchObject({
      installed: 1,
      status: "behind",
    });
    await h.knex.raw(testSql`DROP TABLE ${testQualified(schema, "target_fences")}`);
    expect((await installSearchSchema(h.knex, { schema })).applied).toEqual([2]);
  });
});

describe("SQL 식별자 경로", () => {
  it("검증되지 않은 식별자와 조각이 아닌 값은 SQL 텍스트에 들어가지 못한다", () => {
    for (const name of ["Bad", 'a"b', "a b", "", "x".repeat(64), "1abc"]) {
      expect(() => identifier(name)).toThrow(SearchConfigurationError);
    }
    expect(() => schemaIdentifier("public")).toThrow(SearchConfigurationError);
    // A string in fragment position is refused at runtime too; JSON.parse yields any, so no type assertion is needed.
    const untrusted: SqlFragment = JSON.parse('"public.users; DROP TABLE x"');
    expect(() => sql`SELECT * FROM ${untrusted}`).toThrow(SearchConfigurationError);
    // A plain array instead of a template strings object is refused.
    const forged: TemplateStringsArray = JSON.parse('["SELECT 1; DROP TABLE x"]');
    expect(() => sql(forged)).toThrow(SearchConfigurationError);
    // Fragments cannot be constructed outside the module, even bypassing the private constructor.
    expect(() => Reflect.construct(SqlFragment, [Symbol("SqlFragment"), "DROP TABLE x"])).toThrow(
      SearchConfigurationError,
    );
    expect(() => Reflect.construct(SqlFragment, ["DROP TABLE x"])).toThrow(
      SearchConfigurationError,
    );
    // An object with only the prototype is not a fragment.
    const imitation: SqlFragment = Object.create(SqlFragment.prototype);
    expect(() => sql`SELECT * FROM ${imitation}`).toThrow(SearchConfigurationError);
    // Converting a fragment to a string or JSON is refused.
    const fragment = identifier("ok");
    expect(() => String(fragment)).toThrow(SearchConfigurationError);
    expect(() => JSON.stringify({ fragment })).toThrow(SearchConfigurationError);
    expect(sql`SELECT ${identifier("a")} FROM ${qualified(identifier("s"), "t")}`).toBeInstanceOf(
      SqlFragment,
    );
  });

  it("문장의 자리표시자와 값의 개수가 맞지 않으면 거부한다", () => {
    expect(() => statement(sql`SELECT $1, $2`, ["a"])).toThrow(SearchConfigurationError);
    expect(() => statement(sql`SELECT $1`, ["a", "b"])).toThrow(SearchConfigurationError);
    expect(() => statement(sql`SELECT $3`, ["a"])).toThrow(SearchConfigurationError);
    expect(() =>
      timeoutStatement({ lockTimeoutMs: 0, statementTimeoutMs: 1, idleInTransactionTimeoutMs: 1 }),
    ).toThrow(SearchConfigurationError);
  });

  it("값은 바인드 매개변수로 전달되고, 반복된 $n과 배열과 리터럴 ?가 그대로 동작한다", async () => {
    const result = await executeSql(
      h.knex,
      statement(
        sql`SELECT $1::text AS a, $1::text AS b, $2::text[] AS list, '?' AS mark, (jsonb '{"k": 1}' ? 'k') AS has_key, $3::int AS n`,
        ["x'); DROP TABLE y; --", ["p", null, "q"], 3],
      ),
      "capture",
    );
    expect(result.rows).toEqual([
      {
        a: "x'); DROP TABLE y; --",
        b: "x'); DROP TABLE y; --",
        list: ["p", null, "q"],
        mark: "?",
        has_key: true,
        n: 3,
      },
    ]);
  });

  it("시간 제한 문장은 값 바인딩으로 현재 트랜잭션에만 적용된다", async () => {
    await h.knex.transaction(async (trx) => {
      await executeSql(
        trx,
        timeoutStatement({
          lockTimeoutMs: 300,
          statementTimeoutMs: 10_000,
          idleInTransactionTimeoutMs: 30_000,
        }),
        "admin",
      );
      const result = await trx.raw<{ rows: unknown[] }>(
        "SELECT current_setting('lock_timeout') AS lock, current_setting('statement_timeout') AS statement, current_setting('idle_in_transaction_session_timeout') AS idle",
      );
      expect(result.rows).toEqual([{ lock: "300ms", statement: "10s", idle: "30s" }]);
    });
  });
});

/** Installs a schema with ledger rows x and y for the error mapping tests. */
async function installed(): Promise<string> {
  const schema = reserveSchema();
  await installSearchSchema(h.knex, { schema });
  await h.knex.raw(
    testSql`INSERT INTO ${testQualified(schema, "documents")} (namespace, definition, document_id, revision) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
    ["n", "d", "x", 1, "n", "d", "y", 1],
  );
  return schema;
}

describe("PostgreSQL 오류 매핑", () => {
  it("40001: 직렬화 실패는 재시도 가능한 오류가 되고 드라이버 메시지를 싣지 않는다", async () => {
    const schema = await installed();
    const documents = testQualified(schema, "documents");
    const { sessions } = await h.openSessions(["a", "b"]);
    await sessions.a.run("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await sessions.a.run(testSql`SELECT revision FROM ${documents} WHERE document_id = 'x'`);
    await sessions.b.run(testSql`UPDATE ${documents} SET revision = 2 WHERE document_id = 'x'`);
    const failure = await sessions.a.expectError(
      testSql`UPDATE ${documents} SET revision = 3 WHERE document_id = 'x'`,
      "40001",
    );
    await sessions.a.run("ROLLBACK");
    const mapped = mapPgError(failure.error, "capture");
    expectMessageKey(mapped, SearchUnavailable, "pg.transactionConflict");
    expect(mapped.retryable).toBe(true);
    expect(mapped.details).toEqual({ sqlstate: "40001", reason: "serialization-failure" });
    expectNoDriverText(mapped, failure.message);
    expect(mapPgError(failure.error, "admin")).toBeInstanceOf(SearchAdminBusy);
    expect(mapPgError(failure.error, "catalog")).toBeInstanceOf(SearchCatalogUnavailable);
  });

  it("40P01: 교착 상태도 트랜잭션 충돌로 매핑된다", async () => {
    const schema = await installed();
    const documents = testQualified(schema, "documents");
    const { sessions } = await h.openSessions(["a", "b"]);
    // Different deadlock_timeout values make b the one that detects the deadlock.
    await sessions.a.run("SET deadlock_timeout = '10s'");
    await sessions.b.run("SET deadlock_timeout = '50ms'");
    await sessions.a.run("BEGIN");
    await sessions.b.run("BEGIN");
    await sessions.a.run(testSql`SELECT 1 FROM ${documents} WHERE document_id = 'x' FOR UPDATE`);
    await sessions.b.run(testSql`SELECT 1 FROM ${documents} WHERE document_id = 'y' FOR UPDATE`);
    const blocked = await sessions.a.block(
      testSql`SELECT 1 FROM ${documents} WHERE document_id = 'y' FOR UPDATE`,
      [],
      {
        blockedBy: sessions.b,
      },
    );
    const failure = await sessions.b.expectError(
      testSql`SELECT 1 FROM ${documents} WHERE document_id = 'x' FOR UPDATE`,
      "40P01",
      [],
      { lockWait: "allow" },
    );
    await blocked.expectSuccess();
    await sessions.b.run("ROLLBACK");
    await sessions.a.run("ROLLBACK");
    const mapped = expectMessageKey(
      mapPgError(failure.error, "worker"),
      SearchUnavailable,
      "pg.transactionConflict",
    );
    expect(mapped.details).toEqual({ sqlstate: "40P01", reason: "deadlock" });
    expectNoDriverText(mapped, failure.message);
  });

  it("55P03, 57014: 잠금/문장 시간 초과는 관리 작업에서 SearchAdminBusy, 그 밖에서는 SearchTimeout", async () => {
    const schema = await installed();
    const s = schemaIdentifier(schema);
    const { sessions } = await h.openSessions(["holder"]);
    await sessions.holder.run("BEGIN");
    await sessions.holder.run(testSql`SELECT 1 FROM ${testQualified(schema, "store")} FOR UPDATE`);
    const lockStore = statement(sql`SELECT 1 FROM ${qualified(s, "store")} FOR UPDATE`);
    const timeouts = timeoutStatement({
      lockTimeoutMs: 50,
      statementTimeoutMs: 100,
      idleInTransactionTimeoutMs: 10_000,
    });
    for (const [context, ErrorClass] of [
      ["admin", SearchAdminBusy],
      ["capture", SearchTimeout],
    ] as const) {
      const trx = await h.knex.transaction();
      try {
        await executeSql(trx, timeouts, context);
        const error = expectMessageKey(
          await capture(() => executeSql(trx, lockStore, context)),
          ErrorClass,
          "pg.lockTimeout",
        );
        expect(error.retryable).toBe(true);
        expect(error.details).toMatchObject({ sqlstate: "55P03", reason: "lock-timeout" });
      } finally {
        await trx.rollback();
      }
    }
    await sessions.holder.run("ROLLBACK");
    for (const [context, ErrorClass] of [
      ["admin", SearchAdminBusy],
      ["catalog", SearchTimeout],
    ] as const) {
      const trx = await h.knex.transaction();
      try {
        await executeSql(trx, timeouts, context);
        const error = expectMessageKey(
          await capture(() => executeSql(trx, statement(sql`SELECT pg_sleep(2)`), context)),
          ErrorClass,
          "pg.lockTimeout",
        );
        expect(error.details).toMatchObject({ sqlstate: "57014", reason: "statement-canceled" });
      } finally {
        await trx.rollback();
      }
    }
  });

  it("23514: 리비전 범위 제약은 SearchRevisionOverflow, 그 밖의 CHECK 위반은 SearchConfigurationError", async () => {
    const schema = await installed();
    const s = schemaIdentifier(schema);
    const revision = expectMessageKey(
      await capture(() =>
        executeSql(
          h.knex,
          statement(
            sql`INSERT INTO ${qualified(s, "documents")} (namespace, definition, document_id, revision) VALUES ($1, $2, $3, $4)`,
            ["n", "d", "z", 9_007_199_254_740_992],
          ),
          "capture",
        ),
      ),
      SearchRevisionOverflow,
      "pg.revisionOutOfRange",
    );
    expect(revision.details).toEqual({
      sqlstate: "23514",
      reason: "check-violation",
      constraint: "documents_revision_safe_integer",
      table: "documents",
    });
    expectMessageKey(
      await capture(() =>
        executeSql(
          h.knex,
          statement(
            sql`INSERT INTO ${qualified(s, "deliveries")} (target_id, document_id, desired_revision) VALUES (gen_random_uuid(), $1, $2)`,
            ["z", 0],
          ),
          "capture",
        ),
      ),
      SearchRevisionOverflow,
      "pg.revisionOutOfRange",
    );
    const other = expectMessageKey(
      await capture(() =>
        executeSql(
          h.knex,
          statement(
            sql`INSERT INTO ${qualified(s, "indexes")} (namespace, definition, store_id) VALUES ($1, $2, gen_random_uuid())`,
            ["BAD", "d"],
          ),
          "admin",
        ),
      ),
      SearchConfigurationError,
      "pg.checkViolation",
    );
    expect(other.details).toMatchObject({ constraint: "indexes_namespace_check" });
  });

  it("25006, 25P02: 읽기 전용 트랜잭션과 이미 실패한 트랜잭션은 SearchInvalidTransaction", async () => {
    const schema = await installed();
    const insert = statement(
      sql`INSERT INTO ${qualified(schemaIdentifier(schema), "documents")} (namespace, definition, document_id, revision) VALUES ($1, $2, $3, $4)`,
      ["n", "d", "w", 1],
    );
    const trx = await h.knex.transaction();
    try {
      await trx.raw("SET TRANSACTION READ ONLY");
      const readOnly = expectMessageKey(
        await capture(() => executeSql(trx, insert, "capture")),
        SearchInvalidTransaction,
        "pg.readOnlyTransaction",
      );
      expect(readOnly.details).toMatchObject({ sqlstate: "25006" });
      const failed = expectMessageKey(
        await capture(() => executeSql(trx, insert, "capture")),
        SearchInvalidTransaction,
        "pg.failedTransaction",
      );
      expect(failed.details).toMatchObject({ sqlstate: "25P02" });
    } finally {
      await trx.rollback();
    }
  });

  it("SQLSTATE가 없는 드라이버 오류는 메시지 없이 unavailable로 바뀐다", async () => {
    const unreachable: Knex = knexFactory({
      client: "pg",
      connection: {
        host: "127.0.0.1",
        port: 1,
        user: "nobody",
        database: "none",
        connectionTimeoutMillis: 2000,
      },
      pool: { min: 0, max: 1 },
      acquireConnectionTimeout: 5000,
    });
    try {
      const error = await capture(() =>
        executeSql(unreachable, statement(sql`SELECT 1`), "worker"),
      );
      const mapped = expectMessageKey(error, SearchUnavailable, "pg.driverError");
      expect(mapped.retryable).toBe(true);
      expect(mapped.details).toMatchObject({ reason: "connection", errorCode: "ECONNREFUSED" });
      const catalog = await capture(() =>
        executeSql(unreachable, statement(sql`SELECT 1`), "catalog"),
      );
      expect(catalog).toBeInstanceOf(SearchCatalogUnavailable);
    } finally {
      await unreachable.destroy();
    }
    const secret = new Error("password=hunter2 in driver text");
    const mapped = mapPgError(secret, "capture");
    expectNoDriverText(mapped, "hunter2");
    expect(mapped.details).toEqual({ reason: "driver-error", errorName: "Error" });
    // A package error is returned unchanged.
    const original = new SearchTimeout();
    expect(mapPgError(original, "admin")).toBe(original);
  });
});
