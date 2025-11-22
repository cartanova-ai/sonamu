import { Biome } from "@biomejs/js-api/nodejs";
import { Naite } from "../naite/naite";

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

export function formatCode(code: string, parser: "typescript" | "json") {
  Naite.t("formatCode", { code, parser });

  if (projectKey === -1) {
    console.warn("Biome is not setup. Please call setupBiome first.");
    return code;
  }

  // TODO: biome은 파일 경로에 기반해서 동작하기 때문에 임의로 처리함.
  const filePath =
    parser === "typescript"
      ? "src/application/sonamu.generated.ts"
      : "src/application/sonamu.generated.json";

  const result = biome.formatContent(projectKey, code, { filePath });
  Naite.t("formatCode:result", result);
  if (result.diagnostics.filter((d) => d.severity === "error").length > 0) {
    console.error(result.diagnostics);
    throw new Error("Biome format error");
  }
  return result.content;
}
