import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { todayString } from "../core/date.js";
import type { AcceptanceCriterion, CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

interface AcAddOptions {
  condition?: string;
  target?: string;
  pattern?: string;
  id?: string;
}

export function runAcAdd(
  specRef: string | undefined,
  options: AcAddOptions,
  project: CddProject,
): OutputResult {
  if (!specRef) {
    console.error("사용법: cdd ac add <spec> --condition <text> --target <file> --pattern <regex>");
    process.exit(1);
  }

  if (!options.condition || !options.target || !options.pattern) {
    console.error("--condition, --target, --pattern은 필수입니다");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const doc = { ...spec.document };
  const criteria = [...doc.acceptanceCriteria];

  const acId = options.id ?? generateAcId(spec.basename, criteria);

  if (criteria.some((ac) => ac.id === acId)) {
    return {
      data: { error: "duplicate_id", id: acId },
      pretty() {
        console.log(chalk.red(`중복된 AC id: "${acId}"`));
      },
      exitCode: 1,
    };
  }

  const newAc: AcceptanceCriterion = {
    id: acId,
    condition: options.condition,
    testRef: {
      target: options.target,
      pattern: options.pattern,
    },
  };

  criteria.push(newAc);
  doc.acceptanceCriteria = criteria;
  doc.lastModified = todayString();

  if (doc.status === "done") {
    doc.status = "implementing";
  }

  fs.writeFileSync(spec.path, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, spec.path);
  return {
    data: { path: relPath, ac: newAc },
    pretty() {
      console.log(chalk.green(`AC 추가: ${acId}`));
      console.log(`  condition: ${newAc.condition}`);
      console.log(`  testRef: ${newAc.testRef.target} | /${newAc.testRef.pattern}/`);
    },
  };
}

function generateAcId(specBasename: string, existing: AcceptanceCriterion[]): string {
  const prefix = `ac-${specBasename}-`;
  let seq = 1;
  const existingIds = new Set(existing.map((ac) => ac.id));
  while (existingIds.has(`${prefix}${seq}`)) {
    seq++;
  }
  return `${prefix}${seq}`;
}
