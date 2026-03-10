import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";
import {
  defaultExplainDeps,
  type ExplainDeps,
  type ExplainOptions,
  printExplainEmpty,
  printExplainPretty,
  runExplain,
} from "./explain-core.js";

export type SpecExplainOptions = ExplainOptions;
export type SpecExplainDeps = ExplainDeps;

export interface SpecExplainData {
  feature: string;
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

export async function runSpecExplain(
  specRef: string,
  options: SpecExplainOptions,
  project: CddProject,
  deps: SpecExplainDeps = defaultExplainDeps,
): Promise<OutputResult> {
  const specNode = resolveSpec(specRef, project);
  const specBasename = specNode.basename;

  const result = await runExplain(specNode.path, specNode.path, options, deps);

  if (!result) {
    const fallback: SpecExplainData = {
      feature: specBasename,
      changes: [],
      overall_summary: "",
      breaking_changes: [],
    };
    return {
      data: fallback,
      pretty() {
        printExplainEmpty("Spec", specNode.path);
      },
    };
  }

  const data: SpecExplainData = {
    feature: specBasename,
    changes: result.changes,
    overall_summary: result.overall_summary,
    breaking_changes: result.breaking_changes,
  };

  return {
    data,
    pretty() {
      printExplainPretty("Spec", specBasename, result);
    },
  };
}
