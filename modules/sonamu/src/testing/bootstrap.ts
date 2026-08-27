import { afterAll, afterEach, beforeAll, beforeEach, test as vitestTest } from "vitest";
import { type TestFunction, type TestOptions, type VitestUtils } from "vitest";

import { type Context } from "../api/context";
import { Sonamu } from "../api/sonamu";
import { DB } from "../database/db";
import { Naite } from "../naite/naite";
import { type SerializedTrace } from "../naite/naite";
import { NaiteReporter } from "../naite/naite-reporter";

export interface BootstrapOptions {
  /**
   * Sonamu 초기화 모드를 지정합니다.
   * - true (기본값): 테스팅 모드로 초기화 (빠름, Syncer/Task 생략)
   * - false: 전체 초기화 (Syncer, Task, EntityManager 등 모두 로드)
   *
   * migrator, syncer, template 등의 테스트에서는 false를 사용합니다.
   */
  forTesting?: boolean;
}

export function bootstrap(vi: VitestUtils, options?: BootstrapOptions) {
  const forTesting = options?.forTesting ?? true;

  beforeAll(async () => {
    if (!forTesting) {
      // forTesting: false인 경우 재초기화가 필요하므로 플래그 해제
      Sonamu.isInitialized = false;
    }
    await Sonamu.init(true, false, undefined, forTesting);
  });
  beforeEach(async () => {
    await DB.createTestTransaction();
  });
  afterEach(async ({ task }) => {
    vi.useRealTimers();
    await DB.clearTestTransaction();

    await NaiteReporter.reportTestResult({
      suiteName: task.suite?.name ?? "(no suite)",
      suiteFilePath: task.file?.filepath,
      testName: task.name,
      testFilePath: task.file?.filepath ?? "",
      testLine: task.location?.line ?? 0,
      status: task.result?.state ?? "pass",
      duration: task.result?.duration ?? 0,
      error: task.result?.errors?.[0]
        ? {
            message: task.result.errors[0].message,
            stack: task.result.errors[0].stack,
          }
        : undefined,
      traces: task.meta?.traces ?? [],
    });
  });
  afterAll(() => {});
}

function getMockContext(): Context {
  // SAFETY: 테스트 컨텍스트에서는 Fastify 요청과 응답을 사용하지 않으며 접근 시 즉시 실패해야 합니다.
  const request: Context["request"] = null as never;
  // SAFETY: 테스트 컨텍스트에서는 Fastify 요청과 응답을 사용하지 않으며 접근 시 즉시 실패해야 합니다.
  const reply: Context["reply"] = null as never;
  // SAFETY: 모의 구현은 실제 createSSE와 같은 호출 계약을 유지하되 항상 명시적으로 실패합니다.
  const createSSE = (() => {
    throw new Error("createSSE is not available in mock context");
  }) as Context["createSSE"];

  return {
    transport: "http",
    request,
    reply,
    headers: {},
    createSSE,
    session: null,
    user: null,
    naiteStore: Naite.createStore(),
    locale: "",
  };
}

export async function runWithContext(context: Context | null, fn: () => Promise<void>) {
  // Sonamu.asyncLocalStorage.run으로 context 설정
  await Sonamu.asyncLocalStorage.run({ context: context ?? getMockContext() }, fn);
}

export async function runWithMockContext(fn: () => Promise<void>) {
  await runWithContext(getMockContext(), fn);
}

type TestResult = Promise<ReturnType<typeof vitestTest>>;
type TestCallbackResult = void | Promise<void>;
type TestEach = <TArgs extends readonly unknown[]>(
  cases: readonly TArgs[],
) => (title: string, fn: (...args: TArgs) => TestCallbackResult) => void;

type TestWrapper = {
  (title: string, fn: TestFunction, options?: TestOptions): TestResult;
  skip: (title: string, fn: TestFunction, options?: TestOptions) => TestResult;
  only: (title: string, fn: TestFunction, options?: TestOptions) => TestResult;
  todo: (title: string) => void;
  each: TestEach;
};

type TestAsWrapper = {
  <User extends Context["user"]>(
    user: User,
    title: string,
    fn: TestFunction,
    options?: TestOptions,
  ): TestResult;
  skip: <User extends Context["user"]>(
    user: User,
    title: string,
    fn: TestFunction,
    options?: TestOptions,
  ) => TestResult;
  only: <User extends Context["user"]>(
    user: User,
    title: string,
    fn: TestFunction,
    options?: TestOptions,
  ) => TestResult;
  todo: (title: string) => void;
};

const each: TestEach = vitestTest.each.bind(vitestTest);

declare module "vitest" {
  interface TaskMeta {
    traces: SerializedTrace[];
  }
}

export const test: TestWrapper = Object.assign(
  async (title: string, fn: TestFunction, options?: TestOptions) => {
    return vitestTest(title, options, async (context) => {
      await runWithMockContext(async () => {
        try {
          await fn(context);
          context.task.meta.traces = Naite.getAllTraces();
        } catch (e: unknown) {
          context.task.meta.traces = Naite.getAllTraces();
          throw e;
        }
      });
    });
  },
  {
    skip: async (title: string, fn: TestFunction, options?: TestOptions) =>
      vitestTest.skip(title, options, fn),
    only: async (title: string, fn: TestFunction, options?: TestOptions) => {
      return vitestTest.only(title, options, async (context) => {
        await runWithMockContext(async () => {
          try {
            await fn(context);
            context.task.meta.traces = Naite.getAllTraces();
          } catch (e: unknown) {
            context.task.meta.traces = Naite.getAllTraces();
            throw e;
          }
        });
      });
    },
    todo: (title: string) => vitestTest.todo(title),
    each,
  },
);

export const testAs: TestAsWrapper = Object.assign(
  async <User extends Context["user"]>(
    user: User,
    title: string,
    fn: TestFunction,
    options?: TestOptions,
  ) => {
    return vitestTest(title, options, async (context) => {
      await runWithContext(
        {
          ...getMockContext(),
          user,
        },
        async () => {
          try {
            await fn(context);
            context.task.meta.traces = Naite.getAllTraces();
          } catch (e: unknown) {
            context.task.meta.traces = Naite.getAllTraces();
            throw e;
          }
        },
      );
    });
  },
  {
    skip: async <User extends Context["user"]>(
      _user: User,
      title: string,
      fn: TestFunction,
      options?: TestOptions,
    ) => vitestTest.skip(title, options, fn),
    only: async <User extends Context["user"]>(
      user: User,
      title: string,
      fn: TestFunction,
      options?: TestOptions,
    ) => {
      return vitestTest.only(title, options, async (context) => {
        await runWithContext(
          {
            ...getMockContext(),
            user,
          },
          async () => {
            try {
              await fn(context);
              context.task.meta.traces = Naite.getAllTraces();
            } catch (e: unknown) {
              context.task.meta.traces = Naite.getAllTraces();
              throw e;
            }
          },
        );
      });
    },
    todo: (title: string) => vitestTest.todo(title),
  },
);
