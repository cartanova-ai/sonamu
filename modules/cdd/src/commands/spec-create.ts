import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { todayString } from "../core/date.js";
import type { CddProject, SpecDocument } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";

interface SpecCreateOptions {
  domain?: string;
  contract?: string;
}

export function runSpecCreate(
  name: string | undefined,
  options: SpecCreateOptions,
  project: CddProject,
): OutputResult {
  if (!name) {
    console.error("Spec 이름을 지정하세요: cdd spec create <name>");
    process.exit(1);
  }

  if (!options.domain && !options.contract) {
    console.error("--domain 또는 --contract 옵션이 필요합니다.");
    process.exit(1);
  }

  const existing = project.specs.filter((s) => s.basename === name);
  if (existing.length > 0) {
    console.error(`동명의 Spec이 이미 존재합니다: "${name}"`);
    for (const s of existing) {
      console.error(`  - ${path.relative(project.projectRoot, s.path)}`);
    }
    process.exit(1);
  }

  let targetDir: string;
  if (options.contract) {
    const contractPath = path.resolve(project.projectRoot, options.contract);
    const contract = project.contracts.find((c) => c.path === contractPath);
    if (!contract) {
      console.error(`Contract를 찾을 수 없습니다: "${options.contract}"`);
      const candidates = project.contracts.map((c) => path.relative(project.projectRoot, c.path));
      console.error("후보 목록:");
      for (const c of candidates) {
        console.error(`  - ${c}`);
      }
      process.exit(1);
    }
    targetDir = path.dirname(contractPath);
  } else {
    const domain = options.domain ?? "";
    targetDir = path.join(project.contractDir, domain);
    if (!fs.existsSync(targetDir)) {
      console.error(`도메인 디렉토리가 존재하지 않습니다: "${domain}"`);
      const domains = [...new Set(project.contracts.map((c) => c.domain))].filter((d) => d !== "");
      if (domains.length > 0) {
        console.error("사용 가능한 도메인:");
        for (const d of domains.sort()) {
          console.error(`  - ${d}`);
        }
      }
      process.exit(1);
    }
  }

  const specPath = path.join(targetDir, `${name}.spec.json`);

  if (fs.existsSync(specPath)) {
    console.error(`파일이 이미 존재합니다: ${path.relative(project.projectRoot, specPath)}`);
    process.exit(1);
  }

  const today = todayString();
  const contractRef = options.contract
    ? `./${path.basename(options.contract)}`
    : "./main.contract.json";

  const doc: SpecDocument = {
    schemaVersion: 1,
    summary: "",
    description: [],
    acceptanceCriteria: [],
    lastModified: today,
    status: "draft",
    sources: [],
    contracts: [contractRef],
    modules: {},
    interfaces: {},
    dataFlow: [],
    errorHandling: {},
    constraints: [],
  };

  fs.writeFileSync(specPath, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, specPath);

  return {
    data: { path: relPath, status: "draft" },
    pretty() {
      console.log(chalk.green(`Spec을 생성했습니다: ${relPath}`));
    },
  };
}
