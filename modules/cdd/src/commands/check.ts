import fs from "node:fs";
import path from "node:path";
import type { CddProject, ValidationIssue } from "../core/types.js";
import { formatPath, formatSeverity } from "../utils/format.js";

export function runCheck(project: CddProject): void {
  const issues: ValidationIssue[] = [];

  for (const spec of project.specs) {
    checkSourcesExist(spec.document.sources, project.projectRoot, spec.path, issues);
    checkSourcesSecurity(spec.document.sources, project.projectRoot, spec.path, issues);
    checkDuplicateSources(spec.document.sources, spec.path, issues);
    checkStatusRevisionConsistency(spec.document, spec.path, issues);
  }

  if (issues.length === 0) {
    console.log("Spec-Code 일관성 검증 완료: 이슈가 없습니다.");
    return;
  }

  for (const issue of issues) {
    const sev = formatSeverity(issue.severity);
    const rel = formatPath(issue.path, project.projectRoot);
    console.log(`  ${sev}  ${rel}  ${issue.message}`);
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warning").length;

  console.log();
  console.log(`${errorCount} error(s), ${warnCount} warning(s)`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

function checkSourcesExist(
  sources: string[],
  projectRoot: string,
  filePath: string,
  issues: ValidationIssue[],
): void {
  for (const source of sources) {
    const resolved = path.resolve(projectRoot, source);
    if (!fs.existsSync(resolved)) {
      issues.push({
        severity: "warning",
        path: filePath,
        message: `sources 파일이 존재하지 않습니다: "${source}"`,
      });
    }
  }
}

function checkSourcesSecurity(
  sources: string[],
  projectRoot: string,
  filePath: string,
  issues: ValidationIssue[],
): void {
  for (const source of sources) {
    const resolved = path.resolve(projectRoot, source);
    const rel = path.relative(projectRoot, resolved);
    if (rel.startsWith("..")) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `sources 경로가 프로젝트 루트를 벗어납니다: "${source}"`,
      });
    }
  }
}

function checkDuplicateSources(
  sources: string[],
  filePath: string,
  issues: ValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source)) {
      issues.push({
        severity: "warning",
        path: filePath,
        message: `sources에 중복 참조가 있습니다: "${source}"`,
      });
    }
    seen.add(source);
  }
}

function checkStatusRevisionConsistency(
  doc: { status: string; revisions: { status: string }[] },
  filePath: string,
  issues: ValidationIssue[],
): void {
  if (doc.status === "done") {
    const notDone = doc.revisions.filter((r) => r.status !== "done");
    if (notDone.length > 0) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `status가 "done"이지만 완료되지 않은 revision이 ${notDone.length}개 있습니다`,
      });
    }
  }
}
