import { type UserConfig as ViteUserConfig } from "vite";
import {
  type CliOptions,
  type Reporter,
  type TestCase,
  type TestModule,
  type TestRunResult,
  type TestSpecification,
  type TestSuite,
  type Vitest,
} from "vitest/node";
import { z } from "zod";

import { type SerializedTrace } from "../naite/naite";

// 테스트 한 건의 trace 모음
export type TestNodeKind = "file" | "suite" | "test";
export type TestState = "passed" | "failed" | "skipped" | "todo" | "running" | "unknown";

export type TestCaseResult = {
  id: string;
  kind: TestNodeKind;
  name: string;
  fullName: string;
  file: string;
  state: TestState;
  durationMs: number | null;
  counts: TestCounts;
  error: { message: string; stack?: string } | null;
  traces: SerializedTrace[];
  children: TestCaseResult[];
};

export type TestCounts = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
};

export type RunResult = {
  ok: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  results: TestCaseResult[];
};

export type ManagerStatus = {
  ready: boolean;
  running: boolean;
  lastRunAt: string | null;
};

export type TestEventPayload =
  | { schemaVersion: number; runId: string; queuedAt: string; request: RunRequest }
  | { schemaVersion: number; runId: string; startedAt: string }
  | {
      schemaVersion: number;
      runId: string;
      startedAt: string;
      finishedAt: string;
      result: RunResult;
    }
  | {
      schemaVersion: number;
      runId: string;
      finishedAt: string;
      error: { message: string; stack?: string };
    }
  | {
      schemaVersion: 1;
      runId: string;
      startedAt: string;
      at: string;
      kind: TestNodeKind;
      phase: "ready" | "result";
      fileId: string;
      nodeId: string;
      parentId: string | null;
      node: TestCaseResult;
    };

export type RunRequest = { files?: string[]; pattern?: string };
export type TestEventListener = (event: string, data: TestEventPayload) => void;

type QueueEntry = {
  runId: string;
  task: () => Promise<RunResult>;
  resolve: (result: RunResult) => void;
  reject: (error: Error) => void;
};

export type ManagedVitest = Pick<
  Vitest,
  | "standalone"
  | "close"
  | "onFilterWatchedSpecification"
  | "invalidateFile"
  | "globTestSpecifications"
  | "runTestSpecifications"
  | "setGlobalTestNamePattern"
  | "resetGlobalTestNamePattern"
>;

export type DevVitestFactory = (
  mode: "test",
  options: CliOptions,
  viteOverrides: ViteUserConfig,
) => Promise<ManagedVitest>;

export class DevVitestManager {
  private vitest: ManagedVitest | null = null;
  private running = false;
  private lastRunAt: string | null = null;
  private queue: QueueEntry[] = [];
  private processing = false;
  private closed = false;
  private eventListeners = new Set<TestEventListener>();
  private currentRunContext: {
    runId: string;
    startedAt: string;
    specModuleIds: Set<string>;
  } | null = null;

  constructor(private readonly vitestFactory?: DevVitestFactory) {}

  addEventListener(listener: TestEventListener): void {
    this.eventListeners.add(listener);
  }

  removeEventListener(listener: TestEventListener): void {
    this.eventListeners.delete(listener);
  }

  emitEvent(event: string, data: TestEventPayload): void {
    for (const listener of this.eventListeners) {
      listener(event, data);
    }
  }

  async start(vitestConfigPath?: string): Promise<void> {
    // 이미 시작된 경우 중복 초기화를 방지
    if (this.vitest) {
      return;
    }

    const createVitest =
      this.vitestFactory ??
      (async (...args: Parameters<DevVitestFactory>) => {
        const vitestModule = await import("vitest/node");
        return vitestModule.createVitest(...args);
      });

    const viteOverrides: ViteUserConfig = {
      server: { watch: null },
    };

    const cliOptions: CliOptions = {
      watch: true,
      standalone: true,
      forceRerunTriggers: [],
      config: vitestConfigPath,
      env: {
        NODE_ENV: "test",
      },
    };

    const realtimeReporter = this.createRealtimeProgressReporter();
    viteOverrides.plugins = [
      ...(viteOverrides.plugins ?? []),
      {
        name: "sonamu-realtime-reporter",
        configureVitest({ vitest: vitestInstance }: { vitest: Vitest }) {
          const reporters = vitestInstance.config.reporters;
          if (!reporters.includes(realtimeReporter)) {
            reporters.push(realtimeReporter);
          }
        },
      },
    ];

    const vitest = await createVitest("test", cliOptions, viteOverrides);
    try {
      await vitest.standalone();
    } catch (err) {
      await vitest.close();
      throw err;
    }

    this.vitest = vitest;
    this.vitest.onFilterWatchedSpecification((_spec) => false);
    this.closed = false;
  }

  async run(opts: { files?: string[]; pattern?: string }, runId: string): Promise<RunResult> {
    if (this.closed) {
      throw new Error("DevVitestManager is already shut down");
    }
    if (!this.vitest) {
      throw new Error("DevVitestManager is not started");
    }

    return new Promise<RunResult>((resolve, reject) => {
      const task = () => this.executeRun(opts, runId);
      this.queue.push({ runId, task, resolve, reject });
      this.processQueue();
    });
  }

  getStatus(): ManagerStatus {
    return {
      ready: this.vitest !== null && !this.closed,
      running: this.running,
      lastRunAt: this.lastRunAt,
    };
  }

  /**
   * 변경된 파일을 Vitest 모듈 그래프에서 무효화합니다.
   * hmrAndSync에서 호출되어 다음 테스트 실행 시 최신 코드를 사용하도록 합니다.
   */
  invalidateFiles(filePaths: string[]): void {
    if (!this.vitest || this.closed) {
      return;
    }
    for (const filePath of filePaths) {
      this.vitest.invalidateFile(filePath);
    }
  }

  async shutdown(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    // 큐에 남은 작업들을 reject하여 호출자가 영구 대기하지 않도록 정리
    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry) {
        entry.reject(new Error("DevVitestManager is being shut down"));
      }
    }

    this.eventListeners.clear();

    if (this.vitest) {
      await this.vitest.close();
      this.vitest = null;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift();
        if (!entry) break;
        if (this.closed) {
          entry.reject(new Error("DevVitestManager is already shut down"));
          continue;
        }

        try {
          const result = await entry.task();
          entry.resolve(result);
        } catch (err) {
          entry.reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async executeRun(
    opts: { files?: string[]; pattern?: string },
    runId: string,
  ): Promise<RunResult> {
    const vitest = this.vitest;
    if (!vitest) {
      throw new Error("DevVitestManager is not started");
    }

    this.running = true;
    const startTime = Date.now();

    if (opts.pattern) {
      vitest.setGlobalTestNamePattern(opts.pattern);
    }

    try {
      const specs: TestSpecification[] = opts.files
        ? await vitest.globTestSpecifications(opts.files)
        : await vitest.globTestSpecifications();

      const specModuleIds = new Set(specs.map((s) => s.moduleId));
      // routes에서 생성한 runId를 그대로 사용하여 runStarted/runNodeProgress/runCompleted 간 일관성 보장
      this.currentRunContext = {
        runId,
        startedAt: new Date().toISOString(),
        specModuleIds,
      };

      const allTestsRun = !opts.files || opts.files.length === 0;
      const runResult: TestRunResult = await vitest.runTestSpecifications(specs, allTestsRun);

      const durationMs = Date.now() - startTime;
      this.lastRunAt = new Date().toISOString();

      return this.collectResults(runResult, durationMs, specModuleIds);
    } finally {
      this.currentRunContext = null;
      if (opts.pattern) {
        vitest.resetGlobalTestNamePattern();
      }
      this.running = false;
    }
  }

  private createRealtimeProgressReporter(): Reporter {
    const emitProgress = (
      kind: "file" | "suite" | "test",
      phase: "ready" | "result",
      fileId: string,
      nodeId: string,
      parentId: string | null,
      node: TestCaseResult,
    ) => {
      const ctx = this.currentRunContext;
      if (!ctx) return;
      this.emitEvent("runNodeProgress", {
        schemaVersion: 1,
        runId: ctx.runId,
        startedAt: ctx.startedAt,
        at: new Date().toISOString(),
        kind,
        phase,
        fileId,
        nodeId,
        parentId,
        node,
      });
    };

    return {
      onTestModuleQueued: (testModule: TestModule) => {
        const ctx = this.currentRunContext;
        if (!ctx || !ctx.specModuleIds.has(testModule.moduleId)) return;
        const fileId = testModule.moduleId;
        emitProgress(
          "file",
          "ready",
          fileId,
          fileId,
          null,
          this.buildFileProgressNode(testModule, "ready"),
        );
      },
      onTestModuleEnd: (testModule: TestModule) => {
        const ctx = this.currentRunContext;
        if (!ctx || !ctx.specModuleIds.has(testModule.moduleId)) return;
        const fileId = testModule.moduleId;
        emitProgress("file", "result", fileId, fileId, null, this.buildFileNode(testModule));
      },
      onTestSuiteReady: (testSuite: TestSuite) => {
        const ctx = this.currentRunContext;
        if (!ctx || !ctx.specModuleIds.has(testSuite.module.moduleId)) return;
        const fileId = testSuite.module.moduleId;
        const nodeId = `${fileId}::${testSuite.fullName}`;
        const parentId = this.resolveSuiteParentId(testSuite);
        emitProgress(
          "suite",
          "ready",
          fileId,
          nodeId,
          parentId,
          this.buildSuiteProgressNode(testSuite, "ready"),
        );
      },
      onTestSuiteResult: (testSuite: TestSuite) => {
        const ctx = this.currentRunContext;
        if (!ctx || !ctx.specModuleIds.has(testSuite.module.moduleId)) return;
        const fileId = testSuite.module.moduleId;
        const nodeId = `${fileId}::${testSuite.fullName}`;
        const parentId = this.resolveSuiteParentId(testSuite);
        emitProgress(
          "suite",
          "result",
          fileId,
          nodeId,
          parentId,
          this.buildSuiteNode(testSuite, fileId),
        );
      },
      onTestCaseReady: (testCase: TestCase) => {
        const ctx = this.currentRunContext;
        if (!ctx || !ctx.specModuleIds.has(testCase.module.moduleId)) return;
        const fileId = testCase.module.moduleId;
        const nodeId = `${fileId}::${testCase.fullName}`;
        const parentId = this.resolveTestParentId(testCase);
        emitProgress(
          "test",
          "ready",
          fileId,
          nodeId,
          parentId,
          this.buildTestProgressNode(testCase, "ready"),
        );
      },
      onTestCaseResult: (testCase: TestCase) => {
        const ctx = this.currentRunContext;
        if (!ctx || !ctx.specModuleIds.has(testCase.module.moduleId)) return;
        const fileId = testCase.module.moduleId;
        const nodeId = `${fileId}::${testCase.fullName}`;
        const parentId = this.resolveTestParentId(testCase);
        emitProgress(
          "test",
          "result",
          fileId,
          nodeId,
          parentId,
          this.buildTestNode(testCase, fileId),
        );
      },
    };
  }

  private buildFileProgressNode(testModule: TestModule, _phase: "ready"): TestCaseResult {
    return {
      id: testModule.moduleId,
      kind: "file",
      name: testModule.moduleId,
      fullName: testModule.moduleId,
      file: testModule.moduleId,
      state: "running",
      durationMs: null,
      counts: { total: 0, passed: 0, failed: 0, skipped: 0 },
      error: null,
      traces: [],
      children: [],
    };
  }

  private buildSuiteProgressNode(testSuite: TestSuite, _phase: "ready"): TestCaseResult {
    const fileId = testSuite.module.moduleId;
    return {
      id: `${fileId}::${testSuite.fullName}`,
      kind: "suite",
      name: testSuite.name,
      fullName: testSuite.fullName,
      file: fileId,
      state: "running",
      durationMs: null,
      counts: { total: 0, passed: 0, failed: 0, skipped: 0 },
      error: null,
      traces: [],
      children: [],
    };
  }

  private buildTestProgressNode(testCase: TestCase, _phase: "ready"): TestCaseResult {
    const fileId = testCase.module.moduleId;
    return {
      id: `${fileId}::${testCase.fullName}`,
      kind: "test",
      name: testCase.name,
      fullName: testCase.fullName,
      file: fileId,
      state: "running",
      durationMs: null,
      counts: { total: 1, passed: 0, failed: 0, skipped: 0 },
      error: null,
      traces: [],
      children: [],
    };
  }

  private resolveSuiteParentId(testSuite: TestSuite): string {
    const parent = testSuite.parent;
    if (parent.type === "suite") {
      return `${testSuite.module.moduleId}::${parent.fullName}`;
    }
    return testSuite.module.moduleId;
  }

  private resolveTestParentId(testCase: TestCase): string {
    const parent = testCase.parent;
    if (parent.type === "suite") {
      return `${testCase.module.moduleId}::${parent.fullName}`;
    }
    return testCase.module.moduleId;
  }

  private collectResults(
    runResult: TestRunResult,
    durationMs: number,
    specModuleIds: Set<string>,
  ): RunResult {
    const resultsByFile = new Map<string, TestCaseResult>();

    for (const testModule of runResult.testModules) {
      if (!specModuleIds.has(testModule.moduleId)) continue;
      const nextResult = this.buildFileNode(testModule);
      const existingResult = resultsByFile.get(nextResult.id);

      if (!existingResult) {
        resultsByFile.set(nextResult.id, nextResult);
        continue;
      }

      const existingScore = getResultCompletenessScore(existingResult);
      const nextScore = getResultCompletenessScore(nextResult);
      if (nextScore >= existingScore) {
        resultsByFile.set(nextResult.id, nextResult);
      }
    }

    const results = Array.from(resultsByFile.values());
    const summary = aggregateCounts(results);

    return {
      ok: summary.failed === 0,
      summary: { ...summary, durationMs },
      results,
    };
  }

  private buildFileNode(testModule: TestModule): TestCaseResult {
    const file = testModule.moduleId;
    const children = this.buildChildNodes(testModule, file);
    const counts = aggregateCounts(children);
    const moduleState = testModule.state();
    const diagnostic = testModule.diagnostic();

    return {
      id: testModule.moduleId,
      kind: "file",
      name: testModule.moduleId,
      fullName: testModule.moduleId,
      file,
      state: mapModuleState(moduleState),
      durationMs: diagnostic.duration > 0 ? diagnostic.duration : null,
      counts,
      error: null,
      traces: [],
      children,
    };
  }

  private buildChildNodes(parent: TestModule | TestSuite, file: string): TestCaseResult[] {
    const result: TestCaseResult[] = [];
    for (const child of parent.children) {
      if (child.type === "suite") {
        result.push(this.buildSuiteNode(child, file));
      } else {
        result.push(this.buildTestNode(child, file));
      }
    }
    return result;
  }

  private buildSuiteNode(suite: TestSuite, file: string): TestCaseResult {
    const children = this.buildChildNodes(suite, file);
    const counts = aggregateCounts(children);
    const suiteState = suite.state();

    return {
      id: `${file}::${suite.fullName}`,
      kind: "suite",
      name: suite.name,
      fullName: suite.fullName,
      file,
      state: mapSuiteState(suiteState),
      durationMs: null,
      counts,
      error: null,
      traces: [],
      children,
    };
  }

  private buildTestNode(testCase: TestCase, file: string): TestCaseResult {
    const result = testCase.result();
    const diagnostic = testCase.diagnostic();
    const state = mapTestResult(result, testCase.options.mode);

    let error: { message: string; stack?: string } | null = null;
    if (result.state === "failed" && result.errors.length > 0) {
      const firstError = result.errors[0];
      error = {
        message: firstError.message ?? String(firstError),
        stack: firstError.stack,
      };
    }

    const raw = testCase.meta().traces;
    let traces: SerializedTrace[] = [];
    if (Array.isArray(raw) && raw.length > 0) {
      traces = parseSerializedTraces(raw);
    }

    return {
      id: `${file}::${testCase.fullName}`,
      kind: "test",
      name: testCase.name,
      fullName: testCase.fullName,
      file,
      state,
      durationMs: diagnostic ? diagnostic.duration : null,
      counts: countFromState(state),
      error,
      traces,
      children: [],
    };
  }
}

function mapModuleState(state: "skipped" | "pending" | "failed" | "passed" | "queued"): TestState {
  switch (state) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "pending":
    case "queued":
      return "running";
    default:
      return "unknown";
  }
}

function mapSuiteState(state: "skipped" | "pending" | "failed" | "passed"): TestState {
  switch (state) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "pending":
      return "running";
    default:
      return "unknown";
  }
}

function mapTestResult(
  result: ReturnType<TestCase["result"]>,
  mode: "run" | "only" | "skip" | "todo",
): TestState {
  switch (result.state) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
      return mode === "todo" ? "todo" : "skipped";
    case "pending":
      return "running";
    default:
      return "unknown";
  }
}

function countFromState(state: TestState): TestCounts {
  switch (state) {
    case "passed":
      return { total: 1, passed: 1, failed: 0, skipped: 0 };
    case "failed":
      return { total: 1, passed: 0, failed: 1, skipped: 0 };
    case "skipped":
    case "todo":
      return { total: 1, passed: 0, failed: 0, skipped: 1 };
    default:
      // running/unknown 상태도 total에 포함하여 파일 노드 counts.total이 하위 합계와 일치하도록 함
      return { total: 1, passed: 0, failed: 0, skipped: 0 };
  }
}

function aggregateCounts(children: TestCaseResult[]): TestCounts {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const child of children) {
    total += child.counts.total;
    passed += child.counts.passed;
    failed += child.counts.failed;
    skipped += child.counts.skipped;
  }
  return { total, passed, failed, skipped };
}

function getResultCompletenessScore(node: TestCaseResult): number {
  let score = 0;
  // 테스트 수가 더 많은 결과를 우선하여 중복 파일 병합 시 정보 손실을 줄입니다.
  score += node.counts.total * 1000;
  score += node.children.length * 100;
  if (node.durationMs !== null) score += 10;

  switch (node.state) {
    case "failed":
      score += 5;
      break;
    case "passed":
      score += 4;
      break;
    case "skipped":
      score += 3;
      break;
    case "todo":
      score += 2;
      break;
    case "running":
      score += 1;
      break;
    case "unknown":
      break;
    default:
      break;
  }

  return score;
}

const serializedTraceSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  filePath: z.string(),
  lineNumber: z.number(),
  at: z.string(),
});

type SerializedTraceCandidate = object | string | number | boolean | bigint | symbol | null;

function parseSerializedTraces(values: readonly SerializedTraceCandidate[]): SerializedTrace[] {
  return values.flatMap((value) => {
    const parsed = serializedTraceSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}
