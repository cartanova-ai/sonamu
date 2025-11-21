import { describe, it, expect } from "vitest";
import { t1 } from "./t1";

describe("t1", () => {
  it("should return t1", () => {
    expect(t1()).toBe("t1");
  });
});
