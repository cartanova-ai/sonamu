import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);
describe.skip("CompanyModelTest", () => {
  test("Query", async () => {
    expect(true).toBe(true);
  });
});
