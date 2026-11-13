import { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchInvalidTransaction } from "../../../src/errors";
import { createPostgresSynchronization, type PostgresSynchronization } from "../../../src/postgres";
import { useIntegrationHarness } from "../../helpers/harness";
import {
  createTarget,
  openAdminClient,
  type PreparedTarget,
  readDeliveries,
  readLedger,
  resetSearchSchema,
  type StatementRunner,
} from "../../helpers/test-targets";

// Every assertion reads committed state through another connection.

const h = useIntegrationHarness({ opensearch: false });
const KEY = "messages";

let admin: { run: StatementRunner; close(): Promise<void> };
let target: PreparedTarget;
let sync: PostgresSynchronization;

beforeAll(async () => {
  admin = await openAdminClient(h);
});
afterAll(async () => {
  await admin.close();
});
beforeEach(async () => {
  await resetSearchSchema(h);
  target = await createTarget(admin.run, {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey: KEY,
  });
  sync = createPostgresSynchronization({
    getPrimaryDatabase: () => h.knex,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
  await sync.initialize();
});

function countQueries(knex: Knex) {
  let count = 0;
  const listener = () => {
    count += 1;
  };
  knex.on("query", listener);
  return { count: () => count, stop: () => knex.off("query", listener) };
}

describe("루트와 savepoint 롤백", () => {
  it("루트 트랜잭션이 롤백되면 원장과 delivery가 남지 않는다", async () => {
    const rollback = new Error("도메인 실패");
    await expect(
      h.knex.transaction(async (trx) => {
        await h.sample.createRoom("r1", trx);
        await expect(sync.markChanged(trx, KEY, ["m-1", "m-2"])).resolves.toBe("recorded");
        throw rollback;
      }),
    ).rejects.toBe(rollback);

    expect(await h.sample.count("rooms")).toBe(0);
    expect(await readLedger(h)).toEqual({});
    expect(await readDeliveries(h)).toEqual({});

    await h.knex.transaction(async (trx) => {
      await sync.markChanged(trx, KEY, ["m-1"]);
    });
    expect(await readLedger(h)).toEqual({ "m-1": 1 });
    expect(await readDeliveries(h)).toEqual({ [`${target.targetId}/m-1`]: 1 });
  });

  it("savepoint가 롤백되면 그 안의 표시만 사라진다", async () => {
    await h.knex.transaction(async (trx) => {
      await h.sample.createRoom("outer", trx);
      await sync.markChanged(trx, KEY, ["outer"]);
      const inner = new Error("savepoint 실패");
      await expect(
        trx.transaction(async (savepoint) => {
          await h.sample.createRoom("inner", savepoint);
          await sync.markChanged(savepoint, KEY, ["inner", "outer"]);
          throw inner;
        }),
      ).rejects.toBe(inner);
      // Rolling back the savepoint also drops its FOR SHARE; marking again must still work.
      await sync.markChanged(trx, KEY, ["after"]);
    });

    const rooms = await h.sample.from("rooms").select("name").orderBy("name");
    expect(rooms.map((room: { name: string }) => room.name)).toEqual(["outer"]);
    expect(await readLedger(h)).toEqual({ after: 1, outer: 1 });
    expect(await readDeliveries(h)).toEqual({
      [`${target.targetId}/after`]: 1,
      [`${target.targetId}/outer`]: 1,
    });
  });

  it("한 트랜잭션 안에서 같은 문서를 여러 번 표시하면 리비전이 그만큼 오르고 의도는 하나로 합쳐진다", async () => {
    await h.knex.transaction(async (trx) => {
      await sync.markChanged(trx, KEY, ["a", "a", "b"]);
      await sync.markChanged(trx, KEY, ["a"]);
    });
    expect(await readLedger(h)).toEqual({ a: 2, b: 1 });
    expect(await readDeliveries(h)).toEqual({
      [`${target.targetId}/a`]: 2,
      [`${target.targetId}/b`]: 1,
    });
  });

  it("배열 리터럴에서 특별한 의미를 갖는 문자와 다국어 ID도 그대로 기록된다", async () => {
    const ids = ["NULL", "a,b", '"q"', "{x}", "back\\slash", " lead", "한글-아이디", "😀"];
    await h.knex.transaction(async (trx) => {
      await sync.markChanged(trx, KEY, ids);
    });
    const ledger = await readLedger(h);
    expect(Object.keys(ledger).toSorted()).toEqual(ids.toSorted());
    expect(Object.values(ledger).every((revision) => revision === 1)).toBe(true);
  });
});

describe("잘못된 트랜잭션", () => {
  it("트랜잭션이 아닌 Knex 핸들은 거부하고 어떤 연결에도 쓰지 않는다", async () => {
    const getPrimaryDatabase = vi.fn(() => h.knex);
    const guarded = createPostgresSynchronization({
      getPrimaryDatabase,
      schema: h.searchSchema,
      namespace: h.namespace,
      expectedStoreId: sync.storeId(),
    });
    const queries = countQueries(h.knex);
    try {
      const handles: unknown[] = [h.knex, null, undefined, {}, { isTransaction: true }];
      for (const handle of handles) {
        // SAFETY: values a JavaScript caller or a type assertion can pass.
        const error = await guarded
          .markChanged(handle as Knex.Transaction, KEY, ["x"])
          .catch((caught) => caught);
        expect(error).toBeInstanceOf(SearchInvalidTransaction);
        expect(error.details).toEqual({ reason: "not-a-transaction" });
      }
    } finally {
      queries.stop();
    }
    expect(queries.count()).toBe(0);
    expect(getPrimaryDatabase).not.toHaveBeenCalled();
    expect(await readLedger(h)).toEqual({});
  });

  it("완료된 트랜잭션은 거부한다", async () => {
    let committed: Knex.Transaction | undefined;
    await h.knex.transaction(async (trx) => {
      committed = trx;
    });
    const rolledBack = await h.knex.transaction();
    await rolledBack.rollback();
    let releasedSavepoint: Knex.Transaction | undefined;
    await h.knex.transaction(async (trx) => {
      await trx.transaction(async (savepoint) => {
        releasedSavepoint = savepoint;
      });
      const queries = countQueries(h.knex);
      try {
        for (const handle of [committed, rolledBack, releasedSavepoint]) {
          // SAFETY: all three are assigned above.
          const error = await sync
            .markChanged(handle as Knex.Transaction, KEY, ["x"])
            .catch((caught) => caught);
          expect(error).toBeInstanceOf(SearchInvalidTransaction);
          expect(error.details).toEqual({ reason: "completed-transaction" });
        }
      } finally {
        queries.stop();
      }
      expect(queries.count()).toBe(0);
      // Passing a finished savepoint cannot fail the outer transaction: there is no live handle to fail.
      await expect(sync.markChanged(trx, KEY, ["ok"])).resolves.toBe("recorded");
    });
    expect(await readLedger(h)).toEqual({ ok: 1 });
  });
});
