import { describe, expect, it } from "vitest";
import { bootstrap } from "../testing/bootstrap";
import { vi } from "vitest";

bootstrap(vi);
describe.skip("Migrator", () => {
  it("test1", async () => {
    expect(1).toBe(1);
  });

  it("test2", async () => {
    expect(1).toBe(1);
  });

  describe("inner describe", () => {
    it("test3", async () => {
      expect(1).toBe(1);
    });

    it("test4", async () => {
      expect(1).toBe(1);
    });
  });
});
