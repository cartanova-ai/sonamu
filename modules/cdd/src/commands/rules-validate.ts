import path from "node:path";

import chalk from "chalk";

import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";

interface RulesFileResult {
  path: string;
  valid: boolean;
  ruleCount: number;
  errors: string[];
}

interface RulesValidateData {
  files: RulesFileResult[];
  globalErrors: string[];
  summary: { total: number; passed: number; failed: number };
}

export function runRulesValidate(project: CddProject): OutputResult {
  const fileResults: RulesFileResult[] = [];
  const globalErrors: string[] = [];

  for (const rule of project.rules) {
    fileResults.push({
      path: path.relative(project.projectRoot, rule.path),
      valid: true,
      ruleCount: rule.document.rules.length,
      errors: [],
    });
  }

  // 파일 간 id 중복 검사
  const globalIdMap = new Map<string, string[]>();
  for (const rule of project.rules) {
    const relPath = path.relative(project.projectRoot, rule.path);
    for (const entry of rule.document.rules) {
      const existing = globalIdMap.get(entry.id);
      if (existing) {
        existing.push(relPath);
      } else {
        globalIdMap.set(entry.id, [relPath]);
      }
    }
  }

  for (const [id, files] of globalIdMap) {
    if (files.length > 1) {
      globalErrors.push(`id "${id}"가 여러 파일에서 중복됩니다: ${files.join(", ")}`);
    }
  }

  const total = fileResults.length;
  const failed = fileResults.filter((f) => !f.valid).length + (globalErrors.length > 0 ? 0 : 0);
  const passed = total - failed;

  const data: RulesValidateData = {
    files: fileResults,
    globalErrors,
    summary: {
      total,
      passed: globalErrors.length > 0 ? passed : passed,
      failed: globalErrors.length > 0 ? failed : failed,
    },
  };

  const hasErrors = globalErrors.length > 0 || fileResults.some((f) => !f.valid);

  return {
    data,
    pretty() {
      console.log(chalk.bold("CDD Rules Validation"));
      console.log();

      if (fileResults.length === 0) {
        console.log(chalk.yellow("  rules 파일이 없습니다."));
        return;
      }

      for (const file of fileResults) {
        const status = file.valid ? chalk.green("PASS") : chalk.red("FAIL");
        console.log(`  ${status}  ${file.path} (${file.ruleCount} rules)`);
        for (const err of file.errors) {
          console.log(chalk.red(`         ${err}`));
        }
      }

      if (globalErrors.length > 0) {
        console.log();
        console.log(chalk.red("  Global errors:"));
        for (const err of globalErrors) {
          console.log(chalk.red(`    - ${err}`));
        }
      }

      console.log();
      console.log(
        `  ${chalk.bold("Total:")} ${total}  ${chalk.green("Passed:")} ${passed}  ${chalk.red("Failed:")} ${failed}`,
      );

      if (globalErrors.length > 0) {
        console.log();
        console.log(chalk.red("  파일 간 중복 id가 발견되었습니다."));
      }
    },
    exitCode: hasErrors ? 1 : undefined,
  };
}
