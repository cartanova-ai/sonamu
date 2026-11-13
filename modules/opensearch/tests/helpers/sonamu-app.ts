import { type Knex } from "knex";
import { type BaseModelClass, DB, type SonamuDBConfig, transactional } from "sonamu";

import { type IntegrationHarness } from "./harness";

const PRESETS = [
  "test",
  "fixture",
  "development",
  "staging",
  "production",
  "test_readonly",
  "development_readonly",
  "staging_readonly",
  "production_readonly",
] as const satisfies readonly (keyof SonamuDBConfig)[];

// Sonamu mutates connection objects, so every preset gets its own.
export function sonamuDatabaseConfig(
  h: IntegrationHarness,
  applicationName = "sonamu",
): SonamuDBConfig {
  const entries = PRESETS.map((preset) => {
    const config: Knex.Config = {
      client: "pg",
      connection: { connectionString: h.connectionString(`${applicationName}:${preset}`) },
      pool: { min: 0, max: 5 },
    };
    return [preset, config] as const;
  });
  // SAFETY: PRESETS lists every SonamuDBConfig key (checked by satisfies) and each gets one config.
  return Object.fromEntries(entries) as SonamuDBConfig;
}

export function configureSonamuDatabase(h: IntegrationHarness, applicationName?: string): void {
  DB.setConfig(sonamuDatabaseConfig(h, applicationName));
  h.onCleanup(async () => {
    await DB.destroy();
  });
}

export function applyTransactional(
  prototype: BaseModelClass,
  methodName: string,
  options: Parameters<typeof transactional>[0] = {},
): void {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
  if (descriptor === undefined) {
    throw new Error(`메서드 ${methodName}가 없습니다.`);
  }
  transactional(options)(prototype, methodName, descriptor);
  Object.defineProperty(prototype, methodName, descriptor);
}
