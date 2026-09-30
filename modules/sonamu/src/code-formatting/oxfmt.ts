import { readFile } from "node:fs/promises";
import path, { dirname, join } from "node:path";

import { format, type FormatConfig } from "oxfmt";

import { isTest } from "../utils/controller";

/**
 * 프로젝트 설정을 찾아서 이에 맞춰서 코드를 포맷합니다.
 */
export async function runOxfmt(code: string, filePath: string): Promise<string> {
  const result = await format(path.basename(filePath), code, await loadOxfmtConfig());

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
async function loadOxfmtConfig(): Promise<FormatConfig> {
  if (cachedOxfmtConfig !== null) {
    return cachedOxfmtConfig;
  }

  let dir = process.cwd();
  while (true) {
    const candidate = join(dir, ".oxfmtrc.json");
    try {
      // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
      cachedOxfmtConfig = JSON.parse(await readFile(candidate, "utf-8")) as FormatConfig;
      return cachedOxfmtConfig;
    } catch (e) {
      // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
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
