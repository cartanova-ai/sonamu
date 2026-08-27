import fs from "node:fs";
import path from "node:path";

import fg from "fast-glob";

import { type CddProject, type RulesDocument, type RulesNode } from "./types.js";

const CONTRACT_DIR_NAME = "contract";

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

interface JsonObject {
  [key: string]: JsonValue | undefined;
}

function requireJsonObject<Value>(value: Value, message: string): JsonObject {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    throw new Error(message);
  }
  // SAFETY: 위 태그 검증으로 값이 JSON 객체임을 확인했다.
  return value as JsonObject;
}

function requireString<Value>(value: Value, message: string): string {
  if (Object.prototype.toString.call(value) !== "[object String]") {
    throw new Error(message);
  }
  return String(value);
}

function requireNonEmptyString<Value>(value: Value, message: string): string {
  const parsed = requireString(value, message);
  if (parsed.length === 0) {
    throw new Error(message);
  }
  return parsed;
}

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
    const parsed: JsonValue = JSON.parse(raw);
    const doc = parseRulesDocument(parsed, absPath);
    nodes.push({
      path: absPath,
      basename: path.basename(relPath, ".rules.json"),
      document: doc,
    });
  }

  return nodes;
}

function parseRulesDocument<Value>(parsed: Value, filePath: string): RulesDocument {
  const document = requireJsonObject(parsed, `잘못된 JSON 구조입니다: ${filePath}`);
  const description = requireString(
    document.description,
    `description 필드가 문자열이 아닙니다: ${filePath}`,
  );
  const rulesValue = document.rules;
  if (!Array.isArray(rulesValue)) {
    throw new Error(`rules 필드가 배열이 아닙니다: ${filePath}`);
  }

  const seenIds = new Set<string>();
  const rules = rulesValue.map((rule, i) => {
    const entry = requireJsonObject(rule, `rules[${i}]가 객체가 아닙니다: ${filePath}`);
    const id = requireNonEmptyString(
      entry.id,
      `rules[${i}].id가 비어 있거나 문자열이 아닙니다: ${filePath}`,
    );
    if (seenIds.has(id)) {
      throw new Error(`rules[${i}].id "${id}"가 중복됩니다: ${filePath}`);
    }
    seenIds.add(id);
    const when = requireNonEmptyString(
      entry.when,
      `rules[${i}].when이 비어 있거나 문자열이 아닙니다: ${filePath}`,
    );
    const instruction = requireNonEmptyString(
      entry.instruction,
      `rules[${i}].instruction이 비어 있거나 문자열이 아닙니다: ${filePath}`,
    );

    let examples: string[] | undefined;
    if (entry.examples !== undefined) {
      if (!Array.isArray(entry.examples)) {
        throw new Error(`rules[${i}].examples가 배열이 아닙니다: ${filePath}`);
      }
      examples = entry.examples.map((example, j) =>
        requireString(example, `rules[${i}].examples[${j}]가 문자열이 아닙니다: ${filePath}`),
      );
    }

    const parsedRule = { id, when, instruction, examples };
    if (examples === undefined) {
      delete parsedRule.examples;
    }
    return parsedRule;
  });

  return { description, rules };
}

/** Rules JSON 필수 필드 구조 검증 */
export function validateRulesStructure<Value>(parsed: Value, filePath: string): void {
  parseRulesDocument(parsed, filePath);
}
