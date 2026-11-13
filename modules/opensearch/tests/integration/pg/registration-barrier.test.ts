import { type Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SearchUnavailable } from "../../../src/errors";
import { createPostgresSynchronization, type PostgresSynchronization } from "../../../src/postgres";
import { useIntegrationHarness } from "../../helpers/harness";
import { type PgSession } from "../../helpers/pg-sessions";
import {
  backendPid,
  closeOpenBuildsForTest,
  createTarget,
  openAdminClient,
  prepareTarget,
  type PreparedTarget,
  readDeliveries,
  releaseLease,
  resetSearchSchema,
  runRegistrationBody,
  sessionRunner,
  type StatementRunner,
  TEST_ADMIN_TIMEOUTS,
  targetStatements,
  waitForLockWait,
} from "../../helpers/test-targets";

/**
 * Registration barrier: a domain write that overlaps a target registration either also reserves the new target (a
 * later marker) or commits before the registration does (a marker that locked the barrier first). A REPEATABLE READ
 * marker with a snapshot from before the registration cannot commit with the old target list and fails with 40001;
 * SERIALIZABLE takes the same path.
 */

const h = useIntegrationHarness({ opensearch: false });
const KEY = "messages";
type Isolation = "read committed" | "repeatable read";

let admin: { run: StatementRunner; close(): Promise<void> };
let sync: PostgresSynchronization;

beforeAll(async () => {
  admin = await openAdminClient(h);
});
afterAll(async () => {
  await admin.close();
});

type Scenario = { first: PreparedTarget; second: PreparedTarget; registrar: PgSession };

/** A registered first target and a second target committed up to intent and verified remote creation. */
async function setUp(): Promise<Scenario> {
  await resetSearchSchema(h);
  const spec = { schema: h.searchSchema, namespace: h.namespace, logicalKey: KEY };
  const first = await createTarget(admin.run, spec);
  await closeOpenBuildsForTest(admin.run, spec);
  const second = await prepareTarget(admin.run, spec);
  sync = createPostgresSynchronization({
    getPrimaryDatabase: () => h.knex,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
  await sync.initialize();
  const { sessions } = await h.openSessions(["registrar"]);
  return { first, second, registrar: sessions.registrar };
}

const statements = () => targetStatements(h.searchSchema);

async function beginRegistration(registrar: PgSession): Promise<void> {
  await registrar.run("BEGIN");
  await registrar.run(statements().setAdminTimeouts, [...TEST_ADMIN_TIMEOUTS]);
}

/** Runs the registration body after the exclusive barrier, commits and releases the lease. */
async function finishRegistration(scenario: Scenario, epoch: number): Promise<void> {
  const run = sessionRunner(scenario.registrar);
  await runRegistrationBody(run, scenario.second, epoch, {
    kind: "rebuild",
    oldTargetId: scenario.first.targetId,
  });
  await scenario.registrar.run("COMMIT");
  await releaseLease(run, scenario.second);
}

async function blockingPids(pid: number): Promise<number[]> {
  const { rows } = await h.knex.raw<{ rows: { blocking: number[] }[] }>(
    "SELECT pg_blocking_pids(?) AS blocking",
    [pid],
  );
  return rows[0].blocking;
}

async function writer(isolation: Isolation): Promise<{ trx: Knex.Transaction; pid: number }> {
  const trx = await h.knex.transaction({ isolationLevel: isolation });
  // The first statement takes the snapshot under REPEATABLE READ.
  await h.sample.createRoom("domain", trx);
  return { trx, pid: await backendPid(trx) };
}

function deliveryKey(target: PreparedTarget, documentId: string): string {
  return `${target.targetId}/${documentId}`;
}

/** A marker that locked first: the registration's exclusive barrier waits for it and it commits with the old targets. */
async function markerBeforeRegistration(isolation: Isolation): Promise<void> {
  const scenario = await setUp();
  const { trx, pid } = await writer(isolation);
  await expect(sync.markChanged(trx, KEY, ["early"])).resolves.toBe("recorded");

  await beginRegistration(scenario.registrar);
  const exclusive = await scenario.registrar.block(statements().lockBarrierExclusive, [
    h.namespace,
    KEY,
  ]);
  expect(await blockingPids(scenario.registrar.pid)).toContain(pid);
  await exclusive.expectStillBlocked();
  await trx.commit();
  const barrier = await exclusive.expectSuccess();
  await finishRegistration(scenario, Number(barrier.rows[0].capture_epoch));

  expect(await readDeliveries(h)).toEqual({ [deliveryKey(scenario.first, "early")]: 1 });
}

/** A later READ COMMITTED marker waits on the barrier and, once the registration commits, reserves the new target too. */
async function markerWaitsForRegistrationReadCommitted(): Promise<void> {
  const scenario = await setUp();
  await beginRegistration(scenario.registrar);
  const barrier = await scenario.registrar.run(statements().lockBarrierExclusive, [
    h.namespace,
    KEY,
  ]);
  const epoch = Number(barrier.rows[0].capture_epoch);
  await runRegistrationBody(sessionRunner(scenario.registrar), scenario.second, epoch, {
    kind: "rebuild",
    oldTargetId: scenario.first.targetId,
  });

  const { trx, pid } = await writer("read committed");
  const pending = sync.markChanged(trx, KEY, ["late"]);
  pending.catch(() => {});
  await waitForLockWait(h.knex, pid, scenario.registrar.pid);
  await scenario.registrar.run("COMMIT");
  await releaseLease(sessionRunner(scenario.registrar), scenario.second);
  await expect(pending).resolves.toBe("recorded");
  await trx.commit();

  expect(await readDeliveries(h)).toEqual({
    [deliveryKey(scenario.first, "late")]: 1,
    [deliveryKey(scenario.second, "late")]: 1,
  });
}

/** A stale snapshot marking after a committed registration fails with 40001; rerunning reserves both targets. */
async function staleSnapshotAfterRegistration(isolation: Isolation): Promise<void> {
  const scenario = await setUp();
  const { trx } = await writer(isolation);

  await beginRegistration(scenario.registrar);
  // The writer has not touched the barrier yet, so the registration does not wait (run forbids lock waits).
  const barrier = await scenario.registrar.run(statements().lockBarrierExclusive, [
    h.namespace,
    KEY,
  ]);
  await finishRegistration(scenario, Number(barrier.rows[0].capture_epoch));

  const error = await sync.markChanged(trx, KEY, ["stale"]).catch((caught) => caught);
  expect(error).toBeInstanceOf(SearchUnavailable);
  expect(error).toMatchObject({
    retryable: true,
    details: { sqlstate: "40001", reason: "serialization-failure" },
  });
  await trx.rollback();
  expect(await readDeliveries(h)).toEqual({});

  await retryWholeTransaction(isolation, "stale");
  expect(await readDeliveries(h)).toEqual({
    [deliveryKey(scenario.first, "stale")]: 1,
    [deliveryKey(scenario.second, "stale")]: 1,
  });
}

/** A stale snapshot marker that waited for an in-progress registration still fails with 40001. */
async function staleSnapshotWaitsForRegistration(isolation: Isolation): Promise<void> {
  const scenario = await setUp();
  const { trx, pid } = await writer(isolation);

  await beginRegistration(scenario.registrar);
  const barrier = await scenario.registrar.run(statements().lockBarrierExclusive, [
    h.namespace,
    KEY,
  ]);
  await runRegistrationBody(
    sessionRunner(scenario.registrar),
    scenario.second,
    Number(barrier.rows[0].capture_epoch),
    {
      kind: "rebuild",
      oldTargetId: scenario.first.targetId,
    },
  );
  const pending = sync.markChanged(trx, KEY, ["waiting"]);
  pending.catch(() => {});
  await waitForLockWait(h.knex, pid, scenario.registrar.pid);
  await scenario.registrar.run("COMMIT");
  await releaseLease(sessionRunner(scenario.registrar), scenario.second);

  const error = await pending.catch((caught) => caught);
  expect(error).toBeInstanceOf(SearchUnavailable);
  expect(error).toMatchObject({ details: { sqlstate: "40001" } });
  await trx.rollback();

  await retryWholeTransaction(isolation, "waiting");
  expect(await readDeliveries(h)).toEqual({
    [deliveryKey(scenario.first, "waiting")]: 1,
    [deliveryKey(scenario.second, "waiting")]: 1,
  });
}

async function retryWholeTransaction(isolation: Isolation, documentId: string): Promise<void> {
  await h.knex.transaction(
    async (trx) => {
      await h.sample.createRoom("retry", trx);
      await expect(sync.markChanged(trx, KEY, [documentId])).resolves.toBe("recorded");
    },
    { isolationLevel: isolation },
  );
}

describe("대상 등록 경합", () => {
  it("READ COMMITTED: 등록보다 먼저 잠근 마커는 등록을 기다리게 하고, 나중 마커는 새 대상까지 예약한다", async () => {
    await markerBeforeRegistration("read committed");
    await markerWaitsForRegistrationReadCommitted();
  });

  it("REPEATABLE READ: 옛 스냅샷 마커는 40001로 실패하고 재시도하면 두 대상에 예약한다", async () => {
    await staleSnapshotAfterRegistration("repeatable read");
    await staleSnapshotWaitsForRegistration("repeatable read");
  });
});
