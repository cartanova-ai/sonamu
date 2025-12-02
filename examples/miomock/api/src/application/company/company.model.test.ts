import { describe, expect, vi } from "vitest";
import { bootstrap, test } from "../../testing/bootstrap";

bootstrap(vi);
describe.skip("CompanyModelTest", () => {
  test("Query", async () => {
    expect(true).toBe(true);
  });
});
