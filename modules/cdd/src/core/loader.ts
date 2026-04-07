import fs from "node:fs";
import path from "node:path";

import fg from "fast-glob";

import { type CddProject, type RulesDocument, type RulesNode } from "./types.js";

const CONTRACT_DIR_NAME = "contract";

/**
 * startDir부터 상위로 올라가며 contract/ 디렉토리를 탐색한다.
 * 찾으면 절대 경로를 반환하고, 루트까지 못 찾으면 null을 반환한다.
 */
export function findContractDir(startDir: string): string | null {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (true) {
    const candidate = path.join(current, CONTRACT_DIR_NAME);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    if (current === root) {
      return null;
    }
    current = path.dirname(current);
  }
}

/**
 * contract 디렉토리를 기준으로 CDD 프로젝트를 로드한다.
 */
export async function loadProject(contractDir: string): Promise<CddProject> {
  const resolvedDir = path.resolve(contractDir);
  const projectRoot = path.dirname(resolvedDir);
  const rules = await loadRules(resolvedDir);

  return { contractDir: resolvedDir, projectRoot, rules };
}

/**
 * contract/rules/ 디렉토리에서 *.rules.json 파일을 로드한다.
 */
async function loadRules(contractDir: string): Promise<RulesNode[]> {
  const rulesDir = path.join(contractDir, "rules");
  if (!fs.existsSync(rulesDir) || !fs.statSync(rulesDir).isDirectory()) {
    return [];
  }

  const rulesFiles = await fg("*.rules.json", {
    cwd: rulesDir,
    absolute: false,
    onlyFiles: true,
  });

  const nodes: RulesNode[] = [];

  for (const relPath of rulesFiles.toSorted()) {
    const absPath = path.resolve(rulesDir, relPath);
    const raw = fs.readFileSync(absPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    validateRulesStructure(parsed, absPath);
    const doc = parsed as RulesDocument;
    nodes.push({
      path: absPath,
      basename: path.basename(relPath, ".rules.json"),
      document: doc,
    });
  }

  return nodes;
}

/** Rules JSON 필수 필드 구조 검증 */
export function validateRulesStructure(parsed: unknown, filePath: string): void {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`잘못된 JSON 구조입니다: ${filePath}`);
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.description !== "string") {
    throw new Error(`description 필드가 문자열이 아닙니다: ${filePath}`);
  }
  if (!Array.isArray(obj.rules)) {
    throw new Error(`rules 필드가 배열이 아닙니다: ${filePath}`);
  }

  const seenIds = new Set<string>();
  for (const [i, rule] of (obj.rules as unknown[]).entries()) {
    if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
      throw new Error(`rules[${i}]가 객체가 아닙니다: ${filePath}`);
    }
    const r = rule as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.length === 0) {
      throw new Error(`rules[${i}].id가 비어 있거나 문자열이 아닙니다: ${filePath}`);
    }
    if (seenIds.has(r.id)) {
      throw new Error(`rules[${i}].id "${r.id}"가 중복됩니다: ${filePath}`);
    }
    seenIds.add(r.id);
    if (typeof r.when !== "string" || r.when.length === 0) {
      throw new Error(`rules[${i}].when이 비어 있거나 문자열이 아닙니다: ${filePath}`);
    }
    if (typeof r.instruction !== "string" || r.instruction.length === 0) {
      throw new Error(`rules[${i}].instruction이 비어 있거나 문자열이 아닙니다: ${filePath}`);
    }
    if (r.examples !== undefined) {
      if (!Array.isArray(r.examples)) {
        throw new Error(`rules[${i}].examples가 배열이 아닙니다: ${filePath}`);
      }
      for (const [j, ex] of (r.examples as unknown[]).entries()) {
        if (typeof ex !== "string") {
          throw new Error(`rules[${i}].examples[${j}]가 문자열이 아닙니다: ${filePath}`);
        }
      }
    }
  }
}
