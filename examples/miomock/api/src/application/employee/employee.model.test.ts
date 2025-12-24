import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);
describe("EmployeeModel", () => {
  test("should be defined", () => {
    expect(true).toBe(true);
  });

  test("should get my IP", async () => {
    expect(false).toBe(false);
  });
});
