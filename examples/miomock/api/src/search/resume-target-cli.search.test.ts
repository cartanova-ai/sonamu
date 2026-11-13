import assert from "assert";

import { Client } from "@opensearch-project/opensearch";
import { DB, Sonamu } from "sonamu";
import { test } from "sonamu/test";
import { afterAll, beforeAll, describe, expect, inject } from "vitest";
import { z } from "zod";

import { ProjectModel } from "../application/project/project.model";
import { createMiomockSearchAdmin } from "./admin";
import { getSearchHandles } from "./index";
import { projectsSearchDefinition } from "./projects.definition";
import { initializeSearchStore, startSearch, stopSearch } from "./startup";
import { APPROVE, runCli } from "./testing/cli";
import { SEARCH_IT_DATABASE } from "./testing/constants";
import {
  ensureInitialTarget,
  ledgerRevision,
  projectParams,
  waitFor,
  waitForIndexedRevision,
} from "./testing/helpers";
import { searchWorkerLimits } from "./worker-limits";

/*
  A write outside the package makes the real worker pause the target with revision_divergence. Verification may
  start only after the in-flight bound (lease plus request timeout) has passed since the pause, so this case waits that long.
  Runs after project-search (file name order) so a target left paused cannot stall it.
*/

const QUIESCENCE_TIMEOUT_MS = 240_000;

/** Same in-flight bound as workerBounds in admin.ts. */
const IN_FLIGHT_BOUND_MS =
  searchWorkerLimits().leaseDurationMs + searchWorkerLimits().requestTimeoutMs;

let raw: Client;
let physicalIndex: string;
let targetId: string;
let projectId: number | undefined;

const cli = (...args: string[]) => runCli([...args, ...APPROVE]);

const targetRowSchema = z.object({
  state: z.string(),
  pause_class: z.string().nullable(),
  quiesced: z.boolean().nullable(),
});

async function targetRow() {
  const { rows } = await DB.getDB("w").raw<{ rows: unknown[] }>(
    `SELECT state, pause_reason ->> 'class' AS pause_class,
       clock_timestamp() >= paused_at + make_interval(secs => ?::double precision / 1000) AS quiesced
     FROM sonamu_search.targets WHERE target_id = ?`,
    [IN_FLIGHT_BOUND_MS, targetId],
  );
  return targetRowSchema.parse(rows[0]);
}

beforeAll(async () => {
  await Sonamu.init(true, false, undefined, true);
  const { rows } = await DB.getDB("w").raw<{ rows: { name: string }[] }>(
    "SELECT current_database() AS name",
  );
  expect(rows[0]?.name).toBe(SEARCH_IT_DATABASE);
  const handles = getSearchHandles();
  assert(handles);
  const admin = createMiomockSearchAdmin({
    client: handles.client,
    synchronization: handles.synchronization,
  });
  await ensureInitialTarget();
  const inspection = await admin.inspect("projects");
  const target = inspection.targets.find(
    (candidate) =>
      candidate.fingerprint === projectsSearchDefinition.fingerprint &&
      candidate.state === "active" &&
      candidate.writeEnabled,
  );
  assert(target, "현재 정의의 활성 대상이 없습니다");
  targetId = target.targetId;
  physicalIndex = target.physicalIndex;
  raw = new Client({ node: inject("opensearchUrl") });
  await initializeSearchStore();
  await startSearch();
});

afterAll(async () => {
  await stopSearch();
  if (projectId !== undefined) {
    await DB.getDB("w")("projects").where("id", projectId).delete();
  }
  await raw?.close();
  await DB.destroy();
});

describe("관리 도구: 정지된 대상의 검증과 재개", () => {
  test(
    "revision_divergence로 멈춘 대상을 remark, verify, resume-target으로 되살린다",
    async () => {
      const [id] = await ProjectModel.save([projectParams("검증재개 프로젝트")]);
      assert(id);
      projectId = id;
      const indexed = await waitForIndexedRevision(raw, physicalIndex, id);
      const ledger = await ledgerRevision(id);
      assert(ledger !== undefined);

      // Outside the package: overwrite the document with an external version two above the ledger.
      const strayVersion = ledger + 2;
      await raw.index({
        index: physicalIndex,
        id: String(id),
        version: strayVersion,
        version_type: "external",
        refresh: true,
        body: {
          ...indexed._source,
          sonamu_meta: { ...indexed._source.sonamu_meta, revision: strayVersion },
        },
      });

      // The next revision (ledger + 1) gets a 409 against the higher indexed version, and the worker pauses the target.
      await ProjectModel.save([projectParams("검증재개 프로젝트 둘", { id })]);
      const paused = await waitFor("대상 정지", async () => {
        const row = await targetRow();
        return row.state === "paused" ? row : undefined;
      });
      expect(paused.pause_class).toBe("revision_divergence");

      const early = await cli("verify", "--target", targetId);
      expect(early.exitCode).toBe(1);
      expect(early.failure).toMatchObject({
        code: "SEARCH_ADMIN_PRECONDITION_FAILED",
        details: { reason: "verification-not-quiesced", retryable: true },
      });

      const refused = await cli("resume-target", "--target", targetId);
      expect(refused.exitCode).toBe(1);
      expect(refused.failure).toMatchObject({ code: "SEARCH_ADMIN_PRECONDITION_FAILED" });

      // Resolve by raising the ledger above the stray version (ledger + 1 -> + 3).
      for (let step = 0; step < 2; step += 1) {
        const remark = await cli("remark", "--ids", String(id));
        expect(remark.exitCode, remark.outputTail).toBe(0);
        expect(remark.events).toContainEqual({
          event: "remark.page",
          data: expect.objectContaining({ marked: 1 }),
        });
      }
      expect(await ledgerRevision(id)).toBe(ledger + 3);

      await waitFor(
        "pause 뒤 in-flight 상한",
        async () => ((await targetRow()).quiesced === true ? true : undefined),
        QUIESCENCE_TIMEOUT_MS,
      );

      const verify = await cli("verify", "--target", targetId);
      expect(verify.exitCode, verify.outputTail).toBe(0);
      const pages = verify.events.filter((line) => line.event === "verify.page");
      expect(pages.at(-1)?.data).toMatchObject({ done: true, violations: 0 });

      const resumed = await cli("resume-target", "--target", targetId);
      expect(resumed.exitCode, resumed.outputTail).toBe(0);
      expect(resumed.data).toMatchObject({ targetId });
      expect((await targetRow()).state).toBe("active");

      const after = await waitForIndexedRevision(raw, physicalIndex, id);
      expect(after._source.sonamu_meta.revision).toBe(ledger + 3);
    },
    { timeout: QUIESCENCE_TIMEOUT_MS + 120_000 },
  );
});
