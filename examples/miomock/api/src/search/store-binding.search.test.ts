import assert from "assert";

import { SearchStoreMismatch } from "@sonamu-kit/opensearch";
import { createIndexer } from "@sonamu-kit/opensearch/postgres";
import knex from "knex";
import { DB, Sonamu } from "sonamu";
import { test } from "sonamu/test";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { z } from "zod";

import { ProjectModel } from "../application/project/project.model";
import { createMiomockSearchClient } from "./client";
import { getSearchHandles } from "./index";
import { projectsSearchDefinitions } from "./projects.definition";
import { APPROVE, type CliResult, runCli } from "./testing/cli";
import { SEARCH_IT_COPY_DATABASE, SEARCH_IT_RENAMED_COPY_DATABASE } from "./testing/constants";
import { ledgerRevision, projectParams } from "./testing/helpers";
import { searchWorkerLimits } from "./worker-limits";

// Uses the unadopted copy made by the global setup, which inherits a registered index and write target.

const bindingSchema = z.object({
  storeId: z.string(),
  originRecorded: z.boolean(),
  originMatches: z.boolean(),
  instanceMatches: z.boolean(),
  ok: z.boolean(),
});
const inspectSchema = z.object({ binding: bindingSchema });
const adoptedSchema = z.object({
  adopted: z.object({ storeId: z.string(), detachedTargets: z.array(z.unknown()) }),
  binding: bindingSchema,
});
const confirmedSchema = z.object({
  confirmed: z.object({ storeId: z.string() }),
  binding: bindingSchema,
});

function resultData<Schema extends z.ZodType>(result: CliResult, schema: Schema): z.output<Schema> {
  return schema.parse(result.data);
}

let copiedStoreId: string;

beforeAll(async () => {
  // Sonamu reads SONAMU_DB_NAME during init.
  process.env.SONAMU_DB_NAME = SEARCH_IT_COPY_DATABASE;
  await Sonamu.init(true, false, undefined, true);
  const { rows } = await DB.getDB("w").raw<{ rows: { name: string }[] }>(
    "SELECT current_database() AS name",
  );
  expect(rows[0]?.name).toBe(SEARCH_IT_COPY_DATABASE);
});

afterAll(async () => {
  await getSearchHandles()?.client.close();
  await DB.destroy().catch(() => {});
});

describe("저장소 결속", () => {
  test("채택하지 않은 복사본에서 표시는 커밋되고, 워커와 원격 관리 작업은 거부된다", async () => {
    const handles = getSearchHandles();
    assert(handles);
    const binding = await handles.synchronization.checkBinding();
    expect(binding).toMatchObject({ originRecorded: true, originMatches: false });
    copiedStoreId = binding.storeId;

    // initialize() and marking do not check the binding.
    await handles.synchronization.initialize();
    const [id] = await ProjectModel.save([projectParams("결속 복사본 프로젝트")]);
    assert(id);
    expect(await DB.getDB("w")("projects").where("id", id).first()).toMatchObject({ id });
    expect(await ledgerRevision(id)).toBe(1);
    const intents = await DB.getDB("w")
      .withSchema("sonamu_search")
      .table("deliveries")
      .where("document_id", String(id))
      .count({ count: "*" });
    expect(Number(intents[0]?.count)).toBe(1);

    const indexer = createIndexer({
      client: createMiomockSearchClient(handles.url),
      synchronization: handles.synchronization,
      definitions: projectsSearchDefinitions,
      limits: searchWorkerLimits(),
    });
    const drain = indexer.drainOnce();
    await expect(drain).rejects.toBeInstanceOf(SearchStoreMismatch);
    await expect(drain).rejects.toMatchObject({ details: { reason: "store-origin-changed" } });

    const backfill = await runCli(["backfill", ...APPROVE], {
      databaseName: SEARCH_IT_COPY_DATABASE,
    });
    expect(backfill.exitCode).toBe(1);
    expect(backfill.failure).toMatchObject({
      code: "SEARCH_STORE_MISMATCH",
      details: { reason: "store-origin-changed" },
    });
    expect(backfill.failure?.hint).toContain("adopt-store");
    expect(backfill.failure?.hint).toContain("confirm-ownership");

    const inspect = await runCli(["inspect"], { databaseName: SEARCH_IT_COPY_DATABASE });
    expect(inspect.exitCode, inspect.outputTail).toBe(0);
    expect(resultData(inspect, inspectSchema).binding).toMatchObject({
      storeId: copiedStoreId,
      originMatches: false,
      ok: false,
    });
  });

  test("adopt-store는 CLI 승인을 요구하고, 채택 뒤에는 runbook으로 자기 대상을 만든다", async () => {
    const unconfirmed = await runCli(["adopt-store"], { databaseName: SEARCH_IT_COPY_DATABASE });
    expect(unconfirmed.exitCode).toBe(3);
    expect(unconfirmed.failure).toMatchObject({ code: "CONFIRMATION_REQUIRED" });

    const adopted = await runCli(["adopt-store", ...APPROVE], {
      databaseName: SEARCH_IT_COPY_DATABASE,
    });
    expect(adopted.exitCode, adopted.outputTail).toBe(0);
    const result = resultData(adopted, adoptedSchema);
    expect(result.adopted.storeId).not.toBe(copiedStoreId);
    expect(result.adopted.detachedTargets).toHaveLength(1);
    expect(result.binding).toMatchObject({
      storeId: result.adopted.storeId,
      ok: true,
    });

    const copy = { databaseName: SEARCH_IT_COPY_DATABASE };
    for (const step of ["resume", "backfill", "cutover"]) {
      const run = await runCli([step, ...APPROVE], copy);
      expect(run.exitCode, `${step}: ${run.outputTail}`).toBe(0);
    }
  });

  test("데이터베이스 이름이 바뀌면 거부되고, confirm-ownership이 store_id를 그대로 둔 채 다시 연다", async () => {
    const before = resultData(
      await runCli(["inspect"], { databaseName: SEARCH_IT_COPY_DATABASE }),
      inspectSchema,
    ).binding;
    expect(before.ok).toBe(true);

    // Moving the same store: close this process's connections, then rename the database.
    await DB.destroy();
    const admin = knex({
      client: "pg",
      connection: {
        host: process.env.SONAMU_DB_HOST ?? "0.0.0.0",
        port: Number(process.env.SONAMU_DB_PORT ?? 5432),
        user: process.env.SONAMU_DB_USER ?? "postgres",
        password: process.env.SONAMU_DB_PASSWORD ?? "miomock123",
        database: "postgres",
      },
      pool: { min: 0, max: 1 },
    });
    try {
      await admin.raw(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ? AND pid <> pg_backend_pid()",
        [SEARCH_IT_COPY_DATABASE],
      );
      await admin.raw("ALTER DATABASE ?? RENAME TO ??", [
        SEARCH_IT_COPY_DATABASE,
        SEARCH_IT_RENAMED_COPY_DATABASE,
      ]);
    } finally {
      await admin.destroy();
    }

    const moved = { databaseName: SEARCH_IT_RENAMED_COPY_DATABASE };
    const refused = await runCli(["drain", ...APPROVE], moved);
    expect(refused.exitCode).toBe(1);
    expect(refused.failure).toMatchObject({
      code: "SEARCH_STORE_MISMATCH",
      details: { reason: "store-origin-changed" },
    });

    const unconfirmed = await runCli(["confirm-ownership"], moved);
    expect(unconfirmed.exitCode).toBe(3);
    expect(unconfirmed.failure).toMatchObject({ code: "CONFIRMATION_REQUIRED" });

    const confirmed = await runCli(["confirm-ownership", ...APPROVE], moved);
    expect(confirmed.exitCode, confirmed.outputTail).toBe(0);
    const ownership = resultData(confirmed, confirmedSchema);
    expect(ownership.confirmed.storeId).toBe(before.storeId);
    expect(ownership.binding).toMatchObject({
      storeId: before.storeId,
      ok: true,
    });

    const drain = await runCli(["drain", ...APPROVE], moved);
    expect(drain.exitCode, drain.outputTail).toBe(0);
  });
});
