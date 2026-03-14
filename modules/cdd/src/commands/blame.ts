import path from "node:path";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveFile } from "../utils/resolve.js";
import {
  type BlameDeps,
  type BlameOptions,
  defaultBlameDeps,
  printBlamePretty,
  runBlame,
} from "./blame-core.js";

export async function runUnifiedBlame(
  fileRef: string | undefined,
  options: BlameOptions,
  project: CddProject,
  deps: BlameDeps = defaultBlameDeps,
): Promise<OutputResult> {
  if (!fileRef) {
    console.error("사용법: cdd blame <file> [--since <date>] [--until <rev>]");
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
      displayName = path.relative(project.projectRoot, resolved.node.path);
      break;
    case "contract":
      absPath = resolved.node.path;
      label = "Contract";
      displayName = path.relative(project.projectRoot, resolved.node.path);
      break;
    case "source":
      absPath = resolved.absPath;
      label = "Source";
      displayName = path.relative(project.projectRoot, resolved.absPath);
      break;
  }

  const result = await runBlame(absPath, options, deps);

  const data = {
    file: displayName,
    kind: resolved.kind,
    primary_owner: result.primaryOwner,
    contributors: result.contributors,
  };

  return {
    data,
    pretty() {
      printBlamePretty(label, displayName, data.primary_owner, data.contributors);
    },
  };
}
