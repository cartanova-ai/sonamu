import fs from "node:fs";
import path from "node:path";

import chalk from "chalk";

import { type OutputResult } from "../utils/output.js";

export interface AcAddOptions {
  describe?: string;
}

export function runAcAdd(
  file: string | undefined,
  testName: string | undefined,
  options: AcAddOptions,
  cwd: string,
): OutputResult {
  if (!file || !testName) {
    console.error("사용법: cdd ac add <파일> [--describe <그룹>] <테스트명>");
    process.exit(1);
  }

  const absPath = path.resolve(cwd, file);
  const dirPath = path.dirname(absPath);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  if (!fs.existsSync(absPath)) {
    const content = options.describe
      ? `describe("${options.describe}", () => {\n  test("${testName}", () => {\n    // TODO\n  });\n});\n`
      : `test("${testName}", () => {\n  // TODO\n});\n`;
    fs.writeFileSync(absPath, content);

    const relPath = path.relative(cwd, absPath);
    return {
      data: { path: relPath, describe: options.describe ?? null, test: testName, created: true },
      pretty() {
        console.log(chalk.green(`생성됨: ${relPath}`));
        if (options.describe) {
          console.log(`  describe: ${options.describe}`);
        }
        console.log(`  test: ${testName}`);
      },
    };
  }

  const content = fs.readFileSync(absPath, "utf-8");
  const relPath = path.relative(cwd, absPath);

  if (options.describe) {
    const describePattern = new RegExp(`describe\\(["'\`]${escapeRegExp(options.describe)}["'\`]`);
    const match = describePattern.exec(content);

    if (match) {
      const insertPos = findDescribeInsertPosition(content, match.index);
      if (insertPos === -1) {
        return {
          data: { error: `describe 블록의 닫는 위치를 찾을 수 없습니다: "${options.describe}"` },
          pretty() {
            console.log(
              chalk.red(`describe 블록의 닫는 위치를 찾을 수 없습니다: "${options.describe}"`),
            );
          },
          exitCode: 1,
        };
      }

      const indent = detectIndent(content, match.index);
      const testCode = `${indent}  test("${testName}", () => {\n${indent}    // TODO\n${indent}  });\n`;
      const updated = content.slice(0, insertPos) + testCode + content.slice(insertPos);
      fs.writeFileSync(absPath, updated);
    } else {
      const describeBlock = `\ndescribe("${options.describe}", () => {\n  test("${testName}", () => {\n    // TODO\n  });\n});\n`;
      fs.appendFileSync(absPath, describeBlock);
    }
  } else {
    const testCode = `\ntest("${testName}", () => {\n  // TODO\n});\n`;
    fs.appendFileSync(absPath, testCode);
  }

  return {
    data: { path: relPath, describe: options.describe ?? null, test: testName, created: false },
    pretty() {
      console.log(chalk.green(`추가됨: ${relPath}`));
      if (options.describe) {
        console.log(`  describe: ${options.describe}`);
      }
      console.log(`  test: ${testName}`);
    },
  };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectIndent(content: string, pos: number): string {
  const lineStart = content.lastIndexOf("\n", pos - 1) + 1;
  const beforeDescribe = content.slice(lineStart, pos);
  const match = beforeDescribe.match(/^(\s*)/);
  return match ? match[1] : "";
}

function findDescribeInsertPosition(content: string, describeStart: number): number {
  let depth = 0;
  let inString: string | null = null;
  let i = content.indexOf("{", describeStart);
  if (i === -1) return -1;

  for (; i < content.length; i++) {
    const ch = content[i];

    if (inString) {
      if (ch === "\\" && i + 1 < content.length) {
        i++;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const beforeClose = content.lastIndexOf("\n", i);
        return beforeClose === -1 ? i : beforeClose + 1;
      }
    }
  }

  return -1;
}
