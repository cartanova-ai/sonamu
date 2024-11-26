import path from "path";
import glob from "glob";
import fs from "fs-extra";
import _ from "lodash";

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

export function hydrate<T>(rows: T[]): T[] {
  return rows.map((row: any) => {
    // nullable relation인 경우 관련된 필드가 전부 null로 생성되는 것 방지하는 코드
    const nestedKeys = Object.keys(row).filter((key) => key.includes("__"));
    const groups = _.groupBy(nestedKeys, (key) => key.split("__")[0]);
    const nullKeys = Object.keys(groups).filter(
      (key) =>
        groups[key].length > 1 &&
        groups[key].every((field) => row[field] === null)
    );

    const hydrated = Object.keys(row).reduce((r, field) => {
      if (!field.includes("__")) {
        if (Array.isArray(row[field]) && _.isObject(row[field][0])) {
          r[field] = hydrate(row[field]);
          return r;
        } else {
          r[field] = row[field];
          return r;
        }
      }

      const parts = field.split("__");
      const objPath =
        parts[0] +
        parts
          .slice(1)
          .map((part) => `[${part}]`)
          .join("");
      _.set(
        r,
        objPath,
        row[field] && Array.isArray(row[field]) && _.isObject(row[field][0])
          ? hydrate(row[field])
          : row[field]
      );

      return r;
    }, {} as any);
    nullKeys.map((nullKey) => (hydrated[nullKey] = null));

    return hydrated;
  });
}
