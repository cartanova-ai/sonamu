import { randomUUID } from "node:crypto";

import { type Client, errors } from "@opensearch-project/opensearch";
import knexFactory, { type Knex } from "knex";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  applySearchGrants,
  createSearchAdmin,
  type SearchAdmin,
} from "../../src/admin";
import { createSearchClient, type SearchClient } from "../../src/client/search-client";
import {
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  type SearchError,
} from "../../src/errors";
import { createPostgresSynchronization, type MarkChangedResult } from "../../src/postgres";
import { TEST_READ_LIFETIMES } from "../../src/testing";
import { type TestRole, useIntegrationHarness } from "../helpers/harness";
import { indexExists } from "../helpers/opensearch-ops";
import {
  gate,
  type RecordedRequest,
  requestRecorder,
  type RequestHooks,
} from "../helpers/request-recorder";
import { qualified, sql } from "../helpers/sql";
import { readDeliveries } from "../helpers/test-targets";
import {
  outcomeSum,
  recordingClient,
  useWorkerFixture,
  waitFor,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * Admin code runs on the admin role pool against a real engine, markers on the capture role and the worker on the
 * worker role. Admin engine requests are recorded, and steps are interleaved with gates rather than sleeps.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";

let adminRole: TestRole;
let adminKnex: Knex;
const clients: SearchClient[] = [];

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  const url = new URL(adminRole.url);
  url.searchParams.set("application_name", `h:${h.id}:admin`);
  adminKnex = knexFactory({ client: "pg", connection: url.toString(), pool: { min: 0, max: 4 } });
});
afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.close()));
});
afterAll(async () => {
  await adminKnex?.destroy();
});

const s = (name: string) => qualified(h.searchSchema, name);

function audit(): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason: "suspend and resume" };
}

function adminFor(setup: WorkerSetup, native: Client, adminLeaseMs = 120_000): SearchAdmin {
  const client = createSearchClient({
    createClient: () => native,
    ownsClient: false,
    requestTimeoutMs: 30_000,
  });
  clients.push(client);
  return createSearchAdmin({
    client,
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [...setup.definitions.values()],
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    timeouts: {
      lockTimeoutMs: 15_000,
      statementTimeoutMs: 20_000,
      idleInTransactionTimeoutMs: 60_000,
      adminLeaseMs,
    },
    cutover: { maxPendingDocuments: 1_000_000, sampleSize: 0 },
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 10_000 },
  });
}

interface Prepared {
  setup: WorkerSetup;
  admin: SearchAdmin;
  requests: RecordedRequest[];
  firstTarget: string;
  fingerprint: string;
}

async function prepare(
  options: { hooks?: RequestHooks; setup?: Parameters<typeof kit.setUp>[0] } = {},
): Promise<Prepared> {
  const setup = await kit.setUp(options.setup);
  await applySearchGrants(h.knex, { schema: h.searchSchema, roles: { admin: [adminRole.name] } });
  const recorder = requestRecorder(kit.nativeClient(), options.hooks);
  const target = setup.targets.get(KEY);
  const definition = setup.definitions.get(KEY);
  if (target === undefined || definition === undefined) throw new Error("대상이 없습니다.");
  return {
    setup,
    admin: adminFor(setup, recorder.client),
    requests: recorder.requests,
    firstTarget: target.targetId,
    fingerprint: definition.fingerprint,
  };
}

async function backfill(admin: SearchAdmin, buildId: string): Promise<void> {
  for (let step = 0; step < 20; step += 1) {
    if ((await admin.runBackfillPage(buildId, { limit: 100 })).done) return;
  }
  throw new Error("backfill이 끝나지 않았습니다.");
}

async function serveOpenBuild(admin: SearchAdmin): Promise<string> {
  const build = (await admin.inspect(KEY)).openBuild;
  if (build === null) throw new Error("열린 빌드가 없습니다.");
  await backfill(admin, build.buildId);
  await admin.cutover(build.buildId, audit());
  return build.buildId;
}

async function mark(setup: WorkerSetup, ids: readonly string[]): Promise<MarkChangedResult> {
  return setup.capture.transaction(async (trx) => {
    for (const id of ids) await kit.upsert(trx, KEY, id, `본문 ${id}`, { tag: id });
    return setup.captureSync.markChanged(trx, KEY, ids);
  });
}

type IndexRow = {
  capture_mode: string;
  capture_epoch: number;
  generation: string;
  rebuild_required: boolean;
  read_target_id: string | null;
};
async function indexRow(): Promise<IndexRow> {
  const { rows } = await h.knex.raw<{ rows: IndexRow[] }>(
    sql`SELECT i.capture_mode, i.capture_epoch, i.generation, h.rebuild_required, h.target_id::text AS read_target_id
FROM ${s("indexes")} i JOIN ${s("read_heads")} h USING (namespace, definition)
WHERE i.namespace = ? AND i.definition = ?`,
    [h.namespace, KEY],
  );
  return rows[0];
}

type TargetRow = {
  target_id: string;
  physical_index: string;
  state: string;
  write_enabled: boolean;
  capture_epoch: number;
  remote_create_state: string;
};
async function targetRows(): Promise<TargetRow[]> {
  const { rows } = await h.knex.raw<{ rows: TargetRow[] }>(
    sql`SELECT target_id::text, physical_index, state, write_enabled, capture_epoch, remote_create_state
FROM ${s("targets")} ORDER BY created_at, target_id`,
  );
  return rows;
}

type BuildRow = { phase: string; kind: string; old_target_id: string | null };
async function buildRow(buildId: string): Promise<BuildRow> {
  const { rows } = await h.knex.raw<{ rows: BuildRow[] }>(
    sql`SELECT phase, kind, old_target_id::text FROM ${s("builds")} WHERE build_id = ?`,
    [buildId],
  );
  return rows[0];
}

async function leaseToken(): Promise<string | null> {
  const { rows } = await h.knex.raw<{ rows: { lease_token: string | null }[] }>(
    sql`SELECT lease_token::text AS lease_token FROM ${s("admin_controls")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, KEY],
  );
  return rows[0]?.lease_token ?? null;
}

const foundSchema = z.looseObject({ found: z.boolean() });
async function indexedIn(physicalIndex: string, id: string): Promise<boolean> {
  const response = await h.opensearch.get(
    { index: physicalIndex, id, realtime: true },
    { ignore: [404] },
  );
  return foundSchema.parse(response.body).found;
}

async function errorOf(pending: Promise<unknown>): Promise<SearchError> {
  return pending.then(
    () => {
      throw new Error("실패해야 할 호출이 성공했습니다.");
    },
    (error: SearchError) => error,
  );
}

function expectRefused(error: SearchError, reason: string): void {
  expect(error).toBeInstanceOf(SearchAdminPreconditionFailed);
  expect(error.details?.reason).toBe(reason);
}

/** An index create request, PUT /<index>. */
const isCreate = (request: RecordedRequest) =>
  request.method === "PUT" && /^\/snm-[^/]+$/.test(request.path);

describe("중단과 옛 epoch", () => {
  it("중단은 열린 빌드와 기존 대상을 모두 무효화한다", async () => {
    const { admin, firstTarget, fingerprint } = await prepare();
    await serveOpenBuild(admin);
    const rebuild = await admin.beginRebuild({ logicalKey: KEY, fingerprint }, audit());
    await backfill(admin, rebuild.buildId);
    expect((await buildRow(rebuild.buildId)).phase).toBe("catching_up");

    await admin.suspendCapture(KEY, audit());

    expect((await buildRow(rebuild.buildId)).phase).toBe("failed");
    expect((await targetRows()).map((row) => [row.target_id, row.write_enabled])).toEqual([
      [firstTarget, false],
      [rebuild.target.targetId, false],
    ]);
    expectRefused(await errorOf(admin.cutover(rebuild.buildId, audit())), "capture-suspended");
    expectRefused(
      await errorOf(admin.runBackfillPage(rebuild.buildId, { limit: 10 })),
      "build-closed",
    );
    expect(await indexRow()).toMatchObject({ read_target_id: firstTarget, rebuild_required: true });
  });

  it("중단 전 대상으로의 rollback과 cutover는 거부된다", async () => {
    const { admin, firstTarget, fingerprint } = await prepare();
    await serveOpenBuild(admin);
    const rebuild = await admin.beginRebuild({ logicalKey: KEY, fingerprint }, audit());
    await backfill(admin, rebuild.buildId);
    await admin.cutover(rebuild.buildId, audit());
    expect(await buildRow(rebuild.buildId)).toEqual({
      phase: "serving",
      kind: "rebuild",
      old_target_id: firstTarget,
    });

    await admin.suspendCapture(KEY, audit());
    expectRefused(await errorOf(admin.rollback(rebuild.buildId, audit())), "phase-not-serving");
    expectRefused(await errorOf(admin.cutover(rebuild.buildId, audit())), "capture-suspended");

    // The pre-suspend build stays dead after resuming too.
    await admin.resumeCaptureForRebuild(KEY, audit());
    expectRefused(await errorOf(admin.rollback(rebuild.buildId, audit())), "phase-not-serving");
    expectRefused(await errorOf(admin.cutover(rebuild.buildId, audit())), "phase-not-catching-up");
    expect(await indexRow()).toMatchObject({
      read_target_id: rebuild.target.targetId,
      rebuild_required: true,
    });
  });
});

describe("재구축을 위한 재개", () => {
  it("재개는 새 epoch의 새 대상을 등록한 커밋에서만 캡처를 다시 켠다", async () => {
    const put = gate();
    const { setup, admin, firstTarget, requests } = await prepare({
      hooks: {
        before: async (request) => {
          if (isCreate(request)) await put.wait();
        },
      },
    });
    await serveOpenBuild(admin);
    expect(await mark(setup, ["a"])).toBe("recorded");
    await admin.suspendCapture(KEY, audit());
    const before = await indexRow();

    const pending = admin.resumeCaptureForRebuild(KEY, audit());
    pending.catch(() => {});
    await put.reached;
    // During the remote create the new target is creating/in_flight and capture is still suspended.
    const during = await targetRows();
    expect(during).toHaveLength(2);
    const created = during[1];
    expect(created).toMatchObject({
      state: "creating",
      remote_create_state: "in_flight",
      capture_epoch: 2,
      write_enabled: false,
    });
    expect(await indexRow()).toEqual(before);
    expect(await mark(setup, ["b"])).toBe("suspended");
    put.open();
    const handle = await pending;

    expect(handle).toMatchObject({
      kind: "resume",
      target: { targetId: created.target_id, captureEpoch: 2, remoteCreateState: "verified" },
    });
    const after = await indexRow();
    expect(after).toMatchObject({
      capture_mode: "active",
      capture_epoch: 2,
      rebuild_required: true,
      read_target_id: firstTarget,
    });
    expect(Number(after.generation)).toBe(Number(before.generation) + 1);
    expect(await buildRow(handle.buildId)).toEqual({
      phase: "created",
      kind: "resume",
      old_target_id: null,
    });
    expect(
      (await targetRows()).map((row) => [
        row.target_id,
        row.state,
        row.write_enabled,
        row.capture_epoch,
      ]),
    ).toEqual([
      [firstTarget, "active", false, 1],
      [created.target_id, "active", true, 2],
    ]);
    // After resuming, markers reserve only the new epoch's target.
    expect(await mark(setup, ["c"])).toBe("recorded");
    expect(await readDeliveries(h)).toEqual({
      [`${firstTarget}/a`]: 1,
      [`${created.target_id}/c`]: 1,
    });
    // Repeating the call returns the open resume build and creates nothing.
    const creates = requests.filter(isCreate).length;
    expect(await admin.resumeCaptureForRebuild(KEY, audit())).toEqual(handle);
    expect(requests.filter(isCreate)).toHaveLength(creates);
  });

  it("캡처가 켜져 있으면 재개는 원격 명령 없이 거부된다", async () => {
    const { admin, requests } = await prepare();
    const before = await targetRows();
    expectRefused(
      await errorOf(admin.resumeCaptureForRebuild(KEY, audit())),
      "capture-not-suspended",
    );
    expect(requests).toEqual([]);
    expect(await targetRows()).toEqual(before);
  });
});

describe("재개의 원격 생성 규칙", () => {
  it("응답을 잃은 재개 생성은 ambiguous로 남아 재개와 은퇴를 막고, reconcileCreate 뒤에는 같은 식별자를 다시 만들지 않고 등록한다", async () => {
    let loseResponse = true;
    const { admin, requests } = await prepare({
      hooks: {
        after: async (request) =>
          isCreate(request) && loseResponse ? new errors.ConnectionError("응답을 잃음") : undefined,
      },
    });
    await serveOpenBuild(admin);
    await admin.suspendCapture(KEY, audit());

    expectRefused(
      await errorOf(admin.resumeCaptureForRebuild(KEY, audit())),
      "remote-create-ambiguous",
    );
    loseResponse = false;
    const pending = (await targetRows()).find((row) => row.state === "creating");
    if (pending === undefined) throw new Error("미등록 대상이 없습니다.");
    expect(pending).toMatchObject({ remote_create_state: "ambiguous", capture_epoch: 2 });
    expect((await indexRow()).capture_mode).toBe("suspended");
    // The engine did create the index, and there is no compensating delete.
    expect(await indexExists(h.opensearch, pending.physical_index)).toBe(true);
    expect(await leaseToken()).toBeNull();

    // The unresolved identity blocks resume and retire before any remote command.
    const sent = requests.length;
    expectRefused(
      await errorOf(admin.resumeCaptureForRebuild(KEY, audit())),
      "remote-create-unresolved",
    );
    expectRefused(
      await errorOf(admin.retireTarget(pending.target_id, audit())),
      "remote-create-unresolved",
    );
    // Retirement only reads the fence (one _mget) before refusing.
    expect(requests.slice(sent).map((request) => `${request.method} ${request.path}`)).toEqual([
      `POST /${pending.physical_index}/_mget`,
    ]);
    expect(await indexExists(h.opensearch, pending.physical_index)).toBe(true);

    const reconciled = await admin.reconcileCreate(
      pending.target_id,
      { confirmQuiescent: true },
      audit(),
    );
    expect(reconciled.remoteCreateState).toBe("verified");
    const creates = requests.filter(isCreate).length;
    const handle = await admin.resumeCaptureForRebuild(KEY, audit());
    expect(handle.target.targetId).toBe(pending.target_id);
    expect(requests.filter(isCreate)).toHaveLength(creates);
    expect((await indexRow()).capture_mode).toBe("active");
  });

  it("임대가 원격 호출을 덮지 못하는 설정이면 재개는 아무것도 보내거나 쓰기 전에 거부된다", async () => {
    const { setup, admin } = await prepare();
    await serveOpenBuild(admin);
    await admin.suspendCapture(KEY, audit());
    const recorder = requestRecorder(kit.nativeClient());
    const short = adminFor(setup, recorder.client, 5_000);
    const targets = await targetRows();
    const index = await indexRow();
    const error = await errorOf(short.resumeCaptureForRebuild(KEY, audit()));
    expect(error).toBeInstanceOf(SearchConfigurationError);
    expect(error.details?.reason).toBe("admin-lease-too-short");
    expect(recorder.requests).toEqual([]);
    expect(await targetRows()).toEqual(targets);
    expect(await indexRow()).toEqual(index);
    expect(await leaseToken()).toBeNull();
  });
});

describe("실제 워커와 epoch", () => {
  it("중단 순간에 claim했지만 보내지 않은 delivery는 보내지 않고 반납되며, 재개 뒤 실행 중인 워커도 옛 epoch의 intent를 가져가지 않는다", async () => {
    const held = gate();
    let armed = true;
    const { setup, admin, firstTarget } = await prepare({
      setup: {
        hooks: {
          [KEY]: {
            beforeRead: async () => {
              if (!armed) return;
              armed = false;
              await held.wait();
            },
          },
        },
      },
    });
    await serveOpenBuild(admin);
    expect(await mark(setup, ["a"])).toBe("recorded");
    const recorder = recordingClient(kit.nativeClient());
    const { indexer } = kit.indexer(setup, { client: recorder.client });
    const draining = indexer.drainOnce();
    await held.reached;
    // The worker holds a under lease and is materializing it.
    expect(
      (await kit.runtimes()).map((row) => [row.document_id, row.lease_token !== null]),
    ).toEqual([["a", true]]);

    await admin.suspendCapture(KEY, audit());
    held.open();
    const report = await draining;
    expect(report).toMatchObject({ claimed: 1, indexed: 0, released: 1 });
    expect(outcomeSum(report)).toBe(report.claimed);
    expect(recorder.bulks).toEqual([]);
    const first = setup.targets.get(KEY);
    if (first === undefined) throw new Error("대상이 없습니다.");
    expect(await indexedIn(first.physicalIndex, "a")).toBe(false);

    // After resuming, a running worker only processes the new epoch's target.
    const handle = await admin.resumeCaptureForRebuild(KEY, audit());
    const running = kit.indexer(setup).indexer.start({ pollIntervalMs: 50 });
    try {
      expect(await mark(setup, ["d"])).toBe("recorded");
      await waitFor("새 대상에 d 색인", () => indexedIn(handle.target.physicalIndex, "d"));
      // After several drains the old epoch's a is still untouched.
      await waitFor("두 번째 drain 이후", async () => (await kit.intents()).length === 1);
    } finally {
      await running.stop({ deadlineMs: 10_000 });
    }
    expect(await kit.intents()).toEqual([
      { target_id: firstTarget, document_id: "a", desired_revision: 1 },
    ]);
    expect((await kit.runtimes()).find((row) => row.document_id === "a")).toMatchObject({
      target_id: firstTarget,
      lease_token: null,
    });
    expect(await indexedIn(first.physicalIndex, "a")).toBe(false);
    expect(await indexedIn(first.physicalIndex, "d")).toBe(false);
  });
});
