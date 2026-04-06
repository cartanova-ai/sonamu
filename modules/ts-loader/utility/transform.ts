import * as fs from "node:fs/promises";
import * as path from "node:path";

import JSON5 from "json5";
import { type SourceMap, transform, type TransformOptions } from "oxc-transform";

type LegacySwcConfig = {
  sourceMaps?: boolean | "inline";
  module?: {
    type?: string;
  };
  jsc?: {
    parser?: {
      syntax?: string;
      decorators?: boolean;
    };
    target?: string;
  };
};

const TRANSFORM_CONFIG_ENV = "TS_LOADER_TRANSFORM_CONFIG_PATH";
const LEGACY_SWC_CONFIG_ENV = "SWCRC_PATH";

let transformConfigCache: { path: string; config: LegacySwcConfig } | null = null;

function getTransformConfigPath(): string {
  const configPath = process.env[TRANSFORM_CONFIG_ENV] ?? process.env[LEGACY_SWC_CONFIG_ENV];
  if (!configPath) {
    throw new Error(`${TRANSFORM_CONFIG_ENV} environment variable is required`);
  }

  return configPath;
}

async function loadTransformConfig(): Promise<LegacySwcConfig> {
  const configPath = getTransformConfigPath();

  if (transformConfigCache?.path === configPath) {
    return transformConfigCache.config;
  }

  const content = await fs.readFile(configPath, "utf8");
  const config = JSON5.parse(content) as LegacySwcConfig;
  transformConfigCache = { path: configPath, config };
  return config;
}

function getLangFromFilename(filename: string): TransformOptions["lang"] {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case ".tsx":
      return "tsx";
    case ".jsx":
      return "jsx";
    case ".d.ts":
      return "dts";
    case ".ts":
    default:
      return "ts";
  }
}

function encodeInlineSourceMap(map: SourceMap): string {
  return Buffer.from(JSON.stringify(map)).toString("base64");
}

/** @internal */
export async function transpileSource(
  sourceText: string,
  sourceLocation: URL,
  packageDirectory?: URL,
): Promise<string> {
  const filename = sourceLocation.pathname;
  const config = await loadTransformConfig();
  const lang = getLangFromFilename(filename);

  const options: TransformOptions = {
    cwd: packageDirectory?.pathname ?? process.cwd(),
    sourceType: config.module?.type === "commonjs" ? "commonjs" : "module",
    sourcemap: true,
    typescript: {
      rewriteImportExtensions: false,
    },
  };

  if (config.jsc?.parser?.decorators) {
    options.decorator = {
      legacy: true,
    };
  }

  if (config.jsc?.target) {
    options.target = config.jsc.target;
  }

  if (lang) {
    options.lang = lang;
  }

  const result = await transform(filename, sourceText, options);

  if (result.errors.length > 0) {
    const messages = result.errors
      .map((error) => error.codeframe ?? error.message)
      .filter((message) => message && message.length > 0)
      .join("\n");
    throw new Error(messages || "Failed to transpile source with oxc-transform");
  }

  if (!result.code) {
    throw new Error("Failed to transpile source with oxc-transform");
  }

  if (!result.map) {
    throw new Error("Source map is required but was not returned by oxc-transform");
  }

  return `${result.code}\n//# sourceMappingURL=data:application/json;base64,${encodeInlineSourceMap(result.map)}`;
}
