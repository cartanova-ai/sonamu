import fs from "node:fs";
import path from "node:path";
import type { AcceptanceCriterion, CddProject, ValidationIssue } from "../core/types.js";
import { findMissingResolvedPaths, findSourcesOutsideRoot } from "../core/validation-shared.js";
import { formatPath, formatSeverity } from "../utils/format.js";
import type { OutputResult } from "../utils/output.js";

export function runCheck(project: CddProject): OutputResult {
  const issues: ValidationIssue[] = [];
  const specPaths = new Set(project.specs.map((s) => s.path));

  for (const spec of project.specs) {
    checkSourcesExist(spec.document.sources, project.projectRoot, spec.path, issues);
    checkSourcesSecurity(spec.document.sources, project.projectRoot, spec.path, issues);
    checkDuplicateSources(spec.document.sources, project.projectRoot, spec.path, issues);
    checkDependsOnSpecsExist(spec.resolvedDependsOnSpecs, specPaths, spec.path, issues);
    checkAcceptanceCriteriaTestRefs(
      spec.document.acceptanceCriteria,
      project.projectRoot,
      spec.path,
      issues,
    );
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warning").length;

  const data = {
    issues: issues.map((i) => ({
      severity: i.severity,
      path: formatPath(i.path, project.projectRoot),
      message: i.message,
    })),
    errorCount,
    warningCount: warnCount,
  };

  return {
    data,
    pretty() {
      if (issues.length === 0) {
        console.log("Spec-Code 일관성 검증 완료: 이슈가 없습니다.");
        return;
      }

      for (const issue of issues) {
        const sev = formatSeverity(issue.severity);
        const rel = formatPath(issue.path, project.projectRoot);
        console.log(`  ${sev}  ${rel}  ${issue.message}`);
      }

      console.log();
      console.log(`${errorCount} error(s), ${warnCount} warning(s)`);
    },
    exitCode: errorCount > 0 ? 1 : undefined,
  };
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

/** AC testRef 검증: 테스트 파일 존재 및 패턴 매칭 확인 */
function checkAcceptanceCriteriaTestRefs(
  criteria: AcceptanceCriterion[],
  projectRoot: string,
  filePath: string,
  issues: ValidationIssue[],
): void {
  for (const ac of criteria) {
    if (!ac.testRef?.target) continue;

    const testPath = path.resolve(projectRoot, ac.testRef.target);
    if (!fs.existsSync(testPath)) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `AC "${ac.id}": 테스트 파일이 존재하지 않습니다: "${ac.testRef.target}"`,
      });
      continue;
    }

    if (ac.testRef.pattern) {
      const content = fs.readFileSync(testPath, "utf-8");
      try {
        const regex = new RegExp(ac.testRef.pattern);
        if (!regex.test(content)) {
          issues.push({
            severity: "warning",
            path: filePath,
            message: `AC "${ac.id}": 테스트 파일에서 패턴 "${ac.testRef.pattern}"을(를) 찾을 수 없습니다`,
          });
        }
      } catch {
        issues.push({
          severity: "error",
          path: filePath,
          message: `AC "${ac.id}": 유효하지 않은 정규식 패턴: "${ac.testRef.pattern}"`,
        });
      }
    }
  }
}
