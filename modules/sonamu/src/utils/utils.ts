import path from "path";
import glob from "glob";
import { existsSync } from "fs";

export function globAsync(pathPattern: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    glob(path.resolve(pathPattern), (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files);
      }
    });
  });
}
export async function importMultiple(
  filePaths: string[]
): Promise<{ filePath: string; imported: any }[]> {
  return Promise.all(
    filePaths.map(async (filePath) => {
      const importPath = "./" + path.relative(__dirname, filePath);
      const imported = await import(importPath);
      return {
        filePath,
        imported,
      };
    })
  );
}
export async function findAppRootPath() {
  if (require.main === undefined) {
    throw new Error("Cannot find AppRoot using Sonamu");
  }
  let dir = path.dirname(require.main.path);
  if (dir.includes("/.yarn/")) {
    dir = dir.split("/.yarn/")[0];
  }
  do {
    if (existsSync(path.join(dir, "/package.json"))) {
      return dir.split(path.sep).slice(0, -1).join(path.sep);
    }
    dir = dir.split(path.sep).slice(0, -1).join(path.sep);
  } while (dir.split(path.sep).length > 1);
  throw new Error("Cannot find AppRoot using Sonamu");
}
