import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { todayString } from "../core/date.js";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

export function runAcRemove(
  specRef: string | undefined,
  acId: string | undefined,
  project: CddProject,
): OutputResult {
  if (!specRef || !acId) {
    console.error("사용법: cdd ac remove <spec> --id <ac-id>");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const doc = { ...spec.document };
  const criteria = [...doc.acceptanceCriteria];

  const idx = criteria.findIndex((ac) => ac.id === acId);
  if (idx === -1) {
    return {
      data: { error: "not_found", id: acId },
      pretty() {
        console.log(chalk.red(`AC를 찾을 수 없습니다: "${acId}"`));
      },
      exitCode: 1,
    };
  }

  criteria.splice(idx, 1);
  doc.acceptanceCriteria = criteria;
  doc.lastModified = todayString();

  if (doc.status === "done") {
    doc.status = "implementing";
  }

  fs.writeFileSync(spec.path, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, spec.path);
  return {
    data: { path: relPath, removedId: acId },
    pretty() {
      console.log(chalk.green(`AC 제거 완료: ${acId} (${relPath})`));
    },
  };
}
