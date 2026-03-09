import type { CddProject } from "../core/types.js";
import { validateProject } from "../core/validator.js";
import { formatPath, formatSeverity } from "../utils/format.js";

export function runValidate(project: CddProject): void {
  const issues = validateProject(project);

  if (issues.length === 0) {
    console.log("검증 완료: 이슈가 없습니다.");
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
