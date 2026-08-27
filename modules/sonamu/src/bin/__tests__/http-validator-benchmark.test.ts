import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

const isolatedModeNames = ["cachedPlain", "eagerJit", "aot"] as const;
type IsolatedModeName = (typeof isolatedModeNames)[number];

const ProcessMetricSchema = z.object({
  startupMs: z.number(),
  rssAtStartBytes: z.number(),
  rssReadyBytes: z.number(),
});

const ModeRunResultSchema = z.object({
  mode: z.enum(isolatedModeNames),
  parity: z.literal(true),
  fixtureAssertions: z.object({
    validAccepted: z.literal(true),
    invalidRejected: z.literal(true),
  }),
  process: ProcessMetricSchema,
  resultChecksum: z.number(),
});

type ModeRunResult = z.infer<typeof ModeRunResultSchema>;

const packageRoot = path.resolve(import.meta.dirname, "../../..");
const benchmarkArtifactPath = path.join(packageRoot, "benchmarks/dist/http-validator.bench.mjs");

function parseModeOutput(output: string): ModeRunResult {
  const outputLine = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);
  if (outputLine === undefined) {
    throw new Error("benchmark child process가 결과를 출력하지 않았습니다");
  }
  return ModeRunResultSchema.parse(JSON.parse(outputLine));
}

function runBenchmarkMode(mode: IsolatedModeName): ModeRunResult {
  const output = execFileSync(process.execPath, [benchmarkArtifactPath], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      BENCHMARK_MODE: mode,
      BENCHMARK_RUN_INDEX: "0",
      ZOD_COMPILER: undefined,
    },
  });
  return parseModeOutput(output);
}

describe("HTTP validator benchmark RSS 계약", () => {
  const results = new Map<IsolatedModeName, ModeRunResult>();

  beforeAll(() => {
    execFileSync("pnpm", ["exec", "tsdown", "--config", "benchmarks/tsdown.config.ts"], {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    for (const mode of isolatedModeNames) {
      results.set(mode, runBenchmarkMode(mode));
    }
  }, 120_000);

  it("각 validator mode를 실제 child process로 실행한다", () => {
    expect([...results.keys()]).toEqual(isolatedModeNames);
    for (const mode of isolatedModeNames) {
      expect(results.get(mode)).toMatchObject({
        mode,
        parity: true,
        fixtureAssertions: { validAccepted: true, invalidRejected: true },
      });
    }
  });

  it("각 mode의 시작 및 준비 시점 RSS를 보고한다", () => {
    for (const mode of isolatedModeNames) {
      expect(results.get(mode)?.process).toMatchObject({
        startupMs: expect.any(Number),
        rssAtStartBytes: expect.any(Number),
        rssReadyBytes: expect.any(Number),
      });
    }
  });
});
