import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type DocumentId,
  defineSearch,
  type Projection,
  type ProjectionReadContext,
} from "../../../src/definition/define-search";
import {
  SearchConfigurationError,
  SearchProjectionError,
  SearchTimeout,
} from "../../../src/errors";
import { createPostgresSynchronization, type PostgresSynchronization } from "../../../src/postgres";
import { type ClaimedDelivery, createDeliveryStore } from "../../../src/postgres/delivery-store";
import {
  type DocumentOutcome,
  type MaterializedDocument,
  materializeGroup,
} from "../../../src/worker/materialize";
import { useIntegrationHarness } from "../../helpers/harness";
import {
  createTarget,
  openAdminClient,
  type PreparedTarget,
  readLedger,
  resetSearchSchema,
  type StatementRunner,
} from "../../helpers/test-targets";

/**
 * Projections and the ledger read of one materialize call share one read-only REPEATABLE READ snapshot, so an edit
 * committed in between can never put a new revision on an old body. Writes inside the snapshot and broken snapshots
 * fail only the document that caused them.
 */

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

type Body = { body: string };
type Hooks = {
  /** Runs after the first document is read, before the next. */
  afterFirst?: () => Promise<void>;
  /** Runs before each document is read. */
  before?: (context: ProjectionReadContext, id: DocumentId) => Promise<void>;
  observed?: Record<string, string>[];
};

function messageDefinition(hooks: Hooks = {}) {
  return defineSearch<Body>({
    key: KEY,
    projectionVersion: "1",
    schema: z.object({ body: z.string() }),
    settings: {},
    mappings: { properties: { body: { type: "text" } } },
    requiredPlugins: [],
    async materialize(context, ids) {
      const result = new Map<DocumentId, Projection<Body>>();
      const { rows } = await context.trx.raw<{ rows: Record<string, string>[] }>(
        `SELECT current_setting('transaction_isolation') AS iso, current_setting('transaction_read_only') AS ro,
                current_setting('statement_timeout') AS statement_timeout, current_setting('lock_timeout') AS lock_timeout,
                current_setting('idle_in_transaction_session_timeout') AS idle_timeout,
                pg_backend_pid()::text AS pid, pg_current_snapshot()::text AS snapshot`,
      );
      hooks.observed?.push(rows[0]);
      for (const [position, id] of ids.entries()) {
        await hooks.before?.(context, id);
        const row = await h.sample
          .from("messages", context.trx)
          .where({ id })
          .first<{ body: string } | undefined>("body");
        result.set(
          id,
          row === undefined
            ? { state: "deleted" }
            : { state: "present", document: { body: row.body } },
        );
        if (position === 0) await hooks.afterFirst?.();
      }
      return result;
    },
    async captureScanBoundary() {
      return "";
    },
    async scanSourceIds() {
      return { ids: [] };
    },
  });
}

async function sendAndMark(roomId: string, body: string): Promise<string> {
  return h.knex.transaction(async (trx) => {
    const message = await h.sample.sendMessage({ roomId, authorId: null, body }, trx);
    await sync.markChanged(trx, KEY, [message.id]);
    return message.id;
  });
}

async function claimAll(): Promise<ClaimedDelivery[]> {
  const worker = createDeliveryStore({ schema: h.searchSchema });
  return worker.claim(h.knex, {
    targetIds: [target.targetId],
    limit: 100,
    leaseToken: randomUUID(),
    leaseMs: 120_000,
  });
}

function run(
  definition: ReturnType<typeof messageDefinition>,
  deliveries: ClaimedDelivery[],
  projectionTimeoutMs = 5_000,
  db: Knex = h.knex,
) {
  return materializeGroup({
    db,
    store: createDeliveryStore({ schema: h.searchSchema }),
    namespace: h.namespace,
    definition,
    deliveries,
    limits: { projectionTimeoutMs, maxIsolationCallsPerBatch: 50, maxBulkBytes: 1_000_000 },
  });
}

function outcomeOf(documents: readonly DocumentOutcome[], id: string): DocumentOutcome | undefined {
  return documents.find((document) => document.delivery.documentId === id);
}

function materialized(documents: readonly DocumentOutcome[], id: string): MaterializedDocument {
  const outcome = outcomeOf(documents, id);
  if (outcome?.kind !== "materialized")
    throw new Error(
      `${id}가 materialize되지 않았습니다: ${JSON.stringify(outcome?.kind === "failed" ? outcome.reason : outcome)}`,
    );
  return outcome;
}

function failedReason(documents: readonly DocumentOutcome[], id: string): string | undefined {
  const outcome = outcomeOf(documents, id);
  if (outcome?.kind !== "failed") return undefined;
  expect(outcome.error).toBeInstanceOf(SearchProjectionError);
  return outcome.reason;
}

const docBody = (document: MaterializedDocument) =>
  document.projection.state === "present" ? document.projection.document.body : null;

describe("같은 스냅샷", () => {
  it("두 projection 사이에 커밋된 수정은 보이지 않고, 원장 리비전도 그 이전 값이다", async () => {
    const room = await h.sample.createRoom("room");
    const first = await sendAndMark(room.id, "first-v1");
    const second = await sendAndMark(room.id, "second-v1");
    const observed: Record<string, string>[] = [];
    let committed = false;
    const definition = messageDefinition({
      observed,
      // Another connection edits and marks the second document and commits (ledger revision 2).
      afterFirst: async () => {
        await h.knex.transaction(async (trx) => {
          await h.sample.editMessage(second, "second-v2", trx);
          expect(await sync.markChanged(trx, KEY, [second])).toBe("recorded");
        });
        committed = true;
      },
    });
    const claimed = await claimAll();
    const result = await run(definition, claimed);
    expect(committed).toBe(true);
    expect(result.materializeCalls).toBe(1);

    // The ledger is at 2, yet the snapshot sees the old body together with revision 1.
    expect(await readLedger(h)).toEqual({ [first]: 1, [second]: 2 });
    expect(docBody(materialized(result.documents, first))).toBe("first-v1");
    const stale = materialized(result.documents, second);
    expect(docBody(stale)).toBe("second-v1");
    expect(stale.revision).toBe(1);
    expect(stale.envelope.sonamu_meta.revision).toBe(1);

    expect(observed[0]).toMatchObject({
      iso: "repeatable read",
      ro: "on",
      statement_timeout: "5s",
      lock_timeout: "2500ms",
      idle_timeout: "5s",
    });

    const next = await run(
      messageDefinition(),
      claimed.filter((row) => row.documentId === second),
    );
    const fresh = materialized(next.documents, second);
    expect(docBody(fresh)).toBe("second-v2");
    expect(fresh.revision).toBe(2);
  });

  it("primary 대신 트랜잭션을 넘기면 스냅샷을 열지 않고 설정 오류다", async () => {
    const room = await h.sample.createRoom("room");
    await sendAndMark(room.id, "x");
    const claimed = await claimAll();
    await h.knex.transaction(async (trx) => {
      const error = await run(messageDefinition(), claimed, 5_000, trx).catch((caught) => caught);
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details?.reason).toBe("primary-is-transaction");
    });
  });
});

describe("문서 단위 실패", () => {
  it("projection 안의 쓰기는 읽기 전용 트랜잭션에서 거부되고 그 문서의 실패로 보고된다", async () => {
    const room = await h.sample.createRoom("room");
    const ids = [
      await sendAndMark(room.id, "a"),
      await sendAndMark(room.id, "b"),
      await sendAndMark(room.id, "c"),
    ];
    const writer = ids[1];
    const definition = messageDefinition({
      before: async (context, id) => {
        if (id === writer) {
          await h.sample.from("messages", context.trx).where({ id }).update({ body: "hacked" });
        }
      },
    });
    const result = await run(definition, await claimAll());
    expect(failedReason(result.documents, writer)).toBe("read_only_violation");
    const failure = outcomeOf(result.documents, writer);
    expect(failure?.kind === "failed" && failure.disposition).toBe("poison");
    expect(failure?.kind === "failed" && failure.error.details?.sqlstate).toBe("25006");
    expect(docBody(materialized(result.documents, ids[0]))).toBe("a");
    expect(docBody(materialized(result.documents, ids[2]))).toBe("c");
    expect((await h.sample.findMessage(writer))?.body).toBe("b");
  });

  it("SQL 오류를 삼켜 중단된 스냅샷과 COMMIT으로 바뀐 스냅샷은 결과를 버리고 원인 문서만 격리한다", async () => {
    const room = await h.sample.createRoom("room");
    const ids: string[] = [];
    for (const body of ["a", "b", "c", "d"]) ids.push(await sendAndMark(room.id, body));
    const [plain, swallow, other, committer] = ids;
    const definition = messageDefinition({
      before: async (context, id) => {
        if (id === swallow) await context.trx.raw("SELECT 1 / 0").catch(() => undefined);
        if (id === committer) await context.trx.raw("COMMIT");
      },
    });
    const result = await run(definition, await claimAll());
    expect(failedReason(result.documents, swallow)).toBe("snapshot_aborted");
    expect(failedReason(result.documents, committer)).toBe("snapshot_replaced");
    expect(docBody(materialized(result.documents, plain))).toBe("a");
    expect(docBody(materialized(result.documents, other))).toBe("c");
    expect(result.infrastructureError).toBeUndefined();
  });

  it("statement_timeout을 넘긴 projection은 그 문서만 재시도로 남기고, 연결에 실행 중인 문장을 남기지 않는다", async () => {
    const room = await h.sample.createRoom("room");
    const ids: string[] = [];
    for (const body of ["a", "b", "c"]) ids.push(await sendAndMark(room.id, body));
    const slow = ids[1];
    const definition = messageDefinition({
      before: async (context, id) => {
        if (id === slow) await context.trx.raw("SELECT pg_sleep(30)");
      },
    });
    const result = await run(definition, await claimAll(), 400);
    expect(failedReason(result.documents, slow)).toBe("projection_timeout");
    const failure = outcomeOf(result.documents, slow);
    expect(failure?.kind === "failed" && failure.disposition).toBe("retry");
    expect(docBody(materialized(result.documents, ids[0]))).toBe("a");
    expect(docBody(materialized(result.documents, ids[2]))).toBe("c");
    const { rows } = await h.knex.raw<{ rows: { count: string }[] }>(
      "SELECT count(*) AS count FROM pg_stat_activity WHERE query LIKE 'SELECT pg_sleep(30)%' AND state = 'active'",
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  it("모든 문서가 statement_timeout을 넘기면 하나도 세지 않고 반납하며 스냅샷 3개에서 멈춘다", async () => {
    const room = await h.sample.createRoom("room");
    const ids: string[] = [];
    for (const body of ["a", "b", "c", "d"]) ids.push(await sendAndMark(room.id, body));
    const opened = new Set<string>();
    const definition = messageDefinition({
      before: async (context) => {
        const { rows } = await context.trx.raw<{ rows: { started: string }[] }>(
          "SELECT transaction_timestamp()::text AS started",
        );
        opened.add(rows[0].started);
        await context.trx.raw("SELECT pg_sleep(30)");
      },
    });
    const result = await run(definition, await claimAll(), 400);
    expect(result.materializeCalls).toBe(3);
    expect(opened.size).toBe(3);
    for (const id of ids) {
      expect(failedReason(result.documents, id)).toBe("projection_timeout");
      const failure = outcomeOf(result.documents, id);
      expect(failure?.kind === "failed" && failure.disposition).toBe("release");
      expect(failure?.kind === "failed" && failure.revision).toBe(1);
    }
    expect(result.infrastructureError).toBeInstanceOf(SearchTimeout);
    expect(result.infrastructureError?.details?.reason).toBe("projection-timeout-unproven");
  });

  it("문서 하나만 claim해 시간 초과되면 반납하고, 다른 projection이 완료된 뒤의 다음 시간 초과는 재시도로 센다", async () => {
    const room = await h.sample.createRoom("room");
    const slow = await sendAndMark(room.id, "slow");
    const healthy = await sendAndMark(room.id, "healthy");
    const claimed = await claimAll();
    const only = (id: string) => claimed.filter((row) => row.documentId === id);
    const definition = messageDefinition({
      before: async (context, id) => {
        if (id === slow) await context.trx.raw("SELECT pg_sleep(30)");
      },
    });

    const first = await run(definition, only(slow), 400);
    expect(first.materializeCalls).toBe(1);
    expect(failedReason(first.documents, slow)).toBe("projection_timeout");
    expect(first.documents[0]?.kind === "failed" && first.documents[0].disposition).toBe("release");
    expect(first.infrastructureError).toBeInstanceOf(SearchTimeout);

    // Another document's projection completes on the same primary in between.
    const other = await run(definition, only(healthy), 400);
    expect(docBody(materialized(other.documents, healthy))).toBe("healthy");

    const second = await run(definition, only(slow), 400);
    expect(second.documents[0]?.kind === "failed" && second.documents[0].disposition).toBe("retry");
    expect(second.infrastructureError).toBeUndefined();
  });

  it("다른 세션이 쥔 테이블 잠금은 lock_timeout(55P03)으로 끊기고 이분 격리 없이 모두 반납된다", async () => {
    const room = await h.sample.createRoom("room");
    const ids: string[] = [];
    for (const body of ["a", "b"]) ids.push(await sendAndMark(room.id, body));
    const claimed = await claimAll();
    const { sessions } = await h.openSessions(["locker"]);
    await sessions.locker.run("BEGIN");
    await sessions.locker.run("LOCK TABLE messages IN ACCESS EXCLUSIVE MODE");
    try {
      const pending = run(messageDefinition(), claimed, 2_000);
      // Confirm the projection really waits on the locker instead of assuming elapsed time.
      let waited = false;
      const deadline = Date.now() + 2_000;
      while (!waited && Date.now() < deadline) {
        const { rows } = await h.knex.raw<{ rows: { count: string }[] }>(
          "SELECT count(*) AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND ? = ANY(pg_blocking_pids(pid))",
          [sessions.locker.pid],
        );
        waited = Number(rows[0].count) > 0;
      }
      expect(waited).toBe(true);
      const result = await pending;
      expect(result.materializeCalls).toBe(1);
      expect(result.infrastructureError?.details?.sqlstate).toBe("55P03");
      for (const id of ids) expect(failedReason(result.documents, id)).toBe("database_unavailable");
    } finally {
      await sessions.locker.run("ROLLBACK");
    }
  });
});
