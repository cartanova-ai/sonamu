require("dotenv").config();
import { FixtureManager, Sonamu } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

export function bootstrap(tableNames?: string[]) {
  beforeAll(async () => {
    await Sonamu.init(true);
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
