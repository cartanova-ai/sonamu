import fs from "node:fs";
import path from "node:path";

import chalk from "chalk";
import fg from "fast-glob";

import type { OutputResult } from "../utils/output.js";

interface AcEntry {
  describe: string | null;
  test: string;
}

interface AcFileResult {
  path: string;
  entries: AcEntry[];
}

export async function runAcList(fileRef: string | undefined, cwd: string): Promise<OutputResult> {
  const files: string[] = [];

  if (fileRef) {
    const absPath = path.resolve(cwd, fileRef);
    if (!fs.existsSync(absPath)) {
      return {
        data: { error: `파일을 찾을 수 없습니다: ${fileRef}` },
        pretty() {
          console.log(chalk.red(`파일을 찾을 수 없습니다: ${fileRef}`));
        },
        exitCode: 1,
      };
    }
    files.push(absPath);
  } else {
    const found = await fg("**/*.test.ts", {
      cwd,
      absolute: true,
      ignore: ["**/node_modules/**", "**/dist/**"],
    });
    files.push(...found.sort());
  }

  const results: AcFileResult[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const entries = parseAcEntries(content);
    if (entries.length > 0) {
      results.push({
        path: path.relative(cwd, file),
        entries,
      });
    }
  }

  const totalCount = results.reduce((sum, r) => sum + r.entries.length, 0);

  return {
    data: { files: results, total: totalCount },
    pretty() {
      if (results.length === 0) {
        console.log(chalk.yellow("AC가 없습니다."));
        return;
      }

      for (const file of results) {
        console.log(chalk.bold(file.path));
        const grouped = groupByDescribe(file.entries);

        for (const [describe, tests] of grouped) {
          if (describe) {
            console.log(`  ${chalk.cyan(describe)}`);
            for (const t of tests) {
              console.log(`    ${chalk.white(t)}`);
            }
          } else {
            for (const t of tests) {
              console.log(`  ${chalk.white(t)}`);
            }
          }
        }
        console.log();
      }

      console.log(chalk.dim(`총 ${totalCount}개 AC (${results.length}개 파일)`));
    },
  };
}

/**
 * test("name"), it("name") — 테스트명이 첫 번째 문자열 인자
 * testAs({...}, "name") — 첫 번째 인자가 객체, 두 번째가 테스트명 (멀티라인)
 */
function parseAcEntries(content: string): AcEntry[] {
  const entries: AcEntry[] = [];
  const lines = content.split("\n");

  let currentDescribe: string | null = null;
  let describeDepth = 0;
  let braceDepth = 0;
  // testAs 멀티라인 파싱용 상태
  let pendingTestAs = false;
  let testAsBraceDepth = 0;
  let testAsNeedName = false;

  for (const line of lines) {
    const trimmed = line.trim();

    const describeMatch = trimmed.match(/^describe\(["'`](.+?)["'`]/);
    if (describeMatch) {
      currentDescribe = describeMatch[1];
      describeDepth = braceDepth;
    }

    const testMatch = trimmed.match(/^(?:test|it)\(["'`](.+?)["'`]/);
    if (testMatch) {
      entries.push({
        describe: currentDescribe,
        test: testMatch[1],
      });
    }

    // testAs: 첫 번째 인자(객체)가 닫힌 후 두 번째 인자(문자열)에서 테스트명 추출
    if (!pendingTestAs && trimmed.match(/^testAs\s*\(/)) {
      const inlineMatch = trimmed.match(/^testAs\s*\(\s*\{[^}]*\}\s*,\s*["'`](.+?)["'`]/);
      if (inlineMatch) {
        entries.push({ describe: currentDescribe, test: inlineMatch[1] });
      } else {
        pendingTestAs = true;
        testAsBraceDepth = 0;
        testAsNeedName = false;
        for (const ch of trimmed) {
          if (ch === "{") testAsBraceDepth++;
          if (ch === "}") testAsBraceDepth--;
        }
        if (testAsBraceDepth <= 0) {
          testAsNeedName = true;
          const nameMatch = trimmed.match(/}\s*,\s*["'`](.+?)["'`]/);
          if (nameMatch) {
            entries.push({ describe: currentDescribe, test: nameMatch[1] });
            pendingTestAs = false;
            testAsNeedName = false;
          }
        }
      }
    } else if (pendingTestAs) {
      if (!testAsNeedName) {
        for (const ch of trimmed) {
          if (ch === "{") testAsBraceDepth++;
          if (ch === "}") testAsBraceDepth--;
        }
        if (testAsBraceDepth <= 0) {
          testAsNeedName = true;
          const nameMatch = trimmed.match(/}\s*,\s*["'`](.+?)["'`]/);
          if (nameMatch) {
            entries.push({ describe: currentDescribe, test: nameMatch[1] });
            pendingTestAs = false;
            testAsNeedName = false;
          }
        }
      } else {
        const nameMatch = trimmed.match(/^["'`](.+?)["'`]/);
        if (nameMatch) {
          entries.push({ describe: currentDescribe, test: nameMatch[1] });
          pendingTestAs = false;
          testAsNeedName = false;
        }
      }
    }

    for (const ch of trimmed) {
      if (ch === "{") braceDepth++;
      if (ch === "}") {
        braceDepth--;
        if (currentDescribe && braceDepth <= describeDepth) {
          currentDescribe = null;
        }
      }
    }
  }

  return entries;
}

function groupByDescribe(entries: AcEntry[]): Map<string | null, string[]> {
  const map = new Map<string | null, string[]>();
  for (const e of entries) {
    const list = map.get(e.describe);
    if (list) {
      list.push(e.test);
    } else {
      map.set(e.describe, [e.test]);
    }
  }
  return map;
}
