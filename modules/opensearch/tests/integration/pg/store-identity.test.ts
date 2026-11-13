import knexFactory, { type Knex } from "knex";
import { Client as PgClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { installSearchSchema } from "../../../src/admin";
import {
  SearchConfigurationError,
  SearchSchemaMissing,
  SearchStoreMismatch,
  SearchTimeout,
} from "../../../src/errors";
import {
  createPostgresSynchronization,
  type MarkChangedResult,
  type PostgresSynchronizationOptions,
} from "../../../src/postgres";
import { useIntegrationHarness } from "../../helpers/harness";
import { installSampleDomain, type SampleChat } from "../../helpers/sample-domain";
import { identifier, qualified, sql } from "../../helpers/sql";
import {
  clientRunner,
  createTarget,
  openAdminClient,
  readLedger,
  resetSearchSchema,
  type StatementRunner,
} from "../../helpers/test-targets";

/**
 * The store identity comes only from expectedStoreId or from what initialize() reads on the configured primary; it is
 * never inferred from the transaction passed to markChanged. A second database with the same schema, namespace,
 * logical key and target makes the difference observable.
 */

const h = useIntegrationHarness({ opensearch: false });
const KEY = "messages";

let admin: { run: StatementRunner; close(): Promise<void> };
let storeA: string;
let storeB: string;
let otherDatabase: string;
let otherKnex: Knex;
let otherSample: SampleChat;
let otherAdmin: PgClient;

function synchronization(overrides: Partial<PostgresSynchronizationOptions> = {}) {
  return createPostgresSynchronization({
    getPrimaryDatabase: () => h.knex,
    schema: h.searchSchema,
    namespace: h.namespace,
    ...overrides,
  });
}

function otherDatabaseUrl(): string {
  const url = new URL(h.connectionString("other-db"));
  url.pathname = `/${otherDatabase}`;
  return url.toString();
}

beforeAll(async () => {
  admin = await openAdminClient(h);
  otherDatabase = `ss2_${h.id}`;
  await h.knex.raw(sql`CREATE DATABASE ${identifier(otherDatabase)}`);
  otherKnex = knexFactory({
    client: "pg",
    connection: otherDatabaseUrl(),
    pool: { min: 0, max: 4 },
  });
  otherSample = await installSampleDomain(otherKnex, h.appSchema);
  otherAdmin = new PgClient({ connectionString: otherDatabaseUrl() });
  otherAdmin.on("error", () => {});
  await otherAdmin.connect();
  h.onCleanup(async () => {
    await otherAdmin.end().catch(() => {});
    await otherKnex.destroy();
    await h.knex.raw(sql`DROP DATABASE IF EXISTS ${identifier(otherDatabase)} WITH (FORCE)`);
  });
});
afterAll(async () => {
  await admin.close();
});
beforeEach(async () => {
  storeA = await resetSearchSchema(h);
  await createTarget(admin.run, {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey: KEY,
  });
  // Same schema name and catalogue in the second database; only the store identity differs.
  await otherKnex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(h.searchSchema)} CASCADE`);
  await otherKnex.raw(sql`TRUNCATE ${qualified(h.appSchema, "rooms")} RESTART IDENTITY CASCADE`);
  storeB = (await installSearchSchema(otherKnex, { schema: h.searchSchema })).storeId;
  await createTarget(clientRunner(otherAdmin), {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey: KEY,
  });
});

async function otherLedgerSize(): Promise<number> {
  const { rows } = await otherKnex.raw<{ rows: { count: string }[] }>(
    sql`SELECT count(*) AS count FROM ${qualified(h.searchSchema, "documents")}`,
  );
  return Number(rows[0].count);
}

/** Writes a domain row in the other database, swallows markChanged's error and commits. */
async function markInOtherDatabase(
  mark: (trx: Knex.Transaction) => Promise<MarkChangedResult>,
): Promise<Error | undefined> {
  let caught: Error | undefined;
  await otherKnex.transaction(async (trx) => {
    await otherSample.createRoom("other", trx);
    caught = await mark(trx).then(
      () => undefined,
      (error) => error,
    );
  });
  return caught;
}

describe("저장소 식별자", () => {
  it("initialize 전의 마커는 실패 닫힘으로 거부된다", async () => {
    const getPrimaryDatabase = vi.fn(() => h.knex);
    const sync = synchronization({ getPrimaryDatabase });
    expect(sync.storeId()).toBeUndefined();

    let caught: unknown;
    await h.knex.transaction(async (trx) => {
      await h.sample.createRoom("domain", trx);
      caught = await sync.markChanged(trx, KEY, ["a"]).then(
        () => undefined,
        (error) => error,
      );
    });
    expect(caught).toBeInstanceOf(SearchConfigurationError);
    expect(caught).toMatchObject({
      retryable: true,
      details: { reason: "store-identity-uninitialized" },
    });
    // The marker neither calls initialize nor uses another connection.
    expect(getPrimaryDatabase).not.toHaveBeenCalled();
    expect(await h.sample.count("rooms")).toBe(0);
    expect(await readLedger(h)).toEqual({});

    await expect(sync.initialize()).resolves.toEqual({ storeId: storeA });
    expect(getPrimaryDatabase).toHaveBeenCalledTimes(1);
    await h.knex.transaction(async (trx) => {
      await expect(sync.markChanged(trx, KEY, ["a"])).resolves.toBe("recorded");
    });
    expect(await readLedger(h)).toEqual({ a: 1 });
  });

  it("저장소 식별자는 설정된 primary에서만 읽는다: 다른 데이터베이스의 트랜잭션은 SearchStoreMismatch", async () => {
    expect(storeB).not.toBe(storeA);

    // A marker from the other database before initialize must not pin that store.
    const sync = synchronization();
    const early = await markInOtherDatabase((trx) => sync.markChanged(trx, KEY, ["b"]));
    expect(early).toMatchObject({ details: { reason: "store-identity-uninitialized" } });
    expect(sync.storeId()).toBeUndefined();

    await expect(sync.initialize()).resolves.toEqual({ storeId: storeA });
    const late = await markInOtherDatabase((trx) => sync.markChanged(trx, KEY, ["b"]));
    expect(late).toBeInstanceOf(SearchStoreMismatch);
    expect(late).toMatchObject({
      details: { reason: "store-mismatch", expected: storeA, actual: storeB },
    });
    expect(await otherSample.count("rooms")).toBe(0);
    expect(await otherLedgerSize()).toBe(0);

    await h.knex.transaction(async (trx) => {
      await expect(sync.markChanged(trx, KEY, ["a"])).resolves.toBe("recorded");
    });
    expect(sync.storeId()).toBe(storeA);
  });

  it("expectedStoreId와 읽은 값이 다르면 initialize가 실패한다", async () => {
    const wrong = synchronization({ expectedStoreId: storeB });
    // With a configured id the marker works without initialize and compares against it.
    expect(wrong.storeId()).toBe(storeB);
    await expect(wrong.initialize()).rejects.toMatchObject({
      constructor: SearchStoreMismatch,
      details: { reason: "expected-store-mismatch", expected: storeB, actual: storeA },
    });
    let caught: unknown;
    await h.knex.transaction(async (trx) => {
      await h.sample.createRoom("domain", trx);
      caught = await wrong.markChanged(trx, KEY, ["a"]).catch((error) => error);
    });
    expect(caught).toBeInstanceOf(SearchStoreMismatch);
    expect(await h.sample.count("rooms")).toBe(0);

    const right = synchronization({ expectedStoreId: storeA });
    await h.knex.transaction(async (trx) => {
      await expect(right.markChanged(trx, KEY, ["a"])).resolves.toBe("recorded");
    });
    await expect(right.initialize()).resolves.toEqual({ storeId: storeA });
  });

  it("동시에 부른 initialize는 저장소 식별자 조회 한 번을 공유하고, 실패한 initialize는 다시 시도할 수 있다", async () => {
    const getPrimaryDatabase = vi.fn(() => h.knex);
    const sync = synchronization({ getPrimaryDatabase });
    let statements = 0;
    const listener = () => {
      statements += 1;
    };
    h.knex.on("query", listener);
    try {
      const results = await Promise.all([sync.initialize(), sync.initialize(), sync.initialize()]);
      expect(results).toEqual([{ storeId: storeA }, { storeId: storeA }, { storeId: storeA }]);
      await sync.initialize();
    } finally {
      h.knex.off("query", listener);
    }
    expect(getPrimaryDatabase).toHaveBeenCalledTimes(1);
    expect(statements).toBe(1);

    const missing = synchronization({ schema: `missing_${h.id}` });
    await expect(missing.initialize()).rejects.toBeInstanceOf(SearchSchemaMissing);
    await expect(missing.initialize()).rejects.toBeInstanceOf(SearchSchemaMissing);
  });

  it("initialize는 중단 신호, 끝난 트랜잭션, 실패한 resolver를 타입 오류로 알린다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      synchronization().initialize({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(SearchTimeout);

    const finished = await h.knex.transaction();
    await finished.rollback();
    // A resolver returning a finished transaction (Knex.Transaction is a subtype of Knex).
    const finishedPrimary = synchronization({ getPrimaryDatabase: () => finished });
    await expect(finishedPrimary.initialize()).rejects.toMatchObject({
      constructor: SearchConfigurationError,
      details: { reason: "invalid-primary" },
    });

    const throwing = synchronization({
      getPrimaryDatabase: () => {
        throw new Error("resolver 실패");
      },
    });
    await expect(throwing.initialize()).rejects.toMatchObject({
      constructor: SearchConfigurationError,
      details: { reason: "primary-resolver-failed" },
    });

    // A resolver returning a live transaction (Sonamu test mode's shared transaction) is read on that connection.
    await h.knex.transaction(async (trx) => {
      const shared = synchronization({ getPrimaryDatabase: () => trx });
      await expect(shared.initialize()).resolves.toEqual({ storeId: storeA });
    });
  });
});
