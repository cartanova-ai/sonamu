import { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  SearchConfigurationError,
  type SearchError,
  SearchInvalidDocumentId,
  SearchNotConfigured,
  SearchNoWriteTarget,
  SearchRevisionOverflow,
} from "../../../src/errors";
import {
  createPostgresSynchronization,
  type MarkChangedResult,
  type PostgresSynchronization,
  type PostgresSynchronizationOptions,
} from "../../../src/postgres";
import { useIntegrationHarness } from "../../helpers/harness";
import { qualified, sql } from "../../helpers/sql";
import {
  createTarget,
  openAdminClient,
  readDeliveries,
  readLedger,
  resetSearchSchema,
  type StatementRunner,
  targetStatements,
} from "../../helpers/test-targets";

/**
 * When a package precondition fails, markChanged first puts the caller's transaction (or savepoint) into the failed
 * state and then throws the typed error. A caller that swallows the error and returns normally still has its COMMIT
 * turned into a ROLLBACK by PostgreSQL. One case per distinct refusal; uninitialized store identity and store mismatch
 * are covered with the same assertions in store-identity.test.ts.
 */

const h = useIntegrationHarness({ opensearch: false });
const KEY = "messages";

let admin: { run: StatementRunner; close(): Promise<void> };
let storeId: string;
let sync: PostgresSynchronization;

function synchronization(overrides: Partial<PostgresSynchronizationOptions> = {}) {
  return createPostgresSynchronization({
    getPrimaryDatabase: () => h.knex,
    schema: h.searchSchema,
    namespace: h.namespace,
    ...overrides,
  });
}

beforeAll(async () => {
  admin = await openAdminClient(h);
});
afterAll(async () => {
  await admin.close();
});
beforeEach(async () => {
  storeId = await resetSearchSchema(h);
  await createTarget(admin.run, {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey: KEY,
  });
  sync = synchronization();
  await sync.initialize();
});

type SwallowedOutcome = {
  error: SearchError;
  /** SQLSTATE of the next statement in the same transaction. */
  followUpSqlstate: string | undefined;
};

/** Writes a domain row, swallows markChanged's error and returns normally, so Knex sends COMMIT. */
async function markAndSwallow(
  run: (trx: Knex.Transaction) => Promise<MarkChangedResult>,
): Promise<SwallowedOutcome> {
  let outcome: SwallowedOutcome | undefined;
  await h.knex.transaction(async (trx) => {
    await h.sample.createRoom("domain", trx);
    const error = await run(trx).then(
      () => undefined,
      (caught: SearchError) => caught,
    );
    if (error === undefined) throw new Error("markChanged가 실패해야 했습니다.");
    const followUp = await trx.raw("SELECT 1").then(
      () => undefined,
      (caught: { code?: string }) => caught.code,
    );
    outcome = { error, followUpSqlstate: followUp };
  });
  if (outcome === undefined) throw new Error("트랜잭션 콜백이 실행되지 않았습니다.");
  return outcome;
}

describe("패키지 전제 조건 실패", () => {
  type Case = {
    name: string;
    run: (trx: Knex.Transaction) => Promise<MarkChangedResult>;
    errorClass: abstract new (...args: never[]) => SearchError;
    reason: string;
    retryable?: boolean;
  };
  const cases: Case[] = [
    {
      name: "등록되지 않은 logical key",
      run: (trx) => sync.markChanged(trx, "unknown-key", ["a"]),
      errorClass: SearchNotConfigured,
      reason: "logical-key-not-registered",
    },
    {
      name: "쓰기 대상 없음",
      run: async (trx) => {
        // Only the first target-intent statement: an index row with no registered target.
        await admin.run(targetStatements(h.searchSchema).ensureIndexRow, [h.namespace, "orphans"]);
        return sync.markChanged(trx, "orphans", ["a"]);
      },
      errorClass: SearchNoWriteTarget,
      reason: "no-write-target",
    },
    {
      name: "빈 문서 ID",
      run: (trx) => sync.markChanged(trx, KEY, ["a", ""]),
      errorClass: SearchInvalidDocumentId,
      reason: "",
    },
    {
      name: "문자열이 아닌 문서 ID",
      // @ts-expect-error -- a value a JavaScript caller can pass
      run: (trx) => sync.markChanged(trx, KEY, [42]),
      errorClass: SearchInvalidDocumentId,
      reason: "invalid-mark-input",
    },
    {
      name: "잘못된 logical key",
      run: (trx) => sync.markChanged(trx, "Bad Key", ["a"]),
      errorClass: SearchConfigurationError,
      reason: "invalid-logical-key",
    },
    {
      name: "호출당 ID 상한 초과",
      run: async (trx) => {
        const small = synchronization({ maxIdsPerCall: 2, expectedStoreId: storeId });
        return small.markChanged(trx, KEY, ["a", "b", "c"]);
      },
      errorClass: SearchConfigurationError,
      reason: "too-many-ids",
    },
  ];

  it.each(cases)(
    "패키지 전제 조건 실패 뒤 예외를 삼켜도 도메인 변경은 커밋되지 않는다: $name",
    async ({ run, errorClass, reason, retryable }) => {
      const { error, followUpSqlstate } = await markAndSwallow(run);

      // The typed error, not the 22012 used to fail the transaction.
      expect(error).toBeInstanceOf(errorClass);
      if (reason !== "") expect(error.details?.reason).toBe(reason);
      if (retryable !== undefined) expect(error.retryable).toBe(retryable);
      expect(followUpSqlstate).toBe("25P02");
      expect(await h.sample.count("rooms")).toBe(0);
      expect(await readLedger(h)).toEqual({});
      expect(await readDeliveries(h)).toEqual({});
    },
  );

  it("SQL 오류(리비전 상한)는 별도의 실패 처리 없이도 트랜잭션을 실패시킨다", async () => {
    await h.knex.raw(
      sql`INSERT INTO ${qualified(h.searchSchema, "documents")} (namespace, definition, document_id, revision) VALUES (?, ?, 'max', 9007199254740991)`,
      [h.namespace, KEY],
    );
    const { error, followUpSqlstate } = await markAndSwallow((trx) =>
      sync.markChanged(trx, KEY, ["max"]),
    );
    expect(error).toBeInstanceOf(SearchRevisionOverflow);
    expect(error.details).toMatchObject({ sqlstate: "23514" });
    expect(followUpSqlstate).toBe("25P02");
    expect(await h.sample.count("rooms")).toBe(0);
    expect(await readLedger(h)).toEqual({ max: 9_007_199_254_740_991 });
  });
});

describe("호출자 savepoint", () => {
  it("호출자 savepoint 안에서는 그 savepoint만 잃는다", async () => {
    await h.knex.transaction(async (trx) => {
      await h.sample.createRoom("outer", trx);
      await sync.markChanged(trx, KEY, ["outer"]);
      const error = await trx
        .transaction(async (savepoint) => {
          await h.sample.createRoom("inner", savepoint);
          await sync.markChanged(savepoint, "unknown-key", ["inner"]);
        })
        .then(
          () => undefined,
          (caught: SearchError) => caught,
        );
      // The savepoint callback rethrew, so Knex ran ROLLBACK TO SAVEPOINT.
      expect(error).toBeInstanceOf(SearchNotConfigured);
      await expect(sync.markChanged(trx, KEY, ["after"])).resolves.toBe("recorded");
    });
    const rooms = await h.sample.from("rooms").select("name");
    expect(rooms.map((room: { name: string }) => room.name)).toEqual(["outer"]);
    expect(await readLedger(h)).toEqual({ after: 1, outer: 1 });
  });

  it("savepoint 안에서 예외를 삼키면 savepoint 해제가 실패하고 바깥 커밋도 도메인 변경을 남기지 않는다", async () => {
    let releaseSqlstate: string | undefined;
    await h.knex.transaction(async (trx) => {
      await h.sample.createRoom("outer", trx);
      releaseSqlstate = await trx
        .transaction(async (savepoint) => {
          await h.sample.createRoom("inner", savepoint);
          await sync.markChanged(savepoint, "unknown-key", ["inner"]).catch(() => undefined);
        })
        .then(
          () => undefined,
          (caught: { code?: string }) => caught.code,
        );
    });
    expect(releaseSqlstate).toBe("25P02");
    expect(await h.sample.count("rooms")).toBe(0);
    expect(await readLedger(h)).toEqual({});
  });
});
