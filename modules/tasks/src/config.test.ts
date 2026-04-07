import { describe, expect, test } from "vitest";

import { defineConfig } from "./config";
import { createBackend } from "./testing/connection";

describe("defineConfig", async () => {
  const backend = await createBackend();

  test("returns the same config", () => {
    const config = { backend };
    const result = defineConfig(config);
    expect(result).toBe(config);
  });
});

describe("loadConfig", () => {
  test("loads config file in the specified directory", async () => {
    const { loadConfig } = await import("./config");
    const { config, configFile } = await loadConfig("./templates");
    expect(config).toBeDefined();
    expect(config.backend).toBeDefined();
    expect(configFile).toContain("/templates/openworkflow.config.ts");
  });
});
