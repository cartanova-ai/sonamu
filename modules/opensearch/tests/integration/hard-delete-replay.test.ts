import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type DefinedSearch,
  type DocumentId,
  type Projection,
} from "../../src/definition/define-search";
import { useIntegrationHarness } from "../helpers/harness";
import { sendBulk } from "../helpers/opensearch-ops";
import { identifier, qualified, sql } from "../helpers/sql";
import {
  type Note,
  outcomeSum,
  useWorkerFixture,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * A hard delete keeps the ledger row and indexes a bodiless tombstone at the next revision with an external version.
 * Late or reordered older requests either get 409 or are re-projected at the current ledger revision, so they cannot
 * resurrect the document. The write path never sends a native delete.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";

const WORKER_QUERY = {
  require_alias: "true",
  filter_path: "errors,items.*._id,items.*.status,items.*._version,items.*.error.type",
};

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

/** Resends an old revision's body to the write alias with external versioning; returns the item statuses. */
async function replay(
  alias: string,
  id: string,
  revision: number,
  body: string,
): Promise<number[]> {
  const result = await sendBulk(
    h.opensearch,
    alias,
    [
      { index: { _id: id, version: revision, version_type: "external" } },
      {
        sonamu_meta: {
          deleted: false,
          revision,
          hash_version: "sonamu-c14n-v1",
          projection_hash: "0".repeat(64),
        },
        doc: { body },
      },
    ],
    WORKER_QUERY,
  );
  return result.items.map((item) => item.status);
}

async function searchBody(index: string, text: string): Promise<string[]> {
  await h.opensearch.indices.refresh({ index });
  const response = await h.opensearch.search({
    index,
    body: { query: { match: { "doc.body": text } } },
  });
  return z
    .object({ hits: z.object({ hits: z.array(z.object({ _id: z.string() })) }) })
    .parse(response.body)
    .hits.hits.map((hit) => hit._id);
}

async function drainAll(setup: WorkerSetup, definitions?: ReadonlyMap<string, DefinedSearch>) {
  const { indexer } = kit.indexer(definitions === undefined ? setup : { ...setup, definitions });
  const reports = [];
  for (let round = 0; round < 10 && (await kit.intents()).length > 0; round += 1) {
    const report = await indexer.drainOnce();
    expect(outcomeSum(report)).toBe(report.claimed);
    reports.push(report);
  }
  expect(await kit.intents()).toEqual([]);
  return reports;
}

describe("hard delete와 재생", () => {
  it("hard delete 뒤 원장이 남아 있고, 늦게 재전송된 옛 payload가 내용을 되살리지 못한다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    await kit.write(setup, KEY, ["x"], (trx) => kit.upsert(trx, KEY, "x", "사과 하나"));
    await drainAll(setup);
    await kit.write(setup, KEY, ["x"], (trx) => kit.upsert(trx, KEY, "x", "사과 둘"));
    await drainAll(setup);
    await kit.write(setup, KEY, ["x"], (trx) => kit.remove(trx, KEY, "x"));
    const [deletion] = await drainAll(setup);
    expect(deletion).toMatchObject({ claimed: 1, indexed: 1 });

    expect(await kit.ledger(KEY)).toEqual({ x: 3 });
    expect(await kit.indexed(target, "x")).toEqual({
      version: 3,
      revision: 3,
      deleted: true,
      doc: undefined,
    });

    // Late bodies at older revisions and at the tombstone's own revision all get 409.
    for (const [revision, body] of [
      [2, "사과 둘"],
      [1, "사과 하나"],
      [3, "사과 셋"],
    ] as const) {
      expect(await replay(target.writeAlias, "x", revision, body)).toEqual([409]);
    }
    expect(await kit.indexed(target, "x")).toMatchObject({
      version: 3,
      deleted: true,
      doc: undefined,
    });
    expect(await searchBody(target.physicalIndex, "사과")).toEqual([]);

    // A replayed stale intent is projected at the current ledger revision: the same tombstone gets 409 and verifies
    // as a duplicate.
    for (const stale of [1, 2]) {
      await h.knex.raw(
        sql`INSERT INTO ${qualified(h.searchSchema, "deliveries")} (target_id, document_id, desired_revision) VALUES (?, 'x', ?)`,
        [target.targetId, stale],
      );
      const [report] = await drainAll(setup);
      expect(report).toMatchObject({ claimed: 1, superseded: 1, indexed: 0, quarantined: 0 });
    }
    expect(await kit.indexed(target, "x")).toMatchObject({
      version: 3,
      deleted: true,
      doc: undefined,
    });
    expect(await kit.ledger(KEY)).toEqual({ x: 3 });

    await kit.write(setup, KEY, ["x"], (trx) => kit.upsert(trx, KEY, "x", "사과 넷"));
    await drainAll(setup);
    expect(await kit.indexed(target, "x")).toEqual({
      version: 4,
      revision: 4,
      deleted: false,
      doc: { body: "사과 넷" },
    });
    expect(await searchBody(target.physicalIndex, "사과")).toEqual(["x"]);
    expect(await replay(target.writeAlias, "x", 3, "사과 셋")).toEqual([409]);
    expect(await kit.runtimes()).toEqual([]);
  });

  it("애플리케이션이 표시한 FK CASCADE 삭제도 tombstone이 되고, 옛 본문 재생으로 되살아나지 않는다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    const messages = qualified(h.appSchema, "messages");
    // Wraps the fixture definition, so key and fingerprint and hence the target stay the same.
    const base = setup.definitions.get(KEY);
    if (base === undefined) throw new Error("정의가 없습니다.");
    const messageDefinition: DefinedSearch = {
      ...base,
      async materialize(context, ids: readonly DocumentId[]) {
        const { rows } = z
          .object({ rows: z.array(z.object({ id: z.string(), body: z.string() })) })
          .parse(
            await context.trx.raw(
              sql`SELECT id::text AS id, body FROM ${messages} WHERE id::text = ANY(?) ORDER BY id`,
              [[...ids]],
            ),
          );
        const byId = new Map(rows.map((row) => [row.id, row]));
        return new Map(
          ids.map((id): [DocumentId, Projection<Note>] => {
            const row = byId.get(id);
            return [
              id,
              row === undefined
                ? { state: "deleted" }
                : { state: "present", document: { body: row.body } },
            ];
          }),
        );
      },
    };
    const definitions = new Map([[KEY, messageDefinition]]);
    // The capture role writes the sample domain and the worker role reads messages.
    const roleOf = async (db: typeof setup.worker) =>
      z
        .object({ rows: z.array(z.object({ role: z.string() })) })
        .parse(await db.raw("SELECT current_user AS role")).rows[0]?.role ?? "";
    const [captureRole, workerRole] = [await roleOf(setup.capture), await roleOf(setup.worker)];
    await h.knex.raw(
      sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${identifier(h.appSchema)} TO ${identifier(captureRole)}`,
    );
    await h.knex.raw(sql`GRANT SELECT ON ${messages} TO ${identifier(workerRole)}`);

    const room = await h.sample.createRoom("방");
    const other = await h.sample.createRoom("다른 방");
    const sent = [
      await h.sample.sendMessage({ roomId: room.id, authorId: null, body: "배 하나" }),
      await h.sample.sendMessage({ roomId: room.id, authorId: null, body: "배 둘" }),
      await h.sample.sendMessage({ roomId: other.id, authorId: null, body: "배 셋" }),
    ];
    const ids = sent.map((message) => message.id);
    await setup.capture.transaction(async (trx) => {
      expect(await setup.captureSync.markChanged(trx, KEY, ids)).toBe("recorded");
    });
    await drainAll(setup, definitions);
    expect(await searchBody(target.physicalIndex, "배")).toEqual(ids.toSorted());

    // The application must mark the messages the CASCADE will delete, in the same transaction and before the delete.
    await setup.capture.transaction(async (trx) => {
      const cascaded = await h.sample.messagesInRoom(room.id, trx);
      expect(
        await setup.captureSync.markChanged(
          trx,
          KEY,
          cascaded.map((message) => message.id),
        ),
      ).toBe("recorded");
      expect(await h.sample.deleteRoom(room.id, trx)).toBe(true);
    });
    expect(await h.sample.count("messages")).toBe(1);
    await drainAll(setup, definitions);
    const [first, second, kept] = ids;
    for (const id of [first, second]) {
      expect(await kit.indexed(target, id ?? "")).toEqual({
        version: 2,
        revision: 2,
        deleted: true,
        doc: undefined,
      });
    }
    expect(await kit.indexed(target, kept ?? "")).toMatchObject({ version: 1, deleted: false });
    expect(await kit.ledger(KEY)).toEqual(
      Object.fromEntries(ids.map((id) => [id, id === kept ? 1 : 2])),
    );

    expect(await replay(target.writeAlias, first ?? "", 1, "배 하나")).toEqual([409]);
    expect(await searchBody(target.physicalIndex, "배")).toEqual([kept]);

    const again = await h.sample.createRoom("새 방");
    await h.knex.raw(
      sql`INSERT INTO ${messages} (id, room_id, author_id, body) OVERRIDING SYSTEM VALUE VALUES (?, ?, NULL, '배 다시')`,
      [first, again.id],
    );
    await setup.capture.transaction(async (trx) => {
      expect(await setup.captureSync.markChanged(trx, KEY, [first ?? ""])).toBe("recorded");
    });
    await drainAll(setup, definitions);
    expect(await kit.indexed(target, first ?? "")).toEqual({
      version: 3,
      revision: 3,
      deleted: false,
      doc: { body: "배 다시" },
    });
  });
});
