import chalk from "chalk";
import type { IssueSeverity, SpecStatus } from "../core/types.js";

/** 상태별 색상 포매팅 */
export function formatStatus(status: SpecStatus): string {
  switch (status) {
    case "draft":
      return chalk.yellow(status);
    case "specifying":
      return chalk.hex("#f59e0b")(status);
    case "implementing":
      return chalk.blue(status);
    case "validating":
      return chalk.magenta(status);
    case "done":
      return chalk.green(status);
  }
}

/** 이슈 심각도별 색상 포매팅 */
export function formatSeverity(severity: IssueSeverity): string {
  switch (severity) {
    case "error":
      return chalk.red("ERROR");
    case "warning":
      return chalk.yellow("WARN");
  }
}

/** 파일 경로를 짧게 표시 (projectRoot 기준 상대 경로) */
export function formatPath(absPath: string, projectRoot: string): string {
  if (absPath.startsWith(projectRoot)) {
    return absPath.slice(projectRoot.length + 1);
  }
  return absPath;
}
