import { afterEach, describe, expect, it } from "vitest";

import { Sonamu } from "../../api/sonamu";
import { type SonamuDBConfig, type SonamuDBPreset } from "../../database/db";
import { Migrator } from "../migrator";

describe("Migrator environment target filtering", () => {
  const originalEnv = { ...process.env };
  const presets: SonamuDBPreset[] = [
    "test",
    "fixture",
    "development",
    "staging",
    "production",
    "test_readonly",
    "development_readonly",
    "staging_readonly",
    "production_readonly",
  ];

  const dbConfig = Object.fromEntries(
    presets.map((preset) => [
      preset,
      {
        client: "postgresql",
        connection: {
          host: "localhost",
          database: preset,
        },
      },
    ]),
  ) as SonamuDBConfig;

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  const getMigrationTargetKeys = () => {
    Sonamu.dbConfig = dbConfig;
    return (
      new Migrator() as unknown as {
        getMigrationTargetKeys(): (keyof SonamuDBConfig)[];
      }
    ).getMigrationTargetKeys();
  };

  it("limits migration targets to production on a production server runtime", () => {
    process.env.NODE_ENV = "production";

    expect(getMigrationTargetKeys()).toEqual(["production"]);
  });

  it("keeps all writable targets available for local development UI workflows", () => {
    process.env.NODE_ENV = "development";

    expect(getMigrationTargetKeys()).toEqual([
      "test",
      "fixture",
      "development",
      "staging",
      "production",
    ]);
  });
});
