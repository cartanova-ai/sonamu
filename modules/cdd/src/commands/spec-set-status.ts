import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { CddProject, SpecDocument, SpecNode, SpecStatus } from "../core/types.js";

const VALID_STATUSES: SpecStatus[] = ["draft", "in-progress", "done"];
const STATUS_ORDER: Record<SpecStatus, number> = { draft: 0, "in-progress": 1, done: 2 };

export function runSpecSetStatus(
  specRef: string | undefined,
  status: string | undefined,
  revisionId: string | undefined,
  project: CddProject,
): void {
  if (!specRef || !status) {
    console.error("사용법: cdd spec set-status <spec> <status> [--revision <id>]");
    process.exit(1);
  }

  if (!VALID_STATUSES.includes(status as SpecStatus)) {
    console.error(`유효하지 않은 status: "${status}" (draft | in-progress | done)`);
    process.exit(1);
  }

  const newStatus = status as SpecStatus;
  const spec = resolveSpec(specRef, project);
  const doc: SpecDocument = { ...spec.document };

  if (revisionId) {
    const rev = doc.revisions.find((r) => r.id === revisionId);
    if (!rev) {
      console.error(`revision을 찾을 수 없습니다: "${revisionId}"`);
      const ids = doc.revisions.map((r) => r.id);
      console.error(`사용 가능한 revision: ${ids.join(", ")}`);
      process.exit(1);
    }
    rev.status = newStatus;
  } else {
    for (const rev of doc.revisions) {
      rev.status = newStatus;
    }
  }

  // top-level status = revision 최솟값으로 재계산
  doc.status = doc.revisions.reduce<SpecStatus>((min, rev) => {
    return STATUS_ORDER[rev.status] < STATUS_ORDER[min] ? rev.status : min;
  }, "done");

  doc.lastModified = todayString();

  fs.writeFileSync(spec.path, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, spec.path);
  console.log(chalk.green(`상태를 변경했습니다: ${relPath} -> ${doc.status}`));
}

function resolveSpec(specRef: string, project: CddProject): SpecNode {
  // 경로로 직접 매칭 시도
  const absPath = path.resolve(project.projectRoot, specRef);
  const byPath = project.specs.find((s) => s.path === absPath);
  if (byPath) return byPath;

  // basename으로 검색
  const byName = project.specs.filter((s) => s.basename === specRef);
  if (byName.length === 1) return byName[0];

  if (byName.length > 1) {
    console.error(`동명의 Spec이 여러 개 존재합니다: "${specRef}"`);
    for (const s of byName) {
      console.error(`  - ${path.relative(project.projectRoot, s.path)}`);
    }
    process.exit(1);
  }

  console.error(`Spec을 찾을 수 없습니다: "${specRef}"`);
  process.exit(1);
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
