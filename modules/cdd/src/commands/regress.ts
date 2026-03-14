import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { todayString } from "../core/date.js";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

export function runRegress(specRef: string | undefined, project: CddProject): OutputResult {
  if (!specRef) {
    console.error("사용법: cdd regress <spec>");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);

  if (spec.document.status !== "done") {
    return {
      data: { path: path.relative(project.projectRoot, spec.path), status: spec.document.status },
      pretty() {
        console.log(
          chalk.yellow(`회귀는 done 상태에서만 가능합니다. 현재: ${spec.document.status}`),
        );
      },
      exitCode: 1,
    };
  }

  const doc = { ...spec.document };
  doc.status = "implementing";
  doc.lastModified = todayString();
  fs.writeFileSync(spec.path, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, spec.path);
  return {
    data: { path: relPath, from: "done", to: "implementing" },
    pretty() {
      console.log(chalk.green(`회귀 완료: done → implementing (${relPath})`));
    },
  };
}
