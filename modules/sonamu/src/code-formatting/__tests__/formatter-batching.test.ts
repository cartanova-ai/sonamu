import { access, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as processUtils from "../../utils/process-utils";
import { formatCode } from "../index";

const OXLINT_FLAGS = ["--fix", "--fix-suggestions", "--type-aware"];
const FIXED_SUFFIX = "// oxlint 적용\n";

let testDirectory = "";

function createGate() {
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, promise };
}

function extractTemporaryFiles(args: string[]): string[] {
  return args.slice(OXLINT_FLAGS.length);
}

async function listTemporaryFiles(): Promise<string[]> {
  const entries = await readdir(testDirectory, { withFileTypes: true });
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith(".sonamu-") && entry.name.endsWith(".ts"),
    )
    .map((entry) => path.join(testDirectory, entry.name));
}

async function waitForTemporaryFiles(count: number): Promise<void> {
  await vi.waitFor(async () => {
    const paths = await listTemporaryFiles();
    expect(paths).toHaveLength(count);
    const contents = await Promise.all(paths.map((filePath) => readFile(filePath, "utf8")));
    contents.forEach((content) => expect(content.length).toBeGreaterThan(0));
  });

  // 완료된 파일 쓰기의 후속 continuation까지 실행해 대기열 구성을 확정합니다.
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function applyFixes(args: string[]): Promise<void> {
  await Promise.all(
    extractTemporaryFiles(args).map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      await writeFile(filePath, `${source}${FIXED_SUFFIX}`, "utf8");
    }),
  );
}

async function expectTemporaryFilesRemoved(filePaths: string[]): Promise<void> {
  await Promise.all(
    filePaths.map(async (filePath) => {
      await expect(access(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    }),
  );
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "development");
  testDirectory = await mkdtemp(path.join(os.tmpdir(), "sonamu-formatter-batching-"));
  vi.spyOn(process, "cwd").mockReturnValue(testDirectory);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(testDirectory, { recursive: true, force: true });
});

describe("formatter oxlint 내부 배칭", () => {
  it("동시 호출을 소수 배치로 합치고 한 번에 한 프로세스만 실행하며 호출별 결과를 반환한다", async () => {
    const releaseExecutions = createGate();
    const firstExecutionStarted = createGate();
    const batches: string[][] = [];
    let activeExecutions = 0;
    let maxActiveExecutions = 0;

    vi.spyOn(processUtils, "execute").mockImplementation(
      async (_bin: string, args: string[], options) => {
        batches.push(extractTemporaryFiles(args));
        activeExecutions += 1;
        maxActiveExecutions = Math.max(maxActiveExecutions, activeExecutions);
        firstExecutionStarted.open();
        try {
          expect(args.slice(0, OXLINT_FLAGS.length)).toEqual(OXLINT_FLAGS);
          expect(options?.timeout).toBe(10_000);
          await releaseExecutions.promise;
          await applyFixes(args);
          return "";
        } finally {
          activeExecutions -= 1;
        }
      },
    );

    const inputs = Array.from(
      { length: 8 },
      (_, index) => `const formatterBatchingValue${index} = ${index};\n`,
    );
    const results = inputs.map((code, index) => formatCode(code, `generated-${index}.ts`));

    await firstExecutionStarted.promise;
    await waitForTemporaryFiles(inputs.length);
    releaseExecutions.open();

    await expect(Promise.all(results)).resolves.toEqual(
      inputs.map((code) => `${code}${FIXED_SUFFIX}`),
    );

    expect(batches).toHaveLength(2);
    expect(batches.flat()).toHaveLength(inputs.length);
    expect(maxActiveExecutions).toBe(1);
    await expectTemporaryFilesRemoved(batches.flat());
  });

  it("실패한 배치의 호출자만 거부하고 실행 중 쌓인 다음 배치는 정상 처리한다", async () => {
    const firstExecution = createGate();
    const firstExecutionStarted = createGate();
    const failingExecution = createGate();
    const succeedingExecutions = createGate();
    const secondExecutionStarted = createGate();
    const batchError = Object.assign(new Error("oxlint 실행 실패"), { code: null });
    const batches: string[][] = [];

    vi.spyOn(processUtils, "execute").mockImplementation(async (_bin: string, args: string[]) => {
      const batchIndex = batches.length;
      batches.push(extractTemporaryFiles(args));
      if (batchIndex === 0) {
        firstExecutionStarted.open();
        await firstExecution.promise;
        await applyFixes(args);
        return "";
      }
      if (batchIndex === 1) {
        secondExecutionStarted.open();
        await failingExecution.promise;
        throw batchError;
      }
      await succeedingExecutions.promise;
      await applyFixes(args);
      return "";
    });

    const firstCode = "const formatterBatchingFirst = 1;\n";
    const firstResult = formatCode(firstCode, "first-batch.ts");
    await firstExecutionStarted.promise;
    await waitForTemporaryFiles(1);

    const failedCodes = [
      "const formatterBatchingFailedA = 2;\n",
      "const formatterBatchingFailedB = 3;\n",
    ];
    const failedResults = failedCodes.map((code, index) => formatCode(code, `failed-${index}.ts`));
    const failedOutcomes = Promise.allSettled(failedResults);
    await waitForTemporaryFiles(3);
    firstExecution.open();
    await secondExecutionStarted.promise;

    const recoveryCode = "const formatterBatchingRecovered = 4;\n";
    const recoveryResult = formatCode(recoveryCode, "recovered.ts");
    await waitForTemporaryFiles(3);
    failingExecution.open();
    succeedingExecutions.open();

    await expect(firstResult).resolves.toBe(`${firstCode}${FIXED_SUFFIX}`);
    await expect(failedOutcomes).resolves.toEqual(
      failedCodes.map(() => ({ reason: batchError, status: "rejected" })),
    );
    await expect(recoveryResult).resolves.toBe(`${recoveryCode}${FIXED_SUFFIX}`);

    expect(batches.map((batch) => batch.length)).toEqual([1, 2, 1]);
    await expectTemporaryFilesRemoved(batches.flat());
  });

  it("숫자 exit code이면 적용된 fix를 반환하고 임시 파일을 정리한다", async () => {
    const lintError = Object.assign(new Error("수정 후 lint 오류가 남음"), { code: 1 });
    let temporaryFile = "";
    const execute = vi.spyOn(processUtils, "execute").mockImplementation(async (_bin, args) => {
      [temporaryFile] = extractTemporaryFiles(args);
      await applyFixes(args);
      throw lintError;
    });

    const code = "const formatterBatchingNumericExit = 1;\n";

    await expect(formatCode(code, "numeric-exit.ts")).resolves.toBe(`${code}${FIXED_SUFFIX}`);
    expect(execute).toHaveBeenCalledTimes(1);
    await expectTemporaryFilesRemoved([temporaryFile]);
  });

  it("테스트 환경에서는 파일이나 프로세스를 사용하지 않고 원본을 반환한다", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const execute = vi.spyOn(processUtils, "execute");
    const code = "const formatterBatchingTestBypass = 1;\n";

    await expect(formatCode(code, "test-bypass.ts")).resolves.toBe(code);

    expect(execute).not.toHaveBeenCalled();
    await expect(listTemporaryFiles()).resolves.toEqual([]);
  });
});
