import { execFileSync } from "child_process";
// mock없는 진짜 fs가 잠깐 필요하기 때문에 끌어다 씁니다 ㅎㅎ
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";

import { format, type FormatConfig } from "oxfmt";

import { isTest } from "./controller";

const _require = createRequire(import.meta.url);

/**
 * 코드를 프로젝트의 oxfmt + oxlint 설정에 맞춰 포매팅한 문자열을 반환합니다.
 */
export async function formatCode(
  code: string,
  parser: "typescript" | "json",
  _filePath: string,
): Promise<string> {
  const formatted = await runOxfmt(code, parser);

  if (parser === "json") {
    // json이면 포맷만 하면 끝이쥬.
    return formatted;
  }

  return runOxlint(formatted);
}

/**
 * 프로젝트 설정을 찾아서 이에 맞춰서 코드를 포맷합니다.
 */
async function runOxfmt(code: string, parser: "typescript" | "json"): Promise<string> {
  // fileName을 실제로 넘겼다가는 .oxfmtrc.json의 ignorePatterns에 걸려서 무시당할 수 있습니다.
  // 생성물들 건드리지 말라고 되어있는 것이긴 하나, 우리는 일단 넘겼으면 무조건 포맷이 되어야 하지 않겠읍니까?
  // 그러니 fake 이름을 지어줘요 ㅎ 이건 뭐 어디 쓰이지도 않기 때문에 괜찮습니다.
  const fileName = parser === "json" ? "stdin.json" : "stdin.ts";
  const result = await format(fileName, code, loadOxfmtConfig());

  if (result.errors.some((e) => e.severity === "Error")) {
    !isTest() &&
      console.error(
        "oxfmt errors:",
        result.errors.filter((e) => e.severity === "Error").map((e) => e.message),
      );
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
function runOxlint(code: string): string {
  const tmpFile = join(
    process.cwd(),
    `.sonamu-fmt-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`,
  );

  try {
    writeFileSync(tmpFile, code, "utf-8");

    try {
      execFileSync(resolveOxlintBin(), ["--fix", "--fix-suggestions", "--type-aware", tmpFile], {
        stdio: "pipe",
        timeout: 10000,
      });
    } catch (e) {
      // lint 위반 시 exit code != 0이지만 --fix는 적용됨. exec 자체 실패만 throw.
      if (typeof (e as Error & { status?: number }).status !== "number") {
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
