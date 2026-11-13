import { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SearchUnavailable } from "../../../src/errors";
import { createPostgresSynchronization, type PostgresSynchronization } from "../../../src/postgres";
import { useIntegrationHarness } from "../../helpers/harness";
import { qualified, sql } from "../../helpers/sql";
import {
  backendPid,
  createTarget,
  openAdminClient,
  readLedger,
  resetSearchSchema,
  type StatementRunner,
  waitForLockWait,
} from "../../helpers/test-targets";

/**
 * Marker lock order. One call sorts its IDs by bytes, so two calls over the same IDs only wait, never deadlock. Order
 * across calls is the caller's job: following the guideline (logical keys ascending, all IDs of a key in one call)
 * avoids deadlocks; breaking it yields a retryable 40P01 and the whole transaction can be rerun.
 */

const h = useIntegrationHarness({ opensearch: false });
const MESSAGES = "messages";
const ROOMS = "rooms";

let admin: { run: StatementRunner; close(): Promise<void> };
let sync: PostgresSynchronization;

beforeAll(async () => {
  admin = await openAdminClient(h);
});
afterAll(async () => {
  await admin.close();
});
beforeEach(async () => {
  await resetSearchSchema(h);
  for (const logicalKey of [MESSAGES, ROOMS]) {
    await createTarget(admin.run, { schema: h.searchSchema, namespace: h.namespace, logicalKey });
  }
  sync = createPostgresSynchronization({
    getPrimaryDatabase: () => h.knex,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
  await sync.initialize();
});

async function openWriter(): Promise<{ trx: Knex.Transaction; pid: number }> {
  const trx = await h.knex.transaction();
  await trx.raw("SELECT set_config('deadlock_timeout', '50ms', true)");
  return { trx, pid: await backendPid(trx) };
}

/** Marks a promise as handled so an early test failure leaves no unhandled rejection. */
function later<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  return promise;
}

describe("마커 잠금 순서", () => {
  it("키와 ID를 한 번에 정렬해 표시하면 두 트랜잭션이 교착하지 않는다", async () => {
    // Test-only gate: with sonamu_test.gate on, inserting the 'lock-b' row waits on an advisory lock.
    const gateFunction = qualified(h.searchSchema, "test_gate_row");
    await h.knex.raw(
      sql`CREATE FUNCTION ${gateFunction}() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN
  IF current_setting('sonamu_test.gate', true) = 'on' AND NEW.document_id = 'lock-b' THEN
    PERFORM pg_advisory_xact_lock(current_setting('sonamu_test.gate_key')::bigint);
  END IF;
  RETURN NEW;
END $f$`,
    );
    await h.knex.raw(
      sql`CREATE TRIGGER test_gate BEFORE INSERT ON ${qualified(h.searchSchema, "documents")} FOR EACH ROW EXECUTE FUNCTION ${gateFunction}()`,
    );
    const gateKey = Number.parseInt(h.id, 16);
    const { sessions } = await h.openSessions(["holder"]);
    await sessions.holder.run("SELECT pg_advisory_lock($1)", [gateKey]);

    const first = await openWriter();
    await first.trx.raw(
      "SELECT set_config('sonamu_test.gate', 'on', true), set_config('sonamu_test.gate_key', ?, true)",
      [String(gateKey)],
    );
    // Whatever the input order, lock-a is inserted first and the call stops right before lock-b.
    const firstMark = later(sync.markChanged(first.trx, MESSAGES, ["lock-b", "lock-a"]));
    await waitForLockWait(h.knex, first.pid, sessions.holder.pid);

    // The second call waits on lock-a without holding lock-b, so there is no cycle.
    const second = await openWriter();
    const secondMark = later(sync.markChanged(second.trx, MESSAGES, ["lock-b", "lock-a"]));
    await waitForLockWait(h.knex, second.pid, first.pid);

    await sessions.holder.run("SELECT pg_advisory_unlock($1)", [gateKey]);
    await expect(firstMark).resolves.toBe("recorded");
    await first.trx.commit();
    await expect(secondMark).resolves.toBe("recorded");
    await second.trx.commit();
    expect(await readLedger(h)).toEqual({ "lock-a": 2, "lock-b": 2 });
  });

  it("logical key를 오름차순으로, key마다 한 번 표시하면 겹치는 두 트랜잭션은 기다릴 뿐 교착하지 않는다", async () => {
    const first = await openWriter();
    const second = await openWriter();
    await sync.markChanged(first.trx, MESSAGES, ["m-1"]);
    const secondMessages = later(sync.markChanged(second.trx, MESSAGES, ["m-1"]));
    await waitForLockWait(h.knex, second.pid, first.pid);
    await sync.markChanged(first.trx, ROOMS, ["r-1"]);
    await first.trx.commit();
    await expect(secondMessages).resolves.toBe("recorded");
    await sync.markChanged(second.trx, ROOMS, ["r-1"]);
    await second.trx.commit();
    expect(await readLedger(h)).toEqual({ "m-1": 2, "r-1": 2 });
  });

  it("같은 key의 ID를 반대 순서로 나눠 표시해 지침을 어기면 40P01이 재시도 가능한 오류로 나고, 트랜잭션 전체를 다시 하면 성공한다", async () => {
    const firstSteps = [
      [MESSAGES, "a"],
      [MESSAGES, "b"],
    ] as const;
    const secondSteps = [
      [MESSAGES, "b"],
      [MESSAGES, "a"],
    ] as const;
    const first = await openWriter();
    const second = await openWriter();
    await sync.markChanged(first.trx, firstSteps[0][0], [firstSteps[0][1]]);
    await sync.markChanged(second.trx, secondSteps[0][0], [secondSteps[0][1]]);
    const firstPending = later(sync.markChanged(first.trx, firstSteps[1][0], [firstSteps[1][1]]));
    await waitForLockWait(h.knex, first.pid, second.pid);
    const secondPending = later(
      sync.markChanged(second.trx, secondSteps[1][0], [secondSteps[1][1]]),
    );

    // The victim keeps its locks until it rolls back, so the survivor is still waiting at this point.
    const victim = await Promise.race([
      firstPending.then(
        () => null,
        (error: Error) => ({ writer: first, steps: firstSteps, error }),
      ),
      secondPending.then(
        () => null,
        (error: Error) => ({ writer: second, steps: secondSteps, error }),
      ),
    ]);
    if (victim === null) throw new Error("교착이 감지되지 않았습니다.");
    expect(victim.error).toBeInstanceOf(SearchUnavailable);
    expect(victim.error).toMatchObject({
      retryable: true,
      details: { sqlstate: "40P01", reason: "deadlock" },
    });
    await victim.writer.trx.rollback();
    const survivor = victim.writer === first ? second : first;
    await expect(victim.writer === first ? secondPending : firstPending).resolves.toBe("recorded");
    await survivor.trx.commit();

    await h.knex.transaction(async (trx) => {
      for (const [logicalKey, id] of victim.steps) {
        await sync.markChanged(trx, logicalKey, [id]);
      }
    });
    const ledger = await readLedger(h);
    expect(Object.values(ledger)).toEqual([2, 2]);
  });
});
