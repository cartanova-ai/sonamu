import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  type TestFunction,
  type TestOptions,
  type VitestUtils,
  test as vitestTest,
} from "vitest";
import type { Context } from "../api/context";
import { Sonamu } from "../api/sonamu";
import { DB } from "../database/db";
import { Naite } from "../naite/naite";
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
  return {
    ip: "127.0.0.1",
    session: {},
    user: null,
    passport: {
      login: async () => {},
      logout: () => {},
    },
    naiteStore: Naite.createStore(),
  } as unknown as Context;
}

export async function runWithContext(context: Context | null, fn: () => Promise<void>) {
  // Sonamu.asyncLocalStorage.run으로 context 설정
  await Sonamu.asyncLocalStorage.run({ context: context ?? getMockContext() }, fn);
}

export async function runWithMockContext(fn: () => Promise<void>) {
  await runWithContext(getMockContext(), fn);
}

declare module "vitest" {
  interface TaskMeta {
    traces: {
      key: string;
      // biome-ignore lint/suspicious/noExplicitAny: expect와 호응하도록 any를 허용함.
      value: any;
      filePath: string;
      lineNumber: number;
      at: string;
    }[];
  }
}

export const test = Object.assign(
  async (title: string, fn: TestFunction<object>, options?: TestOptions) => {
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
    skip: async (title: string, fn: TestFunction<object>, options?: TestOptions) =>
      vitestTest.skip(title, options, fn),
    only: async (title: string, fn: TestFunction<object>, options?: TestOptions) => {
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
    each: vitestTest.each.bind(vitestTest) as typeof vitestTest.each,
  },
);

export const testAs = Object.assign(
  async <User extends Context["user"]>(
    user: User,
    title: string,
    fn: TestFunction<object>,
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
      fn: TestFunction<object>,
      options?: TestOptions,
    ) => vitestTest.skip(title, options, fn),
    only: async <User extends Context["user"]>(
      user: User,
      title: string,
      fn: TestFunction<object>,
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
