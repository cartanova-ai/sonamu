// mock없는 진짜 fs가 잠깐 필요하기 때문에 끌어다 씁니다 ㅎㅎ
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { createRequire } from "module";
import path, { dirname, join } from "path";

import { format, type FormatConfig } from "oxfmt";

import { isTest } from "./controller";
import { execute } from "./process-utils";

const _require = createRequire(import.meta.url);

/**
 * 코드를 프로젝트의 oxfmt + oxlint 설정에 맞춰 포매팅한 문자열을 반환합니다.
 */
export async function formatCode(code: string, filePath: string): Promise<string> {
  // json은 포맷만 하면 됩니다.
  if (filePath.endsWith("json")) {
    return runOxfmt(code, filePath);
  }

  // 린트 먼저 한 다음에 포맷으로 마무리해요.
  return runOxfmt(await runOxlint(code), filePath);
}

/**
 * 프로젝트 설정을 찾아서 이에 맞춰서 코드를 포맷합니다.
 */
async function runOxfmt(code: string, filePath: string): Promise<string> {
  const result = await format(path.basename(filePath), code, loadOxfmtConfig());

  const errors = result.errors.filter((e) => e.severity === "Error");
  if (errors.length > 0) {
    if (!isTest()) {
      console.error(`oxfmt errors (${filePath}):`);
      for (const err of errors) {
        const label = err.labels[0];
        if (label) {
          const before = code.slice(Math.max(0, label.start - 80), label.start);
          const at = code.slice(label.start, label.end);
          const after = code.slice(label.end, Math.min(code.length, label.end + 80));
          console.error(`  - ${err.message} (offset ${label.start}-${label.end})`);
          console.error(`    around: ...${before}»${at}«${after}...`);
        } else {
          console.error(`  - ${err.message}`);
        }
      }
    }
    return code;
  }
  return result.code;
}

let cachedOxfmtConfig: FormatConfig | null = null;
function loadOxfmtConfig(): FormatConfig {
  if (cachedOxfmtConfig !== null) {
    return cachedOxfmtConfig;
  }

  let dir = process.cwd();
  while (true) {
    const candidate = join(dir, ".oxfmtrc.json");
    try {
      cachedOxfmtConfig = JSON.parse(readFileSync(candidate, "utf-8")) as FormatConfig;
      return cachedOxfmtConfig;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        !isTest() && console.error(`Failed to load ${candidate}:`, e);
        break;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  cachedOxfmtConfig = {};
  return cachedOxfmtConfig;
}

/**
 * 프로젝트 설정에 맞춰 코드를 lint합니다.
 *
 * 프로젝트 설정을 적용받는 oxlint cli를 찾아 띄워서,
 * 임시 파일에 in-place로 써서 그 결과를 빼오는 방식으로 작동합니다.
 * 왜 이렇게 하느냐? oxlint가 node api도 안 주고 cli에서 stdin 옵션도 안 주기 때문...
 */
async function runOxlint(code: string): Promise<string> {
  const tmpFile = join(
    process.cwd(),
    `.sonamu-fmt-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`,
  );

  try {
    writeFileSync(tmpFile, code, "utf-8");

    try {
      await execute(resolveOxlintBin(), ["--fix", "--fix-suggestions", "--type-aware", tmpFile], {
        timeout: 10000,
      });
    } catch (e) {
      // lint 위반 시 exit code != 0이지만 --fix는 적용됨. exec 자체 실패만 throw.
      if (typeof (e as Error & { code?: number }).code !== "number") {
        throw e;
      }
    }

    return readFileSync(tmpFile, "utf-8");
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // 삭제 실패해도 어차피 ignore됨.
    }
  }
}

function resolveOxlintBin(): string {
  try {
    return _require.resolve("oxlint/bin/oxlint");
  } catch {
    return "oxlint";
  }
}
