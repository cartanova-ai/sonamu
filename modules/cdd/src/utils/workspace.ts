import fs from "node:fs";
import path from "node:path";

export function findWorkspaceRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg: object = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if ("workspaces" in pkg && Boolean(pkg.workspaces)) return dir;
      } catch {
        // 무시
      }
    }
    if (fs.existsSync(path.join(dir, ".agents"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
