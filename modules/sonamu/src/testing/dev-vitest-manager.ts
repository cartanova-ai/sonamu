import type { UserConfig as ViteUserConfig } from "vite";
import type {
  CliOptions,
  TestCase,
  TestModule,
  TestRunResult,
  TestSpecification,
  TestSuite,
  Vitest,
} from "vitest/node";
import type { SerializedTrace } from "../naite/naite";

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
  counts: { total: number; passed: number; failed: number; skipped: number };
  error: { message: string; stack?: string } | null;
  traces: SerializedTrace[];
  children: TestCaseResult[];
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

export type TestEventListener = (event: string, data: unknown) => void;

type QueueEntry = {
  task: () => Promise<RunResult>;
  resolve: (result: RunResult) => void;
  reject: (error: unknown) => void;
};

export class DevVitestManager {
  private vitest: Vitest | null = null;
  private running = false;
  private lastRunAt: string | null = null;
  private queue: QueueEntry[] = [];
  private processing = false;
  private closed = false;
  private eventListeners = new Set<TestEventListener>();

  addEventListener(listener: TestEventListener): void {
    this.eventListeners.add(listener);
  }

  removeEventListener(listener: TestEventListener): void {
    this.eventListeners.delete(listener);
  }

  emitEvent(event: string, data: unknown): void {
    for (const listener of this.eventListeners) {
      listener(event, data);
    }
  }

  async start(vitestConfigPath?: string): Promise<void> {
    // 이미 시작된 경우 중복 초기화를 방지
    if (this.vitest) {
      return;
    }

    const { createVitest } = await import("vitest/node");

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

    const vitest = await createVitest("test", cliOptions, viteOverrides);
    try {
      await vitest.init();
    } catch (err) {
      await vitest.close();
      throw err;
    }

    this.vitest = vitest;
    this.vitest.onFilterWatchedSpecification((_spec) => false);
    this.closed = false;
  }

  async run(opts: { files?: string[]; pattern?: string }): Promise<RunResult> {
    if (this.closed) {
      throw new Error("DevVitestManager is already shut down");
    }
    if (!this.vitest) {
      throw new Error("DevVitestManager is not started");
    }

    return new Promise<RunResult>((resolve, reject) => {
      const task = () => this.executeRun(opts);
      this.queue.push({ task, resolve, reject });
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
   * syncFromWatcher에서 호출되어 다음 테스트 실행 시 최신 코드를 사용하도록 합니다.
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
          entry.reject(err);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async executeRun(opts: { files?: string[]; pattern?: string }): Promise<RunResult> {
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

      const allTestsRun = !opts.files || opts.files.length === 0;
      const runResult: TestRunResult = await vitest.runTestSpecifications(specs, allTestsRun);

      const durationMs = Date.now() - startTime;
      this.lastRunAt = new Date().toISOString();

      const specModuleIds = new Set(specs.map((s) => s.moduleId));
      return this.collectResults(runResult, durationMs, specModuleIds);
    } finally {
      if (opts.pattern) {
        vitest.resetGlobalTestNamePattern();
      }
      this.running = false;
    }
  }

  private collectResults(
    runResult: TestRunResult,
    durationMs: number,
    specModuleIds: Set<string>,
  ): RunResult {
    const results: TestCaseResult[] = [];

    for (const testModule of runResult.testModules) {
      if (!specModuleIds.has(testModule.moduleId)) continue;
      results.push(this.buildFileNode(testModule));
    }

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
      traces = raw.filter(isSerializedTrace);
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

function countFromState(state: TestState): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
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

function aggregateCounts(children: TestCaseResult[]): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
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

function isSerializedTrace(value: unknown): value is SerializedTrace {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === "string" &&
    typeof v.filePath === "string" &&
    typeof v.lineNumber === "number" &&
    typeof v.at === "string" &&
    "value" in v
  );
}
