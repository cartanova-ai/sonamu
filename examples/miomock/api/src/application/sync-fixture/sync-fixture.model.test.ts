import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);
describe.skip("SyncFixtureModelTest", () => {
  test("Query", async () => {
    expect(true).toBe(true);
  });
});
