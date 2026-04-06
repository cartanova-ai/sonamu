import { execFileSync } from "child_process";
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { join } from "path";

import { format } from "oxfmt";

import { Naite } from "../naite/naite";
import { isTest } from "./controller";

const _require = createRequire(import.meta.url);

const OXFMT_OPTIONS = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  singleQuote: false,
  jsxSingleQuote: false,
  trailingComma: "all" as const,
  semi: true,
  endOfLine: "lf" as const,
  bracketSpacing: true,
  sortImports: true,
};

function resolveOxlintBin(): string {
  try {
    return _require.resolve("oxlint/bin/oxlint");
  } catch {
    return "oxlint";
  }
}

export async function formatCode(
  code: string,
  parser: "typescript" | "json",
  _filePath: string,
): Promise<string> {
  Naite.t("formatCode", { code, parser });

  const fileName = parser === "json" ? "file.json" : "file.ts";

  // oxfmt 포맷팅
  const formatted = await format(fileName, code, OXFMT_OPTIONS);
  if (formatted.errors.length > 0) {
    const errorMessages = formatted.errors
      .filter((e) => e.severity === "Error")
      .map((e) => e.message);
    if (errorMessages.length > 0) {
      // 파싱 에러가 있는 코드는 포맷팅 없이 원본 반환 (Biome formatWithErrors: false와 동일)
      Naite.t("formatCode:parse-error", errorMessages);
      return code;
    }
  }
  Naite.t("formatCode:formatted", formatted.code);

  // JSON은 포맷팅만 수행
  if (parser === "json") {
    return formatted.code;
  }

  // TypeScript: oxlint --fix로 lint fix 수행 (unused import 제거, type import 변환 등)
  // cwd 아래에 생성해야 nested config(.oxlintrc.json)과 tsconfig를 찾을 수 있음
  const tmpFile = join(
    process.cwd(),
    `.sonamu-fmt-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`,
  );
  try {
    writeFileSync(tmpFile, formatted.code, "utf-8");

    const oxlintBin = resolveOxlintBin();
    try {
      execFileSync(oxlintBin, ["--fix", "--fix-suggestions", "--type-aware", tmpFile], {
        stdio: "pipe",
        timeout: 10000,
      });
    } catch (execError: unknown) {
      // oxlint은 lint 에러가 있으면 exit code != 0으로 종료하지만 --fix는 적용됨
      if (execError instanceof Error) {
        const errObj = execError as Error & { status?: number | null; code?: string };
        if (typeof errObj.status === "number") {
          Naite.t("formatCode:oxlint-exit", errObj.status);
        } else {
          throw execError;
        }
      } else {
        throw execError;
      }
    }

    const lintFixed = readFileSync(tmpFile, "utf-8");
    Naite.t("formatCode:linted", lintFixed);

    // lint fix 후 재포맷 (import 구문 변경으로 인한 정렬 등)
    const reformatted = await format(fileName, lintFixed, OXFMT_OPTIONS);
    if (reformatted.errors.length > 0) {
      const errorMessages = reformatted.errors
        .filter((e) => e.severity === "Error")
        .map((e) => e.message);
      if (errorMessages.length > 0) {
        !isTest() && console.error("oxfmt reformat errors:", errorMessages);
        throw new Error(`oxfmt reformat error: ${errorMessages.join(", ")}`);
      }
    }

    return reformatted.code;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // 임시 파일 정리 실패는 무시
    }
  }
}
