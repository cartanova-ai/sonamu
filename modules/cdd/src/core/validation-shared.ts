import path from "node:path";

/**
 * 프로젝트 루트 밖으로 탈출하는 source 경로 목록을 반환한다.
 */
export function findSourcesOutsideRoot(sources: string[], projectRoot: string): string[] {
  const result: string[] = [];
  for (const source of sources) {
    const resolved = path.resolve(projectRoot, source);
    const rel = path.relative(projectRoot, resolved);
    if (rel.startsWith("..")) {
      result.push(source);
    }
  }
  return result;
}

/**
 * knownPaths Set에 포함되지 않는 경로 목록을 반환한다.
 */
export function findMissingResolvedPaths(
  resolvedPaths: string[],
  knownPaths: Set<string>,
): string[] {
  return resolvedPaths.filter((p) => !knownPaths.has(p));
}
