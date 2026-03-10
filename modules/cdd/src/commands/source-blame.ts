import path from "node:path";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSourcePath } from "../utils/resolve.js";
import {
  type BlameDeps,
  type BlameOptions,
  defaultBlameDeps,
  printBlamePretty,
  runBlame,
} from "./blame-core.js";

export type SourceBlameOptions = BlameOptions;
export type SourceBlameDeps = BlameDeps;

export async function runSourceBlame(
  sourceRef: string | undefined,
  options: SourceBlameOptions,
  project: CddProject,
  deps: SourceBlameDeps = defaultBlameDeps,
): Promise<OutputResult> {
  if (!sourceRef) {
    console.error("사용법: cdd source blame <file> [--since <date>] [--until <rev>]");
    process.exit(1);
  }

  const sourcePath = resolveSourcePath(sourceRef, project);
  const sourceAbsPath = path.resolve(project.projectRoot, sourcePath);
  const result = await runBlame(sourceAbsPath, options, deps);

  const data = {
    source: sourcePath,
    primary_owner: result.primaryOwner,
    contributors: result.contributors,
  };

  return {
    data,
    pretty() {
      printBlamePretty("Source", sourcePath, data.primary_owner, data.contributors);
    },
  };
}
