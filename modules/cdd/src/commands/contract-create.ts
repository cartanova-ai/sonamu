import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { todayString } from "../core/date.js";
import { loadSchema } from "../core/loader.js";
import type { CddProject } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";

export interface ContractCreateOptions {
  domain?: string;
  schema?: string;
}

export function runContractCreate(
  name: string | undefined,
  options: ContractCreateOptions,
  project: CddProject,
): OutputResult {
  const resolvedName = name ?? "main";

  const schemaId = options.schema ?? "default-contract";
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

  const contractPath = path.join(targetDir, `${resolvedName}.contract.json`);
  if (fs.existsSync(contractPath)) {
    return {
      data: {
        error: `파일이 이미 존재합니다: ${path.relative(project.projectRoot, contractPath)}`,
      },
      pretty() {
        console.log(
          chalk.red(`파일이 이미 존재합니다: ${path.relative(project.projectRoot, contractPath)}`),
        );
      },
      exitCode: 1,
    };
  }

  const doc: Record<string, unknown> = {
    schema: schemaId,
    lastModified: todayString(),
    features: {},
  };

  for (const field of schema.fields) {
    doc[field.name] = emptyValueForType(field.type);
  }

  fs.writeFileSync(contractPath, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, contractPath);
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
