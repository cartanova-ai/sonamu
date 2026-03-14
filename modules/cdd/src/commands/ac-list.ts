import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

interface AcStatus {
  id: string;
  condition: string;
  target: string;
  pattern: string;
  targetExists: boolean;
  patternMatched: boolean | null;
}

export function runAcList(specRef: string | undefined, project: CddProject): OutputResult {
  if (!specRef) {
    console.error("사용법: cdd ac list <spec>");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const results: AcStatus[] = [];

  for (const ac of spec.document.acceptanceCriteria) {
    const testPath = path.resolve(project.projectRoot, ac.testRef.target);
    const targetExists = fs.existsSync(testPath);
    let patternMatched: boolean | null = null;

    if (targetExists && ac.testRef.pattern) {
      try {
        const content = fs.readFileSync(testPath, "utf-8");
        const regex = new RegExp(ac.testRef.pattern);
        patternMatched = regex.test(content);
      } catch {
        patternMatched = false;
      }
    }

    results.push({
      id: ac.id,
      condition: ac.condition,
      target: ac.testRef.target,
      pattern: ac.testRef.pattern,
      targetExists,
      patternMatched,
    });
  }

  const passed = results.filter((r) => r.targetExists && r.patternMatched === true).length;
  const failed = results.length - passed;

  return {
    data: { spec: spec.basename, criteria: results, passed, failed },
    pretty() {
      console.log(`${spec.basename} — ${results.length} acceptance criteria`);
      console.log();

      for (const r of results) {
        const ok = r.targetExists && r.patternMatched === true;
        const icon = ok ? chalk.green("✓") : chalk.red("✗");
        console.log(`  ${icon} ${chalk.bold(r.id)}  ${r.condition}`);

        let testStatus: string;
        if (!r.targetExists) {
          testStatus = chalk.red("✗ file not found");
        } else if (r.patternMatched === true) {
          testStatus = chalk.green("✓ matched");
        } else {
          testStatus = chalk.red("✗ pattern not found");
        }
        console.log(`    test: ${r.target}  /${r.pattern}/  ${testStatus}`);
        console.log();
      }

      console.log(`${passed} passed, ${failed} failed`);
    },
  };
}
