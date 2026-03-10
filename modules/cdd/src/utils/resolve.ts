import path from "node:path";
import type { CddProject, ContractNode, SpecNode } from "../core/types.js";

export type ResolvedFile =
  | { kind: "spec"; node: SpecNode }
  | { kind: "contract"; node: ContractNode }
  | { kind: "source"; absPath: string };

/**
 * 파일 레퍼런스를 해석한다.
 * 절대/상대 경로, 부분 경로(auth/signin.spec.json), 파일명(signin.spec.json), basename(signin) 모두 지원.
 * 복수 매칭 시 후보 목록 출력 후 process.exit(1).
 */
export function resolveFile(fileRef: string, project: CddProject): ResolvedFile {
  const specNode = tryResolveSpec(fileRef, project);
  if (specNode) return { kind: "spec", node: specNode };

  const contractNode = tryResolveContract(fileRef, project);
  if (contractNode) return { kind: "contract", node: contractNode };

  return { kind: "source", absPath: path.resolve(project.projectRoot, fileRef) };
}

/**
 * Spec 레퍼런스를 해석한다.
 * 절대/상대 경로, 부분 경로, 파일명, basename 모두 지원.
 */
export function resolveSpec(specRef: string, project: CddProject): SpecNode {
  const node = tryResolveSpec(specRef, project);
  if (node) return node;

  console.error(`Spec을 찾을 수 없습니다: "${specRef}"`);
  process.exit(1);
}

/**
 * Contract 레퍼런스를 해석한다.
 * 절대/상대 경로, 부분 경로, 파일명, basename 모두 지원.
 */
export function resolveContract(contractRef: string, project: CddProject): ContractNode {
  const node = tryResolveContract(contractRef, project);
  if (node) return node;

  console.error(`Contract를 찾을 수 없습니다: "${contractRef}"`);
  process.exit(1);
}

function tryResolveSpec(ref: string, project: CddProject): SpecNode | null {
  return tryResolveNode(ref, project.specs, project, ".spec.json");
}

function tryResolveContract(ref: string, project: CddProject): ContractNode | null {
  return tryResolveNode(ref, project.contracts, project, ".contract.json");
}

function tryResolveNode<T extends { path: string; basename: string }>(
  ref: string,
  nodes: T[],
  project: CddProject,
  ext: string,
): T | null {
  // contract/ 이전의 경로 제거 (e.g. api/contract/auth/signin.spec.json → contract/auth/signin.spec.json)
  const contractDirName = path.basename(project.contractDir);
  const contractPrefix = `${contractDirName}/`;
  const contractIdx = ref.indexOf(contractPrefix);
  const normalized = contractIdx > 0 ? ref.slice(contractIdx) : ref;

  const hasPathSeparator = normalized.includes("/");

  if (hasPathSeparator) {
    // 경로가 포함된 경우: 직접 경로 해석을 우선 시도
    // 1a. projectRoot 기준 절대/상대 경로
    const absPath = path.resolve(project.projectRoot, normalized);
    const byPath = nodes.find((n) => n.path === absPath);
    if (byPath) return byPath;

    // 1b. contractDir 기준 상대 경로
    const absFromContract = path.resolve(project.contractDir, normalized);
    const byContractPath = nodes.find((n) => n.path === absFromContract);
    if (byContractPath) return byContractPath;

    // 2. 부분 경로 매칭 (path가 ref로 끝나는지 확인)
    const suffixRef = `/${normalized}`;
    const byPartial = nodes.filter((n) => n.path.endsWith(suffixRef));
    if (byPartial.length === 1) return byPartial[0];
    if (byPartial.length > 1) {
      printAmbiguous(ref, byPartial, project);
      process.exit(1);
    }
  } else {
    // 경로 구분자 없음: 파일명/basename으로 매칭 (중복 감지 우선)
    // 3. 파일명 매칭 (확장자 포함)
    const byFileName = nodes.filter((n) => path.basename(n.path) === normalized);
    if (byFileName.length === 1) return byFileName[0];
    if (byFileName.length > 1) {
      printAmbiguous(ref, byFileName, project);
      process.exit(1);
    }

    // 4. basename 매칭 (확장자 제외)
    const bare = normalized.endsWith(ext) ? normalized.slice(0, -ext.length) : normalized;
    const byBasename = nodes.filter((n) => n.basename === bare);
    if (byBasename.length === 1) return byBasename[0];
    if (byBasename.length > 1) {
      printAmbiguous(ref, byBasename, project);
      process.exit(1);
    }
  }

  return null;
}

function printAmbiguous<T extends { path: string }>(
  ref: string,
  candidates: T[],
  project: CddProject,
): void {
  console.error(`"${ref}"에 해당하는 파일이 여러 개 존재합니다:`);
  for (const c of candidates) {
    console.error(`  - ${path.relative(project.projectRoot, c.path)}`);
  }
  console.error("더 구체적인 경로를 사용하세요.");
}
