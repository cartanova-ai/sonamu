import fs from "node:fs";
import path from "node:path";
import type { CddProject, ValidationIssue } from "../core/types.js";
import { formatPath, formatSeverity } from "../utils/format.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

export function runAcCheck(specRef: string | undefined, project: CddProject): OutputResult {
  if (!specRef) {
    console.error("사용법: cdd ac check <spec>");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const issues: ValidationIssue[] = [];

  for (const ac of spec.document.acceptanceCriteria) {
    if (!ac.testRef?.target) continue;

    const testPath = path.resolve(project.projectRoot, ac.testRef.target);
    if (!fs.existsSync(testPath)) {
      issues.push({
        severity: "error",
        path: spec.path,
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
            path: spec.path,
            message: `AC "${ac.id}": 테스트 파일에서 패턴 "${ac.testRef.pattern}"을(를) 찾을 수 없습니다`,
          });
        }
      } catch {
        issues.push({
          severity: "error",
          path: spec.path,
          message: `AC "${ac.id}": 유효하지 않은 정규식 패턴: "${ac.testRef.pattern}"`,
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warning").length;

  return {
    data: {
      spec: spec.basename,
      issues: issues.map((i) => ({
        severity: i.severity,
        path: formatPath(i.path, project.projectRoot),
        message: i.message,
      })),
      errorCount,
      warningCount: warnCount,
    },
    pretty() {
      if (issues.length === 0) {
        console.log(`${spec.basename}: AC testRef 검증 완료 — 이슈 없음`);
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
