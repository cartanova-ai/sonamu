import { BaseModelClass, DB } from "sonamu";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createSearchClient, type SearchClient } from "../../src/client/search-client";
import { SearchInTransactionError } from "../../src/errors";
import { type SearchQueries } from "../../src/query/search-queries";
import { createSonamuSearchQueries } from "../../src/sonamu";
import { createFakeOpenSearch, type FakeOpenSearch, TEST_READ_LIFETIMES } from "../../src/testing";
import { useIntegrationHarness } from "../helpers/harness";
import { applyTransactional, configureSonamuDatabase } from "../helpers/sonamu-app";
import { qualified, sql } from "../helpers/sql";
import {
  createTarget,
  openAdminClient,
  type PreparedTarget,
  resetSearchSchema,
  type StatementRunner,
} from "../helpers/test-targets";

/**
 * Managed search inside an active Sonamu transaction. createSonamuSearchQueries refuses it with SearchInTransactionError
 * before any I/O rather than running it outside the transaction. The catalogue is real PostgreSQL read through the Sonamu
 * primary; the engine is the /testing fake because this project has no OpenSearch. Knex query events on the w pool
 * (transaction IDs) and an uncommitted head change show that catalogue reads never use the caller's transaction.
 */

const h = useIntegrationHarness({ opensearch: false });
const KEY = "messages";
const FINGERPRINT = "b".repeat(64);
const BODY = { query: { match_all: {} } };

let admin: { run: StatementRunner; close(): Promise<void> };
let target: PreparedTarget;
let fake: FakeOpenSearch;
let client: SearchClient;
let queries: SearchQueries<{ body: string }>;
/** Requests made by beforeEach; tests look only at the requests after them. */
let setupRequests = 0;

function engineRequests() {
  return fake.requests().slice(setupRequests);
}

type CallOutcome = { readonly succeeded: true } | Error;

function settle<T>(pending: Promise<T>): Promise<CallOutcome> {
  return pending.then(
    () => ({ succeeded: true }) as const,
    (error: Error) => error,
  );
}

interface ObservedStatement {
  sql: string;
  transactionId: string | undefined;
}
const observed: ObservedStatement[] = [];
const queryEventSchema = z.looseObject({ sql: z.string(), __knexTxId: z.string().optional() });

class SearchProbeModelClass extends BaseModelClass {
  /** Searches inside @transactional, then writes to the domain in the same transaction after the refusals. */
  async searchInDecorated(roomName: string): Promise<CallOutcome[]> {
    const outcomes = [
      await settle(queries.search({ body: BODY })),
      await settle(queries.closeCursor("not-a-cursor")),
    ];
    await h.sample.createRoom(roomName, this.getPuri("w").knex);
    return outcomes;
  }

  async searchInManual(): Promise<CallOutcome> {
    return settle(this.getPuri("w").transaction(async () => queries.search({ body: BODY })));
  }

  async searchInReadOnly(): Promise<CallOutcome> {
    return settle(queries.search({ body: BODY }));
  }
}
applyTransactional(SearchProbeModelClass.prototype, "searchInDecorated");
applyTransactional(SearchProbeModelClass.prototype, "searchInReadOnly", {
  dbPreset: "r",
  readOnly: true,
});
const model = new SearchProbeModelClass();

beforeAll(async () => {
  configureSonamuDatabase(h);
  admin = await openAdminClient(h);
  DB.getDB("w").on("query", (event: { sql: string; __knexTxId?: string }) => {
    const parsed = queryEventSchema.safeParse(event);
    if (parsed.success)
      observed.push({ sql: parsed.data.sql, transactionId: parsed.data.__knexTxId });
  });
});
afterAll(async () => {
  await client?.close();
  await admin.close();
});
beforeEach(async () => {
  await resetSearchSchema(h);
  target = await createTarget(admin.run, {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey: KEY,
    fingerprint: FINGERPRINT,
  });
  // Without OpenSearch there is no cutover, so point the read head at the target directly.
  await h.knex.raw(
    sql`UPDATE ${qualified(h.searchSchema, "read_heads")} SET target_id = ?, generation = generation + 1 WHERE namespace = ? AND definition = ?`,
    [target.targetId, h.namespace, KEY],
  );
  fake = createFakeOpenSearch();
  await fake.client.indices.create({ index: target.physicalIndex, body: {} });
  setupRequests = fake.requests().length;
  await client?.close();
  client = createSearchClient({
    createClient: () => fake.client,
    ownsClient: false,
    requestTimeoutMs: 5_000,
  });
  queries = createSonamuSearchQueries<{ body: string }>({
    client,
    catalog: { namespace: h.namespace, schema: h.searchSchema },
    logicalKey: KEY,
    supportedFingerprints: [FINGERPRINT],
    limits: { ...TEST_READ_LIFETIMES, maxPageSize: 10, timeoutMs: 5_000 },
    cursor: { signingKeys: [{ id: "k1", secret: new Uint8Array(32).fill(3) }] },
  });
  observed.length = 0;
});

function catalogStatements(): ObservedStatement[] {
  return observed.filter(
    (statement) => statement.sql.includes("read_heads") || statement.sql.includes("targets t"),
  );
}

function expectRefused(error: CallOutcome | undefined): void {
  expect(error).toBeInstanceOf(SearchInTransactionError);
  if (!(error instanceof SearchInTransactionError)) return;
  expect(error.code).toBe("SEARCH_IN_TRANSACTION");
  expect(error.retryable).toBe(false);
  expect(error.details?.reason).toBe("ambient-transaction");
}

describe("활성 트랜잭션 안의 관리형 검색", () => {
  it("활성 트랜잭션 안의 관리형 검색은 SearchInTransactionError", async () => {
    const [searched, closed] = await model.searchInDecorated("after-refusal");
    expectRefused(searched);
    expectRefused(closed);
    expectRefused(await model.searchInManual());
    expectRefused(await model.searchInReadOnly());
    expect(catalogStatements()).toEqual([]);
    expect(engineRequests()).toEqual([]);
    // The refusal leaves the caller's transaction usable: its domain write committed.
    expect(
      await h.sample.from("rooms").where({ name: "after-refusal" }).count("* as count"),
    ).toEqual([{ count: "1" }]);
  });

  it("트랜잭션 밖의 검색은 동작하고, 카탈로그 조회는 호출자의 트랜잭션을 쓰지 않는다", async () => {
    const page = await queries.search({ body: BODY });
    expect(page.target).toMatchObject({ targetId: target.targetId, fingerprint: FINGERPRINT });
    expect(page.hits).toEqual([]);
    expect(engineRequests()).toEqual([
      expect.objectContaining({ method: "POST", path: `/${target.physicalIndex}/_search` }),
    ]);
    const catalog = catalogStatements();
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.transactionId).toBeUndefined();

    // An uncommitted head change in another transaction of this process is invisible: the catalogue reads committed
    // state on its own connection.
    const trx = await DB.getDB("w").transaction();
    try {
      await trx.raw(
        sql`UPDATE ${qualified(h.searchSchema, "read_heads")} SET rebuild_required = true WHERE namespace = ? AND definition = ?`,
        [h.namespace, KEY],
      );
      observed.length = 0;
      const during = await queries.search({ body: BODY });
      expect(during.target.targetId).toBe(target.targetId);
      const statements = catalogStatements();
      expect(statements).toHaveLength(1);
      expect(statements[0]?.transactionId).toBeUndefined();
    } finally {
      await trx.rollback();
    }
  });
});
