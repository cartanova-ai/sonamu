import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { CddProject } from "../core/types.js";
import { formatPath } from "../utils/format.js";

export function runImpact(file: string | undefined, project: CddProject): void {
  if (!file) {
    console.error("파일 경로를 지정하세요: cdd impact <file>");
    process.exit(1);
  }

  const sourcePath = resolveSourcePath(file, project);

  const directSpecs = project.specs.filter((s) =>
    s.document.sources.some((src) => src === sourcePath),
  );

  const chainContractPaths = new Set<string>();
  for (const spec of directSpecs) {
    for (const rc of spec.resolvedContracts) {
      chainContractPaths.add(rc);
    }
  }

  // Direct Specs가 dependsOnSpecs로 참조하는 Spec들
  const directSpecPaths = new Set(directSpecs.map((s) => s.path));
  const dependsOnPaths = new Set<string>();
  for (const spec of directSpecs) {
    for (const dep of spec.resolvedDependsOnSpecs) {
      if (!directSpecPaths.has(dep)) {
        dependsOnPaths.add(dep);
      }
    }
  }
  const dependsOnSpecs = project.specs.filter((s) => dependsOnPaths.has(s.path));

  console.log(chalk.bold(`Impact analysis: ${sourcePath}`));
  console.log();

  printSection("Direct Specs", directSpecs, project);
  printContractPaths("Chain Contracts", chainContractPaths, project);
  printSection("Depends On Specs", dependsOnSpecs, project);
}

function printSection(title: string, nodes: { path: string }[], project: CddProject): void {
  console.log(chalk.bold(`${title}:`));
  if (nodes.length === 0) {
    console.log("  (none)");
  } else {
    for (const n of nodes) {
      console.log(`  - ${formatPath(n.path, project.projectRoot)}`);
    }
  }
  console.log();
}

function printContractPaths(title: string, paths: Set<string>, project: CddProject): void {
  console.log(chalk.bold(`${title}:`));
  if (paths.size === 0) {
    console.log("  (none)");
  } else {
    for (const p of [...paths].sort()) {
      console.log(`  - ${formatPath(p, project.projectRoot)}`);
    }
  }
  console.log();
}

/**
 * 입력된 파일 참조를 sources 포맷(src/... 상대 경로)으로 정규화한다.
 * - src/ 포함 시: src/ 이전 경로를 제거 (e.g. api/src/foo/bar.ts → src/foo/bar.ts)
 * - src/ 미포함 시: projectRoot/src/ 하위에서 파일명/부분경로 검색
 */
function resolveSourcePath(ref: string, project: CddProject): string {
  const srcIdx = ref.indexOf("src/");
  if (srcIdx >= 0) {
    return ref.slice(srcIdx);
  }

  // src/ 미포함: src/ 하위에서 검색
  const srcDir = path.join(project.projectRoot, "src");
  if (!fs.existsSync(srcDir)) {
    console.error(`src/ 디렉토리가 존재하지 않습니다: ${srcDir}`);
    process.exit(1);
  }

  const hasPathSep = ref.includes("/");
  const candidates = collectFiles(srcDir).filter((rel) =>
    hasPathSep ? rel.endsWith(`/${ref}`) || rel === ref : path.basename(rel) === ref,
  );

  if (candidates.length === 0) {
    console.error(`src/ 하위에서 "${ref}"에 해당하는 파일을 찾을 수 없습니다.`);
    process.exit(1);
  }
  if (candidates.length > 1) {
    console.error(`"${ref}"에 해당하는 파일이 여러 개 존재합니다:`);
    for (const c of candidates) {
      console.error(`  - ${c}`);
    }
    console.error("더 구체적인 경로를 사용하세요.");
    process.exit(1);
  }

  return candidates[0];
}

/** src/ 디렉토리 하위의 모든 파일을 src/... 형식의 상대 경로로 수집 */
function collectFiles(dir: string): string[] {
  const srcRoot = dir;
  const results: string[] = [];

  function walk(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        results.push(`src/${path.relative(srcRoot, full)}`);
      }
    }
  }

  walk(dir);
  return results;
}
