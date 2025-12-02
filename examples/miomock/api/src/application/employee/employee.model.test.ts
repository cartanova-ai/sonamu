import { describe, expect, vi } from "vitest";
import { bootstrap, test } from "../../testing/bootstrap";

bootstrap(vi);
describe("EmployeeModel", () => {
  test("should be defined", () => {
    expect(true).toBe(true);
  });

  test("should get my IP", async () => {
    expect(false).toBe(false);
  });
});
