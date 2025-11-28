import { describe, expect, test, vi } from "vitest";
import { bootstrap } from "../../testing/bootstrap";

bootstrap(vi);
describe.skip("CompanyModelTest", () => {
  test("Query", async () => {
    expect(true).toBe(true);
  });
});
