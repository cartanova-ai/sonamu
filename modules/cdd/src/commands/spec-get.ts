import path from "node:path";
import chalk from "chalk";
import { getField } from "../core/spec-field-ops.js";
import type { AcceptanceCriterion, CddProject, SpecDocument } from "../core/types.js";
import { formatStatus } from "../utils/format.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

interface SpecGetOptions {
  field?: string;
}

export function runSpecGet(
  specRef: string | undefined,
  options: SpecGetOptions,
  project: CddProject,
): OutputResult {
  if (!specRef) {
    console.error("사용법: cdd spec get <spec> [--field <fieldPath>]");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);

  if (options.field) {
    const value = getField(spec.document, options.field);
    if (value === undefined) {
      console.error(`필드를 찾을 수 없습니다: "${options.field}"`);
      process.exit(1);
    }
    return {
      data: value,
      pretty() {
        if (typeof value === "object") {
          console.log(JSON.stringify(value, null, 2));
        } else {
          console.log(String(value));
        }
      },
    };
  }

  return {
    data: spec.document,
    pretty() {
      printSpecPretty(spec.path, spec.document, project);
    },
  };
}

function printSpecPretty(specPath: string, doc: SpecDocument, project: CddProject): void {
  const rel = path.relative(project.projectRoot, specPath);

  console.log(chalk.bold(`Spec: ${rel}`));
  console.log();

  console.log(`  ${chalk.dim("summary")}      ${doc.summary}`);
  console.log(`  ${chalk.dim("status")}       ${formatStatus(doc.status)}`);
  console.log(`  ${chalk.dim("lastModified")} ${doc.lastModified}`);
  console.log();

  printArray("description", doc.description);
  printAcceptanceCriteria(doc.acceptanceCriteria);
  printArray("sources", doc.sources);
  printArray("contracts", doc.contracts);

  if (doc.dependsOnSpecs && doc.dependsOnSpecs.length > 0) {
    printArray("dependsOnSpecs", doc.dependsOnSpecs);
  }

  printRecord("modules", doc.modules);
  printRecord("interfaces", doc.interfaces);
  printArray("dataFlow", doc.dataFlow);
  printRecord("errorHandling", doc.errorHandling);
  printArray("constraints", doc.constraints);
}

function printArray(label: string, items: string[]): void {
  console.log(`  ${chalk.bold.cyan(label)}`);
  if (items.length === 0) {
    console.log(`    ${chalk.dim("(empty)")}`);
  } else {
    for (const item of items) {
      console.log(`    - ${item}`);
    }
  }
  console.log();
}

function printAcceptanceCriteria(criteria: AcceptanceCriterion[]): void {
  console.log(`  ${chalk.bold.cyan("acceptanceCriteria")}`);
  if (criteria.length === 0) {
    console.log(`    ${chalk.dim("(empty)")}`);
  } else {
    for (const ac of criteria) {
      console.log(`    - ${chalk.dim(`[${ac.id}]`)} ${ac.condition}`);
      if (ac.testRef?.target) {
        console.log(
          `      ${chalk.dim("test:")} ${ac.testRef.target} ${chalk.dim(`/${ac.testRef.pattern}/`)}`,
        );
      }
    }
  }
  console.log();
}

function printRecord(label: string, record: Record<string, string>): void {
  const entries = Object.entries(record);
  console.log(`  ${chalk.bold.cyan(label)}`);
  if (entries.length === 0) {
    console.log(`    ${chalk.dim("(empty)")}`);
  } else {
    for (const [key, value] of entries) {
      console.log(`    ${chalk.white(key)}: ${value}`);
    }
  }
  console.log();
}
