import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";
import {
  defaultLogDeps,
  groupCommitsByPeriod,
  type LogDeps,
  type LogOptions,
  printLogPretty,
  runLog,
  toPeriodKey,
} from "./log-core.js";

export type SpecLogOptions = LogOptions;
export type SpecLogDeps = LogDeps;

export { groupCommitsByPeriod, toPeriodKey };

export async function runSpecLog(
  specRef: string | undefined,
  options: SpecLogOptions,
  project: CddProject,
  deps: SpecLogDeps = defaultLogDeps,
): Promise<OutputResult> {
  if (!specRef) {
    console.error(
      "사용법: cdd spec log <spec> [--since <date>] [--until <date>] [--group-by <day|week|month>]",
    );
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const result = await runLog(spec.path, options, deps);

  const data = {
    feature: spec.basename,
    group_by: result.groupBy,
    timeline: result.timeline,
  };

  return {
    data,
    pretty() {
      printLogPretty("Spec", spec.basename, data.group_by, data.timeline);
    },
  };
}
