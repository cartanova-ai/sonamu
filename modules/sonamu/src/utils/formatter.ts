import { Biome } from "@biomejs/js-api/nodejs";
import { Sonamu } from "../api";

const biome = new Biome();
const { projectKey } = biome.openProject(Sonamu.appRootPath);
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
});

export function formatCode(code: string, parser: "typescript" | "json") {
  // TODO: biome은 파일 경로에 기반해서 동작하기 때문에 임의로 처리함.
  const filePath =
    parser === "typescript"
      ? "src/application/sonamu.generated.ts"
      : "src/application/sonamu.generated.json";
  return biome.formatContent(projectKey, code, {
    filePath,
  }).content;
}
