import { type Context, DB, Naite, NaiteReporter, Sonamu } from "sonamu";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
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
  async (title: string, fn: () => Promise<void>) => {
    return vitestTest(title, async ({ task }) => {
      await runWithMockContext(async () => {
        const result = await fn();
        task.meta.traces = Naite.getAllTraces(); // 테스트 케이스 끝나면 컨텍스트 살아있을 때 잘 담아둡니다.
        return result;
      });
    });
  },
  {
    skip: async (title: string, fn: () => Promise<void>) => {
      return vitestTest.skip(title, async () => {
        await runWithMockContext(fn);
      });
    },
    only: async (title: string, fn: () => Promise<void>) => {
      return vitestTest.only(title, async () => {
        await runWithMockContext(fn);
      });
    },
    todo: (title: string) => {
      return vitestTest.todo(title);
    },
  },
);

export const testAs = Object.assign(
  async (user: UserSubsetSS, title: string, fn: () => Promise<void>) => {
    return vitestTest(title, async ({ task }) => {
      await runWithContext(
        {
          ...getMockContext(),
          user,
        },
        async () => {
          const result = await fn();
          task.meta.traces = Naite.getAllTraces();
          return result;
        },
      );
    });
  },
  {
    skip: async (user: UserSubsetSS, title: string, fn: () => Promise<void>) => {
      return vitestTest.skip(title, async () => {
        await runWithContext(
          {
            ...getMockContext(),
            user,
          },
          fn,
        );
      });
    },
    only: async (user: UserSubsetSS, title: string, fn: () => Promise<void>) => {
      return vitestTest.only(title, async ({ task }) => {
        await runWithContext(
          {
            ...getMockContext(),
            user,
          },
          async () => {
            const result = await fn();
            task.meta.traces = Naite.getAllTraces();
            return result;
          },
        );
      });
    },
    todo: (title: string) => {
      return vitestTest.todo(title);
    },
  },
);
