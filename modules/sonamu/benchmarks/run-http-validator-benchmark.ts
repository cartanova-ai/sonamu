import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { isNumberValue, isObjectValue, isStringValue } from "../src/utils/runtime-value";

type ModeName = "uncachedPlain" | "cachedPlain" | "eagerJit" | "aot";
type IsolatedModeName = Exclude<ModeName, "uncachedPlain">;
type LayerName = "validator" | "handler" | "fastifyInject";
type Percentiles = { p50Ns: number; p95Ns: number };
type StartupResult = { validatorMs: number; fastifyMs: number; totalMs: number };
type ProcessResult = { startupMs: number; rssAtStartBytes: number; rssReadyBytes: number };
type BenchmarkEnvironment = {
  node: string;
  zod: string;
  zodCompiler: string;
  schemaCount: number;
  validPercent: number;
  syncWarmupIterations: number;
  syncSamples: number;
  operationsPerSyncSample: number;
  injectWarmupIterations: number;
  injectSamples: number;
};
type ModeRunResult = {
  runIndex: number;
  mode: IsolatedModeName;
  environment: BenchmarkEnvironment;
  parity: boolean;
  fixtureAssertions: { validAccepted: boolean; invalidRejected: boolean };
  results: Record<LayerName, Partial<Record<ModeName, Percentiles>>>;
  startup: Partial<Record<ModeName, StartupResult>>;
  process: ProcessResult;
  resultChecksum: number;
};
type CombinedRunResult = {
  runIndex: number;
  environment: BenchmarkEnvironment;
  parity: boolean;
  fixtureAssertions: { validAccepted: boolean; invalidRejected: boolean };
  results: Record<LayerName, Partial<Record<ModeName, Percentiles>>>;
  startup: Partial<Record<ModeName, StartupResult>>;
  process: Partial<Record<IsolatedModeName, ProcessResult>>;
};
type CombinedRunAccumulator = Omit<CombinedRunResult, "environment"> & {
  environment?: BenchmarkEnvironment;
};

const RUN_COUNT = 5;
const modeNames: ModeName[] = ["uncachedPlain", "cachedPlain", "eagerJit", "aot"];
const isolatedModeNames: IsolatedModeName[] = ["cachedPlain", "eagerJit", "aot"];
const layerNames: LayerName[] = ["validator", "handler", "fastifyInject"];
const packageRoot = path.resolve(import.meta.dirname, "..");
const artifactPath = path.join(packageRoot, "benchmarks/dist/http-validator.bench.mjs");
const artifactPaths = [
  artifactPath,
  path.join(packageRoot, "benchmarks/dist/http-validator-aot.bench.mjs"),
  path.join(packageRoot, "benchmarks/dist/http-validator-schema.mjs"),
];

function isNonNullObject<Value>(value: Value): value is Value & object {
  return isObjectValue(value) && value !== null;
}

function isBenchmarkEnvironment<Value>(value: Value): value is Value & BenchmarkEnvironment {
  if (!isNonNullObject(value)) {
    return false;
  }
  return (
    "node" in value &&
    isStringValue(value.node) &&
    "zod" in value &&
    isStringValue(value.zod) &&
    "zodCompiler" in value &&
    isStringValue(value.zodCompiler) &&
    "schemaCount" in value &&
    isNumberValue(value.schemaCount) &&
    "validPercent" in value &&
    isNumberValue(value.validPercent) &&
    "syncWarmupIterations" in value &&
    isNumberValue(value.syncWarmupIterations) &&
    "syncSamples" in value &&
    isNumberValue(value.syncSamples) &&
    "operationsPerSyncSample" in value &&
    isNumberValue(value.operationsPerSyncSample) &&
    "injectWarmupIterations" in value &&
    isNumberValue(value.injectWarmupIterations) &&
    "injectSamples" in value &&
    isNumberValue(value.injectSamples)
  );
}

function isIsolatedModeName<Value>(value: Value): value is Value & IsolatedModeName {
  return value === "cachedPlain" || value === "eagerJit" || value === "aot";
}

function isModeRunResult<Value>(value: Value): value is Value & ModeRunResult {
  if (
    !isNonNullObject(value) ||
    !("results" in value) ||
    !isNonNullObject(value.results) ||
    !("startup" in value) ||
    !isNonNullObject(value.startup)
  ) {
    return false;
  }
  return (
    "runIndex" in value &&
    isNumberValue(value.runIndex) &&
    "mode" in value &&
    isIsolatedModeName(value.mode) &&
    "environment" in value &&
    isBenchmarkEnvironment(value.environment) &&
    "parity" in value &&
    value.parity === true &&
    "fixtureAssertions" in value &&
    isNonNullObject(value.fixtureAssertions) &&
    "validAccepted" in value.fixtureAssertions &&
    value.fixtureAssertions.validAccepted === true &&
    "invalidRejected" in value.fixtureAssertions &&
    value.fixtureAssertions.invalidRejected === true &&
    "process" in value &&
    isNonNullObject(value.process) &&
    "startupMs" in value.process &&
    isNumberValue(value.process.startupMs) &&
    "rssAtStartBytes" in value.process &&
    isNumberValue(value.process.rssAtStartBytes) &&
    "rssReadyBytes" in value.process &&
    isNumberValue(value.process.rssReadyBytes) &&
    "resultChecksum" in value &&
    isNumberValue(value.resultChecksum)
  );
}

function parseRunOutput(output: string): ModeRunResult {
  const outputLine = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);
  if (outputLine === undefined) {
    throw new Error("benchmark child process가 결과를 출력하지 않았습니다");
  }
  const parsed: unknown = JSON.parse(outputLine);
  if (!isModeRunResult(parsed)) {
    throw new Error(`benchmark child process 결과가 올바르지 않습니다: ${outputLine}`);
  }
  return parsed;
}

function median(values: number[]): number {
  const sorted = values.toSorted((left, right) => left - right);
  const value = sorted[Math.floor(sorted.length / 2)];
  if (value === undefined) {
    throw new Error("median을 계산할 benchmark 결과가 없습니다");
  }
  return value;
}

function improvementPercent(baseline: number, candidate: number): number {
  return Number((((baseline - candidate) / baseline) * 100).toFixed(1));
}

function getPercentiles(
  run: CombinedRunResult,
  layerName: LayerName,
  modeName: ModeName,
): Percentiles {
  const result = run.results[layerName][modeName];
  if (result === undefined) {
    throw new Error(`${run.runIndex}번 run에 ${layerName}/${modeName} 결과가 없습니다`);
  }
  return result;
}

function getStartup(run: CombinedRunResult, modeName: ModeName): StartupResult {
  const result = run.startup[modeName];
  if (result === undefined) {
    throw new Error(`${run.runIndex}번 run에 ${modeName} startup 결과가 없습니다`);
  }
  return result;
}

function getProcess(run: CombinedRunResult, modeName: IsolatedModeName): ProcessResult {
  const result = run.process[modeName];
  if (result === undefined) {
    throw new Error(`${run.runIndex}번 run에 ${modeName} process 결과가 없습니다`);
  }
  return result;
}

const buildStartedAt = performance.now();
execFileSync("pnpm", ["exec", "tsdown", "--config", "benchmarks/tsdown.config.ts"], {
  cwd: packageRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const buildTimeMs = Number((performance.now() - buildStartedAt).toFixed(3));
const artifactBytes = artifactPaths.reduce((total, filePath) => total + statSync(filePath).size, 0);

const runs: CombinedRunResult[] = [];
for (let runIndex = 0; runIndex < RUN_COUNT; runIndex++) {
  const combined: CombinedRunAccumulator = {
    runIndex,
    parity: true,
    fixtureAssertions: { validAccepted: true, invalidRejected: true },
    results: { validator: {}, handler: {}, fastifyInject: {} },
    startup: {},
    process: {},
  };
  for (const modeName of isolatedModeNames) {
    const output = execFileSync(process.execPath, [artifactPath], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BENCHMARK_MODE: modeName,
        BENCHMARK_RUN_INDEX: String(runIndex),
      },
    });
    const modeRun = parseRunOutput(output);
    combined.environment = modeRun.environment;
    combined.parity &&= modeRun.parity;
    combined.fixtureAssertions.validAccepted &&= modeRun.fixtureAssertions.validAccepted;
    combined.fixtureAssertions.invalidRejected &&= modeRun.fixtureAssertions.invalidRejected;
    for (const layerName of layerNames) {
      Object.assign(combined.results[layerName], modeRun.results[layerName]);
    }
    Object.assign(combined.startup, modeRun.startup);
    combined.process[modeName] = modeRun.process;
  }
  if (combined.environment === undefined) {
    throw new Error(`${runIndex}번 run에 benchmark 환경 정보가 없습니다`);
  }
  runs.push({ ...combined, environment: combined.environment });
}

const medianResults = Object.fromEntries(
  layerNames.map((layerName) => [
    layerName,
    Object.fromEntries(
      modeNames.map((modeName) => [
        modeName,
        {
          p50Ns: median(runs.map((run) => getPercentiles(run, layerName, modeName).p50Ns)),
          p95Ns: median(runs.map((run) => getPercentiles(run, layerName, modeName).p95Ns)),
        },
      ]),
    ),
  ]),
);

const p95ImprovementPercent = Object.fromEntries(
  layerNames.map((layerName) => {
    const layer = medianResults[layerName];
    return [
      layerName,
      {
        eagerJit: improvementPercent(layer.cachedPlain.p95Ns, layer.eagerJit.p95Ns),
        aot: improvementPercent(layer.cachedPlain.p95Ns, layer.aot.p95Ns),
      },
    ];
  }),
);

const medianStartup = Object.fromEntries(
  modeNames.map((modeName) => [
    modeName,
    {
      validatorMs: median(runs.map((run) => getStartup(run, modeName).validatorMs)),
      fastifyMs: median(runs.map((run) => getStartup(run, modeName).fastifyMs)),
      totalMs: median(runs.map((run) => getStartup(run, modeName).totalMs)),
    },
  ]),
);
const medianProcess = Object.fromEntries(
  isolatedModeNames.map((modeName) => [
    modeName,
    {
      startupMs: median(runs.map((run) => getProcess(run, modeName).startupMs)),
      rssAtStartBytes: median(runs.map((run) => getProcess(run, modeName).rssAtStartBytes)),
      rssReadyBytes: median(runs.map((run) => getProcess(run, modeName).rssReadyBytes)),
    },
  ]),
);

console.log(
  JSON.stringify(
    {
      runCount: RUN_COUNT,
      build: { timeMs: buildTimeMs, artifactBytes },
      environment: runs[0]?.environment,
      parity: runs.every(
        (run) =>
          run.parity &&
          run.fixtureAssertions.validAccepted &&
          run.fixtureAssertions.invalidRejected,
      ),
      runs,
      median: {
        results: medianResults,
        p95ImprovementPercent,
        startup: medianStartup,
        process: medianProcess,
      },
      gates: {
        minimumP95ImprovementPercent: 10,
        validator: {
          eagerJit: p95ImprovementPercent.validator.eagerJit >= 10,
          aot: p95ImprovementPercent.validator.aot >= 10,
        },
        handler: {
          eagerJit: p95ImprovementPercent.handler.eagerJit >= 10,
          aot: p95ImprovementPercent.handler.aot >= 10,
        },
        fastifyInject: {
          eagerJit: p95ImprovementPercent.fastifyInject.eagerJit >= 10,
          aot: p95ImprovementPercent.fastifyInject.aot >= 10,
        },
      },
    },
    undefined,
    2,
  ),
);
