import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getFieldMeta, removeFromField } from "../core/spec-field-ops.js";
import type { CddProject } from "../core/types.js";
import { resolveSpec } from "../utils/resolve.js";

interface SpecRemoveOptions {
  field?: string;
  index?: number;
  value?: string;
  key?: string;
}

export function runSpecRemove(
  specRef: string | undefined,
  options: SpecRemoveOptions,
  project: CddProject,
): void {
  if (!specRef || !options.field) {
    console.error(
      "사용법: cdd spec remove <spec> --field <field> (--index <n> | --value <value> | --key <key>)",
    );
    process.exit(1);
  }

  if (options.index === undefined && options.value === undefined && options.key === undefined) {
    console.error("--index, --value, --key 중 하나를 지정하세요.");
    process.exit(1);
  }

  const meta = getFieldMeta(options.field);
  if (!meta) {
    console.error(`알 수 없는 필드: "${options.field}"`);
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const doc = { ...spec.document };

  const removed = removeFromField(doc, options.field, {
    index: options.index,
    value: options.value,
    key: options.key,
  });

  if (!removed) {
    console.error("제거할 항목을 찾을 수 없습니다.");
    process.exit(1);
  }

  fs.writeFileSync(spec.path, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, spec.path);
  console.log(chalk.green(`항목을 제거했습니다: ${relPath} [${options.field}]`));
}
