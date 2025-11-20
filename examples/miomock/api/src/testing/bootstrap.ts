import { cloneDeep } from "lodash-es";
import { Context, DB, FixtureManager, Sonamu } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

/**
 * @param mode - "trx" for transactional mode, "fm" for fixture mode
 * @param tableNames - optional array of table names to seed in fixture mode
 */
export function bootstrap(mode: "trx" | "fm" = "trx", tableNames?: string[]) {
  beforeAll(async () => {
    await Sonamu.initForTesting();
    if (mode === "fm") {
      await FixtureManager.init();
    }
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    if (mode === "trx") {
      await DB.createTestTransaction();
    }
    if (mode === "fm") {
      await FixtureManager.cleanAndSeed(tableNames);
    }
  });
  afterEach(async () => {
    vi.useRealTimers();
    if (mode === "trx") {
      await DB.clearTestTransaction();
    }
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
    naiteStore: new Map<string, any>(),
  } as unknown as Context;
}

export async function runWithContext(
  context: Context | null,
  fn: () => Promise<void>
) {
  // Sonamu.asyncLocalStorage.run으로 context 설정
  await Sonamu.asyncLocalStorage.run(
    { context: context ?? getMockContext() },
    fn
  );
}

export async function runWithMockContext(fn: () => Promise<void>) {
  await runWithContext(cloneDeep(getMockContext()), fn);
}
