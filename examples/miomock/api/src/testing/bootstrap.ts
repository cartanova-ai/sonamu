import { DatabaseSchemaExtend, FixtureManager, Sonamu } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

export function bootstrap(tableNames?: (keyof DatabaseSchemaExtend)[]) {
  beforeAll(async () => {
    await Sonamu.initForTesting();
    FixtureManager.init();
  });
  beforeEach(async () => {
    await FixtureManager.cleanAndSeed(tableNames);
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });
}
