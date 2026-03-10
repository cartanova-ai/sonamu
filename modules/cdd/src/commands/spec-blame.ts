import path from "node:path";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";
import {
  type BlameDeps,
  type BlameOptions,
  defaultBlameDeps,
  printBlamePretty,
  runBlame,
} from "./blame-core.js";

export type SpecBlameOptions = BlameOptions;
export type SpecBlameDeps = BlameDeps;

export async function runSpecBlame(
  specRef: string | undefined,
  options: SpecBlameOptions,
  project: CddProject,
  deps: SpecBlameDeps = defaultBlameDeps,
): Promise<OutputResult> {
  if (!specRef) {
    console.error("사용법: cdd spec blame <spec> [--since <date>] [--until <rev>]");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const result = await runBlame(spec.path, options, deps);

  const data = {
    feature: spec.basename,
    primary_owner: result.primaryOwner,
    contributors: result.contributors,
  };

  return {
    data,
    pretty() {
      const rel = path.relative(project.projectRoot, spec.path);
      printBlamePretty("Spec", rel, data.primary_owner, data.contributors);
    },
  };
}
