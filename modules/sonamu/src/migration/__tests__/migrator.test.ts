import { afterEach, describe, expect, it } from "vitest";

import { type SonamuConfig } from "../../api/config";
import { Sonamu } from "../../api/sonamu";
import { type SonamuDBConfig, type SonamuDBPreset } from "../../database/db";
import { setSDConfig } from "../../dict/sd";
import { Migrator } from "../migrator";
import { SlackConfirm } from "../slack-confirm";

function createConfig(targets: NonNullable<SonamuConfig["slackConfirm"]>["targets"]): SonamuConfig {
  return {
    projectName: "sonamu-test",
    api: { dir: "src", route: { prefix: "/api" } },
    i18n: { defaultLocale: "ko", supportedLocales: ["ko", "en"] },
    sync: { targets: [] },
    database: {},
    server: {
      apiConfig: {
        contextProvider: (defaultContext) => defaultContext,
        guardHandler: () => undefined,
      },
    },
    slackConfirm: {
      targets,
      botToken: "xoxb-test",
      channelId: "C123",
    },
  };
}

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

  const dbConfig =
    /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ Object.fromEntries(
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
    return new Migrator().getMigrationTargetKeys();
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

describe("SlackConfirm target validation", () => {
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

  const dbConfig =
    /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ Object.fromEntries(
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

  it("fails fast when slackConfirm.targets contains an unknown DB key", () => {
    Sonamu.dbConfig = dbConfig;
    Sonamu.config = createConfig(["production"]);
    Object.defineProperty(Sonamu.config.slackConfirm, "targets", {
      value: ["production_old"],
    });
    setSDConfig(Sonamu.config.i18n);

    expect(() => new SlackConfirm().isTargetRequiresApproval("production")).toThrow(
      /Slack Confirm targets/,
    );
  });

  it("checks approval requirements only after configured targets match dbConfig keys", () => {
    Sonamu.dbConfig = dbConfig;
    Sonamu.config = createConfig(["production"]);
    setSDConfig(Sonamu.config.i18n);

    const slackConfirm = new SlackConfirm();

    expect(slackConfirm.isTargetRequiresApproval("production")).toBe(true);
    expect(slackConfirm.isTargetRequiresApproval("staging")).toBe(false);
  });
});
