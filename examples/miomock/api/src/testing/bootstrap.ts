import { type Context, DB, Naite, Sonamu } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vitest";

export function bootstrap() {
  beforeAll(async () => {
    await Sonamu.initForTesting();
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    await DB.createTestTransaction();
  });
  afterEach(async () => {
    vi.useRealTimers();
    await DB.clearTestTransaction();
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });
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

export async function notImpl(fn: () => Promise<void>) {
  return await expect(fn).rejects.toThrow("Not implemented");
}
