import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import process from "node:process";

import Fastify, { type FastifyInstance } from "fastify";

import {
  buildFinalValidator,
  inputs,
  invalidInput,
  type ValidationResult,
  validInput,
} from "./http-validator-schema";

const SYNC_WARMUP_ITERATIONS = 20_000;
const SYNC_SAMPLE_COUNT = 1_000;
const SYNC_BATCH_SIZE = 100;
const INJECT_WARMUP_ITERATIONS = 500;
const INJECT_SAMPLE_COUNT = 1_000;

type ModeName = "uncachedPlain" | "cachedPlain" | "eagerJit" | "aot";
type IsolatedModeName = Exclude<ModeName, "uncachedPlain">;
type Percentiles = { p50Ns: number; p95Ns: number };
type BenchmarkMode = {
  name: ModeName;
  validatorStartupMs: number;
  validate(input: unknown): ValidationResult;
};

function readBenchmarkMode(): IsolatedModeName {
  const mode = process.env.BENCHMARK_MODE;
  if (mode === "cachedPlain" || mode === "eagerJit" || mode === "aot") {
    return mode;
  }
  throw new Error(`BENCHMARK_MODE이 올바르지 않습니다: ${mode ?? "undefined"}`);
}

const selectedModeName = process.env.ZOD_COMPILER ? undefined : readBenchmarkMode();
const processStartedAt = performance.now();
const rssAtStartBytes = process.memoryUsage().rss;

async function createSelectedMode(modeName: IsolatedModeName): Promise<BenchmarkMode> {
  if (modeName === "cachedPlain") {
    const startedAt = performance.now();
    const validator = buildFinalValidator();
    return {
      name: modeName,
      validatorStartupMs: performance.now() - startedAt,
      validate(input) {
        return validator.safeParse(input);
      },
    };
  }

  if (modeName === "eagerJit") {
    const startedAt = performance.now();
    const validator = buildFinalValidator();
    const originalParse = validator.parse;
    const originalSafeParse = validator.safeParse;
    const { jit } = await import("zod-compiler/jit");
    jit(validator, { eager: true });
    assert.notStrictEqual(validator.parse, originalParse, "eager JIT parse가 설치되지 않았습니다");
    assert.notStrictEqual(
      validator.safeParse,
      originalSafeParse,
      "eager JIT safeParse가 설치되지 않았습니다",
    );
    return {
      name: modeName,
      validatorStartupMs: performance.now() - startedAt,
      validate(input) {
        return validator.safeParse(input);
      },
    };
  }

  const startedAt = performance.now();
  const { aotOriginalParse, aotValidator } = await import("./http-validator-aot.bench");
  assert.notStrictEqual(
    aotValidator.parse,
    aotOriginalParse,
    "AOT build transform이 적용되지 않았습니다",
  );
  return {
    name: modeName,
    validatorStartupMs: performance.now() - startedAt,
    validate(input) {
      return aotValidator.safeParse(input);
    },
  };
}

function createUncachedMode(): BenchmarkMode {
  return {
    name: "uncachedPlain",
    validatorStartupMs: 0,
    validate(input) {
      return buildFinalValidator().safeParse(input);
    },
  };
}

type HandlerResult = {
  statusCode: 200 | 400;
  payload: unknown;
};

function createHandler(mode: BenchmarkMode): (input: unknown) => HandlerResult {
  return (input) => {
    const result = mode.validate(input);
    if (result.success) {
      return { statusCode: 200, payload: result.data };
    }
    return {
      statusCode: 400,
      payload: result.error.issues.map((issue) => ({ code: issue.code, path: issue.path })),
    };
  };
}

function parityValue(result: ValidationResult): unknown {
  return result.success
    ? result.data
    : result.error.issues.map((issue) => ({ code: issue.code, path: issue.path }));
}

function verifySelectedFixtures(mode: BenchmarkMode): void {
  assert.equal(mode.validate(validInput).success, true, "valid fixture가 거부되었습니다");
  assert.equal(mode.validate(invalidInput).success, false, "invalid fixture가 승인되었습니다");
}

function verifyParity(mode: BenchmarkMode): void {
  const plain = buildFinalValidator();
  for (const input of [validInput, invalidInput]) {
    assert.deepStrictEqual(parityValue(mode.validate(input)), parityValue(plain.safeParse(input)));
  }
}

function percentile(sorted: readonly number[], ratio: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio));
  const value = sorted[index];
  if (value === undefined) {
    throw new Error("benchmark sample이 없습니다");
  }
  return value;
}

function toPercentiles(samples: number[]): Percentiles {
  samples.sort((left, right) => left - right);
  return {
    p50Ns: Math.round(percentile(samples, 0.5)),
    p95Ns: Math.round(percentile(samples, 0.95)),
  };
}

let resultChecksum = 0;

function measureSync(operation: (input: unknown) => ValidationResult | HandlerResult): Percentiles {
  for (let index = 0; index < SYNC_WARMUP_ITERATIONS; index++) {
    const result = operation(inputs[index % inputs.length]);
    resultChecksum += "success" in result ? Number(result.success) : result.statusCode;
  }

  const samples: number[] = [];
  for (let sample = 0; sample < SYNC_SAMPLE_COUNT; sample++) {
    const startedAt = performance.now();
    for (let index = 0; index < SYNC_BATCH_SIZE; index++) {
      const input = inputs[(sample * SYNC_BATCH_SIZE + index) % inputs.length];
      const result = operation(input);
      resultChecksum += "success" in result ? Number(result.success) : result.statusCode;
    }
    samples.push(((performance.now() - startedAt) * 1_000_000) / SYNC_BATCH_SIZE);
  }
  return toPercentiles(samples);
}

async function createBenchmarkServer(mode: BenchmarkMode): Promise<{
  app: FastifyInstance;
  handler: (input: unknown) => HandlerResult;
  startupMs: number;
}> {
  const startedAt = performance.now();
  const app = Fastify({ logger: false });
  const handler = createHandler(mode);
  app.post("/validate", async (request, reply) => {
    const result = handler(request.body);
    return reply.code(result.statusCode).send(result.payload);
  });
  await app.ready();
  return { app, handler, startupMs: performance.now() - startedAt };
}

async function verifyFastifyBoundary(app: FastifyInstance): Promise<void> {
  const accepted = await app.inject({ method: "POST", url: "/validate", payload: validInput });
  const rejected = await app.inject({ method: "POST", url: "/validate", payload: invalidInput });
  assert.equal(accepted.statusCode, 200, "valid fixture가 Fastify boundary에서 거부되었습니다");
  assert.equal(rejected.statusCode, 400, "invalid fixture가 Fastify boundary에서 승인되었습니다");
}

async function measureFastifyInject(app: FastifyInstance): Promise<Percentiles> {
  for (let index = 0; index < INJECT_WARMUP_ITERATIONS; index++) {
    const response = await app.inject({
      method: "POST",
      url: "/validate",
      payload: inputs[index % inputs.length],
    });
    resultChecksum += response.statusCode;
  }

  const samples: number[] = [];
  for (let sample = 0; sample < INJECT_SAMPLE_COUNT; sample++) {
    const startedAt = performance.now();
    const response = await app.inject({
      method: "POST",
      url: "/validate",
      payload: inputs[sample % inputs.length],
    });
    samples.push((performance.now() - startedAt) * 1_000_000);
    resultChecksum += response.statusCode;
  }
  return toPercentiles(samples);
}

async function runBenchmark(modeName: IsolatedModeName): Promise<void> {
  const selectedMode = await createSelectedMode(modeName);
  verifySelectedFixtures(selectedMode);
  const selectedServer = await createBenchmarkServer(selectedMode);
  await verifyFastifyBoundary(selectedServer.app);
  const processStartupMs = performance.now() - processStartedAt;
  const rssReadyBytes = process.memoryUsage().rss;

  // parity용 plain schema는 RSS snapshot 뒤에 만들어 선택한 mode의 startup sample을 오염시키지 않습니다.
  verifyParity(selectedMode);

  const measuredModes = [selectedMode];
  const servers = new Map([[selectedMode.name, selectedServer]]);
  const startup: Partial<
    Record<ModeName, { validatorMs: number; fastifyMs: number; totalMs: number }>
  > = {
    [selectedMode.name]: {
      validatorMs: Number(selectedMode.validatorStartupMs.toFixed(3)),
      fastifyMs: Number(selectedServer.startupMs.toFixed(3)),
      totalMs: Number((selectedMode.validatorStartupMs + selectedServer.startupMs).toFixed(3)),
    },
  };

  if (modeName === "cachedPlain") {
    const uncachedMode = createUncachedMode();
    const uncachedServer = await createBenchmarkServer(uncachedMode);
    await verifyFastifyBoundary(uncachedServer.app);
    measuredModes.push(uncachedMode);
    servers.set(uncachedMode.name, uncachedServer);
    startup.uncachedPlain = {
      validatorMs: 0,
      fastifyMs: Number(uncachedServer.startupMs.toFixed(3)),
      totalMs: Number(uncachedServer.startupMs.toFixed(3)),
    };
  }

  const validator: Partial<Record<ModeName, Percentiles>> = {};
  const handler: Partial<Record<ModeName, Percentiles>> = {};
  const fastifyInject: Partial<Record<ModeName, Percentiles>> = {};
  for (const mode of measuredModes) {
    const server = servers.get(mode.name);
    if (server === undefined) {
      throw new Error(`${mode.name} Fastify server가 없습니다`);
    }
    validator[mode.name] = measureSync(mode.validate);
    handler[mode.name] = measureSync(server.handler);
    fastifyInject[mode.name] = await measureFastifyInject(server.app);
  }

  for (const server of servers.values()) {
    await server.app.close();
  }

  console.log(
    JSON.stringify({
      runIndex: Number.parseInt(process.env.BENCHMARK_RUN_INDEX ?? "0", 10),
      mode: modeName,
      environment: {
        node: process.version,
        zod: "4.3.6",
        zodCompiler: "1.23.6",
        schemaCount: 1,
        validPercent: 75,
        syncWarmupIterations: SYNC_WARMUP_ITERATIONS,
        syncSamples: SYNC_SAMPLE_COUNT,
        operationsPerSyncSample: SYNC_BATCH_SIZE,
        injectWarmupIterations: INJECT_WARMUP_ITERATIONS,
        injectSamples: INJECT_SAMPLE_COUNT,
      },
      parity: true,
      fixtureAssertions: { validAccepted: true, invalidRejected: true },
      results: { validator, handler, fastifyInject },
      startup,
      process: {
        startupMs: Number(processStartupMs.toFixed(3)),
        rssAtStartBytes,
        rssReadyBytes,
      },
      resultChecksum,
    }),
  );
}

if (selectedModeName !== undefined) {
  await runBenchmark(selectedModeName);
}
