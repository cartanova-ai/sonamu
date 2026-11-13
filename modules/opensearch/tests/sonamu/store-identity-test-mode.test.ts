import { BaseModelClass, DB, PuriTransactionWrapper, UpsertBuilder } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchConfigurationError } from "../../src/errors";
import { createPostgresSynchronization, type PostgresSynchronization } from "../../src/postgres";
import {
  createSonamuSynchronization,
  resolveSonamuPrimary,
  type SonamuSearchSynchronization,
} from "../../src/sonamu";
import { useIntegrationHarness } from "../helpers/harness";
import { applyTransactional, configureSonamuDatabase } from "../helpers/sonamu-app";
import { qualified, sql } from "../helpers/sql";
import {
  createTarget,
  openAdminClient,
  readLedger,
  resetSearchSchema,
  type StatementRunner,
} from "../helpers/test-targets";

/**
 * Sonamu test mode (NODE_ENV=test) gives the w and r pools one connection each, and DB.getDB("w") returns the open test
 * transaction. Only this file turns test mode on, to check that:
 * - initialize() called before the test transaction opens borrows that connection for one statement and returns it;
 * - markChanged inside the test transaction runs on the same connection and does not hang.
 * A hang surfaces as a withDeadline failure; no order is assumed from sleeps.
 */

const h = useIntegrationHarness({ opensearch: false });
const KEY = "messages";
const HANG_LIMIT_MS = 10_000;

let admin: { run: StatementRunner; close(): Promise<void> };
let sync: PostgresSynchronization;
let search: SonamuSearchSynchronization;
let storeId: string;

async function withDeadline<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label}이(가) ${HANG_LIMIT_MS}ms 안에 끝나지 않았습니다 (커넥션 1개 풀에서 멈춤).`,
          ),
        ),
      HANG_LIMIT_MS,
    );
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

class StoreProbeModelClass extends BaseModelClass {
  async createRoomAndMark(name: string, documentId: string): Promise<string> {
    await h.sample.createRoom(name, this.getPuri("w").knex);
    return search.markChanged(KEY, [documentId]);
  }
}
applyTransactional(StoreProbeModelClass.prototype, "createRoomAndMark");
const model = new StoreProbeModelClass();

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  configureSonamuDatabase(h, "sonamu-test-mode");
  admin = await openAdminClient(h);
});
afterAll(async () => {
  await admin.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  storeId = await resetSearchSchema(h);
  await createTarget(admin.run, {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey: KEY,
  });
  sync = createPostgresSynchronization({
    getPrimaryDatabase: resolveSonamuPrimary,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
  search = createSonamuSynchronization(sync);
  // The checks below mean something only if test mode really gives a one-connection w pool.
  const pool = DB.getDB("w");
  expect(pool.isTransaction).not.toBe(true);
  expect(pool.client.config.pool).toMatchObject({ min: 1, max: 1 });
  await expect(withDeadline(sync.initialize(), "initialize")).resolves.toEqual({ storeId });
  // Hangs here if initialize() kept the only connection.
  await withDeadline(DB.createTestTransaction(), "createTestTransaction");
});
afterEach(async () => {
  await DB.clearTestTransaction();
});

describe("Sonamu test 모드의 저장소 식별자", () => {
  it("test 모드의 커넥션 1개 풀에서도 initialize와 markChanged가 멈추지 않는다", async () => {
    const shared = DB.getDB("w");
    expect(shared.isTransaction).toBe(true);

    // @transactional opens a savepoint inside the shared test transaction, on the same connection.
    await expect(
      withDeadline(model.createRoomAndMark("room", "m-1"), "@transactional markChanged"),
    ).resolves.toBe("recorded");
    const testTransaction = DB.testTransaction;
    if (testTransaction === null) throw new Error("테스트 트랜잭션이 열려 있어야 합니다.");
    expect(shared).toBe(testTransaction);
    await expect(
      withDeadline(
        search.markChangedIn(
          new PuriTransactionWrapper(testTransaction, new UpsertBuilder()),
          KEY,
          ["m-2"],
        ),
        "markChangedIn",
      ),
    ).resolves.toBe("recorded");
    // A resolved store ID is not read again.
    await expect(withDeadline(sync.initialize(), "두 번째 initialize")).resolves.toEqual({
      storeId,
    });

    // Visible inside the uncommitted test transaction, invisible to another connection.
    const inside = await DB.getDB("w").raw<{ rows: { document_id: string; revision: string }[] }>(
      sql`SELECT document_id, revision FROM ${qualified(h.searchSchema, "documents")} ORDER BY document_id`,
    );
    expect(inside.rows.map((row) => [row.document_id, Number(row.revision)])).toEqual([
      ["m-1", 1],
      ["m-2", 1],
    ]);
    expect(await readLedger(h)).toEqual({});

    await DB.clearTestTransaction();
    expect(await readLedger(h)).toEqual({});
    await withDeadline(DB.createTestTransaction(), "다시 createTestTransaction");
  });

  it("테스트 트랜잭션이 열린 뒤의 initialize도 멈추지 않는다: resolveSonamuPrimary는 거부하고 공유 트랜잭션 resolver는 그 연결에서 읽는다", async () => {
    const strict = createPostgresSynchronization({
      getPrimaryDatabase: resolveSonamuPrimary,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    await expect(
      withDeadline(strict.initialize(), "resolveSonamuPrimary initialize"),
    ).rejects.toMatchObject({
      constructor: SearchConfigurationError,
      details: { reason: "primary-is-transaction" },
    });

    const sharedResolver = createPostgresSynchronization({
      getPrimaryDatabase: () => DB.getDB("w"),
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    await expect(
      withDeadline(sharedResolver.initialize(), "공유 트랜잭션 initialize"),
    ).resolves.toEqual({ storeId });

    // A marker on an uninitialized handle fails closed with a retryable error; only the @transactional savepoint is lost.
    search = createSonamuSynchronization(strict);
    await expect(
      withDeadline(model.createRoomAndMark("rejected", "x"), "미초기화 마커"),
    ).rejects.toMatchObject({
      constructor: SearchConfigurationError,
      retryable: true,
      details: { reason: "store-identity-uninitialized" },
    });
    // The test transaction is still usable.
    search = createSonamuSynchronization(sync);
    await expect(
      withDeadline(model.createRoomAndMark("room", "m-1"), "다시 markChanged"),
    ).resolves.toBe("recorded");
  });
});
