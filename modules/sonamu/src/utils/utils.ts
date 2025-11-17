import path from "path";
import { glob } from "fs/promises";
import fs from "fs";
import { createImportUrl } from "./esm-utils";
import { AbsolutePath } from "./path-utils";

export async function globAsync(pathPattern: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of glob(path.resolve(pathPattern))) {
    files.push(file);
  }
  return files;
}

/**
 * 캐시 무시하고 새로 임포트합니다.
 * @param filePath
 * @returns
 */
export async function importFresh<ExportedMemberT>(
  filePath: string
): Promise<{ name: string; value: ExportedMemberT }[]> {
  const importUrl = createImportUrl(filePath); // ESM: file:// URL 사용
  const imported = await import(`${importUrl}?hot=${Date.now()}`);

  const allExportedMembers = Object.entries<ExportedMemberT>(imported).map(
    ([name, value]) => ({ name, value })
  );

  return allExportedMembers;
}

export async function findAppRootPath(): Promise<AbsolutePath> {
  const apiRootPath = findApiRootPath();
  return apiRootPath.split(path.sep).slice(0, -1).join(path.sep) as AbsolutePath;
}

export function findApiRootPath(): AbsolutePath {
  // NOTE: for support npm / yarn workspaces
  const workspacePath = process.env["INIT_CWD"];
  if (workspacePath && workspacePath.length !== 0) {
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
