import { type Context, DB, Naite, NaiteReporter, Sonamu } from "sonamu";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  type TestFunction,
  type VitestUtils,
  test as vitestTest,
} from "vitest";
import type { UserSubsetSS } from "../application/sonamu.generated";

export function bootstrap(vi: VitestUtils) {
  beforeAll(async () => {
    await Sonamu.initForTesting();
  });
  beforeEach(async () => {
    await DB.createTestTransaction();
  });
  afterEach(async ({ task }) => {
    vi.useRealTimers();
    await DB.clearTestTransaction();

    NaiteReporter.reportTestResult({
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
      value: any;
      filePath: string;
      lineNumber: number;
      at: string;
    }[];
  }
}

export const test = Object.assign(
  async (title: string, fn: TestFunction<object>) => {
    return vitestTest(title, async (context) => {
      await runWithMockContext(async () => {
        await fn(context);
        context.task.meta.traces = Naite.getAllTraces(); // 테스트 케이스 끝나면 컨텍스트 살아있을 때 잘 담아둡니다.
      });
    });
  },
  {
    skip: async (title: string, fn: TestFunction<object>) => {
      return vitestTest.skip(title, async (context) => {
        await runWithMockContext(async () => {
          await fn(context);
          context.task.meta.traces = Naite.getAllTraces();
        });
      });
    },
    only: async (title: string, fn: TestFunction<object>) => {
      return vitestTest.only(title, async (context) => {
        await runWithMockContext(async () => {
          await fn(context);
          context.task.meta.traces = Naite.getAllTraces();
        });
      });
    },
    todo: (title: string) => {
      return vitestTest.todo(title);
    },
    each: vitestTest.each.bind(vitestTest),
  },
);

export const testAs = Object.assign(
  async (user: UserSubsetSS, title: string, fn: TestFunction<object>) => {
    return vitestTest(title, async (context) => {
      await runWithContext(
        {
          ...getMockContext(),
          user,
        },
        async () => {
          await fn(context);
          context.task.meta.traces = Naite.getAllTraces();
        },
      );
    });
  },
  {
    skip: async (user: UserSubsetSS, title: string, fn: TestFunction<object>) => {
      return vitestTest.skip(title, async (context) => {
        await runWithContext(
          {
            ...getMockContext(),
            user,
          },
          async () => {
            await fn(context);
            context.task.meta.traces = Naite.getAllTraces();
          },
        );
      });
    },
    only: async (user: UserSubsetSS, title: string, fn: TestFunction<object>) => {
      return vitestTest.only(title, async (context) => {
        await runWithContext(
          {
            ...getMockContext(),
            user,
          },
          async () => {
            await fn(context);
            context.task.meta.traces = Naite.getAllTraces();
          },
        );
      });
    },
    todo: (title: string) => {
      return vitestTest.todo(title);
    },
  },
);
