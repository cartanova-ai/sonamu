import * as path from "node:path";

import { type SourceMap, transform, type TransformOptions } from "oxc-transform";

type CompilerOptions = {
  experimentalDecorators?: boolean;
  module?: string;
  target?: string;
  verbatimModuleSyntax?: boolean;
};

type TransformConfig = {
  decorators: boolean;
  sourceType: TransformOptions["sourceType"];
  target: string | undefined;
  verbatimModuleSyntax: boolean;
};

function loadTransformConfig(compilerOptions: CompilerOptions | undefined): TransformConfig {
  const moduleType = compilerOptions?.module?.toLowerCase();

  return {
    decorators: compilerOptions?.experimentalDecorators ?? false,
    sourceType: moduleType === "commonjs" ? "commonjs" : "module",
    target: compilerOptions?.target?.toLowerCase(),
    verbatimModuleSyntax: compilerOptions?.verbatimModuleSyntax ?? false,
  };
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
  transformContext?: {
    compilerOptions?: CompilerOptions;
    packageDirectory?: URL;
  },
): Promise<string> {
  const filename = sourceLocation.pathname;
  const baseDirectory = transformContext?.packageDirectory ?? new URL("./", sourceLocation);
  const config = loadTransformConfig(transformContext?.compilerOptions);
  const lang = getLangFromFilename(filename);

  const transformOptions: TransformOptions = {
    cwd: baseDirectory.pathname,
    sourceType: config.sourceType,
    sourcemap: true,
    typescript: {
      rewriteImportExtensions: false,
    },
  };

  if (config.decorators) {
    transformOptions.decorator = {
      legacy: true,
    };
  }

  if (config.target) {
    transformOptions.target = config.target;
  }

  if (lang) {
    transformOptions.lang = lang;
  }

  const result = await transform(filename, sourceText, transformOptions);

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

  const emptyImportPattern = /^\s*import\s*\{\s*\}\s*from\s*(["'][^"']+["']);?\s*$/gm;
  const emptyImportMatches = Array.from(sourceText.matchAll(emptyImportPattern));
  const hasEmptyImport = emptyImportMatches.length > 0;
  const preservedEmptyImports = emptyImportMatches.map(([, specifier]) => `import ${specifier};`);
  const code =
    !config.verbatimModuleSyntax && hasEmptyImport
      ? result.code.replace(/^\s*import\s*\{\s*\}\s*from\s*["'][^"']+["'];?\n?/gm, "")
      : config.verbatimModuleSyntax && preservedEmptyImports.length > 0
        ? `${preservedEmptyImports.join("\n")}\n${result.code}`.trim()
        : result.code;

  return `${code}\n//# sourceMappingURL=data:application/json;base64,${encodeInlineSourceMap(result.map)}`;
}
