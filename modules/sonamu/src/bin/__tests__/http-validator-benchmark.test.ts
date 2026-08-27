import process from "node:process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const benchmarkMocks = vi.hoisted(() => ({
  compile: vi.fn(),
  execFileSync: vi.fn(),
  jit: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: benchmarkMocks.execFileSync,
}));

vi.mock("node:fs", () => ({
  statSync: benchmarkMocks.statSync,
}));

vi.mock("zod-compiler", () => ({
  compile: benchmarkMocks.compile,
}));

vi.mock("zod-compiler/jit", () => ({
  jit: benchmarkMocks.jit,
}));

vi.mock("zod", () => {
  const schema = new Proxy(
    {},
    {
      get() {
        return () => schema;
      },
    },
  );
  return {
    z: {
      array: () => schema,
      boolean: () => schema,
      date: () => schema,
      literal: () => schema,
      number: () => schema,
      object: () => schema,
      string: () => schema,
      union: () => schema,
    },
  };
});

vi.mock("../../api/caster", () => ({
  fastifyCaster: () => {
    const safeParse = (input: unknown) => {
      const invalid =
        isRecord(input) &&
        isRecord(input.filter) &&
        typeof input.filter.score === "string" &&
        input.filter.score === "invalid";
      return invalid
        ? { success: false, error: { issues: [{ code: "custom", path: ["filter", "score"] }] } }
        : { success: true, data: input };
    };
    return {
      parse(input: unknown) {
        const result = safeParse(input);
        if (!result.success) {
          throw new Error("invalid benchmark fixture");
        }
        return result.data;
      },
      safeParse,
    };
  },
}));

vi.mock("fastify", () => ({
  default: () => {
    let routeHandler:
      | ((request: { body: unknown }, reply: Record<string, unknown>) => unknown)
      | undefined;
    return {
      async close() {},
      async inject(options: { payload: unknown }) {
        if (routeHandler === undefined) {
          throw new Error("benchmark route가 등록되지 않았습니다");
        }
        let statusCode = 200;
        const response = { statusCode };
        const reply = {
          code(nextStatusCode: number) {
            statusCode = nextStatusCode;
            response.statusCode = nextStatusCode;
            return reply;
          },
          send() {
            return response;
          },
        };
        return await routeHandler({ body: options.payload }, reply);
      },
      post(
        _path: string,
        handler: (request: { body: unknown }, reply: Record<string, unknown>) => unknown,
      ) {
        routeHandler = handler;
      },
      async ready() {},
    };
  },
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createLayerResults() {
  const modes = {
    uncachedPlain: { p50Ns: 40, p95Ns: 50 },
    cachedPlain: { p50Ns: 30, p95Ns: 40 },
    eagerJit: { p50Ns: 20, p95Ns: 25 },
    aot: { p50Ns: 18, p95Ns: 22 },
  };
  return {
    validator: modes,
    handler: modes,
    fastifyInject: modes,
  };
}

describe("HTTP validator benchmark RSS 계약", () => {
  const originalBenchmarkMode = process.env.BENCHMARK_MODE;
  const originalZodCompiler = process.env.ZOD_COMPILER;

  beforeEach(() => {
    vi.resetModules();
    benchmarkMocks.compile.mockReset();
    benchmarkMocks.execFileSync.mockReset();
    benchmarkMocks.jit.mockReset();
    benchmarkMocks.statSync.mockReset();
    benchmarkMocks.statSync.mockReturnValue({ size: 1024 });
    benchmarkMocks.execFileSync.mockImplementation(
      (
        file: string,
        _args: readonly string[],
        options?: { env?: Record<string, string | undefined> },
      ) => {
        if (file === "pnpm") {
          return "";
        }
        const mode = options?.env?.BENCHMARK_MODE;
        const runIndex = Number(options?.env?.BENCHMARK_RUN_INDEX ?? "0");
        const rssSample = {
          startupMs: 10,
          rssAtStartBytes: 100,
          rssReadyBytes: 200,
        };
        return `${JSON.stringify({
          runIndex,
          mode,
          environment: { node: process.version },
          parity: true,
          fixtureAssertions: { validAccepted: true, invalidRejected: true },
          results: createLayerResults(),
          startup: {
            uncachedPlain: { validatorMs: 0, fastifyMs: 1, totalMs: 1 },
            cachedPlain: { validatorMs: 1, fastifyMs: 1, totalMs: 2 },
            eagerJit: { validatorMs: 2, fastifyMs: 1, totalMs: 3 },
            aot: { validatorMs: 1, fastifyMs: 1, totalMs: 2 },
          },
          process: {
            ...rssSample,
            cachedPlain: rssSample,
            eagerJit: rssSample,
            aot: rssSample,
          },
          resultChecksum: 1,
        })}\n`;
      },
    );
  });

  afterEach(() => {
    if (originalBenchmarkMode === undefined) {
      delete process.env.BENCHMARK_MODE;
    } else {
      process.env.BENCHMARK_MODE = originalBenchmarkMode;
    }
    if (originalZodCompiler === undefined) {
      delete process.env.ZOD_COMPILER;
    } else {
      process.env.ZOD_COMPILER = originalZodCompiler;
    }
    vi.restoreAllMocks();
  });

  it("cached plain, JIT, AOT를 별도 child process로 수집하고 mode별 RSS를 보고한다", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../../../benchmarks/run-http-validator-benchmark");

    const collectedModes = benchmarkMocks.execFileSync.mock.calls
      .filter(([file]) => file === process.execPath)
      .map(([, , options]) => {
        if (!isRecord(options) || !isRecord(options.env)) {
          return undefined;
        }
        return options.env.BENCHMARK_MODE;
      });
    expect(new Set(collectedModes)).toEqual(new Set(["cachedPlain", "eagerJit", "aot"]));

    const printed = consoleLog.mock.calls.at(-1)?.[0];
    if (typeof printed !== "string") {
      throw new Error("benchmark report가 JSON 문자열을 출력하지 않았습니다");
    }
    const report: unknown = JSON.parse(printed);
    if (!isRecord(report) || !isRecord(report.median) || !isRecord(report.median.process)) {
      throw new Error("benchmark report에 median process 결과가 없습니다");
    }
    expect(report.median.process).toMatchObject({
      cachedPlain: {
        rssAtStartBytes: expect.any(Number),
        rssReadyBytes: expect.any(Number),
      },
      eagerJit: {
        rssAtStartBytes: expect.any(Number),
        rssReadyBytes: expect.any(Number),
      },
      aot: {
        rssAtStartBytes: expect.any(Number),
        rssReadyBytes: expect.any(Number),
      },
    });
  });

  it.each([
    { compileCalls: 0, jitCalls: 0, mode: "cachedPlain" },
    { compileCalls: 0, jitCalls: 1, mode: "eagerJit" },
    { compileCalls: 1, jitCalls: 0, mode: "aot" },
  ] as const)(
    "$mode child는 선택한 validator mode만 준비한다",
    async ({ compileCalls, jitCalls, mode }) => {
      process.env.BENCHMARK_MODE = mode;
      delete process.env.ZOD_COMPILER;
      benchmarkMocks.compile.mockImplementation((schema) => {
        const record = isRecord(schema) ? schema : {};
        const originalParse =
          typeof record.parse === "function" ? record.parse.bind(record) : undefined;
        const originalSafeParse =
          typeof record.safeParse === "function" ? record.safeParse.bind(record) : undefined;
        return {
          ...record,
          parse(input: unknown) {
            return originalParse?.(input);
          },
          safeParse(input: unknown) {
            return originalSafeParse?.(input);
          },
        };
      });
      benchmarkMocks.jit.mockImplementation((schema) => {
        if (!isRecord(schema)) {
          return schema;
        }
        const originalParse =
          typeof schema.parse === "function" ? schema.parse.bind(schema) : undefined;
        const originalSafeParse =
          typeof schema.safeParse === "function" ? schema.safeParse.bind(schema) : undefined;
        schema.parse = (input: unknown) => originalParse?.(input);
        schema.safeParse = (input: unknown) => originalSafeParse?.(input);
        return schema;
      });
      vi.spyOn(console, "log").mockImplementation(() => {});

      const importSelectedBenchmark = {
        cachedPlain: () => import("../../../benchmarks/http-validator.bench?mode=cachedPlain"),
        eagerJit: () => import("../../../benchmarks/http-validator.bench?mode=eagerJit"),
        aot: () => import("../../../benchmarks/http-validator.bench?mode=aot"),
      }[mode];
      await importSelectedBenchmark();

      expect(benchmarkMocks.jit).toHaveBeenCalledTimes(jitCalls);
      expect(benchmarkMocks.compile).toHaveBeenCalledTimes(compileCalls);
    },
  );
});
