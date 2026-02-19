import type { UserConfig as ViteUserConfig } from "vite";
import type {
  CliOptions,
  TestCase,
  TestModule,
  TestRunResult,
  TestSpecification,
  Vitest,
} from "vitest/node";

export type RunResult = {
  ok: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  failed: FailedTest[];
};

export type FailedTest = {
  name: string;
  file: string;
  error: string;
};

export type ManagerStatus = {
  ready: boolean;
  running: boolean;
  lastRunAt: string | null;
};

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

    this.vitest = await createVitest("test", cliOptions, viteOverrides);
    await this.vitest.init();

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

  async shutdown(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

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
    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const failedTests: FailedTest[] = [];

    for (const testModule of runResult.testModules) {
      if (!specModuleIds.has(testModule.moduleId)) continue;
      this.collectFromModule(testModule, failedTests, (counts) => {
        total += counts.total;
        passed += counts.passed;
        failed += counts.failed;
        skipped += counts.skipped;
      });
    }

    return {
      ok: failed === 0,
      summary: { total, passed, failed, skipped, durationMs },
      failed: failedTests,
    };
  }

  private collectFromModule(
    testModule: TestModule,
    failedTests: FailedTest[],
    addCounts: (counts: { total: number; passed: number; failed: number; skipped: number }) => void,
  ): void {
    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const testCase of testModule.children.allTests()) {
      total++;
      const result = testCase.result();

      if (result.state === "passed") {
        passed++;
      } else if (result.state === "failed") {
        failed++;
        failedTests.push(this.extractFailedTest(testCase, testModule));
      } else {
        // pending/skipped 상태는 skipped로 집계
        skipped++;
      }
    }

    addCounts({ total, passed, failed, skipped });
  }

  private extractFailedTest(testCase: TestCase, testModule: TestModule): FailedTest {
    const result = testCase.result();
    let errorMessage = "Unknown error";

    if (result.state === "failed" && result.errors.length > 0) {
      const firstError = result.errors[0];
      errorMessage = firstError.message ?? String(firstError);
    }

    return {
      name: testCase.fullName,
      file: testModule.moduleId,
      error: errorMessage,
    };
  }
}
