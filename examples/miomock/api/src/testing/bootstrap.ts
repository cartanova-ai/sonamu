import { type Context, DB, Naite, Sonamu } from "sonamu";
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
  afterEach(async () => {
    vi.useRealTimers();
    await DB.clearTestTransaction();
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

export const test = Object.assign(
  async (title: string, fn: () => Promise<void>) => {
    return vitestTest(title, async () => {
      await runWithMockContext(fn);
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
    return vitestTest(title, async () => {
      await runWithContext(
        {
          ...getMockContext(),
          user,
        },
        fn,
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
      return vitestTest.only(title, async () => {
        await runWithContext(
          {
            ...getMockContext(),
            user,
          },
          fn,
        );
      });
    },
    todo: (title: string) => {
      return vitestTest.todo(title);
    },
  },
);
