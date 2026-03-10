import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { addToField, getFieldMeta } from "../core/spec-field-ops.js";
import type { CddProject } from "../core/types.js";
import { resolveSpec } from "../utils/resolve.js";

interface SpecAddOptions {
  field?: string;
  value?: string;
  key?: string;
}

export function runSpecAdd(
  specRef: string | undefined,
  options: SpecAddOptions,
  project: CddProject,
): void {
  if (!specRef || !options.field || options.value === undefined) {
    console.error("사용법: cdd spec add <spec> --field <field> --value <value> [--key <key>]");
    process.exit(1);
  }

  const meta = getFieldMeta(options.field);
  if (!meta) {
    console.error(`알 수 없는 필드: "${options.field}"`);
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const doc = { ...spec.document };

  addToField(doc, options.field, options.value, options.key);
  fs.writeFileSync(spec.path, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, spec.path);
  console.log(chalk.green(`항목을 추가했습니다: ${relPath} [${options.field}]`));
}
