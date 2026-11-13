import { beforeAll, describe, expect, it } from "vitest";

import { chatMessagesSearch } from "../../examples/search/chat-messages.definition";
import { createSearchAdmin, type SearchAdmin } from "../../src/admin";
import { createSearchClient } from "../../src/client/search-client";
import { workerBoundsFrom } from "../../src/defaults";
import { createPostgresSynchronization } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import {
  LONG_LIFETIMES,
  READ_PATH_WORKER_LIMITS,
  useReadPathFixture,
} from "../helpers/read-path-fixture";
import { requestRecorder } from "../helpers/request-recorder";

/** Runs examples/search/administration.ts against real PostgreSQL and OpenSearch; the documentation embeds it verbatim. */

const h = useIntegrationHarness();
const rp = useReadPathFixture(h);
const DEFINITIONS = [chatMessagesSearch];

type AdministrationExamples = typeof import("../../examples/search/administration");
let examples: AdministrationExamples;

beforeAll(async () => {
  // The example module builds a query handle at import time, which requires a cursor secret of at least 32 bytes.
  const previous = process.env.SEARCH_CURSOR_SECRET;
  process.env.SEARCH_CURSOR_SECRET = Buffer.alloc(32, 7).toString("base64");
  examples = await import("../../examples/search/administration");
  if (previous === undefined) delete process.env.SEARCH_CURSOR_SECRET;
  else process.env.SEARCH_CURSOR_SECRET = previous;
});

/** With loseCreateResponse, the first index PUT succeeds on the engine but its response is lost. */
function adminHandle(options: { loseCreateResponse?: boolean } = {}): SearchAdmin {
  let lost = options.loseCreateResponse !== true;
  const recorder = requestRecorder(h.opensearch, {
    after: async (request) => {
      if (!lost && request.method === "PUT" && !request.path.includes("/_")) {
        lost = true;
        return new Error("응답을 잃었습니다");
      }
      return undefined;
    },
  });
  return createSearchAdmin({
    client: createSearchClient({
      createClient: () => recorder.client,
      ownsClient: false,
      requestTimeoutMs: 30_000,
    }),
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => rp.adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: DEFINITIONS,
    lifetimes: LONG_LIFETIMES,
    timeouts: {
      lockTimeoutMs: 10_000,
      statementTimeoutMs: 20_000,
      idleInTransactionTimeoutMs: 60_000,
      adminLeaseMs: 120_000,
    },
    cutover: { maxPendingDocuments: 0, sampleSize: 0 },
    workerBounds: workerBoundsFrom(READ_PATH_WORKER_LIMITS),
  });
}

describe("관리 예제 실행", () => {
  it("응답을 잃은 생성은 ambiguous로 돌아오고, reconcileAmbiguousCreate가 원격을 확인해 같은 식별자로 등록을 마친다", async () => {
    await rp.reset();
    const lossy = adminHandle({ loseCreateResponse: true });
    const first = await examples.createFirstTarget(
      lossy,
      examples.auditContext("tester", "create"),
    );
    if (!("ambiguous" in first)) throw new Error("결과를 모르는 생성이어야 합니다.");
    const plan = first.ambiguous;
    const pending = (await lossy.inspect(chatMessagesSearch.key)).targets[0];
    expect(pending).toMatchObject({
      targetId: plan.targetId,
      state: "creating",
      remoteCreateState: "ambiguous",
    });

    const admin = adminHandle();
    const handle = await examples.reconcileAmbiguousCreate(
      admin,
      plan,
      examples.auditContext("tester", "reconcile"),
    );
    expect(handle).toMatchObject({ targetId: plan.targetId, remoteCreateState: "verified" });
    const inspection = await admin.inspect(chatMessagesSearch.key);
    expect(inspection.targets).toHaveLength(1);
    expect(inspection.targets[0]).toMatchObject({ targetId: plan.targetId, state: "active" });

    expect((await examples.backlogByTarget(admin)).get(plan.targetId)).toMatchObject({
      intents: 0,
      exact: true,
    });
    const raised = await examples.raiseCursorLifetime(
      admin,
      LONG_LIFETIMES.maxCursorLifetimeMs + 60_000,
      examples.auditContext("tester", "lifetimes"),
    );
    expect(raised).toMatchObject({
      changed: true,
      current: { maxCursorLifetimeMs: LONG_LIFETIMES.maxCursorLifetimeMs + 60_000 },
    });
  });

  it("restoreWriteAliasAndResume: 운영자가 쓰기 alias를 되붙이면 재개되고 워커가 밀린 문서를 보낸다", async () => {
    await rp.reset();
    const sample = h.sample;
    const author = (await sample.createUser("alice")).id;
    const room = (await sample.createRoom("general")).id;
    const message = (await sample.sendMessage({ roomId: room, authorId: author, body: "hello" }))
      .id;
    const admin = adminHandle();
    const created = await examples.createFirstTarget(
      admin,
      examples.auditContext("tester", "create"),
    );
    if ("ambiguous" in created) throw new Error("결과를 모르는 생성이 아니어야 합니다.");
    const build = (await admin.inspect(chatMessagesSearch.key)).openBuild;
    if (build === null) throw new Error("열린 빌드가 없습니다.");
    await rp.backfill(admin, build.buildId);
    const indexer = rp.indexer(DEFINITIONS);
    await rp.drain(indexer);
    // Removing the write alias makes the next send fail with 404, which pauses the target.
    await h.opensearch.indices.deleteAlias({
      index: created.physicalIndex,
      name: created.writeAlias,
    });
    const capture = createPostgresSynchronization({
      getPrimaryDatabase: () => rp.captureKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    await capture.initialize();
    await rp.captureKnex.transaction(async (trx) => {
      await sample.editMessage(message, "hello again", trx);
      await capture.markChanged(trx, chatMessagesSearch.key, [String(message)]);
    });
    await indexer.drainOnce();
    expect((await admin.inspect(chatMessagesSearch.key)).targets[0]?.pauseReason?.class).toBe(
      "write_alias_missing",
    );
    await examples.restoreWriteAliasAndResume(
      admin,
      h.opensearch,
      created.targetId,
      examples.auditContext("tester", "alias"),
    );
    expect((await admin.inspect(chatMessagesSearch.key)).targets[0]?.state).toBe("active");
    expect(await rp.drain(indexer)).toBe(1);
  });
});
