import { DB, FixtureManager, Sonamu } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

let mode: "trx" | "fm" = "trx";

export function bootstrap() {
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
      await FixtureManager.cleanAndSeed();
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
