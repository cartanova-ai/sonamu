import path from "node:path";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveFile } from "../utils/resolve.js";
import {
  defaultLogDeps,
  type LogDeps,
  type LogOptions,
  printLogPretty,
  runLog,
} from "./log-core.js";

export async function runUnifiedLog(
  fileRef: string | undefined,
  options: LogOptions,
  project: CddProject,
  deps: LogDeps = defaultLogDeps,
): Promise<OutputResult> {
  if (!fileRef) {
    console.error(
      "사용법: cdd log <file> [--since <date>] [--until <date>] [--group-by <day|week|month>]",
    );
    process.exit(1);
  }

  const resolved = resolveFile(fileRef, project);

  let absPath: string;
  let label: string;
  let displayName: string;

  switch (resolved.kind) {
    case "spec":
      absPath = resolved.node.path;
      label = "Spec";
      displayName = resolved.node.basename;
      break;
    case "contract":
      absPath = resolved.node.path;
      label = "Contract";
      displayName = resolved.node.basename;
      break;
    case "source":
      absPath = resolved.absPath;
      label = "Source";
      displayName = path.relative(project.projectRoot, resolved.absPath);
      break;
  }

  const result = await runLog(absPath, options, deps);

  const data = {
    file: displayName,
    kind: resolved.kind,
    group_by: result.groupBy,
    timeline: result.timeline,
  };

  return {
    data,
    pretty() {
      printLogPretty(label, displayName, data.group_by, data.timeline);
    },
  };
}
