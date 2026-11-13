import {
  type ApiError,
  type ApiResponse,
  type Client,
  Transport,
} from "@opensearch-project/opensearch";
import {
  type TransportRequestCallback,
  type TransportRequestOptions,
  type TransportRequestParams,
  type TransportRequestPromise,
} from "@opensearch-project/opensearch/lib/Transport.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type WorkerLimits } from "../../src/postgres";
import { FENCE_DOCUMENT_ID } from "../../src/worker/fence";
import { useIntegrationHarness } from "../helpers/harness";
import { identifier, qualified, sql } from "../helpers/sql";
import {
  outcomeSum,
  recordingClient,
  useWorkerFixture,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * The engine rejects a whole bulk with 400 action_request_validation_exception when one _id exceeds 512 bytes. A
 * transport rewrites chosen ids on the wire only (after the worker's own byte check) to get that real response; the
 * worker must bisect within maxIsolationCallsPerBatch and quarantine only the offending document.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

const actionSchema = z.object({ index: z.looseObject({ _id: z.string() }) });

interface RejectingEngine {
  readonly client: Client;
  /** Original document ids of each bulk request sent to the engine. */
  readonly requests: string[][];
}

/** Rewrites the _id of each poison document to 600 bytes on the wire only. */
function rejectingEngine(base: Client, poison: ReadonlySet<string>): RejectingEngine {
  const requests: string[][] = [];
  class RewritingTransport extends Transport {
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
    ): TransportRequestPromise<ApiResponse>;
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
      callback?: (err: ApiError, result: ApiResponse) => void,
    ): TransportRequestCallback;
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
      callback?: (err: ApiError, result: ApiResponse) => void,
    ): TransportRequestPromise<ApiResponse> | TransportRequestCallback {
      const body = z.string().safeParse(params.bulkBody);
      if (callback !== undefined || !params.path.endsWith("/_bulk") || !body.success) {
        return super.request(params, options, callback);
      }
      const lines = body.data.split("\n").filter((line) => line !== "");
      const ids: string[] = [];
      const rewritten = lines.map((line, index) => {
        if (index % 2 === 1) return line;
        const action = actionSchema.parse(JSON.parse(line));
        // The worker prefixes every request, including split ones, with a fence item; it is not a document.
        if (action.index._id !== FENCE_DOCUMENT_ID) ids.push(action.index._id);
        if (!poison.has(action.index._id)) return line;
        return JSON.stringify({ index: { ...action.index, _id: "x".repeat(600) } });
      });
      // A fence-only request advances the fence and is not a document bulk.
      if (ids.length > 0) requests.push(ids);
      return super.request({ ...params, bulkBody: `${rewritten.join("\n")}\n` }, options);
    }
  }
  return { client: base.child({ Transport: RewritingTransport }), requests };
}

async function writeIds(setup: WorkerSetup, ids: readonly string[]) {
  await kit.write(setup, KEY, ids, async (trx) => {
    for (const id of ids) await kit.upsert(trx, KEY, id, `본문 ${id}`);
  });
}

const REJECTED_ERROR = {
  class: "request_rejected",
  status: 400,
  type: "action_request_validation_exception",
};

describe("요청 전체가 거부된 bulk", () => {
  it("요청 전체를 거부하게 만드는 항목 하나는 이분 탐색으로 찾아 격리되고 나머지는 색인된다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    const ids = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"];
    await writeIds(setup, ids);
    const engine = rejectingEngine(kit.nativeClient(), new Set(["d6"]));
    const limits: Partial<WorkerLimits> = { maxDocumentsPerClaim: 8, maxIsolationCallsPerBatch: 7 };
    const { indexer } = kit.indexer(setup, { client: engine.client, limits });

    const report = await indexer.drainOnce();
    expect(report).toMatchObject({
      claimed: 8,
      indexed: 7,
      quarantined: 1,
      retried: 0,
      released: 0,
      superseded: 0,
    });
    expect(outcomeSum(report)).toBe(report.claimed);
    // Bisection finishes within 1 + 2 * ceil(log2 8) = 7 requests.
    expect(engine.requests).toEqual([
      ids,
      ["d1", "d2", "d3", "d4"],
      ["d5", "d6", "d7", "d8"],
      ["d5", "d6"],
      ["d5"],
      ["d6"],
      ["d7", "d8"],
    ]);
    expect(engine.requests.length).toBeLessThanOrEqual(1 + 2 * Math.ceil(Math.log2(ids.length)));
    // Only d6 is quarantined, without budget; the others leave no runtime row at all.
    expect(await kit.runtimes()).toEqual([
      expect.objectContaining({
        document_id: "d6",
        quarantined_revision: 1,
        attempts: 0,
        retry_age_ms: 0,
        last_error: REJECTED_ERROR,
      }),
    ]);
    for (const id of ids.filter((other) => other !== "d6")) {
      expect(await kit.indexed(target, id)).toMatchObject({ version: 1 });
    }
    expect(await kit.indexed(target, "d6")).toBeNull();

    // The batch is not blocked afterwards: the next document goes out in one request.
    const sent = engine.requests.length;
    await writeIds(setup, ["d9"]);
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 1, indexed: 1, quarantined: 0 });
    expect(engine.requests.slice(sent)).toEqual([["d9"]]);
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 0 });
  });

  it("격리 전송 예산 안에서 끝나지 않은 문서는 예산 없이 반납되고 다음 drain이 격리를 마친다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    const ids = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"];
    const poison = new Set(["d2", "d3", "d7"]);
    await writeIds(setup, ids);
    const engine = rejectingEngine(kit.nativeClient(), poison);
    // Isolation budget is maxIsolationCallsPerBatch - 1 = 6 calls, so at most 7 requests per drain.
    const limits: Partial<WorkerLimits> = { maxDocumentsPerClaim: 8, maxIsolationCallsPerBatch: 7 };
    const { indexer } = kit.indexer(setup, { client: engine.client, limits });

    let drains = 0;
    let quarantined = 0;
    const settled = async () =>
      (await kit.intents()).length ===
      (await kit.runtimes()).filter((row) => row.quarantined_revision !== null).length;
    // Quarantined intents remain, so drain until every remaining intent is quarantined.
    while (!(await settled())) {
      drains += 1;
      // Every drain settles at least one document, so more drains than documents means no progress.
      expect(drains).toBeLessThanOrEqual(ids.length);
      const before = engine.requests.length;
      const report = await indexer.drainOnce();
      expect(outcomeSum(report)).toBe(report.claimed);
      expect(report).toMatchObject({ retried: 0 });
      expect(report.indexed + report.quarantined).toBeGreaterThan(0);
      expect(engine.requests.length - before).toBeLessThanOrEqual(7);
      quarantined += report.quarantined;
      for (const row of await kit.runtimes()) {
        expect(row.attempts).toBe(0);
        if (row.quarantined_revision === null) {
          expect(row.last_error).toMatchObject({ class: "isolation_unresolved" });
        }
      }
    }
    expect(quarantined).toBe(poison.size);
    expect(
      (await kit.runtimes()).map((row) => [
        row.document_id,
        row.quarantined_revision,
        row.last_error,
      ]),
    ).toEqual([...poison].toSorted().map((id) => [id, 1, REJECTED_ERROR]));
    for (const id of ids.filter((other) => !poison.has(other))) {
      expect(await kit.indexed(target, id)).toMatchObject({ version: 1 });
    }
  });

  it("512바이트를 넘는 _id는 전송 전에 격리된다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    const documents = qualified(h.searchSchema, "documents");
    // Reproduces a ledger row written by an older package or by hand: drop the byte CHECK in this schema only.
    const { rows } = await h.knex.raw<{ rows: { name: string }[] }>(
      `SELECT conname AS name FROM pg_constraint
WHERE conrelid = ?::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%octet_length(document_id)%'`,
      [`${h.searchSchema}.documents`],
    );
    expect(rows).toHaveLength(1);
    await h.knex.raw(
      sql`ALTER TABLE ${documents} DROP CONSTRAINT ${identifier(rows[0]?.name ?? "")}`,
    );
    // 171 Hangul characters are 513 bytes; the limit counts bytes, not characters.
    const longIds = ["가".repeat(171), "x".repeat(600)];
    for (const longId of longIds) {
      await h.knex.raw(
        sql`INSERT INTO ${documents} (namespace, definition, document_id, revision) VALUES (?, ?, ?, 1)`,
        [h.namespace, KEY, longId],
      );
      await h.knex.raw(
        sql`INSERT INTO ${qualified(h.searchSchema, "deliveries")} (target_id, document_id, desired_revision) VALUES (?, ?, 1)`,
        [target.targetId, longId],
      );
    }
    await writeIds(setup, ["a"]);

    const recorded = recordingClient(kit.nativeClient());
    const { indexer } = kit.indexer(setup, { client: recorded.client });
    const report = await indexer.drainOnce();
    expect(report).toMatchObject({ claimed: 3, indexed: 1, quarantined: 2, released: 0 });
    expect(recorded.bulks.map((bulk) => bulk.ids)).toEqual([["a"]]);
    expect(await kit.indexed(target, "a")).toMatchObject({ version: 1 });
    expect(
      (await kit.runtimes()).map((row) => [
        row.document_id,
        row.quarantined_revision,
        row.attempts,
        row.last_error,
      ]),
    ).toEqual(
      longIds
        .map((id) => [id, 1, 0, { class: "invalid_id", bytes: Buffer.byteLength(id, "utf8") }])
        .toSorted((left, right) => (String(left[0]) < String(right[0]) ? -1 : 1)),
    );
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 0 });
  });
});
