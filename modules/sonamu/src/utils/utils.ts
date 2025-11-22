import fs from "fs";
import path from "path";
import { cluster } from "radash";
import type { AbsolutePath } from "./path-utils";

export async function findAppRootPath(): Promise<AbsolutePath> {
  const apiRootPath = findApiRootPath();
  return apiRootPath.split(path.sep).slice(0, -1).join(path.sep) as AbsolutePath;
}

export function findApiRootPath(): AbsolutePath {
  // NOTE: for support npm / yarn / pnpm workspaces
  // 하지만 workspace 쓰면 process.cwd() 하면 되는데... 이건 나중에 협의 후 수정하는걸로
  const workspacePath = process.env.PNPM_SCRIPT_SRC_DIR ?? process.env.INIT_CWD;
  if (nonNullable(workspacePath)) {
    return workspacePath as AbsolutePath;
  }

  if (nonNullable(process.env["PNPM_PACKAGE_NAME"])) {
    return process.cwd().split(path.sep).join(path.sep) as AbsolutePath;
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

// 일반 버전
export function assertExists<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) {
    throw new Error(message ?? "Value must exist");
  }
  return value;
}

// null만 체크
export function assertNotNull<T>(value: T | null, message?: string): T {
  if (value === null) {
    throw new Error(message ?? "Value must not be null");
  }
  return value;
}
// undefined만 체크
export function assertDefined<T>(value: T | undefined, message?: string): T {
  if (value === undefined) {
    throw new Error(message ?? "Value must be defined");
  }
  return value;
}

// lodash chunk 대체 (radash cluster 사용)
export function chunk<T>(array: T[], size: number): T[][] {
  return cluster(array, Math.ceil(array.length / size));
}
// lodash intersectionBy 대체
export function intersectionBy<T, K>(
  arr1: readonly T[],
  arr2: readonly T[],
  iteratee: (item: T) => K,
): T[] {
  const arr2Keys = new Set(arr2.map(iteratee));
  return arr1.filter((item) => arr2Keys.has(iteratee(item)));
}
// lodash differenceWith 대체
export function differenceWith<T>(
  arr1: readonly T[],
  arr2: readonly T[],
  comparator: (a: T, b: T) => boolean,
): T[] {
  return arr1.filter((itemA) => !arr2.some((itemB) => comparator(itemA, itemB)));
}
