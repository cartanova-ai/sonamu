import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { ContractDocument } from "../core/types.js";

export function runInit(args: string[]): void {
  const targetDir = path.resolve(args[0] ?? ".");
  const contractDir = path.join(targetDir, "contract");

  if (fs.existsSync(contractDir)) {
    console.log(chalk.yellow(`contract/ 디렉토리가 이미 존재합니다: ${contractDir}`));
    return;
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

  console.log(chalk.green("CDD 프로젝트를 초기화했습니다:"));
  console.log(`  ${contractDir}/`);
  console.log("  - main.contract.json");
  console.log("  - cdd.md");
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  "lastModified": "YYYY-MM-DD",
  "status": "draft | in-progress | done",
  "sources": ["src/foo.ts"],
  "contracts": ["./main.contract.json"],
  "revisions": [{ "id": "rev-001", "date": "YYYY-MM-DD", "features": ["feature"], "status": "draft" }],
  "content": ["## Summary", "", "..."]
}
\`\`\`

For full CDD rules, see the project documentation.
`;
