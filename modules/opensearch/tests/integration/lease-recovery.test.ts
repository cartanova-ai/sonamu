import { type Knex } from "knex";
import { describe, expect, it, onTestFinished } from "vitest";
import { z } from "zod";

import { createDeliveryStore, type DeliveryKey } from "../../src/postgres/delivery-store";
import { useIntegrationHarness } from "../helpers/harness";
import { qualified, sql } from "../helpers/sql";
import {
  latch,
  type Latch,
  outcomeSum,
  type RecordedStatement,
  recordingClient,
  useWorkerFixture,
  waitFor,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * Worker A dies after the engine applied its bulk and before it recorded the result: from then on every statement
 * and snapshot on A's primary, including its lease heartbeat, is held back. Worker B may take the documents only
 * after the lease expires, statements with A's old token change nothing (sent directly and by A once it wakes up),
 * and B's resend verifies as a duplicate. Nothing is lost.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";

/** Short lease for A; the bounds require heartbeat * 2 <= lease and request + heartbeat < lease. */
const DEAD_LIMITS = {
  leaseDurationMs: 6_000,
  heartbeatIntervalMs: 1_000,
  projectionTimeoutMs: 3_000,
  requestTimeoutMs: 4_000,
  // Holding statements simulates death; a short statement timeout would let A finish its drain instead.
  statementTimeoutMs: 600_000,
} as const;

// Text fragments that identify the claim and the acknowledgement statements.
const CLAIM_TEXT = "WITH cand AS MATERIALIZED";
const ACKNOWLEDGE_TEXT = "dropped_runtime AS";
const DOCUMENTS = ["a", "b"];

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

interface KillablePrimary {
  readonly primary: Knex;
  kill(): void;
  readonly killed: Promise<void>;
  /** Releases the held statements and passes later ones through: a worker that wakes up late. */
  resume(): void;
  /** Statements and snapshots held since the kill. */
  held(): number;
}

/** After kill(), raw() and transaction() do not reach the database until resume(). */
function killablePrimary(db: Knex): KillablePrimary {
  let dead = false;
  let heldCount = 0;
  const killedLatch = latch();
  const resumed = latch();
  const kill = () => {
    if (dead) return;
    dead = true;
    killedLatch.open();
  };
  const raw = (text: string, bindings: readonly Knex.RawBinding[]) => {
    if (!dead) return db.raw(text, bindings);
    heldCount += 1;
    return resumed.promise.then(() => db.raw(text, bindings));
  };
  const transaction = (...args: Parameters<Knex["transaction"]>) => {
    if (!dead) return db.transaction(...args);
    heldCount += 1;
    return resumed.promise.then(() => db.transaction(...args));
  };
  const primary = new Proxy(db, {
    get(target, property) {
      if (property === "raw") return raw;
      if (property === "transaction") return transaction;
      // SAFETY: the get trap only receives real property names of the Knex instance and reads them from it unchanged.
      return target[property as keyof Knex];
    },
  });
  return {
    primary,
    kill,
    killed: killedLatch.promise,
    resume: () => resumed.open(),
    held: () => heldCount,
  };
}

/**
 * Lease tokens of the claim statements in execution order. Knex repeats a binding for every placeholder occurrence,
 * so pick the only uuid among the bindings rather than a position.
 */
function claimTokens(statements: readonly RecordedStatement[]): string[] {
  return statements
    .filter((statement) => statement.sql.includes(CLAIM_TEXT))
    .map((statement) => {
      const tokens = statement.bindings.flatMap((value) => {
        const token = z.uuid().safeParse(value);
        return token.success ? [token.data] : [];
      });
      return z.tuple([z.uuid()]).parse(tokens)[0];
    });
}

/** Statements containing text that ran since `since` with this token among their bindings. */
function statementsWithToken(
  statements: readonly RecordedStatement[],
  token: string,
  text: string,
  since: number,
): RecordedStatement[] {
  return statements.filter(
    (statement) =>
      statement.at >= since && statement.sql.includes(text) && statement.bindings.includes(token),
  );
}

interface LeaseRow {
  target_id: string;
  document_id: string;
  intent_id: string;
  lease_token: string | null;
  lease_expires_at: string | null;
  live: boolean | null;
  attempts: number;
  retry_age_ms: string;
  quarantined_revision: string | null;
}

async function leases(): Promise<LeaseRow[]> {
  const { rows } = await h.knex.raw<{ rows: LeaseRow[] }>(
    sql`SELECT target_id::text, document_id, intent_id::text, lease_token::text,
       to_char(lease_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS lease_expires_at,
       lease_expires_at > clock_timestamp() AS live, attempts, retry_age_ms::text,
       quarantined_revision::text
FROM ${qualified(h.searchSchema, "delivery_runtime")} ORDER BY document_id`,
  );
  return rows;
}

async function leasedBy(token: string): Promise<LeaseRow[]> {
  return (await leases()).filter((row) => row.lease_token === token);
}

describe("임대 복구", () => {
  it(
    "bulk 전송 뒤 확인 전에 죽은 워커의 임대는 만료 뒤에만 다른 워커가 가져가고, 옛 토큰의 기록은 아무것도 바꾸지 못한다",
    { timeout: 90_000 },
    async () => {
      const setup = await kit.setUp();
      const target = targetOf(setup);
      await kit.write(setup, KEY, DOCUMENTS, async (trx) => {
        for (const id of DOCUMENTS) await kit.upsert(trx, KEY, id, `본문 ${id}`);
      });

      // Worker A dies once the engine has applied and answered its bulk.
      const gate = killablePrimary(setup.worker);
      const aClient = recordingClient(kit.nativeClient(), {
        after: async () => gate.kill(),
      }).client;
      const a = kit.indexer(setup, {
        client: aClient,
        primary: () => gate.primary,
        limits: DEAD_LIMITS,
      });
      const aDrain = a.indexer.drainOnce();
      let holdB: Latch | undefined;
      let bDrain: Promise<unknown> = Promise.resolve();
      // Release every held worker even if an assertion fails, so afterEach can close the clients.
      onTestFinished(async () => {
        gate.resume();
        holdB?.open();
        await Promise.allSettled([aDrain, bDrain]);
      });
      await gate.killed;

      const [aToken] = claimTokens(setup.statements);
      if (aToken === undefined) throw new Error("A의 claim이 없습니다.");
      expect((await kit.intents()).map((row) => row.document_id)).toEqual(DOCUMENTS);
      expect((await leasedBy(aToken)).map((row) => row.document_id)).toEqual(DOCUMENTS);

      const bRecorded = recordingClient(kit.nativeClient(), {
        before: async () => holdB?.promise,
      });
      const b = kit.indexer(setup, { client: bRecorded.client });

      // Before expiry B takes nothing, and A's lease is still live after B's drain.
      expect(await b.indexer.drainOnce()).toMatchObject({ claimed: 0 });
      expect((await leasedBy(aToken)).map((row) => row.live)).toEqual(DOCUMENTS.map(() => true));

      // A cannot heartbeat, so its lease expires by the database clock.
      await waitFor(
        "A의 임대 만료",
        async () => (await leasedBy(aToken)).every((row) => row.live === false),
        20_000,
      );

      // After expiry B takes every document; hold B's bulk before it reaches the engine.
      const heldB = latch();
      holdB = heldB;
      const bPending = b.indexer.drainOnce();
      bDrain = bPending;
      await waitFor("B의 bulk가 붙잡힘", () => bRecorded.bulks.length === 1);
      const bToken = claimTokens(setup.statements).at(-1);
      if (bToken === undefined || bToken === aToken) throw new Error("B의 claim이 없습니다.");
      const takenOver = await leasedBy(bToken);
      expect(takenOver.map((row) => row.document_id)).toEqual(DOCUMENTS);
      expect(takenOver.every((row) => row.live === true && row.attempts === 0)).toBe(true);

      // Heartbeat, acknowledgement, failure count and release sent directly with the old token change no row.
      const store = createDeliveryStore({ schema: h.searchSchema });
      const keys: DeliveryKey[] = takenOver.map((row) => ({
        targetId: row.target_id,
        documentId: row.document_id,
        intentId: row.intent_id,
      }));
      expect(
        await store.heartbeat(setup.worker, {
          leaseToken: aToken,
          deliveries: keys,
          leaseMs: 600_000,
        }),
      ).toEqual([]);
      expect(
        await store.acknowledge(setup.worker, {
          leaseToken: aToken,
          items: keys.map((key) => ({ ...key, materializedRevision: 1 })),
        }),
      ).toEqual([]);
      expect(
        await store.classifyFailures(setup.worker, {
          leaseToken: aToken,
          maxRetryAttempts: 1,
          maxRetryAgeMs: 1,
          items: keys.map((key) => ({
            ...key,
            materializedRevision: 1,
            mode: "retry" as const,
            delayMs: 600_000,
            error: { class: "transient_item" },
          })),
        }),
      ).toEqual([]);
      expect(
        await store.release(setup.worker, {
          leaseToken: aToken,
          items: keys.map((key) => ({
            ...key,
            revision: 1,
            delayMs: 600_000,
            error: { class: "infrastructure" },
          })),
        }),
      ).toEqual([]);
      expect(await leases()).toEqual(takenOver);

      // Wake A: its late acknowledgement must not touch B's lease either.
      const resumedAt = Date.now();
      gate.resume();
      const aReport = await aDrain;
      expect(aReport).toMatchObject({
        claimed: DOCUMENTS.length,
        indexed: 0,
        retried: 0,
        quarantined: 0,
        released: 0,
        skippedLocked: 0,
        leaseLost: DOCUMENTS.length,
      });
      expect(outcomeSum(aReport)).toBe(aReport.claimed);
      expect(
        statementsWithToken(setup.statements, aToken, ACKNOWLEDGE_TEXT, resumedAt).length,
        "깨어난 A의 늦은 확인",
      ).toBeGreaterThan(0);
      expect(await leases()).toEqual(takenOver);

      heldB.open();
      const bReport = await bPending;
      // A's success was applied on the engine, so B's resend gets 409 and verifies as a duplicate.
      expect(bReport).toMatchObject({
        claimed: DOCUMENTS.length,
        indexed: 0,
        superseded: DOCUMENTS.length,
        retried: 0,
        quarantined: 0,
        released: 0,
        leaseLost: 0,
        skippedLocked: 0,
      });

      for (const id of DOCUMENTS) {
        expect(await kit.indexed(target, id)).toEqual({
          version: 1,
          revision: 1,
          deleted: false,
          doc: { body: `본문 ${id}` },
        });
      }
      expect(await kit.intents()).toEqual([]);
      expect(await kit.runtimes()).toEqual([]);
      expect(gate.held()).toBeGreaterThan(0);
    },
  );
});
