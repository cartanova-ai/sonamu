import { mkdtemp, mkdir, rm } from "fs/promises";
import os from "os";
import path from "path";

import { type SonamuConfig } from "../../api/config";
import { Sonamu } from "../../api/sonamu";
import { type SonamuDBConfig, type SonamuDBPreset } from "../../database/db";
import { setSDConfig } from "../../dict/sd";
import { type AbsolutePath } from "../../utils/path-utils";

/** 연결을 시도하더라도 즉시 실패하도록 닫힌 포트를 쓰는 DB 설정입니다. */
export function createDBConfig(
  overrides: Partial<Record<SonamuDBPreset, string>> = {},
): SonamuDBConfig {
  const presetConfig = (preset: SonamuDBPreset) => ({
    client: "postgresql",
    connection: { host: overrides[preset] ?? "127.0.0.1", port: 1, database: preset },
  });
  return {
    test: presetConfig("test"),
    fixture: presetConfig("fixture"),
    development: presetConfig("development"),
    staging: presetConfig("staging"),
    production: presetConfig("production"),
    test_readonly: presetConfig("test_readonly"),
    development_readonly: presetConfig("development_readonly"),
    staging_readonly: presetConfig("staging_readonly"),
    production_readonly: presetConfig("production_readonly"),
  };
}

function isAbsolutePath(value: string): value is AbsolutePath {
  return value.startsWith("/");
}

export function createConfig(slackTargets?: SonamuDBPreset[]): SonamuConfig {
  const config: SonamuConfig = {
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
  };
  if (slackTargets !== undefined) {
    config.slackConfirm = { targets: slackTargets, botToken: "xoxb-test", channelId: "C123" };
  }
  return config;
}

/** Sonamu 전역 상태를 테스트용으로 채우고 임시 apiRootPath를 돌려줍니다. */
export async function setupSonamu(
  config: SonamuConfig,
  dbConfig: SonamuDBConfig,
): Promise<{ cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "sonamu-ui-test-"));
  if (!isAbsolutePath(root)) {
    throw new Error(`mkdtemp가 절대 경로를 반환하지 않았습니다: ${root}`);
  }
  await mkdir(path.join(root, "src", "migrations"), { recursive: true });
  Sonamu.apiRootPath = root;
  Sonamu.dbConfig = dbConfig;
  Sonamu.config = config;
  setSDConfig(config.i18n);
  return { cleanup: () => rm(root, { recursive: true, force: true }) };
}
