import path from "node:path";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSourcePath } from "../utils/resolve.js";
import {
  defaultLogDeps,
  type LogDeps,
  type LogOptions,
  printLogPretty,
  runLog,
} from "./log-core.js";

export type SourceLogOptions = LogOptions;
export type SourceLogDeps = LogDeps;

export async function runSourceLog(
  sourceRef: string | undefined,
  options: SourceLogOptions,
  project: CddProject,
  deps: SourceLogDeps = defaultLogDeps,
): Promise<OutputResult> {
  if (!sourceRef) {
    console.error(
      "사용법: cdd source log <file> [--since <date>] [--until <date>] [--group-by <day|week|month>]",
    );
    process.exit(1);
  }

  const sourcePath = resolveSourcePath(sourceRef, project);
  const sourceAbsPath = path.resolve(project.projectRoot, sourcePath);
  const result = await runLog(sourceAbsPath, options, deps);

  const data = {
    source: sourcePath,
    group_by: result.groupBy,
    timeline: result.timeline,
  };

  return {
    data,
    pretty() {
      printLogPretty("Source", sourcePath, data.group_by, data.timeline);
    },
  };
}
