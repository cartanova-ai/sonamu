import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { todayString } from "../core/date.js";
import type { ContractDocument } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";

export function runInit(args: string[]): OutputResult {
  const targetDir = path.resolve(args[0] ?? ".");
  const contractDir = path.join(targetDir, "contract");

  if (fs.existsSync(contractDir)) {
    return {
      data: { initialized: false, path: contractDir, reason: "already_exists" },
      pretty() {
        console.log(chalk.yellow(`contract/ 디렉토리가 이미 존재합니다: ${contractDir}`));
      },
    };
  }

  fs.mkdirSync(contractDir, { recursive: true });

  const mainContract: ContractDocument = {
    lastModified: todayString(),
    content: [
      "## Overview",
      "",
      "",
      "",
      "## Domain Glossary",
      "",
      "",
      "",
      "## Features/Capabilities",
      "",
      "",
      "",
      "## User Roles/Actors",
      "",
      "",
      "",
      "## Business Rules/Constraints",
      "",
      "",
      "",
      "## Edge Cases",
      "",
      "",
    ],
  };

  fs.writeFileSync(
    path.join(contractDir, "main.contract.json"),
    `${JSON.stringify(mainContract, null, 2)}\n`,
  );

  const cddMdPath = path.join(contractDir, "cdd.md");
  fs.writeFileSync(cddMdPath, CDD_MD_TEMPLATE);

  const data = {
    initialized: true,
    path: contractDir,
    files: ["main.contract.json", "cdd.md"],
  };

  return {
    data,
    pretty() {
      console.log(chalk.green("CDD 프로젝트를 초기화했습니다:"));
      console.log(`  ${contractDir}/`);
      console.log("  - main.contract.json");
      console.log("  - cdd.md");
    },
  };
}

const CDD_MD_TEMPLATE = `# Contract-Driven Development (CDD)

This project follows Contract-Driven Development (CDD).

## Project Structure

\`\`\`text
project/
|- contract/
|  |- main.contract.json
|  |- {domain}/
|  |  |- main.contract.json
|  |  |- {feature}.spec.json
|  \\- ...
|- src/
\\- ...
\`\`\`

## Document Model

### Contract (\`.contract.json\`)

\`\`\`json
{
  "lastModified": "YYYY-MM-DD",
  "content": ["## Overview", "", "Markdown lines as string array", ...]
}
\`\`\`

### Spec (\`.spec.json\`)

\`\`\`json
{
  "schemaVersion": 1,
  "summary": "Feature summary",
  "description": ["Detailed description"],
  "acceptanceCriteria": ["When X, then Y"],
  "lastModified": "YYYY-MM-DD",
  "status": "draft | in-progress | done",
  "sources": ["src/foo.ts"],
  "contracts": ["./main.contract.json"],
  "modules": { "ModuleName": "Role description" },
  "interfaces": { "FunctionName": "Description" },
  "dataFlow": ["1. Step description"],
  "errorHandling": { "ErrorName": "Trigger condition" },
  "constraints": ["Constraint description"]
}
\`\`\`

For full CDD rules, see the project documentation.
`;
