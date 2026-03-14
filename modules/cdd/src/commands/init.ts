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
    schema: "default-contract",
    lastModified: todayString(),
    features: {},
    overview: [],
    domainGlossary: [],
    userRoles: [],
    businessRules: [],
    edgeCases: [],
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
  "schema": "default-contract",
  "lastModified": "YYYY-MM-DD",
  "features": { "feature-name": "Feature description" },
  "overview": ["Project/domain overview"],
  "domainGlossary": ["Term: Definition"],
  "userRoles": ["Role: Description"],
  "businessRules": ["Rule description"],
  "edgeCases": ["Edge case description"]
}
\`\`\`

### Spec (\`.spec.json\`)

\`\`\`json
{
  "schemaVersion": 2,
  "summary": "Feature summary",
  "description": ["Detailed description"],
  "acceptanceCriteria": [
    {
      "id": "ac-feature-1",
      "condition": "When X, then Y",
      "testRef": { "target": "src/foo.test.ts", "pattern": "regex pattern" }
    }
  ],
  "lastModified": "YYYY-MM-DD",
  "status": "draft | specifying | implementing | validating | done",
  "sources": ["src/foo.ts"],
  "contracts": ["./main.contract.json"],
  "modules": { "ModuleName": "Role description" },
  "interfaces": { "FunctionName": "Description" },
  "dataFlow": ["1. Step description"],
  "errorHandling": { "ErrorName": "Trigger condition" },
  "constraints": ["Constraint description"]
}
\`\`\`

## Workflow

Status pipeline: draft → specifying → implementing → validating → done

Each transition enforces gate conditions:
- draft → specifying: contracts must reference valid contract files
- specifying → implementing: modules, interfaces, dataFlow, AC must be non-empty
- implementing → validating: sources must be non-empty and files must exist
- validating → done: all AC testRef targets must exist

For full CDD rules, see the project documentation.
`;
