import { describe, expect, it } from "vitest";
import { z } from "zod";

import { setSearchLocale } from "../../src/i18n";
import { type IndexerEvent } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import { qualified, sql } from "../helpers/sql";
import { createBulkInjector } from "../helpers/transport-proxy";
import {
  outcomeSum,
  recordingClient,
  useWorkerFixture,
  waitFor,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * One bulk holds a real success, a real strict-mapping rejection, a real version conflict that verifies as a duplicate,
 * and an infrastructure result injected in replace mode. All worker statements run as the granted worker role.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

function targetOf(setup: WorkerSetup, key = KEY) {
  const target = setup.targets.get(key);
  if (target === undefined) throw new Error(`대상 ${key}가 없습니다.`);
  return target;
}

describe("한 bulk 안의 섞인 결과", () => {
  it("한 bulk 안에서 성공은 전진, 인프라 오류는 예산 없이 반납, 매핑 거부는 격리된다", async () => {
    setSearchLocale("ko");
    try {
      const setup = await kit.setUp();
      const target = targetOf(setup);

      // Index c, then re-insert its intent at the same revision: a resend after a lost acknowledgement (409, duplicate).
      await kit.write(setup, KEY, ["c"], (trx) => kit.upsert(trx, KEY, "c", "셋"));
      expect(await kit.indexer(setup).indexer.drainOnce()).toMatchObject({
        claimed: 1,
        indexed: 1,
      });
      await h.knex.raw(
        sql`INSERT INTO ${qualified(h.searchSchema, "deliveries")} (target_id, document_id, desired_revision) VALUES (?, 'c', 1)`,
        [target.targetId],
      );
      await kit.write(setup, KEY, ["a", "b", "d"], async (trx) => {
        await kit.upsert(trx, KEY, "a", "하나");
        // A field missing from the strict mapping: the engine rejects the item with 400.
        await kit.upsert(trx, KEY, "b", "둘", { unexpected: "x" });
        await kit.upsert(trx, KEY, "d", "넷");
      });

      const injector = createBulkInjector(kit.nativeClient());
      injector.inject({
        match: (operation) => operation.id === "d",
        outcome: { status: 429, type: "es_rejected_execution_exception" },
        mode: "replace",
      });
      const events: IndexerEvent[] = [];
      const { indexer } = kit.indexer(setup, { client: injector.client, events });
      const report = await indexer.drainOnce();

      expect(report).toMatchObject({
        claimed: 4,
        indexed: 1,
        superseded: 1,
        retried: 0,
        quarantined: 1,
        released: 1,
        leaseLost: 0,
        skippedLocked: 0,
        abandoned: 0,
        unsupportedTargets: [],
        cooldownRemainingMs: 0,
      });
      expect(outcomeSum(report)).toBe(report.claimed);
      expect(injector.calls).toHaveLength(1);
      expect(injector.calls[0]?.operations.map((operation) => operation.id).toSorted()).toEqual([
        "a",
        "b",
        "c",
        "d",
      ]);
      expect(injector.pendingRuleCount).toBe(0);

      // Reports and events carry stable codes and numbers only, so the ko locale must not leak into them.
      expect(JSON.stringify(report)).not.toMatch(HANGUL);
      const { outcome, ...rest } = report;
      expect(outcome).toBe("processed");
      expect(
        z.record(z.string(), z.union([z.number(), z.array(z.uuid())])).safeParse(rest).success,
      ).toBe(true);
      expect(events).toContainEqual({
        type: "quarantined",
        targetId: target.targetId,
        documentId: "b",
        revision: 1,
        errorClass: "rejected",
      });
      expect(JSON.stringify(events)).not.toMatch(HANGUL);

      expect(await kit.indexed(target, "a")).toMatchObject({
        version: 1,
        deleted: false,
        doc: { body: "하나" },
      });
      // b is quarantined without budget, c acknowledged as a duplicate, d released without budget (replace mode
      // applied it on the engine).
      const runtimes = await kit.runtimes();
      expect(runtimes.map((row) => row.document_id)).toEqual(["b", "d"]);
      expect(runtimes[0]).toMatchObject({
        quarantined_revision: 1,
        attempts: 0,
        retry_age_ms: 0,
        lease_token: null,
        last_error: { class: "rejected", status: 400, type: "strict_dynamic_mapping_exception" },
      });
      expect(runtimes[1]).toMatchObject({
        quarantined_revision: null,
        attempts: 0,
        retry_age_ms: 0,
        failure_revision: 0,
        available_revision: 1,
        lease_token: null,
        last_error: {
          class: "infrastructure",
          status: 429,
          type: "es_rejected_execution_exception",
        },
      });
      expect(JSON.stringify(runtimes.map((row) => row.last_error))).not.toMatch(HANGUL);
      expect(await kit.indexed(target, "b")).toBeNull();
      expect((await kit.intents()).map((row) => row.document_id)).toEqual(["b", "d"]);

      // After the cooldown d is resent; the engine already holds that version, so it verifies as a duplicate.
      let superseded = 0;
      await waitFor("d의 재전송 확인", async () => {
        const next = await indexer.drainOnce();
        superseded += next.superseded;
        return (await kit.intents()).every((row) => row.document_id !== "d");
      });
      expect(superseded).toBe(1);
      expect(await kit.indexed(target, "d")).toMatchObject({ version: 1, doc: { body: "넷" } });
      expect((await kit.runtimes()).map((row) => [row.document_id, row.attempts])).toEqual([
        ["b", 0],
      ]);
    } finally {
      setSearchLocale("en");
    }
  });
});

describe("claim과 전송 사이에 부적격이 된 대상", () => {
  it("전송 직전 대상이 부적격이면 bulk를 보내지 않고 예산 없이 반납한다", async () => {
    let current: WorkerSetup | undefined;
    const setup = await kit.setUp({
      hooks: {
        [KEY]: {
          // Disables writes inside the snapshot, the state suspend and retire start with.
          beforeRead: async () => {
            if (current === undefined) return;
            await h.knex.raw(
              sql`UPDATE ${qualified(h.searchSchema, "targets")} SET write_enabled = false WHERE target_id = ?`,
              [targetOf(current).targetId],
            );
          },
        },
      },
    });
    current = setup;
    await kit.write(setup, KEY, ["p", "q"], async (trx) => {
      await kit.upsert(trx, KEY, "p", "피");
      await kit.upsert(trx, KEY, "q", "큐");
    });
    const recorded = recordingClient(kit.nativeClient());
    const { indexer } = kit.indexer(setup, { client: recorded.client });
    const report = await indexer.drainOnce();
    expect(report).toMatchObject({
      claimed: 2,
      released: 2,
      indexed: 0,
      retried: 0,
      quarantined: 0,
    });
    expect(recorded.bulks).toEqual([]);
    expect(
      (await kit.runtimes()).map((row) => [
        row.document_id,
        row.lease_token,
        row.attempts,
        row.last_error,
      ]),
    ).toEqual([
      ["p", null, 0, { class: "not_sent", reason: "target-ineligible" }],
      ["q", null, 0, { class: "not_sent", reason: "target-ineligible" }],
    ]);
    // The claim re-checks eligibility, so the target is not claimed again.
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 0 });
  });
});
