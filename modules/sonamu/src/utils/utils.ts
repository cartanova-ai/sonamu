import path from "path";
import { glob } from "fs/promises";
import fs from "fs";

export async function globAsync(pathPattern: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of glob(path.resolve(pathPattern))) {
    files.push(file);
  }
  return files;
}
export async function importMultiple(
  filePaths: string[],
  doRefresh: boolean = false
): Promise<{ filePath: string; imported: any }[]> {
  const results: { filePath: string; imported: any }[] = [];

  for (const filePath of filePaths) {
    let importPath = "./" + path.relative(__dirname, filePath);

    if (doRefresh) {
      if (require.resolve) {
        delete require.cache[require.resolve(importPath)];
      } else {
        importPath += `?t=${Date.now()}`;
      }
    }

    const imported = await import(importPath);
    results.push({
      filePath,
      imported,
    });
  }

  return results;
}
export async function findAppRootPath() {
  const apiRootPath = findApiRootPath();
  return apiRootPath.split(path.sep).slice(0, -1).join(path.sep);
}

export function findApiRootPath() {
  // NOTE: for support npm / yarn workspaces
  const workspacePath = process.env["INIT_CWD"];
  if (workspacePath && workspacePath.length !== 0) {
    return workspacePath;
  }

  const basePath = require.main?.path ?? __dirname;
  let dir = path.dirname(basePath);
  if (dir.includes("/.yarn/")) {
    dir = dir.split("/.yarn/")[0];
  }
  do {
    if (fs.existsSync(path.join(dir, "/package.json"))) {
      return dir.split(path.sep).join(path.sep);
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
