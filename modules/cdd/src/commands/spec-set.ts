import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getFieldMeta, setField } from "../core/spec-field-ops.js";
import type { CddProject } from "../core/types.js";
import { resolveSpec } from "../utils/resolve.js";

interface SpecSetOptions {
  field?: string;
  value?: string;
  json?: boolean;
}

export function runSpecSet(
  specRef: string | undefined,
  options: SpecSetOptions,
  project: CddProject,
): void {
  if (!specRef || !options.field || options.value === undefined) {
    console.error("사용법: cdd spec set <spec> --field <fieldPath> --value <value>");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const doc = { ...spec.document };

  const rootField = options.field.split(".")[0];
  const meta = getFieldMeta(rootField);
  if (!meta) {
    console.error(`알 수 없는 필드: "${rootField}"`);
    process.exit(1);
  }

  let parsedValue: unknown = options.value;
  if (options.json) {
    parsedValue = JSON.parse(options.value);
  } else if (meta.type === "number") {
    parsedValue = Number(options.value);
  }

  setField(doc, options.field, parsedValue);
  fs.writeFileSync(spec.path, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, spec.path);
  console.log(chalk.green(`필드를 변경했습니다: ${relPath} [${options.field}]`));
}
