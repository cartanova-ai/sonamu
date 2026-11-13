import { type Knex } from "knex";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { computeProjectionHash, type JsonValue } from "../../src/definition/canonical-json";
import {
  type DocumentId,
  defineSearch,
  type Projection,
  type ProjectionReadContext,
} from "../../src/definition/define-search";
import {
  SearchConfigurationError,
  SearchProjectionError,
  SearchTimeout,
  SearchUnavailable,
} from "../../src/errors";
import { type ClaimedDelivery, createDeliveryStore } from "../../src/postgres/delivery-store";
import { traceProjectionConnections } from "../../src/testing/snapshot-tracer";
import {
  parseWorkerLimits,
  requiredIsolationCalls,
  type WorkerLimits,
} from "../../src/worker/limits";
import {
  type DocumentOutcome,
  type FailedDocument,
  type MaterializedDocument,
  materializeGroup,
} from "../../src/worker/materialize";

// In-memory fake primary: each transaction gets a new snapshot id and answers the ledger read and the snapshot
// check. tests/integration/pg/materialize-snapshot.test.ts covers real PostgreSQL.

const TARGET_ID = "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const store = createDeliveryStore({ schema: "ss_unit" });

type Statement = { text: string; bindings: readonly unknown[] };
type TransactionConfig = { isolationLevel?: string; readOnly?: boolean };
type Seen = { calls: (readonly DocumentId[])[]; contexts: ProjectionReadContext[] };

function newSeen(): Seen {
  return { calls: [], contexts: [] };
}

function pgError(code: string): Error {
  return Object.assign(new Error(`fake error ${code}`), { code, severity: "ERROR" });
}

class FakeTransaction {
  readonly statements: Statement[] = [];
  readonly trx: Knex.Transaction;

  constructor(
    readonly serial: number,
    private readonly primary: FakePrimary,
  ) {
    // SAFETY: fake transaction implementing only raw and the flags materialize reads.
    this.trx = Object.assign(function fakeTransaction() {}, {
      isTransaction: true,
      isCompleted: () => false,
      raw: (text: string, bindings: readonly unknown[] = []) => this.raw(text, bindings),
    }) as never;
  }

  async raw(text: string, bindings: readonly unknown[]) {
    this.statements.push({ text, bindings });
    if (text.includes("set_config('statement_timeout'")) {
      if (this.primary.failOpen !== undefined) throw pgError(this.primary.failOpen);
      return {
        rows: [
          {
            iso: this.primary.isolation,
            ro: this.primary.readOnly ? "on" : "off",
            replica: this.primary.replica,
            snapshot: `snap-${this.serial}`,
            started: `start-${this.serial}`,
          },
        ],
      };
    }
    if (text.includes("revision FROM")) {
      if (this.primary.failLedgerAt.has(this.serial)) throw pgError("08006");
      const ids = z.array(z.string()).parse(bindings[2]);
      return {
        rows: ids.flatMap((id) => {
          const revision = this.primary.ledger.get(id);
          return revision === undefined ? [] : [{ document_id: id, revision: String(revision) }];
        }),
      };
    }
    if (text.startsWith("SELECT pg_current_snapshot()")) {
      return {
        rows: [
          {
            snapshot: `snap-${this.serial}`,
            started: `start-${this.serial}`,
            ro: "on",
          },
        ],
      };
    }
    throw new Error(`unknown statement for the fake primary: ${text}`);
  }
}

class FakePrimary {
  isolation = "repeatable read";
  readOnly = true;
  replica = false;
  failOpen: string | undefined;
  readonly failLedgerAt = new Set<number>();
  readonly ledger = new Map<string, number>();
  readonly transactions: { tx: FakeTransaction; config: TransactionConfig }[] = [];
  readonly db: Knex;

  constructor() {
    // SAFETY: fake Knex; the snapshot runner reads only transaction and isTransaction.
    this.db = Object.assign(function fakeKnex() {}, {
      transaction: async <Result>(
        handler: (trx: Knex.Transaction) => Promise<Result>,
        config: TransactionConfig,
      ): Promise<Result> => {
        const tx = new FakeTransaction(this.transactions.length + 1, this);
        this.transactions.push({ tx, config });
        return handler(tx.trx);
      },
    }) as never;
  }
}

type Doc = { title: string; [key: string]: JsonValue };
type Behavior =
  | { kind: "present"; document: Readonly<Record<string, JsonValue | bigint>> }
  | { kind: "deleted" }
  | { kind: "throw"; error: unknown }
  | { kind: "hang" }
  | { kind: "raw"; value: unknown }
  | { kind: "omit" };

// Other fields pass unchecked; the canonical JSON check rejects non-JSON values such as bigint.
const documentSchema = z.object({ title: z.string() }).catchall(z.custom<JsonValue>(() => true));

function definitionFor(
  behaviors: ReadonlyMap<DocumentId, Behavior>,
  seen: Seen = newSeen(),
  extraKeys: readonly string[] = [],
) {
  return defineSearch<Doc>({
    key: "messages",
    projectionVersion: "1",
    schema: documentSchema,
    settings: {},
    mappings: { properties: {} },
    requiredPlugins: [],
    async materialize(context, ids) {
      seen.calls.push([...ids]);
      seen.contexts.push(context);
      const result = new Map<DocumentId, Projection<Doc>>();
      for (const id of ids) {
        const behavior = behaviors.get(id) ?? { kind: "present", document: { title: id } };
        switch (behavior.kind) {
          case "throw":
            throw behavior.error;
          case "hang":
            await new Promise(() => {});
            break;
          case "deleted":
            result.set(id, { state: "deleted" });
            break;
          case "omit":
            break;
          case "raw":
            // SAFETY: deliberately breaks the projection contract.
            result.set(id, behavior.value as Projection<Doc>);
            break;
          default:
            // SAFETY: the unvalidated document is passed on for the schema to judge.
            result.set(id, { state: "present", document: behavior.document as Doc });
        }
      }
      for (const key of extraKeys) result.set(key, { state: "deleted" });
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

function deliveries(ids: readonly string[], claimedRevision = 1): ClaimedDelivery[] {
  return ids.map((documentId, position) => ({
    targetId: TARGET_ID,
    documentId,
    intentId: `1b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a${String(position).padStart(2, "0")}`,
    claimedRevision,
  }));
}

const LIMITS = { projectionTimeoutMs: 2_000, maxIsolationCallsPerBatch: 50, maxBulkBytes: 65_536 };

async function run(
  primary: FakePrimary,
  ids: readonly string[],
  behaviors: ReadonlyMap<DocumentId, Behavior> = new Map(),
  options: {
    limits?: Partial<typeof LIMITS>;
    signal?: AbortSignal;
    seen?: { calls: (readonly DocumentId[])[]; contexts: ProjectionReadContext[] };
    extraKeys?: readonly string[];
  } = {},
) {
  for (const id of ids) if (!primary.ledger.has(id)) primary.ledger.set(id, 3);
  return materializeGroup({
    db: primary.db,
    store,
    namespace: "app",
    definition: definitionFor(behaviors, options.seen, options.extraKeys),
    deliveries: deliveries(ids),
    limits: { ...LIMITS, ...options.limits },
    signal: options.signal,
  });
}

function byId(documents: readonly DocumentOutcome[]): Map<string, DocumentOutcome> {
  return new Map(documents.map((document) => [document.delivery.documentId, document]));
}

function expectMaterialized(outcome: DocumentOutcome | undefined): MaterializedDocument {
  if (outcome?.kind !== "materialized") {
    throw new Error(`not materialized: ${JSON.stringify(outcome?.kind)}`);
  }
  return outcome;
}

function expectFailed(
  outcome: DocumentOutcome | undefined,
  reason: string,
  disposition: string,
): FailedDocument {
  if (outcome?.kind !== "failed") throw new Error("not failed");
  expect(outcome.reason).toBe(reason);
  expect(outcome.disposition).toBe(disposition);
  expect(outcome.error).toBeInstanceOf(SearchProjectionError);
  expect(outcome.error.details?.reason).toBe(reason);
  expect(outcome.error.retryable).toBe(disposition !== "poison");
  return outcome;
}

const IDS = ["a", "b", "c", "d", "e", "f", "g", "h"];

describe("스냅샷과 envelope", () => {
  it("한 스냅샷에서 원장 리비전과 projection을 읽고, 검증된 복사본으로 해시와 본문을 만든다", async () => {
    const primary = new FakePrimary();
    primary.ledger.set("a", 7);
    const original = { title: "원래 제목", tags: ["x"] };
    const seen = newSeen();
    const result = await run(
      primary,
      ["a", "b"],
      new Map<DocumentId, Behavior>([
        ["a", { kind: "present", document: original }],
        ["b", { kind: "deleted" }],
      ]),
      { seen },
    );
    // Mutating the projector's object afterwards must not change the result.
    original.title = "바뀐 제목";
    original.tags.push("y");

    expect(result.materializeCalls).toBe(1);
    expect(result.infrastructureError).toBeUndefined();
    expect(primary.transactions).toHaveLength(1);
    expect(primary.transactions[0]?.config).toEqual({
      isolationLevel: "repeatable read",
      readOnly: true,
    });
    const [open] = primary.transactions[0]?.tx.statements ?? [];
    // statement and idle limits equal projectionTimeoutMs; the lock limit is half of it.
    expect(open?.bindings).toEqual(["2000ms", "1000ms", "2000ms"]);
    expect(seen.contexts[0]?.trx).toBe(primary.transactions[0]?.tx.trx);
    expect(seen.contexts[0]?.logicalKey).toBe("messages");
    expect(seen.contexts[0]?.signal.aborted).toBe(true);

    const outcomes = byId(result.documents);
    const present = expectMaterialized(outcomes.get("a"));
    // The snapshot's ledger revision, not the claimed revision 1.
    expect(present.revision).toBe(7);
    expect(present.projection).toEqual({
      state: "present",
      document: { title: "원래 제목", tags: ["x"] },
    });
    expect(present.envelope).toEqual({
      sonamu_meta: {
        deleted: false,
        revision: 7,
        hash_version: "sonamu-c14n-v1",
        projection_hash: present.projectionHash,
      },
      doc: { title: "원래 제목", tags: ["x"] },
    });
    expect(present.projectionHash).toBe(
      computeProjectionHash({ state: "present", document: { title: "원래 제목", tags: ["x"] } }),
    );
    expect(present.canonical).toBe(
      '{"document":{"tags":["x"],"title":"원래 제목"},"state":"present"}',
    );
    // Hash and body come from the same copy.
    expect("doc" in present.envelope && present.envelope.doc).toBe(
      present.projection.state === "present" && present.projection.document,
    );

    const tombstone = expectMaterialized(outcomes.get("b"));
    expect(tombstone.envelope).toEqual({
      sonamu_meta: {
        deleted: true,
        revision: 3,
        hash_version: "sonamu-c14n-v1",
        projection_hash: computeProjectionHash({ state: "deleted" }),
      },
    });
    expect("doc" in tombstone.envelope).toBe(false);
  });

  it("primary가 트랜잭션이거나 스냅샷이 REPEATABLE READ 읽기 전용 primary가 아니면 설정 오류로 거부한다", async () => {
    const transactionPrimary = new FakePrimary();
    Object.assign(transactionPrimary.db, { isTransaction: true });
    await expect(run(transactionPrimary, ["a"])).rejects.toMatchObject({
      code: "SEARCH_CONFIGURATION_ERROR",
      details: { reason: "primary-is-transaction" },
    });
    expect(transactionPrimary.transactions).toHaveLength(0);

    for (const [mutate, reason] of [
      [(p: FakePrimary) => (p.isolation = "read committed"), "snapshot-not-repeatable-read"],
      [(p: FakePrimary) => (p.readOnly = false), "snapshot-not-read-only"],
      [(p: FakePrimary) => (p.replica = true), "snapshot-on-replica"],
    ] as const) {
      const primary = new FakePrimary();
      mutate(primary);
      const seen = newSeen();
      const error = await run(primary, ["a"], new Map(), { seen }).catch((caught) => caught);
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details?.reason).toBe(reason);
      expect(seen.calls).toEqual([]);
    }
  });

  it("첫 스냅샷의 원장 읽기가 실패하면 materialize가 거부되고, 격리 중의 실패는 남은 문서를 반납한다", async () => {
    const primary = new FakePrimary();
    primary.failLedgerAt.add(1);
    await expect(run(primary, ["a", "b"])).rejects.toBeInstanceOf(SearchUnavailable);

    const isolating = new FakePrimary();
    isolating.failLedgerAt.add(2);
    const result = await run(
      isolating,
      ["a", "b", "c", "d"],
      new Map<DocumentId, Behavior>([["a", { kind: "throw", error: new Error("x") }]]),
    );
    expect(result.infrastructureError).toBeInstanceOf(SearchUnavailable);
    for (const document of result.documents) {
      expectFailed(document, "database_unavailable", "release");
    }
  });
});

describe("문서 단위 격리", () => {
  it("예외를 던지는 ID만 격리되고 다른 문서는 새 스냅샷에서 materialize된다", async () => {
    const primary = new FakePrimary();
    const result = await run(
      primary,
      IDS,
      new Map<DocumentId, Behavior>([
        ["f", { kind: "throw", error: new TypeError("문서 f 실패") }],
      ]),
    );
    const outcomes = byId(result.documents);
    const failure = expectFailed(outcomes.get("f"), "projection_threw", "poison");
    expect(failure.error.details?.errorName).toBe("TypeError");
    expect(failure.deliveryError).toEqual({
      class: "projection_error",
      code: "projection_threw",
      errorName: "TypeError",
    });
    // The message text is never stored.
    expect(JSON.stringify(failure.deliveryError)).not.toContain("문서 f 실패");
    for (const id of IDS.filter((id) => id !== "f")) expectMaterialized(outcomes.get(id));
    // Bisection: 1 + 2 * ceil(log2 8) calls, each on a new snapshot.
    expect(result.materializeCalls).toBe(requiredIsolationCalls(IDS.length));
    expect(primary.transactions).toHaveLength(result.materializeCalls);
    expect(result.infrastructureError).toBeUndefined();
  });

  it("읽기 전용 위반(25006)과 그 밖의 SQL 오류는 그 문서의 실패로 보고된다", async () => {
    const primary = new FakePrimary();
    const result = await run(
      primary,
      ["a", "b", "c"],
      new Map<DocumentId, Behavior>([
        ["a", { kind: "throw", error: pgError("25006") }],
        ["c", { kind: "throw", error: pgError("42703") }],
      ]),
    );
    const outcomes = byId(result.documents);
    expect(
      expectFailed(outcomes.get("a"), "read_only_violation", "poison").error.details?.sqlstate,
    ).toBe("25006");
    expect(
      expectFailed(outcomes.get("c"), "projection_sql_error", "poison").deliveryError,
    ).toMatchObject({
      class: "projection_error",
      sqlstate: "42703",
    });
    expectMaterialized(outcomes.get("b"));
  });

  it("값 하나의 계약 위반, 누락, JSON이 아닌 값, schema 위반, 예약 필드, 크기 초과는 그 문서만 실패시킨다", async () => {
    const primary = new FakePrimary();
    const result = await run(
      primary,
      ["ok", "shape", "missing", "bigint", "schema", "reserved", "big", "tomb"],
      new Map<DocumentId, Behavior>([
        ["shape", { kind: "raw", value: { state: "present" } }],
        ["missing", { kind: "omit" }],
        ["bigint", { kind: "present", document: { title: "x", n: 10n } }],
        ["schema", { kind: "present", document: { title: 42 } }],
        ["reserved", { kind: "present", document: { title: "x", _id: "y" } }],
        ["big", { kind: "present", document: { title: "가".repeat(30_000) } }],
        ["tomb", { kind: "deleted" }],
      ]),
    );
    // The result map honours the contract, so one snapshot suffices.
    expect(result.materializeCalls).toBe(1);
    const outcomes = byId(result.documents);
    expectMaterialized(outcomes.get("ok"));
    expectMaterialized(outcomes.get("tomb"));
    expectFailed(outcomes.get("shape"), "invalid_projection", "poison");
    expectFailed(outcomes.get("missing"), "missing_projection", "poison");
    expect(
      expectFailed(outcomes.get("bigint"), "non_json_document", "poison").error.details,
    ).toMatchObject({ violation: "bigint", path: "/document/n" });
    const schema = expectFailed(outcomes.get("schema"), "schema_invalid", "poison");
    expect(schema.error.details).toMatchObject({
      path: "/title",
      code: "invalid_type",
      issueCount: 1,
    });
    expect(schema.deliveryError).toMatchObject({
      class: "schema_invalid",
      issues: [{ path: "/title", code: "invalid_type" }],
    });
    expect(
      expectFailed(outcomes.get("reserved"), "reserved_field", "poison").error.details,
    ).toMatchObject({ field: "_id" });
    expect(expectFailed(outcomes.get("big"), "oversized", "poison").error.details).toMatchObject({
      maxBytes: 65_536,
    });
  });

  it("요청하지 않은 키가 섞인 결과 Map은 이분 격리로 원인을 좁힌다", async () => {
    const primary = new FakePrimary();
    const result = await run(primary, ["a", "b"], new Map(), { extraKeys: ["zzz"] });
    // Every call carries the foreign key, so bisection reaches single calls and both documents fail.
    for (const document of result.documents) expectFailed(document, "invalid_result", "poison");
    expect(result.materializeCalls).toBe(3);
  });

  it("모든 문서가 시간 초과되면 하나도 세지 않고 모두 반납하며, 이분 탐색은 스냅샷 3개에서 멈춘다", async () => {
    for (const behavior of [
      { kind: "hang" },
      { kind: "throw", error: pgError("57014") },
      { kind: "throw", error: pgError("25P03") },
    ] satisfies Behavior[]) {
      const primary = new FakePrimary();
      const result = await run(primary, IDS, new Map(IDS.map((id) => [id, behavior])), {
        limits: { projectionTimeoutMs: 30 },
      });
      // One full call plus two halves; both time out without evidence of a responsive database, so bisection stops.
      expect(result.materializeCalls).toBe(3);
      expect(primary.transactions).toHaveLength(3);
      for (const document of result.documents) {
        const failure = expectFailed(document, "projection_timeout", "release");
        expect(failure.revision).toBe(3);
        expect(failure.error.details?.evidence).toBe("none");
        expect(failure.deliveryError).toMatchObject({
          class: "materialize_released",
          code: "projection_timeout",
        });
      }
      expect(result.infrastructureError).toBeInstanceOf(SearchTimeout);
      expect(result.infrastructureError?.details).toMatchObject({
        reason: "projection-timeout-unproven",
        documents: IDS.length,
      });
    }
  });

  it("건강한 문서 사이의 느린 문서 하나만 예산을 쓰는 재시도가 되고 cooldown은 알리지 않는다", async () => {
    const primary = new FakePrimary();
    const result = await run(
      primary,
      IDS,
      new Map<DocumentId, Behavior>([["f", { kind: "hang" }]]),
      {
        limits: { projectionTimeoutMs: 30 },
      },
    );
    const outcomes = byId(result.documents);
    expect(
      expectFailed(outcomes.get("f"), "projection_timeout", "retry").deliveryError,
    ).toMatchObject({ class: "projection_error", code: "projection_timeout" });
    for (const id of IDS.filter((id) => id !== "f")) expectMaterialized(outcomes.get(id));
    expect(result.infrastructureError).toBeUndefined();
    expect(result.materializeCalls).toBe(requiredIsolationCalls(IDS.length));
  });

  it("문서 하나만 claim해 시간 초과되면 반납하고, 같은 primary의 다른 projection이 완료된 뒤의 다음 시간 초과부터 센다", async () => {
    const primary = new FakePrimary();
    const slow = new Map<DocumentId, Behavior>([["slow", { kind: "hang" }]]);
    const options = { limits: { projectionTimeoutMs: 30 } };

    const first = await run(primary, ["slow"], slow, options);
    expect(first.materializeCalls).toBe(1);
    expectFailed(first.documents[0], "projection_timeout", "release");
    expect(first.infrastructureError).toBeInstanceOf(SearchTimeout);

    // No projection completed in between, so the outage may continue: released again.
    const again = await run(primary, ["slow"], slow, options);
    expectFailed(again.documents[0], "projection_timeout", "release");

    // Another target's projection completes on the same primary: the database responds.
    primary.ledger.set("healthy", 3);
    const other = await materializeGroup({
      db: primary.db,
      store,
      namespace: "app",
      definition: definitionFor(new Map()),
      deliveries: deliveries(["healthy"]).map((delivery) => ({
        ...delivery,
        targetId: "2b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
      })),
      limits: LIMITS,
    });
    expectMaterialized(other.documents[0]);

    const counted = await run(primary, ["slow"], slow, options);
    expectFailed(counted.documents[0], "projection_timeout", "retry");
    expect(counted.infrastructureError).toBeUndefined();

    // Counting consumes the evidence; the next timeout waits for new evidence.
    const afterCount = await run(primary, ["slow"], slow, options);
    expectFailed(afterCount.documents[0], "projection_timeout", "release");

    // Evidence from another primary (Knex instance) does not count.
    const elsewhere = new FakePrimary();
    const isolated = await run(elsewhere, ["slow"], slow, options);
    expectFailed(isolated.documents[0], "projection_timeout", "release");
  });

  it("인프라 오류에서는 이분 격리를 시도하지 않고 모든 문서를 예산 없이 반납한다", async () => {
    for (const code of ["08006", "53300", "57P01", "40001", "55P03"]) {
      const primary = new FakePrimary();
      const result = await run(
        primary,
        IDS,
        new Map<DocumentId, Behavior>([["c", { kind: "throw", error: pgError(code) }]]),
      );
      expect(result.materializeCalls).toBe(1);
      expect(result.infrastructureError).toBeInstanceOf(Error);
      for (const document of result.documents) {
        const failure = expectFailed(document, "database_unavailable", "release");
        expect(failure.revision).toBe(3);
        expect(failure.deliveryError.class).toBe("materialize_released");
      }
    }
  });

  it("원장에 없는 ID는 projection하지 않고 ledger_missing으로 격리한다", async () => {
    const primary = new FakePrimary();
    const seen = newSeen();
    const result = await materializeGroup({
      db: primary.db,
      store,
      namespace: "app",
      definition: definitionFor(new Map(), seen),
      deliveries: deliveries(["ghost"], 5),
      limits: LIMITS,
    });
    const failure = expectFailed(result.documents[0], "ledger_missing", "poison");
    expect(failure.revision).toBe(5);
    expect(failure.deliveryError).toEqual({ class: "ledger_missing" });
    expect(seen.calls).toEqual([]);
  });

  it("중단 신호를 받으면 projection을 기다리지 않고 남은 문서를 반납한다", async () => {
    const before = new AbortController();
    before.abort();
    const idle = new FakePrimary();
    const skipped = await run(idle, ["a"], new Map(), { signal: before.signal });
    expectFailed(skipped.documents[0], "aborted", "release");
    expect(idle.transactions).toHaveLength(0);

    const during = new AbortController();
    const primary = new FakePrimary();
    const pending = run(
      primary,
      ["a", "b"],
      new Map<DocumentId, Behavior>([["a", { kind: "hang" }]]),
      {
        signal: during.signal,
      },
    );
    setTimeout(() => during.abort(), 10);
    const result = await pending;
    for (const document of result.documents) expectFailed(document, "aborted", "release");
    expect(result.materializeCalls).toBe(1);
  });

  it("문서 ID가 겹치는 입력은 거부한다", async () => {
    const primary = new FakePrimary();
    await expect(
      materializeGroup({
        db: primary.db,
        store,
        namespace: "app",
        definition: definitionFor(new Map()),
        deliveries: [...deliveries(["a"]), ...deliveries(["a"])],
        limits: LIMITS,
      }),
    ).rejects.toMatchObject({ details: { reason: "invalid-materialize-input" } });
  });
});

const VALID_LIMITS: WorkerLimits = {
  maxDocumentsPerClaim: 100,
  maxBulkBytes: 5_000_000,
  maxConcurrentBulkRequests: 2,
  projectionTimeoutMs: 10_000,
  requestTimeoutMs: 15_000,
  leaseDurationMs: 60_000,
  heartbeatIntervalMs: 20_000,
  maxRetryAttempts: 10,
  maxRetryAgeMs: 3_600_000,
  maxIsolationCallsPerBatch: 15,
  retryBaseDelayMs: 1_000,
  retryMaxDelayMs: 300_000,
  maxInFlightBytes: 15_000_000,
  statementTimeoutMs: 5_000,
  fenceRenewIntervalMs: 30_000,
};

describe("워커 한도", () => {
  it("올바른 한도는 동결된 복사본으로 돌려준다", () => {
    const parsed = parseWorkerLimits(VALID_LIMITS);
    expect(parsed).toEqual(VALID_LIMITS);
    expect(parsed).not.toBe(VALID_LIMITS);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(requiredIsolationCalls(1)).toBe(1);
    expect(requiredIsolationCalls(100)).toBe(15);
  });

  it("범위 밖의 값, 빠진 값, 모르는 키를 거부한다", () => {
    type LimitsInput = Partial<Record<keyof WorkerLimits | "maxDocuments", number>>;
    const cases: [LimitsInput, string, string][] = [
      [{ ...VALID_LIMITS, maxBulkBytes: 10 }, "invalid-worker-limits", "maxBulkBytes"],
      [{ ...VALID_LIMITS, leaseDurationMs: 1.5 }, "invalid-worker-limits", "leaseDurationMs"],
      [
        { ...VALID_LIMITS, maxDocumentsPerClaim: 0 },
        "invalid-worker-limits",
        "maxDocumentsPerClaim",
      ],
      [
        Object.fromEntries(Object.entries(VALID_LIMITS).filter(([key]) => key !== "maxRetryAgeMs")),
        "invalid-worker-limits",
        "maxRetryAgeMs",
      ],
      [{ ...VALID_LIMITS, maxDocuments: 5 }, "unknown-worker-limit", "maxDocuments"],
    ];
    for (const [limits, reason, field] of cases) {
      const error = (() => {
        try {
          // SAFETY: bypasses the type check to test runtime rejection.
          parseWorkerLimits(limits as never);
        } catch (caught) {
          return caught;
        }
        return undefined;
      })();
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error).toMatchObject({ details: { reason, field } });
    }
  });

  it("워커를 불건전하게 만드는 한도 조합은 설정 오류다", () => {
    const cases: [Partial<WorkerLimits>, string][] = [
      [{ heartbeatIntervalMs: 30_001 }, "heartbeat-exceeds-half-lease"],
      [{ projectionTimeoutMs: 60_000 }, "timeout-exceeds-lease"],
      [{ requestTimeoutMs: 60_000 }, "timeout-exceeds-lease"],
      [{ retryBaseDelayMs: 400_000 }, "retry-delay-inverted"],
      [{ maxRetryAgeMs: 1_000 }, "retry-age-below-base-delay"],
      [{ maxIsolationCallsPerBatch: 14 }, "isolation-budget-too-small"],
    ];
    for (const [patch, reason] of cases) {
      expect(() => parseWorkerLimits({ ...VALID_LIMITS, ...patch })).toThrow(
        expect.objectContaining({
          code: "SEARCH_CONFIGURATION_ERROR",
          details: expect.objectContaining({ reason }),
        }),
      );
    }
    // Boundary values are accepted.
    expect(() =>
      parseWorkerLimits({
        ...VALID_LIMITS,
        heartbeatIntervalMs: 30_000,
        projectionTimeoutMs: 59_999,
      }),
    ).not.toThrow();
  });
});

describe("스냅샷 추적기", () => {
  it("만들기만 해서는 리스너를 붙이지 않고, Knex가 아닌 값과 끝난 트랜잭션은 거부한다", async () => {
    const listeners: string[] = [];
    // SAFETY: fake Knex with only on and removeListener.
    const fake = Object.assign(function fakeKnex() {}, {
      on: (event: string) => listeners.push(event),
      removeListener: () => {},
    }) as never;
    const tracer = traceProjectionConnections(fake);
    expect(listeners).toEqual([]);
    expect(tracer.statements()).toEqual([]);
    // SAFETY: fake shaped like a completed transaction.
    const completed = Object.assign(function fakeTrx() {}, {
      isTransaction: true,
      isCompleted: () => true,
    }) as never;
    await expect(tracer.run(completed, async () => 1)).rejects.toMatchObject({
      details: { reason: "tracer-invalid-snapshot" },
    });
    expect(listeners).toEqual([]);
    tracer.dispose();
    // SAFETY: bypasses the type check to test runtime rejection.
    expect(() => traceProjectionConnections({} as never)).toThrow(SearchConfigurationError);
  });
});

describe("흘려보내기, 기한, 공유 예산, 호출 상한", () => {
  const direct = (
    primary: FakePrimary,
    ids: readonly string[],
    behaviors: ReadonlyMap<DocumentId, Behavior>,
    extra: Partial<Parameters<typeof materializeGroup>[0]>,
  ) => {
    for (const id of ids) if (!primary.ledger.has(id)) primary.ledger.set(id, 3);
    return materializeGroup({
      db: primary.db,
      store,
      namespace: "app",
      definition: definitionFor(behaviors),
      deliveries: deliveries(ids),
      limits: LIMITS,
      ...extra,
    });
  };

  it("onMaterialized를 주면 색인 가능한 문서를 끝나는 대로 넘기고 결과에는 실패한 문서만 남긴다", async () => {
    const primary = new FakePrimary();
    const streamed: string[] = [];
    const result = await direct(
      primary,
      ["a", "b", "c"],
      new Map<DocumentId, Behavior>([
        ["a", { kind: "present", document: { title: "하나" } }],
        ["b", { kind: "present", document: { title: 7 } }],
        ["c", { kind: "deleted" }],
      ]),
      {
        onMaterialized: async (document) => {
          streamed.push(document.delivery.documentId);
          expect(document.projectionHash).toBe(computeProjectionHash(document.projection));
        },
      },
    );
    expect(streamed).toEqual(["a", "c"]);
    expect(result.documents.map((document) => document.delivery.documentId)).toEqual(["b"]);
    expectFailed(result.documents[0], "schema_invalid", "poison");
  });

  it("작업 창(deadlineAt)이 닫혔으면 materialize 호출을 시작하지 않고 모두 예산 없이 반납한다", async () => {
    const primary = new FakePrimary();
    const seen = newSeen();
    const result = await materializeGroup({
      db: primary.db,
      store,
      namespace: "app",
      definition: definitionFor(new Map(), seen),
      deliveries: deliveries(["a", "b"]),
      limits: LIMITS,
      deadlineAt: performance.now() - 1,
    });
    expect(result.materializeCalls).toBe(0);
    expect(seen.calls).toEqual([]);
    for (const document of result.documents) expectFailed(document, "drain_deadline", "release");
  });

  it("공유 이분 격리 예산을 주면 첫 호출은 세지 않고, 예산이 없으면 이분 격리 없이 반납한다", async () => {
    const primary = new FakePrimary();
    primary.ledger.set("a", 3);
    primary.ledger.set("b", 3);
    const budget = { remaining: 0 };
    const seen = newSeen();
    const result = await materializeGroup({
      db: primary.db,
      store,
      namespace: "app",
      definition: definitionFor(
        new Map<DocumentId, Behavior>([["b", { kind: "throw", error: new Error("bad") }]]),
        seen,
      ),
      deliveries: deliveries(["a", "b"]),
      limits: LIMITS,
      isolationBudget: budget,
    });
    expect(result.materializeCalls).toBe(1);
    expect(budget.remaining).toBe(0);
    for (const document of result.documents) {
      expectFailed(document, "isolation_budget_exhausted", "release");
    }
  });

  it("호출 상한(callTimeoutMs)이 지나면 스냅샷이 끝나기를 기다리지 않고 인프라 실패로 끝낸다", async () => {
    const primary = new FakePrimary();
    const result = await direct(
      primary,
      ["a"],
      new Map<DocumentId, Behavior>([["a", { kind: "hang" }]]),
      { limits: { ...LIMITS, projectionTimeoutMs: 60_000 }, callTimeoutMs: 100 },
    );
    expect(result.infrastructureError).toBeInstanceOf(SearchTimeout);
    expect(result.infrastructureError?.details).toMatchObject({ reason: "snapshot-timeout" });
    expectFailed(result.documents[0], "database_unavailable", "release");
  });
});
