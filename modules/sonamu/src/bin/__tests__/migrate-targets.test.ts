import { afterEach, describe, expect, it } from "vitest";

import { getMigrateRunTargets } from "../migrate-targets";

describe("getMigrateRunTargets", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("includes fixture when running migrations in the test environment", () => {
    process.env.NODE_ENV = "test";

    expect(getMigrateRunTargets()).toEqual(["test", "fixture"]);
  });

  it("uses only the current environment outside test", () => {
    process.env.NODE_ENV = "staging";

    expect(getMigrateRunTargets()).toEqual(["staging"]);
  });
});
