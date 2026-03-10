import fs from "node:fs";
import path from "node:path";
import type { CddProject, ValidationIssue } from "../core/types.js";
import { findMissingResolvedPaths, findSourcesOutsideRoot } from "../core/validation-shared.js";
import { formatPath, formatSeverity } from "../utils/format.js";

export function runCheck(project: CddProject): void {
  const issues: ValidationIssue[] = [];
  const specPaths = new Set(project.specs.map((s) => s.path));

  for (const spec of project.specs) {
    checkSourcesExist(spec.document.sources, project.projectRoot, spec.path, issues);
    checkSourcesSecurity(spec.document.sources, project.projectRoot, spec.path, issues);
    checkDuplicateSources(spec.document.sources, project.projectRoot, spec.path, issues);
    checkDependsOnSpecsExist(spec.resolvedDependsOnSpecs, specPaths, spec.path, issues);
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
  for (const source of findSourcesOutsideRoot(sources, projectRoot)) {
    issues.push({
      severity: "error",
      path: filePath,
      message: `sources 경로가 프로젝트 루트를 벗어납니다: "${source}"`,
    });
  }
}

function checkDuplicateSources(
  sources: string[],
  projectRoot: string,
  filePath: string,
  issues: ValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const source of sources) {
    const normalized = path.resolve(projectRoot, source);
    if (seen.has(normalized)) {
      issues.push({
        severity: "warning",
        path: filePath,
        message: `sources에 중복 참조가 있습니다: "${source}"`,
      });
    }
    seen.add(normalized);
  }
}

function checkDependsOnSpecsExist(
  resolvedDependsOnSpecs: string[],
  specPaths: Set<string>,
  filePath: string,
  issues: ValidationIssue[],
): void {
  for (const dep of findMissingResolvedPaths(resolvedDependsOnSpecs, specPaths)) {
    issues.push({
      severity: "error",
      path: filePath,
      message: `dependsOnSpecs 참조를 찾을 수 없습니다: "${dep}"`,
    });
  }
}
