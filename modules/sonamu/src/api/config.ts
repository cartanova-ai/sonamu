import { transformFile } from "@swc/core";
import { Knex } from "knex";
import path from "path";
import { exists } from "../utils/fs-utils";
import { unlink, writeFile } from "fs/promises";

type DatabaseConfig = Omit<Knex.Config, "connection"> & {
  connection?: Knex.MySql2ConnectionConfig;
};

export type SonamuConfig = {
  projectName?: string;

  api: {
    dir: string;
    route: {
      prefix: string;
    };
    timezone?: string;
  };
  sync: {
    targets: string[]; // "web", "app" 등
  };
  ui?: {
    port: number;
  };

  database: {
    // 기본 데이터베이스 이름
    name: string;
    // 모든 환경에 적용될 기본 Knex 옵션
    defaultOptions: DatabaseConfig;
    // 환경별 설정
    environments?: {
      development?: DatabaseConfig;
      development_slave?: DatabaseConfig;
      production?: DatabaseConfig;
      production_slave?: DatabaseConfig;
      remote_fixture?: DatabaseConfig;
    };
  };
};

export type SonamuConfigExport = SonamuConfig | Promise<SonamuConfig>;

export function defineConfig(config: SonamuConfig): SonamuConfig;
export function defineConfig(
  config: Promise<SonamuConfig>
): Promise<SonamuConfig>;
export function defineConfig(config: SonamuConfigExport): SonamuConfigExport {
  return config;
}

export async function loadConfig(rootPath: string): Promise<SonamuConfig> {
  const configPath = path.join(rootPath, "sonamu.config.ts");
  if (!(await exists(configPath))) {
    throw new Error(`Cannot find sonamu.config.ts in ${configPath}`);
  }

  const { code: configCode } = await transformFile(configPath, {
    module: {
      type: "commonjs",
    },
    jsc: {
      parser: {
        syntax: "typescript",
        decorators: true,
      },
    },
  });

  const tempDir = path.join(rootPath, "dist");
  const outputPath = path.join(tempDir, "sonamu.config.js");
  await writeFile(outputPath, configCode);
  const { default: config } = await import(outputPath);
  await unlink(outputPath);

  return config;
}
