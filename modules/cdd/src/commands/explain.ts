import path from "node:path";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveFile } from "../utils/resolve.js";
import {
  defaultExplainDeps,
  type ExplainDeps,
  type ExplainOptions,
  printExplainEmpty,
  printExplainPretty,
  runExplain,
} from "./explain-core.js";

export async function runUnifiedExplain(
  fileRef: string | undefined,
  options: ExplainOptions,
  project: CddProject,
  deps: ExplainDeps = defaultExplainDeps,
): Promise<OutputResult> {
  if (!fileRef) {
    console.error("사용법: cdd explain <file> [--since <date>] [--until <date>] [--commit <hash>]");
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

  const result = await runExplain(absPath, absPath, options, deps);

  if (!result) {
    return {
      data: {
        file: displayName,
        kind: resolved.kind,
        changes: [],
        overall_summary: "",
        breaking_changes: [],
      },
      pretty() {
        printExplainEmpty(label, displayName);
      },
    };
  }

  const data = {
    file: displayName,
    kind: resolved.kind,
    changes: result.changes,
    overall_summary: result.overall_summary,
    breaking_changes: result.breaking_changes,
  };

  return {
    data,
    pretty() {
      printExplainPretty(label, displayName, result);
    },
  };
}
