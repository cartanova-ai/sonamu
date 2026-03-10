import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { todayString } from "../core/date.js";
import type { CddProject, SpecStatus } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

const VALID_STATUSES: SpecStatus[] = ["draft", "in-progress", "done"];

export function runSpecSetStatus(
  specRef: string | undefined,
  status: string | undefined,
  project: CddProject,
): OutputResult {
  if (!specRef || !status) {
    console.error("사용법: cdd spec set-status <spec> <status>");
    process.exit(1);
  }

  if (!VALID_STATUSES.includes(status as SpecStatus)) {
    console.error(`유효하지 않은 status: "${status}" (draft | in-progress | done)`);
    process.exit(1);
  }

  const newStatus = status as SpecStatus;
  const spec = resolveSpec(specRef, project);
  const doc = { ...spec.document };

  doc.status = newStatus;
  doc.lastModified = todayString();

  fs.writeFileSync(spec.path, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, spec.path);

  return {
    data: { path: relPath, status: newStatus },
    pretty() {
      console.log(chalk.green(`상태를 변경했습니다: ${relPath} -> ${doc.status}`));
    },
  };
}
