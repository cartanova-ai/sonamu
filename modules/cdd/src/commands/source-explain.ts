import path from "node:path";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSourcePath } from "../utils/resolve.js";
import {
  defaultExplainDeps,
  type ExplainDeps,
  type ExplainOptions,
  printExplainEmpty,
  printExplainPretty,
  runExplain,
} from "./explain-core.js";

export type SourceExplainOptions = ExplainOptions;
export type SourceExplainDeps = ExplainDeps;

export interface SourceExplainData {
  source: string;
  changes: Array<{
    section: string;
    author: string;
    date: string;
    what: string;
    why: string;
    impact: "low" | "medium" | "high";
  }>;
  overall_summary: string;
  breaking_changes: string[];
}

export async function runSourceExplain(
  sourceRef: string | undefined,
  options: SourceExplainOptions,
  project: CddProject,
  deps: SourceExplainDeps = defaultExplainDeps,
): Promise<OutputResult> {
  if (!sourceRef) {
    console.error(
      "사용법: cdd source explain <file> [--since <date>] [--until <date>] [--commit <hash>]",
    );
    process.exit(1);
  }

  const sourcePath = resolveSourcePath(sourceRef, project);
  const sourceAbsPath = path.resolve(project.projectRoot, sourcePath);

  const result = await runExplain(sourceAbsPath, sourcePath, options, deps);

  if (!result) {
    const fallback: SourceExplainData = {
      source: sourcePath,
      changes: [],
      overall_summary: "",
      breaking_changes: [],
    };
    return {
      data: fallback,
      pretty() {
        printExplainEmpty("Source", sourcePath);
      },
    };
  }

  const data: SourceExplainData = {
    source: sourcePath,
    changes: result.changes,
    overall_summary: result.overall_summary,
    breaking_changes: result.breaking_changes,
  };

  return {
    data,
    pretty() {
      printExplainPretty("Source", sourcePath, result);
    },
  };
}
