import { Biome } from "@biomejs/js-api/nodejs";
import { Naite } from "../naite/naite";
import { isTest } from "./controller";

const biome = new Biome();
let projectKey: number = -1;

export function setupBiome(path: string) {
  if (projectKey !== -1) {
    return;
  }

  projectKey = biome.openProject(path).projectKey;
  biome.applyConfiguration(projectKey, {
    formatter: {
      enabled: true,
      formatWithErrors: false,
      indentStyle: "space",
      indentWidth: 2,
      lineEnding: "lf",
      lineWidth: 100,
      attributePosition: "auto",
    },
    linter: {
      enabled: true,
      rules: {
        recommended: true,
        style: {
          useNodejsImportProtocol: "off",
        },
        correctness: {
          useParseIntRadix: "off",
        },
      },
    },
    javascript: {
      formatter: {
        jsxQuoteStyle: "double",
        quoteProperties: "asNeeded",
        trailingCommas: "all",
        semicolons: "always",
        arrowParentheses: "always",
        bracketSpacing: true,
        bracketSameLine: false,
        quoteStyle: "double",
        attributePosition: "auto",
      },
    },
    json: {
      formatter: {
        indentWidth: 2,
      },
    },
    assist: {
      enabled: true,
      actions: {
        source: {
          organizeImports: "on",
        },
      },
    },
  });
}

export function formatCode(code: string, parser: "typescript" | "json", filePath: string) {
  Naite.t("formatCode", { code, parser });

  if (projectKey === -1) {
    console.warn("Biome is not setup. Please call setupBiome first.");
    return code;
  }

  // 포맷팅을 먼저 해야함
  const formatted = biome.formatContent(projectKey, code, { filePath });
  Naite.t("formatCode:formatted", formatted);
  if (formatted.diagnostics.filter((d) => d.severity === "error").length > 0) {
    console.error(formatted.diagnostics);
    throw new Error("Biome format error");
  }

  // 린팅을 그 다음에
  const linted = biome.lintContent(projectKey, formatted.content, {
    filePath,
    fixFileMode: "safeAndUnsafeFixes",
  });
  if (linted.diagnostics.filter((d) => d.severity === "error").length > 0) {
    Naite.t("formatCode:linted:content", linted.content);
    Naite.t("formatCode:linted:diagnostics", linted.diagnostics);
    !isTest() && console.dir(linted.diagnostics, { depth: null });
    throw new Error("Biome lint error");
  }
  Naite.t("formatCode:linted", linted);

  return linted.content;
}
