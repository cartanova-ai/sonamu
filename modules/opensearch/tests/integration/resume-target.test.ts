import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type SearchAdmin } from "../../src/admin";
import {
  SearchAdminLeaseLost,
  SearchConfigurationError,
  SearchTargetUnavailable,
} from "../../src/errors";
import { type IndexerEvent } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import { aliasExists } from "../helpers/opensearch-ops";
import { type RecordedRequest } from "../helpers/request-recorder";
import {
  audit,
  errorOf,
  expectRefused,
  KEY,
  type RetirementSetup,
  useRetirementFixture,
} from "../helpers/retirement-fixture";
import { qualified, sql } from "../helpers/sql";
import { type PreparedTarget, waitForLockWait } from "../helpers/test-targets";
import { useWorkerFixture, waitFor, type WorkerSetup } from "../helpers/worker-fixture";

/**
 * A real worker pauses the target for one of two causes. revision_divergence: an external write puts a higher version
 * in the index, the next send gets 409 and the worker sees indexed > ledger; the operator raises the ledger with
 * remark, and only a comparison scan started after the pause and finished with no violation allows resuming.
 * write_alias_missing: the package never recreates the alias; the operator restores it and a remote check suffices.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const rf = useRetirementFixture(h, kit);
const s = (name: string) => qualified(h.searchSchema, name);

const targetRowSchema = z.object({
  state: z.string(),
  pause_reason: z.unknown(),
  paused: z.boolean(),
  verify_started: z.boolean(),
  verify_checked: z.coerce.number(),
  verify_violations: z.coerce.number(),
});

async function targetRow(targetId: string) {
  const { rows } = await h.knex.raw<{ rows: unknown[] }>(
    sql`SELECT state, pause_reason, paused_at IS NOT NULL AS paused, verify_started_at IS NOT NULL AS verify_started,
       verify_checked, verify_violations
FROM ${s("targets")} WHERE target_id = ?`,
    [targetId],
  );
  return targetRowSchema.parse(rows[0]);
}

/** A write from outside the package, straight to the physical index with an external version. */
async function strayWrite(target: PreparedTarget, id: string, version: number): Promise<void> {
  await h.opensearch.index({
    index: target.physicalIndex,
    id,
    version,
    version_type: "external",
    refresh: true,
    body: {
      sonamu_meta: {
        deleted: false,
        revision: version,
        hash_version: "sonamu-c14n-v1",
        projection_hash: "0".repeat(64),
      },
      doc: { body: "외부에서 쓴 본문" },
    },
  });
}

/** Waits by the database clock for the in-flight bound after the pause (fixture workerBounds: 300 + 300 ms). */
async function waitForQuiescence(targetId: string): Promise<void> {
  await waitFor("정지 이후 in-flight 상한", async () => {
    const { rows } = await h.knex.raw<{ rows: { elapsed: boolean }[] }>(
      sql`SELECT clock_timestamp() >= paused_at + interval '600 milliseconds' AS elapsed FROM ${s("targets")} WHERE target_id = ?`,
      [targetId],
    );
    return rows[0]?.elapsed;
  });
}

async function verifyAll(admin: SearchAdmin, targetId: string, limit = 2) {
  const samples: { id: string; indexed: number; ledger: number | null }[] = [];
  for (let page = 0; page < 20; page += 1) {
    const progress = await admin.runTargetVerificationPage(targetId, { limit });
    samples.push(...progress.sample);
    if (progress.done) return { ...progress, samples };
  }
  throw new Error("검증 스캔이 끝나지 않았습니다.");
}

async function prepare(): Promise<RetirementSetup & { events: IndexerEvent[] }> {
  const prepared = await rf.prepare();
  return { ...prepared, events: [] };
}

function workerOf(prepared: RetirementSetup & { events: IndexerEvent[] }) {
  return kit.indexer(prepared.setup, { events: prepared.events }).indexer;
}

async function writeNote(setup: WorkerSetup, id: string, body: string): Promise<void> {
  await kit.write(setup, KEY, [id], (trx) => kit.upsert(trx, KEY, id, body));
}

async function resumeAudits(targetId: string) {
  const { rows } = await h.knex.raw<{ rows: { outcome: string; actor: string }[] }>(
    sql`SELECT outcome, actor FROM ${s("admin_operations")} WHERE kind = 'resume-target' AND target_id = ? ORDER BY operation_seq`,
    [targetId],
  );
  return rows;
}

describe("revision_divergence로 정지된 대상", () => {
  it("검증 스캔이 없거나 미완이거나 위반이 있거나 pause보다 오래됐으면, epoch이 다르면 재개가 거부되고, 해소 뒤에는 claim이 재개된다", async () => {
    const prepared = await prepare();
    const { setup, admin, first } = prepared;
    const worker = workerOf(prepared);
    for (const id of ["x", "y", "z"]) await writeNote(setup, id, `${id} 하나`);
    expect(await worker.drainOnce()).toMatchObject({ claimed: 3, indexed: 3 });

    // x is overwritten at external version 3; sending revision 2 gets 409 and indexed 3 > ledger 2 pauses the target.
    await strayWrite(first, "x", 3);
    await writeNote(setup, "x", "x 둘");
    expect(await worker.drainOnce()).toMatchObject({ claimed: 1, released: 1, indexed: 0 });
    expect(prepared.events).toContainEqual({
      type: "target-paused",
      targetId: first.targetId,
      reason: "revision_divergence",
    });
    expect(await targetRow(first.targetId)).toMatchObject({
      state: "paused",
      pause_reason: {
        class: "revision_divergence",
        documents: [{ id: "x", indexed: 3, ledger: 2 }],
      },
      verify_started: false,
    });

    expectRefused(
      await errorOf(admin.resumeTarget(first.targetId, audit())),
      "verification-incomplete",
    );

    // The scan does not start before the in-flight bound has passed (an admin handle with long workerBounds).
    const cautious = rf.adminFor(setup, kit.nativeClient(), {
      workerBounds: { leaseDurationMs: 600_000, requestTimeoutMs: 1_000 },
    });
    const notQuiet = await errorOf(
      cautious.runTargetVerificationPage(first.targetId, { limit: 10 }),
    );
    expectRefused(notQuiet, "verification-not-quiesced");
    expect(notQuiet.retryable).toBe(true);
    expect((await targetRow(first.targetId)).verify_started).toBe(false);

    await waitForQuiescence(first.targetId);
    const partial = await admin.runTargetVerificationPage(first.targetId, { limit: 1 });
    // Scan order is _shard_doc, so which document comes first is unspecified.
    expect(partial).toMatchObject({ checked: 1, done: false, cursor: expect.any(String) });
    expectRefused(
      await errorOf(admin.resumeTarget(first.targetId, audit())),
      "verification-incomplete",
    );

    const dirty = await verifyAll(admin, first.targetId, 1);
    expect(dirty).toMatchObject({ checked: 3, violations: 1, done: true });
    const violated = await errorOf(admin.resumeTarget(first.targetId, audit()));
    expectRefused(violated, "verification-violations");
    expect(violated.details?.violations).toBe(1);
    expect((await targetRow(first.targetId)).state).toBe("paused");

    // Resolve by raising the ledger above the indexed version (two remarks give 4); a paused target only queues intents.
    for (let i = 0; i < 2; i += 1) {
      expect(await admin.remark({ logicalKey: KEY, ids: ["x"] }, audit())).toEqual({
        marked: 1,
        result: "recorded",
      });
    }
    expect(await worker.drainOnce()).toMatchObject({ claimed: 0 });
    // A scan that ended with violations restarts on the next call.
    const clean = await verifyAll(admin, first.targetId);
    expect(clean).toMatchObject({ checked: 3, violations: 0, done: true });
    expect(clean.samples).toEqual([]);

    // Resume changes nothing once its lease has been replaced.
    const { sessions } = await h.openSessions(["holder", "replacer"]);
    await sessions.holder.run("BEGIN");
    await sessions.holder.run(
      sql`SELECT 1 FROM ${s("indexes")} WHERE namespace = $1 AND definition = $2 FOR UPDATE`,
      [h.namespace, KEY],
    );
    const pending = admin.resumeTarget(first.targetId, audit());
    pending.catch(() => {});
    const waiting = await waitForAdminLockWait(sessions.holder.pid);
    const replaced = await sessions.replacer.run(
      sql`UPDATE ${s("admin_controls")} SET operation_id = 'op-replacer', operation_kind = 'suspend', actor = 'tester',
  lease_token = $3::uuid, lease_expires_at = clock_timestamp() + interval '2 minutes' WHERE namespace = $1 AND definition = $2`,
      [h.namespace, KEY, randomUUID()],
    );
    expect(replaced.rowCount).toBe(1);
    await waitForLockWait(h.knex, waiting, sessions.holder.pid);
    await sessions.holder.run("ROLLBACK");
    const lost = await errorOf(pending);
    expect(lost).toBeInstanceOf(SearchAdminLeaseLost);
    expect((await targetRow(first.targetId)).state).toBe("paused");
    await h.knex.raw(
      sql`UPDATE ${s("admin_controls")} SET lease_token = NULL, lease_expires_at = NULL WHERE namespace = ? AND definition = ?`,
      [h.namespace, KEY],
    );

    const handle = await admin.resumeTarget(first.targetId, audit());
    expect(handle).toMatchObject({ targetId: first.targetId, remoteCreateState: "verified" });
    expect(await targetRow(first.targetId)).toMatchObject({
      state: "active",
      pause_reason: null,
      paused: false,
    });
    expect(await resumeAudits(first.targetId)).toContainEqual({
      outcome: "succeeded",
      actor: "tester",
    });
    expect(await worker.drainOnce()).toMatchObject({ claimed: 1, indexed: 1 });
    expect(await kit.indexed(first, "x")).toMatchObject({ version: 4, doc: { body: "x 둘" } });

    // A new pause invalidates the earlier clean scan.
    await strayWrite(first, "y", 10);
    await writeNote(setup, "y", "y 둘");
    expect(await worker.drainOnce()).toMatchObject({ claimed: 1, released: 1 });
    expect((await targetRow(first.targetId)).state).toBe("paused");
    expectRefused(await errorOf(admin.resumeTarget(first.targetId, audit())), "verification-stale");

    // A target whose epoch was ended by suspend cannot be resumed.
    await admin.suspendCapture(KEY, audit());
    expectRefused(
      await errorOf(admin.resumeTarget(first.targetId, audit())),
      "target-epoch-invalid",
    );
    expect((await targetRow(first.targetId)).state).toBe("paused");
  });

  it("잘못된 대상 ID와 paused가 아닌 대상은 아무것도 쓰지 않고 거부한다", async () => {
    const { admin, first } = await prepare();
    expect(await errorOf(admin.resumeTarget("not-a-uuid", audit()))).toBeInstanceOf(
      SearchConfigurationError,
    );
    expectRefused(await errorOf(admin.resumeTarget(first.targetId, audit())), "target-not-paused");
    expectRefused(
      await errorOf(admin.runTargetVerificationPage(first.targetId, { limit: 10 })),
      "target-not-paused",
    );
    expect(await targetRow(first.targetId)).toMatchObject({
      state: "active",
      verify_started: false,
    });
  });
});

describe("검증 스캔의 비용과 일관성", () => {
  /** Indexes count documents, pauses the target through an external write and resolves the divergence. */
  async function pausedWith(count: number) {
    const prepared = await prepare();
    const { setup, admin, first } = prepared;
    const worker = workerOf(prepared);
    const ids = Array.from({ length: count }, (_, i) => `d${String(i).padStart(3, "0")}`);
    await kit.write(setup, KEY, ids, async (trx) => {
      for (const id of ids) await kit.upsert(trx, KEY, id, id);
    });
    while ((await worker.drainOnce()).claimed > 0) {}
    await strayWrite(first, "d000", 3);
    await writeNote(setup, "d000", "둘");
    await worker.drainOnce();
    expect((await targetRow(first.targetId)).state).toBe("paused");
    for (let i = 0; i < 2; i += 1) await admin.remark({ logicalKey: KEY, ids: ["d000"] }, audit());
    await waitForQuiescence(first.targetId);
    return prepared;
  }

  const searches = (requests: readonly RecordedRequest[]) =>
    requests.filter((request) => request.method === "POST" && request.path === "/_search");
  const pitCreates = (requests: readonly RecordedRequest[]) =>
    requests.filter(
      (request) => request.path.endsWith("/_search/point_in_time") && request.method === "POST",
    );

  it("PIT 하나를 _shard_doc 순서로 한 번 지나가며, 검색 요청 수는 ceil(E/limit)이고 _id로 정렬하지 않는다", async () => {
    const { admin, first, requests } = await pausedWith(25);
    const before = requests.length;
    let pages = 0;
    let progress = await admin.runTargetVerificationPage(first.targetId, { limit: 4 });
    for (pages = 1; !progress.done && pages < 50; pages += 1) {
      progress = await admin.runTargetVerificationPage(first.targetId, { limit: 4 });
    }
    expect(progress).toMatchObject({ checked: 25, violations: 0, done: true });
    const sent = requests.slice(before);
    // 25 documents by 4 is 7 pages. No page sorts the whole index, so engine work stays linear in the index size.
    expect(searches(sent)).toHaveLength(7);
    expect(pages).toBe(7);
    for (const request of searches(sent)) {
      expect(request.body).toMatchObject({
        sort: [{ _shard_doc: "asc" }],
        pit: { id: expect.any(String) },
      });
      expect(JSON.stringify(request.body)).not.toContain('"_id"');
    }
    expect(pitCreates(sent)).toHaveLength(1);
    // max_seq_no is read once at the start and once at the end, then the PIT is closed.
    expect(sent.filter((request) => request.path.endsWith("/_stats/docs"))).toHaveLength(2);
    expect(sent.at(-1)).toMatchObject({ method: "DELETE", path: "/_search/point_in_time" });
    await admin.resumeTarget(first.targetId, audit());
    expect((await targetRow(first.targetId)).state).toBe("active");
  });

  it("다른 관리 핸들(임대 교체 뒤)이 같은 스캔을 이어 가고, PIT를 잃으면 처음부터 다시 센다", async () => {
    const prepared = await pausedWith(10);
    const { admin, first, setup, requests } = prepared;
    const before = requests.length;
    expect(await admin.runTargetVerificationPage(first.targetId, { limit: 3 })).toMatchObject({
      checked: 3,
      done: false,
    });
    // Another process's admin handle continues from the same PIT and position.
    const other = rf.adminFor(setup, kit.nativeClient());
    expect(await other.runTargetVerificationPage(first.targetId, { limit: 3 })).toMatchObject({
      checked: 6,
      done: false,
    });
    expect(pitCreates(requests.slice(before))).toHaveLength(1);
    // A lost PIT (as on expiry) cannot be continued, so the count resets and a new PIT starts over.
    await h.opensearch.transport.request({ method: "DELETE", path: "/_search/point_in_time/_all" });
    expect(await admin.runTargetVerificationPage(first.targetId, { limit: 3 })).toMatchObject({
      checked: 3,
      done: false,
    });
    expect(pitCreates(requests.slice(before))).toHaveLength(2);
    let progress = await admin.runTargetVerificationPage(first.targetId, { limit: 3 });
    while (!progress.done)
      progress = await admin.runTargetVerificationPage(first.targetId, { limit: 3 });
    expect(progress).toMatchObject({ checked: 10, violations: 0, done: true });
  });

  it("스캔 중 색인에 외부 쓰기가 있으면 완료로 기록하지 않고 처음으로 되돌려 재개를 막는다", async () => {
    const { admin, first } = await pausedWith(6);
    await admin.runTargetVerificationPage(first.targetId, { limit: 4 });
    // An external_gte write at the same version is invisible to the PIT but raises max_seq_no.
    await h.opensearch.index({
      index: first.physicalIndex,
      id: "d003",
      version: 1,
      version_type: "external_gte",
      refresh: true,
      body: {
        sonamu_meta: {
          deleted: false,
          revision: 1,
          hash_version: "sonamu-c14n-v1",
          projection_hash: "0".repeat(64),
        },
        doc: { body: "외부" },
      },
    });
    const raced = await errorOf(admin.runTargetVerificationPage(first.targetId, { limit: 4 }));
    expectRefused(raced, "verification-raced-writes");
    expect(raced.retryable).toBe(true);
    expectRefused(
      await errorOf(admin.resumeTarget(first.targetId, audit())),
      "verification-incomplete",
    );
    expect((await targetRow(first.targetId)).verify_checked).toBe(0);
    const clean = await verifyAll(admin, first.targetId, 4);
    expect(clean).toMatchObject({ checked: 6, violations: 0, done: true });
  });
});

describe("write_alias_missing으로 정지된 대상", () => {
  it("alias가 없거나 다른 인덱스를 가리키면 재개되지 않고 다시 만들어지지도 않으며, 운영자가 되돌리면 스캔 없이 재개된다", async () => {
    const prepared = await prepare();
    const { setup, admin, first } = prepared;
    const worker = workerOf(prepared);
    await writeNote(setup, "x", "x 하나");
    expect(await worker.drainOnce()).toMatchObject({ indexed: 1 });
    await h.opensearch.indices.deleteAlias({ index: first.physicalIndex, name: first.writeAlias });
    await writeNote(setup, "x", "x 둘");
    expect(await worker.drainOnce()).toMatchObject({ claimed: 1, released: 1, indexed: 0 });
    expect(prepared.events).toContainEqual({
      type: "target-paused",
      targetId: first.targetId,
      reason: "write_alias_missing",
    });
    expect(await targetRow(first.targetId)).toMatchObject({
      state: "paused",
      pause_reason: { class: "write_alias_missing" },
    });

    const missing = await errorOf(admin.resumeTarget(first.targetId, audit()));
    expect(missing).toBeInstanceOf(SearchTargetUnavailable);
    expect(missing.details?.reason).toBe("registered-target-missing-remote");
    expect(await aliasExists(h.opensearch, first.writeAlias)).toBe(false);

    const stray = h.indexName("stray");
    await h.opensearch.indices.create({ index: stray });
    await h.opensearch.indices.putAlias({
      index: stray,
      name: first.writeAlias,
      body: { is_write_index: true },
    });
    const mismatch = await errorOf(admin.resumeTarget(first.targetId, audit()));
    expect(mismatch).toBeInstanceOf(SearchTargetUnavailable);
    expect(mismatch.details?.reason).toBe("registered-target-remote-mismatch");
    expect((await targetRow(first.targetId)).state).toBe("paused");

    // Restoring the alias as this index's write alias resolves it; this cause needs no verification scan.
    await h.opensearch.indices.updateAliases({
      body: {
        actions: [
          { remove: { index: stray, alias: first.writeAlias } },
          { add: { index: first.physicalIndex, alias: first.writeAlias, is_write_index: true } },
        ],
      },
    });
    await admin.resumeTarget(first.targetId, audit());
    expect(await targetRow(first.targetId)).toMatchObject({
      state: "active",
      verify_started: false,
    });
    expect(await worker.drainOnce()).toMatchObject({ claimed: 1, indexed: 1 });
    expect(await kit.indexed(first, "x")).toMatchObject({ version: 2, doc: { body: "x 둘" } });
    expect(await resumeAudits(first.targetId)).toEqual([{ outcome: "succeeded", actor: "tester" }]);
  });
});

/** The admin pool backend waiting on a lock held by blocker. */
async function waitForAdminLockWait(blocker: number): Promise<number> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { rows } = await h.knex.raw<{ rows: { pid: number; blocking: number[] }[] }>(
      "SELECT pid, pg_blocking_pids(pid) AS blocking FROM pg_stat_activity WHERE application_name = ? AND wait_event_type = 'Lock'",
      [`h:${h.id}:admin`],
    );
    const found = rows.find((row) => row.blocking.includes(blocker));
    if (found !== undefined) return found.pid;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`관리 백엔드가 PID ${blocker} 때문에 기다리는 것이 관찰되지 않았습니다.`);
}
