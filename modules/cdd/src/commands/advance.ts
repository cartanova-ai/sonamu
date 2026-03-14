import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { todayString } from "../core/date.js";
import type { CddProject, SpecNode, SpecStatus } from "../core/types.js";
import { STATUS_ORDER } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

interface GateFailure {
  message: string;
}

export function runAdvance(specRef: string | undefined, project: CddProject): OutputResult {
  if (!specRef) {
    console.error("사용법: cdd advance <spec>");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const currentIdx = STATUS_ORDER.indexOf(spec.document.status);

  if (currentIdx === STATUS_ORDER.length - 1) {
    return {
      data: { path: path.relative(project.projectRoot, spec.path), status: spec.document.status },
      pretty() {
        console.log(chalk.yellow(`이미 최종 상태입니다: ${spec.document.status}`));
      },
      exitCode: 1,
    };
  }

  const nextStatus = STATUS_ORDER[currentIdx + 1];
  const failures = checkGate(spec, nextStatus, project);

  if (failures.length > 0) {
    const relPath = path.relative(project.projectRoot, spec.path);
    return {
      data: {
        path: relPath,
        currentStatus: spec.document.status,
        targetStatus: nextStatus,
        failures,
      },
      pretty() {
        console.log(chalk.yellow(`현재: ${spec.document.status}`));
        console.log(chalk.red("게이트 체크 실패:"));
        for (const f of failures) {
          console.log(chalk.yellow(`  - ${f.message}`));
        }
        console.log(chalk.red("전환 차단됨"));
      },
      exitCode: 1,
    };
  }

  const doc = { ...spec.document };
  doc.status = nextStatus;
  doc.lastModified = todayString();
  fs.writeFileSync(spec.path, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, spec.path);
  return {
    data: { path: relPath, from: spec.document.status, to: nextStatus },
    pretty() {
      console.log(chalk.yellow(`현재: ${spec.document.status}`));
      console.log(chalk.green(`전환: ${spec.document.status} → ${nextStatus}`));
    },
  };
}

function checkGate(spec: SpecNode, target: SpecStatus, project: CddProject): GateFailure[] {
  const failures: GateFailure[] = [];
  const doc = spec.document;

  switch (target) {
    case "specifying":
      if (spec.resolvedContracts.length === 0) {
        failures.push({
          message: "contracts 필드가 비어 있거나 유효한 Contract를 참조하지 않습니다",
        });
      }
      break;

    case "implementing":
      if (Object.keys(doc.modules).length === 0) {
        failures.push({ message: "modules가 비어 있습니다" });
      }
      if (Object.keys(doc.interfaces).length === 0) {
        failures.push({ message: "interfaces가 비어 있습니다" });
      }
      if (doc.dataFlow.length === 0) {
        failures.push({ message: "dataFlow가 비어 있습니다" });
      }
      if (doc.acceptanceCriteria.length === 0) {
        failures.push({ message: "acceptanceCriteria가 비어 있습니다" });
      }
      break;

    case "validating": {
      if (doc.sources.length === 0) {
        failures.push({ message: "sources가 비어 있습니다" });
      }
      for (const source of doc.sources) {
        const resolved = path.resolve(project.projectRoot, source);
        if (!fs.existsSync(resolved)) {
          failures.push({ message: `sources 파일이 존재하지 않습니다: "${source}"` });
        }
      }
      break;
    }

    case "done": {
      for (const ac of doc.acceptanceCriteria) {
        if (!ac.testRef?.target) {
          failures.push({ message: `AC "${ac.id}": testRef.target이 지정되지 않았습니다` });
          continue;
        }
        const testPath = path.resolve(project.projectRoot, ac.testRef.target);
        if (!fs.existsSync(testPath)) {
          failures.push({
            message: `AC "${ac.id}": 테스트 파일 없음: "${ac.testRef.target}"`,
          });
        }
      }
      break;
    }
  }

  return failures;
}
