import { describe, expect, test, vi } from "vitest";
import { bootstrap } from "../../testing/bootstrap";

bootstrap(vi);
describe.skip("SyncFixtureModelTest", () => {
  test("Query", async () => {
    expect(true).toBe(true);
  });
});
