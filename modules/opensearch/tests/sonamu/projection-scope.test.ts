import { randomUUID } from "node:crypto";

import { BaseModelClass, DB, type PuriWrapper } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type DocumentId,
  type Projection,
  type ProjectionReadContext,
  type SearchDefinition,
} from "../../src/definition/define-search";
import { SearchInvalidTransaction } from "../../src/errors";
import { createPostgresSynchronization, type PostgresSynchronization } from "../../src/postgres";
import { type ClaimedDelivery, createDeliveryStore } from "../../src/postgres/delivery-store";
import { defineSonamuSearch, resolveSonamuPrimary, withProjectionScope } from "../../src/sonamu";
import { type ProjectionConnectionTracer, traceProjectionConnections } from "../../src/testing";
import {
  type DocumentOutcome,
  type MaterializedDocument,
  materializeGroup,
} from "../../src/worker/materialize";
import { useIntegrationHarness } from "../helpers/harness";
import { applyTransactional, configureSonamuDatabase } from "../helpers/sonamu-app";
import {
  createTarget,
  openAdminClient,
  type PreparedTarget,
  readLedger,
  resetSearchSchema,
  type StatementRunner,
} from "../helpers/test-targets";

/**
 * Model reads inside a projection, with real PostgreSQL and a real Sonamu model: model methods use the snapshot
 * transaction through Sonamu's own transaction scope, never a fresh pool connection (which would see newer data), and
 * the scope does not leak to code outside the projection or to concurrent requests. Runs the worker's path
 * (materializeGroup with resolveSonamuPrimary).
 */

const h = useIntegrationHarness({ opensearch: false });
const KEY = "messages";

let admin: { run: StatementRunner; close(): Promise<void> };
let target: PreparedTarget;
let sync: PostgresSynchronization;
let tracer: ProjectionConnectionTracer;

/** Same backend, snapshot and transaction start time means the same snapshot transaction. */
type Identity = { pid: string; snapshot: string; started: string };
const IDENTITY_SQL =
  "SELECT pg_backend_pid()::text AS pid, pg_current_snapshot()::text AS snapshot, transaction_timestamp()::text AS started";

async function identityOf(db: PuriWrapper["knex"]): Promise<Identity> {
  const { rows } = await db.raw<{ rows: Identity[] }>(IDENTITY_SQL);
  return rows[0];
}

let subsetPuri: PuriWrapper | undefined;

/** Sonamu's decorator requires the "...ModelClass" class-name suffix. */
class MessageProjectionModelClass extends BaseModelClass {
  constructor() {
    // SAFETY: one subset that records the PuriWrapper it receives replaces the generated subset definitions.
    super("MessageProjection", {
      A: (puri: PuriWrapper) => {
        subsetPuri = puri;
        return puri;
      },
    } as never);
  }

  async bodyVia(which: "r" | "w", id: string): Promise<{ body: string | null } & Identity> {
    const db = this.getPuri(which).knex;
    const row = await h.sample
      .from("messages", db)
      .where({ id })
      .first<{ body: string } | undefined>("body");
    return { body: row?.body ?? null, ...(await identityOf(db)) };
  }

  async bodyViaSubset(id: string): Promise<{ body: string | null } & Identity> {
    // SAFETY: the subset key registered in the constructor.
    this.getSubsetQueries("A" as never);
    if (subsetPuri === undefined) throw new Error("subset이 실행되지 않았습니다.");
    const db = subsetPuri.knex;
    const row = await h.sample
      .from("messages", db)
      .where({ id })
      .first<{ body: string } | undefined>("body");
    return { body: row?.body ?? null, ...(await identityOf(db)) };
  }

  /** Must reuse the existing w transaction, which is the snapshot. */
  async bodyViaTransactional(id: string): Promise<{ body: string | null } & Identity> {
    return this.bodyVia("w", id);
  }

  /** Forbidden escape: getDB() and a concrete preset bypass the scope. */
  async bodyViaEscape(preset: "w" | "development", id: string): Promise<string | null> {
    const row = await h.sample
      .from("messages", this.getDB(preset))
      .where({ id })
      .first<{ body: string } | undefined>("body");
    return row?.body ?? null;
  }

  async rename(id: string): Promise<void> {
    await h.sample
      .from("messages", this.getPuri("w").knex)
      .where({ id })
      .update({ body: "hacked" });
  }
}
applyTransactional(MessageProjectionModelClass.prototype, "bodyViaTransactional");
const model = new MessageProjectionModelClass();

beforeAll(async () => {
  configureSonamuDatabase(h);
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
  // Trace the primary the worker opens snapshots on and the instances the escapes use.
  tracer = traceProjectionConnections([
    resolveSonamuPrimary(),
    DB.getDB("r"),
    DB.getDB("development"),
  ]);
  subsetPuri = undefined;
});
afterEach(() => {
  tracer.dispose();
});

type Body = { body: string };

function sonamuDefinition(
  project: (
    context: ProjectionReadContext,
    id: DocumentId,
    position: number,
  ) => Promise<string | null>,
): SearchDefinition<Body> {
  return {
    key: KEY,
    projectionVersion: "1",
    schema: z.object({ body: z.string() }),
    settings: {},
    mappings: { properties: { body: { type: "text" } } },
    requiredPlugins: [],
    // Runs the projection body inside the tracer, as an application test would.
    materialize: (context, ids) =>
      tracer.run(context.trx, async () => {
        const result = new Map<DocumentId, Projection<Body>>();
        for (const [position, id] of ids.entries()) {
          const body = await project(context, id, position);
          result.set(
            id,
            body === null ? { state: "deleted" } : { state: "present", document: { body } },
          );
        }
        return result;
      }),
    async captureScanBoundary() {
      return "";
    },
    async scanSourceIds() {
      return { ids: [] };
    },
  };
}

async function sendAndMark(roomId: string, body: string): Promise<string> {
  return h.knex.transaction(async (trx) => {
    const message = await h.sample.sendMessage({ roomId, authorId: null, body }, trx);
    await sync.markChanged(trx, KEY, [message.id]);
    return message.id;
  });
}

/** Commits an edit and its mark on another connection. */
async function editAndMark(id: string, body: string): Promise<void> {
  await h.knex.transaction(async (trx) => {
    await h.sample.editMessage(id, body, trx);
    await sync.markChanged(trx, KEY, [id]);
  });
}

async function claimAll(): Promise<ClaimedDelivery[]> {
  return createDeliveryStore({ schema: h.searchSchema }).claim(h.knex, {
    targetIds: [target.targetId],
    limit: 100,
    leaseToken: randomUUID(),
    leaseMs: 120_000,
  });
}

function materialize(definition: SearchDefinition<Body>, deliveries: ClaimedDelivery[]) {
  return materializeGroup({
    db: resolveSonamuPrimary(),
    store: createDeliveryStore({ schema: h.searchSchema }),
    namespace: h.namespace,
    definition: defineSonamuSearch(definition),
    deliveries,
    limits: { projectionTimeoutMs: 10_000, maxIsolationCallsPerBatch: 20, maxBulkBytes: 1_000_000 },
  });
}

function materialized(documents: readonly DocumentOutcome[], id: string): MaterializedDocument {
  const outcome = documents.find((document) => document.delivery.documentId === id);
  if (outcome?.kind !== "materialized") throw new Error(`${id}가 materialize되지 않았습니다.`);
  return outcome;
}

const bodyOf = (document: MaterializedDocument) =>
  document.projection.state === "present" ? document.projection.document.body : null;

describe("projection 스코프", () => {
  it("getPuri('r'), getPuri('w'), subset 쿼리가 모두 공급된 primary 스냅샷 연결을 쓴다", async () => {
    const room = await h.sample.createRoom("room");
    const first = await sendAndMark(room.id, "first-v1");
    const second = await sendAndMark(room.id, "second-v1");
    const reads: ({ body: string | null } & Identity)[] = [];
    let snapshotIdentity: Identity | undefined;

    const result = await materialize(
      sonamuDefinition(async (context, id, position) => {
        snapshotIdentity ??= await identityOf(context.trx);
        const viaReader = await model.bodyVia("r", id);
        reads.push(
          viaReader,
          await model.bodyVia("w", id),
          await model.bodyViaSubset(id),
          await model.bodyViaTransactional(id),
        );
        // The second document's edit commits after the first read (ledger revision 2).
        if (position === 0) await editAndMark(second, "second-v2");
        return viaReader.body;
      }),
      await claimAll(),
    );

    expect(result.materializeCalls).toBe(1);
    expect(await readLedger(h)).toEqual({ [first]: 1, [second]: 2 });
    // All four paths read in the same snapshot transaction and saw the body before the edit.
    expect(reads).toHaveLength(8);
    for (const read of reads) {
      expect({ pid: read.pid, snapshot: read.snapshot, started: read.started }).toEqual(
        snapshotIdentity,
      );
    }
    expect(reads.slice(4).map((read) => read.body)).toEqual(Array(4).fill("second-v1"));
    const stale = materialized(result.documents, second);
    expect(bodyOf(stale)).toBe("second-v1");
    expect(stale.revision).toBe(1);
    expect(bodyOf(materialized(result.documents, first))).toBe("first-v1");

    // Every projection statement ran on the snapshot connection.
    expect(tracer.statements().length).toBeGreaterThanOrEqual(16);
    expect(tracer.escapes()).toEqual([]);
  });

  it("getDB()와 다른 preset 사용은 추적기가 이탈로 보고한다", async () => {
    const room = await h.sample.createRoom("room");
    const id = await sendAndMark(room.id, "v1");
    const escaped: (string | null)[] = [];
    const result = await materialize(
      sonamuDefinition(async () => {
        await editAndMark(id, "v2");
        escaped.push(
          await model.bodyViaEscape("w", id),
          await model.bodyViaEscape("development", id),
        );
        return (await model.bodyVia("r", id)).body;
      }),
      await claimAll(),
    );
    // The escapes read the newly committed body on fresh pool connections; the snapshot sees the old body with the old
    // revision.
    expect(escaped).toEqual(["v2", "v2"]);
    const document = materialized(result.documents, id);
    expect(bodyOf(document)).toBe("v1");
    expect(document.revision).toBe(1);
    const escapes = tracer.escapes();
    expect(escapes).toHaveLength(2);
    for (const escape of escapes) expect(escape.sql).toContain("messages");
    expect(tracer.statements().filter((statement) => statement.onSnapshot).length).toBeGreaterThan(
      0,
    );
  });

  it("projection 안의 쓰기는 읽기 전용 트랜잭션에서 거부된다", async () => {
    const room = await h.sample.createRoom("room");
    const keep = await sendAndMark(room.id, "keep");
    const writer = await sendAndMark(room.id, "writer");
    const result = await materialize(
      sonamuDefinition(async (_context, id) => {
        if (id === writer) await model.rename(id);
        return (await model.bodyVia("r", id)).body;
      }),
      await claimAll(),
    );
    const failure = result.documents.find((document) => document.delivery.documentId === writer);
    expect(failure?.kind).toBe("failed");
    if (failure?.kind !== "failed") return;
    expect(failure.reason).toBe("read_only_violation");
    expect(failure.disposition).toBe("poison");
    expect(failure.error.details).toMatchObject({
      reason: "read_only_violation",
      sqlstate: "25006",
    });
    expect(bodyOf(materialized(result.documents, keep))).toBe("keep");
    expect((await h.sample.findMessage(writer))?.body).toBe("writer");
  });

  it("스코프는 projection 밖의 코드와 동시에 실행 중인 요청으로 새지 않는다", async () => {
    const room = await h.sample.createRoom("room");
    const id = await sendAndMark(room.id, "v1");
    let reached!: () => void;
    const reachedGate = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let snapshotIdentity: Identity | undefined;
    let detached: Promise<{ scoped: boolean; identity: Identity }> | undefined;
    let materializeReturned!: () => void;
    const afterMaterialize = new Promise<void>((resolve) => {
      materializeReturned = resolve;
    });

    const pending = materialize(
      sonamuDefinition(async (context) => {
        snapshotIdentity = await identityOf(context.trx);
        // Deferred work started inside the projection that continues after materialize returns; it must not reuse the
        // finished snapshot.
        detached = (async () => {
          await afterMaterialize;
          const scoped = DB.getTransactionContext().getTransaction("w") !== undefined;
          return { scoped, identity: await identityOf(model.getPuri("w").knex) };
        })();
        reached();
        await gate;
        return (await model.bodyVia("r", id)).body;
      }),
      await claimAll(),
    );

    await reachedGate;
    // While the projection holds the snapshot, a request from the outer context sees no scope and reads new data on a
    // pool connection.
    await editAndMark(id, "v2");
    expect(DB.getTransactionContext().getActiveTransaction()).toBeUndefined();
    const concurrent = await model.bodyVia("r", id);
    expect(concurrent.body).toBe("v2");
    expect(concurrent.pid).not.toBe(snapshotIdentity?.pid);
    release();

    const result = await pending;
    materializeReturned();
    expect(bodyOf(materialized(result.documents, id))).toBe("v1");
    // No scope in the outer context after the projection either.
    expect(DB.getTransactionContext().getTransaction("w")).toBeUndefined();
    expect(DB.getTransactionContext().getTransaction("r")).toBeUndefined();
    // The deferred work runs after the scope is cleared and uses a new transaction.
    const late = await detached;
    expect(late?.scoped).toBe(false);
    expect(late?.identity.started).not.toBe(snapshotIdentity?.started);
  });

  it("withProjectionScope는 살아 있는 트랜잭션이 아니면 스코프를 만들지 않고 거부한다", async () => {
    let called = false;
    // SAFETY: deliberately passes a Knex instance that is not a transaction.
    const notTransaction = resolveSonamuPrimary() as never;
    expect(() =>
      withProjectionScope(notTransaction, async () => {
        called = true;
      }),
    ).toThrow(SearchInvalidTransaction);
    const finished = await resolveSonamuPrimary().transaction(async (trx) => trx);
    expect(() =>
      withProjectionScope(finished, async () => {
        called = true;
      }),
    ).toThrow(SearchInvalidTransaction);
    expect(called).toBe(false);
  });
});
