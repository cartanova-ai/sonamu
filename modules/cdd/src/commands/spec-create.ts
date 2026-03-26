import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { todayString } from "../core/date.js";
import { loadSchema } from "../core/loader.js";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";

export interface SpecCreateOptions {
  domain?: string;
  contract?: string;
  schema?: string;
}

export function runSpecCreate(
  name: string | undefined,
  options: SpecCreateOptions,
  project: CddProject,
): OutputResult {
  if (!name) {
    console.error("사용법: cdd spec create <name> [--domain ...] [--contract ...] [--schema ...]");
    process.exit(1);
  }

  const schemaId = options.schema ?? "default-spec";
  const schema = loadSchema(schemaId, project);
  if (!schema) {
    return {
      data: { error: `schema를 찾을 수 없습니다: "${schemaId}"` },
      pretty() {
        console.log(chalk.red(`schema를 찾을 수 없습니다: "${schemaId}"`));
      },
      exitCode: 1,
    };
  }

  const domain = options.domain ?? "";
  const targetDir = domain ? path.join(project.contractDir, domain) : project.contractDir;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const specPath = path.join(targetDir, `${name}.spec.json`);
  if (fs.existsSync(specPath)) {
    return {
      data: { error: `파일이 이미 존재합니다: ${path.relative(project.projectRoot, specPath)}` },
      pretty() {
        console.log(
          chalk.red(`파일이 이미 존재합니다: ${path.relative(project.projectRoot, specPath)}`),
        );
      },
      exitCode: 1,
    };
  }

  const contractRef = options.contract
    ? `./${path.basename(options.contract)}`
    : "./main.contract.json";

  const doc: Record<string, unknown> = {
    schema: schemaId,
    schemaVersion: 2,
    useTestRef: true,
    summary: "",
    description: [],
    acceptanceCriteria: [],
    lastModified: todayString(),
    status: "draft",
    sources: [],
    contracts: [contractRef],
  };

  for (const field of schema.fields) {
    doc[field.name] = emptyValueForType(field.type);
  }

  fs.writeFileSync(specPath, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, specPath);
  return {
    data: { path: relPath, schema: schemaId },
    pretty() {
      console.log(chalk.green(`생성됨: ${relPath} (schema: ${schemaId})`));
    },
  };
}

function emptyValueForType(type: string): unknown {
  if (type === "string") return "";
  if (type === "string[]") return [];
  if (type.startsWith("Record<")) return {};
  return null;
}
