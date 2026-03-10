import path from "node:path";
import chalk from "chalk";
import type { CddProject, SpecStatus } from "../core/types.js";
import { formatStatus } from "../utils/format.js";
import type { OutputResult } from "../utils/output.js";
import { resolveContract } from "../utils/resolve.js";

interface SpecListOptions {
  status?: string;
  domain?: string;
  contract?: string;
}

export function runSpecList(options: SpecListOptions, project: CddProject): OutputResult {
  let specs = [...project.specs];

  if (options.status) {
    specs = specs.filter((s) => s.document.status === options.status);
  }
  if (options.domain) {
    specs = specs.filter((s) => s.domain === options.domain);
  }
  if (options.contract) {
    const contractNode = resolveContract(options.contract, project);
    specs = specs.filter((s) => s.resolvedContracts.includes(contractNode.path));
  }

  const data = specs.map((s) => ({
    path: path.relative(project.projectRoot, s.path),
    domain: s.domain,
    basename: s.basename,
    status: s.document.status,
    summary: s.document.summary,
  }));

  return {
    data,
    pretty() {
      if (specs.length === 0) {
        console.log("조건에 맞는 Spec이 없습니다.");
        return;
      }

      for (const s of specs) {
        const rel = path.relative(project.projectRoot, s.path);
        const status = formatStatus(s.document.status as SpecStatus);
        console.log(`  ${status}  ${chalk.white(rel)}  ${s.document.summary}`);
      }

      console.log();
      console.log(`총 ${specs.length}개`);
    },
  };
}
