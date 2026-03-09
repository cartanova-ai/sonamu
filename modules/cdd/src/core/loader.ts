import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type {
  CddProject,
  ContractDocument,
  ContractNode,
  SpecDocument,
  SpecNode,
} from "./types.js";

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

  const jsonFiles = await fg("**/*.json", {
    cwd: resolvedDir,
    absolute: false,
    onlyFiles: true,
  });

  const contracts: ContractNode[] = [];
  const specs: SpecNode[] = [];

  for (const relPath of jsonFiles.sort()) {
    const absPath = path.resolve(resolvedDir, relPath);
    const raw = fs.readFileSync(absPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);

    if (relPath.endsWith(".contract.json")) {
      validateContentIsStringArray(parsed, absPath);
      const doc = parsed as ContractDocument;
      contracts.push({
        path: absPath,
        domain: deriveDomain(resolvedDir, absPath),
        basename: path.basename(relPath, ".contract.json"),
        document: doc,
      });
    } else if (relPath.endsWith(".spec.json")) {
      validateContentIsStringArray(parsed, absPath);
      validateSpecStructure(parsed, absPath);
      const doc = parsed as SpecDocument;
      const specDir = path.dirname(absPath);
      const resolvedContracts = (doc.contracts ?? []).map((c) => path.resolve(specDir, c));
      specs.push({
        path: absPath,
        domain: deriveDomain(resolvedDir, absPath),
        basename: path.basename(relPath, ".spec.json"),
        document: doc,
        resolvedContracts,
      });
    }
  }

  return { contractDir: resolvedDir, projectRoot, contracts, specs };
}

/** contract 디렉토리 기준 도메인명 파생 */
function deriveDomain(contractDir: string, filePath: string): string {
  const rel = path.relative(contractDir, path.dirname(filePath));
  if (rel === "" || rel === ".") {
    return "";
  }
  return rel;
}

/** Spec JSON 필수 필드 구조 검증 */
function validateSpecStructure(parsed: unknown, filePath: string): void {
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.lastModified !== "string") {
    throw new Error(`lastModified 필드가 문자열이 아닙니다: ${filePath}`);
  }
  if (typeof obj.status !== "string") {
    throw new Error(`status 필드가 문자열이 아닙니다: ${filePath}`);
  }
  if (!Array.isArray(obj.sources)) {
    throw new Error(`sources 필드가 배열이 아닙니다: ${filePath}`);
  }
  if (!Array.isArray(obj.contracts)) {
    throw new Error(`contracts 필드가 배열이 아닙니다: ${filePath}`);
  }
  if (!Array.isArray(obj.revisions)) {
    throw new Error(`revisions 필드가 배열이 아닙니다: ${filePath}`);
  }
}

/** content 필드가 string[]인지 검증 */
function validateContentIsStringArray(parsed: unknown, filePath: string): void {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`잘못된 JSON 구조입니다: ${filePath}`);
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.content)) {
    throw new Error(`content 필드가 배열이 아닙니다: ${filePath}`);
  }
  for (let i = 0; i < obj.content.length; i++) {
    if (typeof obj.content[i] !== "string") {
      throw new Error(`content[${i}]가 문자열이 아닙니다: ${filePath}`);
    }
  }
}
