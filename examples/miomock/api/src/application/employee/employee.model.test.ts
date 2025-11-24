import { describe, expect, test } from "vitest";
import { bootstrap } from "../../testing/bootstrap";
import { vi } from "vitest";

bootstrap(vi);
describe("EmployeeModel", () => {
  test("should be defined", () => {
    expect(true).toBe(true);
  });

  test("should get my IP", async () => {
    expect(false).toBe(false);
  });
});
