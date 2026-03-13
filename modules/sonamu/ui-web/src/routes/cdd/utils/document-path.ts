/** spec 파일 기준 상대 경로를 contract/ 기준 경로로 변환 */
export function resolveRefPath(basePath: string, ref: string): string {
  const dir = basePath.includes("/") ? basePath.substring(0, basePath.lastIndexOf("/")) : "";
  const parts = (dir ? `${dir}/${ref}` : ref).split("/");
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") {
      resolved.pop();
    } else {
      resolved.push(p);
    }
  }
  return resolved.join("/");
}

export function featureToSpecPath(contractDir: string, key: string): string {
  return contractDir ? `${contractDir}/${key}.spec.json` : `${key}.spec.json`;
}
