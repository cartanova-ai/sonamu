import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createPostgresSynchronization } from "../../src/postgres";
import { createSearchCliPlugin, type SearchCliSetup } from "../../src/sonamu";
import { createTestDefinition } from "../../src/testing";
import { useIntegrationHarness } from "../helpers/harness";
import { READ_PATH_WORKER_LIMITS } from "../helpers/read-path-fixture";
import { resetSearchSchema } from "../helpers/test-targets";

// Drives the search commands through run() as the CLI would, after its approval; the admin operations' own rules are
// covered by their tests, so this checks what the commands add: sequencing, defaults and the refusals they surface.

const h = useIntegrationHarness({ sampleDomain: false });

const KEY = "notes";
const noteSchema = z.object({ title: z.string() });
const notes = new Map([
  ["1", { title: "first" }],
  ["2", { title: "second" }],
]);
const definition = (projectionVersion: string) =>
  createTestDefinition({
    key: KEY,
    schema: noteSchema,
    projectionVersion,
    properties: { title: { type: "text" } },
    documents: () => notes,
  });
const V1 = definition("1");
const V2 = definition("2");

// The retirement grace is cursor + search + margin: 4 s.
const LIFETIMES = {
  maxSearchLifetimeMs: 1_000,
  maxCursorLifetimeMs: 2_000,
  maxPitKeepAliveMs: 1_000,
  retirementSafetyMarginMs: 1_000,
};

function setup(
  options: {
    definitions?: SearchCliSetup["definitions"];
    instanceName?: string;
    client?: SearchCliSetup["client"] | "omitted";
  } = {},
): SearchCliSetup {
  const synchronization = createPostgresSynchronization({
    getPrimaryDatabase: () => h.knex,
    schema: h.searchSchema,
    namespace: h.namespace,
    instanceName: options.instanceName,
  });
  const result: SearchCliSetup = {
    definitions: options.definitions ?? [V1],
    synchronization,
    client:
      options.client === "omitted"
        ? undefined
        : (options.client ??
          (() => ({
            createClient: () => h.opensearch,
            ownsClient: false,
            requestTimeoutMs: 30_000,
          }))),
    admin: {
      lifetimes: LIFETIMES,
      timeouts: {
        lockTimeoutMs: 10_000,
        statementTimeoutMs: 20_000,
        idleInTransactionTimeoutMs: 60_000,
        adminLeaseMs: 120_000,
      },
      cutover: { maxPendingDocuments: 1_000, sampleSize: 0 },
    },
    workerLimits: READ_PATH_WORKER_LIMITS,
  };
  return result;
}

const eventSchema = z.object({ event: z.string(), data: z.json() });
type CliEvent = z.infer<typeof eventSchema>;
type CliValue = z.infer<ReturnType<typeof z.json>>;
type CliInput = { options?: Record<string, string | number | string[]>; dryRun?: boolean };

const streamSchema = z.custom<AsyncIterable<object>>(
  (value) => value !== null && value !== undefined && Symbol.asyncIterator in Object(value),
);
const failureSchema = z.object({
  code: z.string(),
  message: z.string(),
  exitCode: z.number(),
  details: z.record(z.string(), z.json()),
  hint: z.string().optional(),
});

/** Runs one approved command (or its dry run): an object result, or the events it streamed. */
async function run(
  using: SearchCliSetup,
  name: string,
  input: CliInput = {},
): Promise<CliValue | CliEvent[]> {
  const command = createSearchCliPlugin({ load: () => using }).commands.find(
    (candidate) => candidate.path.join(" ") === `search ${name}`,
  );
  if (command === undefined) throw new Error(`search ${name}이 없습니다.`);
  const result = await command.run(
    { arguments: {}, options: input.options ?? {}, dryRun: input.dryRun ?? false },
    { command: `search.${name}`, json: true, interactive: false },
  );
  const stream = streamSchema.safeParse(result);
  if (!stream.success) return z.json().parse(JSON.parse(JSON.stringify(result)));
  const lines: CliEvent[] = [];
  for await (const line of stream.data)
    lines.push(eventSchema.parse(JSON.parse(JSON.stringify(line))));
  return lines;
}

async function cli(using: SearchCliSetup, name: string, input: CliInput = {}): Promise<CliValue> {
  return z.json().parse(await run(using, name, input));
}

async function streamed(
  using: SearchCliSetup,
  name: string,
  options?: Record<string, string | string[]>,
): Promise<CliEvent[]> {
  return z
    .array(eventSchema)
    .parse(await run(using, name, options === undefined ? {} : { options }));
}

async function refusal(using: SearchCliSetup, name: string, input: CliInput = {}) {
  const outcome = await run(using, name, input).then(
    () => undefined,
    (error: Error) => error,
  );
  if (outcome === undefined) throw new Error(`search ${name}은 거부돼야 합니다.`);
  return failureSchema.parse({ ...outcome, message: outcome.message });
}

const inspectionSchema = z.object({
  inspection: z.looseObject({
    registered: z.boolean(),
    readHead: z.looseObject({ targetId: z.string().nullable() }).optional(),
    targets: z.array(z.looseObject({ targetId: z.string(), state: z.string() })).optional(),
  }),
  binding: z.looseObject({ storeId: z.string(), ok: z.boolean() }),
});

async function inspect(using: SearchCliSetup) {
  return inspectionSchema.parse(await cli(using, "inspect"));
}

async function waitForDatabaseTime(atMs: number): Promise<void> {
  for (;;) {
    const { rows } = await h.knex.raw<{ rows: { now: string }[] }>(
      "SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now",
    );
    if (Number(rows[0]?.now) >= atMs) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const indexedTotal = (drained: readonly CliEvent[]) =>
  drained
    .filter((line) => line.event === "drain.round")
    .reduce(
      (sum, line) => sum + z.looseObject({ indexed: z.number() }).parse(line.data).indexed,
      0,
    );

beforeEach(async () => {
  await resetSearchSchema(h);
});

describe("검색 CLI 명령: 첫 대상부터 재구성과 은퇴까지", () => {
  it("init이 첫 대상을 만들어 읽기에 올리고, 재구성은 init, backfill, cutover, retire-old 순서로 끝난다", async () => {
    const first = setup();
    expect((await inspect(first)).inspection.registered).toBe(false);
    expect(await refusal(first, "backfill")).toMatchObject({
      code: "SEARCH_ADMIN_PRECONDITION_FAILED",
      exitCode: 1,
      details: { reason: "no-open-build", logicalKey: KEY },
    });

    // The dry run plans the target and records nothing.
    const preview = z
      .object({ registered: z.boolean(), plan: z.looseObject({ targetId: z.string() }) })
      .parse(await cli(first, "init", { dryRun: true }));
    expect(preview.registered).toBe(false);
    expect((await inspect(first)).inspection.registered).toBe(false);

    const initial = await streamed(first, "init");
    expect(initial.map((line) => line.event).filter((name) => name !== "backfill.page")).toEqual([
      "init.plan",
      "init.created",
      "init.build",
      "cutover.check",
      "cutover.done",
    ]);
    expect(initial.findLast((line) => line.event === "backfill.page")?.data).toMatchObject({
      done: true,
    });
    const created = z
      .looseObject({ targetId: z.string() })
      .parse(initial.find((line) => line.event === "init.created")?.data);
    expect(created.targetId).not.toBe(preview.plan.targetId);
    expect((await inspect(first)).inspection.readHead?.targetId).toBe(created.targetId);

    const drained = await streamed(first, "drain");
    expect(indexedTotal(drained)).toBe(notes.size);
    expect(drained.at(-1)?.event).toBe("drain.stopped");

    // The new definition comes first; the old one stays until its target is retired.
    const rebuilding = setup({ definitions: [V2, V1] });
    const opened = await streamed(rebuilding, "init");
    expect(opened.map((line) => line.event)).toEqual(["init.build", "init.next"]);
    expect(opened[0]?.data).toMatchObject({ kind: "rebuild" });
    expect((await streamed(rebuilding, "backfill")).at(-1)?.data).toMatchObject({ done: true });

    const check = z
      .object({ check: z.looseObject({ eligibleForCutover: z.boolean() }) })
      .parse(await cli(rebuilding, "cutover", { dryRun: true }));
    expect(check.check.eligibleForCutover).toBe(true);
    expect((await inspect(rebuilding)).inspection.readHead?.targetId).toBe(created.targetId);

    const cutover = z.object({ result: z.unknown() }).parse(await cli(rebuilding, "cutover"));
    expect(cutover.result).toBeDefined();
    const served = (await inspect(rebuilding)).inspection.readHead?.targetId;
    expect(served).not.toBe(created.targetId);

    const early = await refusal(rebuilding, "retire-old");
    expect(early).toMatchObject({
      code: "SEARCH_ADMIN_PRECONDITION_FAILED",
      details: { reason: "retirement-grace-pending", retryable: true, targetId: created.targetId },
    });
    const earliestAtMs = z.number().parse(early.details.earliestAtMs);
    await waitForDatabaseTime(earliestAtMs);

    expect(await streamed(rebuilding, "retire-old")).toEqual([
      { event: "retire.start", data: { targetId: created.targetId } },
      { event: "retire.done", data: { targetId: created.targetId } },
    ]);
    const after = (await inspect(rebuilding)).inspection;
    expect(after.targets?.find((target) => target.targetId === created.targetId)?.state).toBe(
      "retired",
    );
  }, 180_000);
});

describe("검색 CLI 명령: 복구 경로", () => {
  it("PostgreSQL 전용 명령은 클라이언트 없이 돌고, 저장소 불일치는 hint와 함께 거부되며 confirm-ownership 뒤 drain과 재개 runbook이 이어진다", async () => {
    const east = setup({ instanceName: "east" });
    await streamed(east, "init");
    // Records this environment's instance name; another name is then refused.
    await cli(east, "confirm-ownership");
    const servedFirst = (await inspect(east)).inspection.readHead?.targetId;

    // Without a client, PostgreSQL-only commands run and the rest refuse with the package's reason.
    const clientless = setup({ instanceName: "east", client: "omitted" });
    expect((await inspect(clientless)).inspection.registered).toBe(true);
    expect(await streamed(clientless, "remark", { ids: ["1"] })).toEqual([
      { event: "remark.page", data: expect.objectContaining({ marked: 1 }) },
    ]);
    expect(await refusal(clientless, "drain")).toMatchObject({
      code: "SEARCH_ADMIN_PRECONDITION_FAILED",
      details: { reason: "search-client-not-configured", operation: "drain" },
    });
    // A failing client getter is reached only by the commands that need OpenSearch.
    const unreachable = setup({
      instanceName: "east",
      client: () => {
        throw new Error("OPENSEARCH_URL is required");
      },
    });
    expect((await inspect(unreachable)).inspection.registered).toBe(true);
    await expect(run(unreachable, "retire-old")).rejects.toThrow("OPENSEARCH_URL is required");

    const west = setup({ instanceName: "west" });
    expect(await refusal(west, "drain")).toMatchObject({
      code: "SEARCH_STORE_MISMATCH",
      details: { reason: "store-instance-mismatch" },
      hint: expect.stringMatching(/adopt-store[\s\S]*confirm-ownership/),
    });

    const confirmed = z
      .object({
        confirmed: z.looseObject({ storeId: z.string() }),
        binding: z.looseObject({ storeId: z.string(), ok: z.boolean() }),
      })
      .parse(await cli(west, "confirm-ownership"));
    expect(confirmed.binding).toMatchObject({ storeId: confirmed.confirmed.storeId, ok: true });
    expect(indexedTotal(await streamed(west, "drain"))).toBeGreaterThan(0);

    // Restoring the source: suspend, resume into a new build, backfill, cut over.
    expect(await cli(west, "suspend")).toEqual({ logicalKey: KEY, captureMode: "suspended" });
    const resumed = z
      .object({ build: z.looseObject({ buildId: z.string(), kind: z.string() }) })
      .parse(await cli(west, "resume"));
    expect(resumed.build.kind).toBe("resume");
    expect((await streamed(west, "backfill")).at(-1)?.data).toMatchObject({ done: true });
    await cli(west, "cutover");
    const servedAfter = (await inspect(west)).inspection.readHead?.targetId;
    expect(servedAfter).not.toBe(servedFirst);

    expect(await refusal(west, "verify", { options: { target: servedAfter ?? "" } })).toMatchObject(
      {
        code: "SEARCH_ADMIN_PRECONDITION_FAILED",
        exitCode: 1,
        details: { reason: "target-not-paused" },
      },
    );
  }, 180_000);
});
