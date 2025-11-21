import path from "path";
import fs from "fs";
import { AbsolutePath } from "./path-utils";

export async function findAppRootPath(): Promise<AbsolutePath> {
  const apiRootPath = findApiRootPath();
  return apiRootPath
    .split(path.sep)
    .slice(0, -1)
    .join(path.sep) as AbsolutePath;
}

export function findApiRootPath(): AbsolutePath {
  // NOTE: for support npm / yarn / pnpm workspaces
  // 하지만 workspace 쓰면 process.cwd() 하면 되는데... 이건 나중에 협의 후 수정하는걸로
  const workspacePath = process.env["PNPM_SCRIPT_SRC_DIR"] ?? process.env["INIT_CWD"];
  if (nonNullable(workspacePath)) {
    return workspacePath as AbsolutePath;
  }

  const basePath = import.meta.filename;
  let dir = path.dirname(basePath);
  if (dir.includes("/.yarn/")) {
    dir = dir.split("/.yarn/")[0];
  }

  do {
    if (fs.existsSync(path.join(dir, "/package.json"))) {
      return dir.split(path.sep).join(path.sep) as AbsolutePath;
    }
    dir = dir.split(path.sep).slice(0, -1).join(path.sep);
  } while (dir.split(path.sep).length > 1);
  throw new Error("Cannot find AppRoot using Sonamu -2");
}

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export function exhaustive(_param: never) {
  throw new Error(`exhaustive`);
}