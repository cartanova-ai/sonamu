import { FixtureManager, Sonamu } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

export function bootstrap() {
  beforeAll(async () => {
    await Sonamu.initForTesting();
    FixtureManager.init();
  });
  beforeEach(async () => {
    await FixtureManager.cleanAndSeed();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });
}
