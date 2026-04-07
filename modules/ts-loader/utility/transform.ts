import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";

import JSON5 from "json5";
import { type SourceMap, transform, type TransformOptions } from "oxc-transform";

type TypeScriptConfig = {
  compilerOptions?: {
    experimentalDecorators?: boolean;
    module?: string;
    target?: string;
    verbatimModuleSyntax?: boolean;
  };
  extends?: string;
};

type TransformConfig = {
  decorators: boolean;
  sourceType: TransformOptions["sourceType"];
  target: string | undefined;
  verbatimModuleSyntax: boolean;
};

const transformConfigCache = new Map<string, Promise<TransformConfig>>();
const require = createRequire(import.meta.url);

function resolveConfigPath(baseDirectory: URL): string {
  return path.join(baseDirectory.pathname, "tsconfig.json");
}

function resolveExtendsPath(configPath: string, extendsPath: string): string {
  if (extendsPath.startsWith(".")) {
    return path.resolve(path.dirname(configPath), extendsPath);
  }

  return require.resolve(extendsPath, {
    paths: [path.dirname(configPath)],
  });
}

async function loadTypeScriptConfig(configPath: string): Promise<TypeScriptConfig> {
  const content = await fs.readFile(configPath, "utf8");
  const config = JSON5.parse(content) as TypeScriptConfig;

  if (!config.extends) {
    return config;
  }

  const parentConfigPath = resolveExtendsPath(configPath, config.extends);
  const parentConfig = await loadTypeScriptConfig(parentConfigPath);

  return {
    ...parentConfig,
    ...config,
    compilerOptions: {
      ...parentConfig.compilerOptions,
      ...config.compilerOptions,
    },
  };
}

async function loadTransformConfig(baseDirectory: URL): Promise<TransformConfig> {
  const cacheKey = baseDirectory.href;

  if (!transformConfigCache.has(cacheKey)) {
    transformConfigCache.set(
      cacheKey,
      (async () => {
        const configPath = resolveConfigPath(baseDirectory);
        let config: TypeScriptConfig;

        try {
          config = await loadTypeScriptConfig(configPath);
        } catch (error) {
          const isMissingConfig =
            error instanceof Error &&
            "code" in error &&
            (error as NodeJS.ErrnoException).code === "ENOENT";

          if (isMissingConfig) {
            return {
              decorators: false,
              sourceType: "module",
              target: undefined,
              verbatimModuleSyntax: false,
            };
          }

          throw error;
        }

        const moduleType = config.compilerOptions?.module?.toLowerCase();

        return {
          decorators: config.compilerOptions?.experimentalDecorators ?? false,
          sourceType: moduleType === "commonjs" ? "commonjs" : "module",
          target: config.compilerOptions?.target?.toLowerCase(),
          verbatimModuleSyntax: config.compilerOptions?.verbatimModuleSyntax ?? false,
        };
      })(),
    );
  }

  const cachedConfig = transformConfigCache.get(cacheKey);
  if (!cachedConfig) {
    throw new Error(`Failed to cache transform config for ${cacheKey}`);
  }

  return cachedConfig;
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
  const baseDirectory = packageDirectory ?? new URL("./", sourceLocation);
  const config = await loadTransformConfig(baseDirectory);
  const lang = getLangFromFilename(filename);

  const options: TransformOptions = {
    cwd: baseDirectory.pathname,
    sourceType: config.sourceType,
    sourcemap: true,
    typescript: {
      rewriteImportExtensions: false,
    },
  };

  if (config.decorators) {
    options.decorator = {
      legacy: true,
    };
  }

  if (config.target) {
    options.target = config.target;
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

  const emptyImportPattern = /^\s*import\s*\{\s*\}\s*from\s*["'][^"']+["'];?\s*$/gm;
  const hasEmptyImport = emptyImportPattern.test(sourceText);
  const code =
    !config.verbatimModuleSyntax && hasEmptyImport
      ? result.code.replace(/^\s*import(?:\s*\{\s*\}\s*from)?\s*["'][^"']+["'];?\n?/gm, "")
      : config.verbatimModuleSyntax && hasEmptyImport
        ? `${sourceText.match(emptyImportPattern)?.[0] ?? ""}\n${result.code}`
        : result.code;

  return `${code}\n//# sourceMappingURL=data:application/json;base64,${encodeInlineSourceMap(result.map)}`;
}
