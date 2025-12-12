import { describe, expect, it } from "vitest";
import validate from "./validation";

describe("pattern-validation", () => {
  it("should succeed with a valid expression", () => {
    expect(() => {
      validate("59 * * * *");
    }).to.not.throw();
  });

  it("should fail with an invalid expression", () => {
    expect(() => {
      validate("60 * * * *");
    }).to.throw("60 is a invalid expression for minute");
  });
});
