import type { CddProject } from "../core/types.js";
import { validateProject } from "../core/validator.js";
import { formatPath, formatSeverity } from "../utils/format.js";
import type { OutputResult } from "../utils/output.js";

export function runValidate(project: CddProject): OutputResult {
  const issues = validateProject(project);

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
        console.log("검증 완료: 이슈가 없습니다.");
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
