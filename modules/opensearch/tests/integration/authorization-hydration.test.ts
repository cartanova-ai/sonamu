import { type Knex } from "knex";
import { beforeEach, describe, expect, it } from "vitest";

import {
  type ChatSearchHit,
  searchChatMessages,
} from "../../examples/application/chat-message.search";
import {
  type ChatMessageDocument,
  chatMessagesSearch,
} from "../../examples/search/chat-messages.definition";
import { createPostgresSynchronization, type PostgresSynchronization } from "../../src/postgres";
import { type SearchInput, type SearchQueries } from "../../src/query/search-queries";
import { useIntegrationHarness } from "../helpers/harness";
import { LONG_LIFETIMES, useReadPathFixture } from "../helpers/read-path-fixture";
import { type SampleId } from "../helpers/sample-domain";

/**
 * Exercises the documented reference flow (searchChatMessages and the chat-messages definition from examples/) with a
 * real worker and the query role. Each case leaves the index stale in a different way and expects the re-check to
 * catch it.
 */

const h = useIntegrationHarness();
const rp = useReadPathFixture(h);
const DEFINITIONS = [chatMessagesSearch];

interface World {
  alice: SampleId;
  bob: SampleId;
  carol: SampleId;
  general: SampleId;
  secret: SampleId;
  messages: Record<"hello" | "again" | "secret" | "bye", SampleId>;
}

let world: World;
let sync: PostgresSynchronization;
let raw: SearchQueries<ChatMessageDocument>;

function queries() {
  return rp.queries<ChatMessageDocument>({
    logicalKey: chatMessagesSearch.key,
    supportedFingerprints: [chatMessagesSearch.fingerprint],
    limits: {
      maxPageSize: 100,
      timeoutMs: 10_000,
      maxSearchLifetimeMs: LONG_LIFETIMES.maxSearchLifetimeMs,
      maxCursorLifetimeMs: LONG_LIFETIMES.maxCursorLifetimeMs,
      maxPitKeepAliveMs: LONG_LIFETIMES.maxPitKeepAliveMs,
    },
    policy: { sourceIncludes: ["updated_at"] },
  });
}

async function write(change: (trx: Knex.Transaction) => Promise<readonly SampleId[]>) {
  await rp.captureKnex.transaction(async (trx) => {
    const changed = await change(trx);
    expect(
      await sync.markChanged(trx, chatMessagesSearch.key, changed.map(String).toSorted()),
    ).toBe("recorded");
  });
}

async function index(): Promise<void> {
  await rp.drain(rp.indexer(DEFINITIONS));
  await rp.refresh();
}

/** Raw candidates for the same body the reference flow sends, before the re-check. */
async function candidates(roomIds: readonly SampleId[], text: string) {
  return raw.search({
    body: {
      query: {
        bool: {
          must: [{ match: { "doc.body": text } }],
          filter: [{ terms: { "doc.room_id": [...roomIds] } }],
        },
      },
      highlight: { fields: { "doc.body": {} } },
      _source: ["updated_at"],
    },
  });
}

function ids(hits: readonly { id: string }[]): string[] {
  return hits.map((hit) => hit.id).toSorted();
}

beforeEach(async () => {
  await rp.reset();
  const s = h.sample;
  const alice = (await s.createUser("alice")).id;
  const bob = (await s.createUser("bob")).id;
  const carol = (await s.createUser("carol")).id;
  const general = (await s.createRoom("general")).id;
  const secret = (await s.createRoom("secret")).id;
  await s.addMember(general, alice);
  await s.addMember(general, bob);
  await s.addMember(secret, bob);
  const send = async (roomId: SampleId, authorId: SampleId, body: string) =>
    String((await s.sendMessage({ roomId, authorId, body })).id);
  world = {
    alice: String(alice),
    bob: String(bob),
    carol: String(carol),
    general: String(general),
    secret: String(secret),
    messages: {
      hello: await send(general, alice, "hello from alice"),
      again: await send(general, bob, "hello again"),
      secret: await send(secret, bob, "hello secret room"),
      bye: await send(general, bob, "goodbye"),
    },
  };
  sync = createPostgresSynchronization({
    getPrimaryDatabase: () => rp.captureKnex,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
  await sync.initialize();
  await rp.serve(rp.admin(DEFINITIONS), DEFINITIONS, chatMessagesSearch);
  raw = queries().queries;
});

describe("후보는 권한이 확인된 레코드가 아니다", () => {
  it("허용된 방의 현재 레코드만 돌려주고, 하이라이트는 색인과 현재 본문이 같을 때만 싣는다", async () => {
    const hits = await searchChatMessages(
      { queries: raw, db: rp.queryKnex },
      { userId: world.alice, text: "hello" },
    );
    expect(ids(hits)).toEqual([world.messages.hello, world.messages.again].toSorted());
    const byId = new Map(hits.map((hit): [string, ChatSearchHit] => [hit.id, hit]));
    expect(byId.get(world.messages.hello)).toMatchObject({
      roomId: world.general,
      authorId: world.alice,
      body: "hello from alice",
    });
    expect(byId.get(world.messages.hello)?.highlights.join(" ")).toContain("<em>hello</em>");
  });

  it("삭제된 메시지는 tombstone이 색인되기 전에도 반환되지 않는다", async () => {
    await write(async (trx) => {
      await h.sample.deleteMessage(world.messages.hello, trx);
      return [world.messages.hello];
    });
    expect(ids((await candidates([world.general], "hello")).hits)).toContain(world.messages.hello);
    const hits = await searchChatMessages(
      { queries: raw, db: rp.queryKnex },
      { userId: world.alice, text: "hello" },
    );
    expect(ids(hits)).toEqual([world.messages.again]);

    // Once the tombstone is indexed, the package's deletion filter drops it from candidates too.
    await index();
    expect(ids((await candidates([world.general], "hello")).hits)).toEqual([world.messages.again]);
  });

  it("방을 나간 뒤에는 색인에 남은 후보와 하이라이트가 응답에서 빠진다", async () => {
    // The revocation commits after the scope was read and right after the engine returned candidates.
    let revokedCandidates: string[] = [];
    const revokingQueries: SearchQueries<ChatMessageDocument> = {
      async search(input: SearchInput) {
        const result = await raw.search(input);
        revokedCandidates = ids(result.hits);
        expect(result.hits.some((hit) => (hit.highlight?.["doc.body"] ?? []).length > 0)).toBe(
          true,
        );
        await h.sample.removeMember(world.general, world.alice);
        return result;
      },
      closeCursor: (cursor, options) => raw.closeCursor(cursor, options),
    };
    const hits = await searchChatMessages(
      { queries: revokingQueries, db: rp.queryKnex },
      { userId: world.alice, text: "hello" },
    );
    expect(revokedCandidates).toEqual([world.messages.hello, world.messages.again].toSorted());
    expect(hits).toEqual([]);

    // Membership is not in the document, so the next search's filter excludes the room without reindexing.
    expect(
      await searchChatMessages(
        { queries: raw, db: rp.queryKnex },
        { userId: world.alice, text: "hello" },
      ),
    ).toEqual([]);
    const bobHits = await searchChatMessages(
      { queries: raw, db: rp.queryKnex },
      { userId: world.bob, text: "hello" },
    );
    expect(ids(bobHits)).toEqual(
      [world.messages.hello, world.messages.again, world.messages.secret].toSorted(),
    );
  });

  it("색인 뒤 수정된 메시지는 현재 본문으로 돌려주고 지금 없는 글의 하이라이트는 버린다", async () => {
    await write(async (trx) => {
      await h.sample.editMessage(world.messages.again, "rewritten text", trx);
      return [world.messages.again];
    });
    const before = await candidates([world.general], "again");
    expect(ids(before.hits)).toEqual([world.messages.again]);
    expect(before.hits[0]?.highlight?.["doc.body"]?.join(" ")).toContain("<em>again</em>");

    const hits = await searchChatMessages(
      { queries: raw, db: rp.queryKnex },
      { userId: world.alice, text: "again" },
    );
    expect(hits).toEqual([
      {
        id: world.messages.again,
        roomId: world.general,
        authorId: world.bob,
        body: "rewritten text",
        highlights: [],
      },
    ]);

    await index();
    expect(
      await searchChatMessages(
        { queries: raw, db: rp.queryKnex },
        { userId: world.alice, text: "again" },
      ),
    ).toEqual([]);
    const fresh = await searchChatMessages(
      { queries: raw, db: rp.queryKnex },
      { userId: world.alice, text: "rewritten" },
    );
    expect(fresh[0]?.highlights.join(" ")).toContain("<em>rewritten</em>");
  });

  it("허용 방이 없으면 필터를 생략하지 않고 빈 결과를 낸다", async () => {
    const handle = queries();
    const sent: SearchInput[] = [];
    const recording: SearchQueries<ChatMessageDocument> = {
      search(input) {
        sent.push(input);
        return handle.queries.search(input);
      },
      closeCursor: (cursor, options) => handle.queries.closeCursor(cursor, options),
    };
    const hits = await searchChatMessages(
      { queries: recording, db: rp.queryKnex },
      { userId: world.carol, text: "hello" },
    );
    expect(hits).toEqual([]);
    // The empty terms filter really reaches the engine rather than being short-circuited or dropped.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body.query).toMatchObject({
      bool: { filter: [{ terms: { "doc.room_id": [] } }] },
    });
    expect(handle.requests.filter((request) => request.path.endsWith("/_search"))).toHaveLength(1);
    // Without the filter the same query has candidates, so the empty result comes from the filter.
    const unfiltered = await raw.search({ body: { query: { match: { "doc.body": "hello" } } } });
    expect(unfiltered.hits.length).toBeGreaterThan(0);
  });
});
