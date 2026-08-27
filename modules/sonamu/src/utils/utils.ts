import fs from "fs";
import path from "path";

import { type FastifyRequest } from "fastify";

import { type AbsolutePath } from "./path-utils";
import { isObjectValue } from "./runtime-value";

export function findAppRootPath(): AbsolutePath {
  const apiRootPath = findApiRootPath();
  // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
  return path.dirname(apiRootPath) as AbsolutePath;
}

export function findApiRootPath(): AbsolutePath {
  // NOTE: for support npm / yarn / pnpm workspaces
  // 하지만 workspace 쓰면 process.cwd() 하면 되는데... 이건 나중에 협의 후 수정하는걸로
  const workspacePath = process.env.PNPM_SCRIPT_SRC_DIR ?? process.env.INIT_CWD;
  if (nonNullable(workspacePath)) {
    // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
    return workspacePath as AbsolutePath;
  }

  if (nonNullable(process.env.PNPM_PACKAGE_NAME)) {
    // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
    return process.cwd().split(path.sep).join(path.sep) as AbsolutePath;
  }

  const cwdPackagePath = path.join(process.cwd(), "package.json");
  if (fs.existsSync(cwdPackagePath)) {
    // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
    return process.cwd().split(path.sep).join(path.sep) as AbsolutePath;
  }

  const basePath = import.meta.filename;
  let dir = path.dirname(basePath);
  if (dir.includes("/.yarn/")) {
    dir = dir.split("/.yarn/")[0];
  }

  do {
    if (fs.existsSync(path.join(dir, "/package.json"))) {
      // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
      return dir.split(path.sep).join(path.sep) as AbsolutePath;
    }
    dir = dir.split(path.sep).slice(0, -1).join(path.sep);
  } while (dir.split(path.sep).length > 1);
  throw new Error("Cannot find AppRoot using Sonamu -2");
}

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export function exhaustive(_param: never): never {
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

export function merge<T extends object>(defaultObj: T, userObj: T): T {
  // 원본을 보존하면서 사용자 설정의 own enumerable 속성만 병합합니다.
  const result = { ...defaultObj };
  const defaultEntries = new Map(Object.entries(defaultObj));

  for (const [key, userValue] of Object.entries(userObj)) {
    const defaultValue = defaultEntries.get(key);
    const mergedValue =
      isPlainObject(userValue) && isPlainObject(defaultValue)
        ? merge(defaultValue, userValue)
        : userValue;
    Object.assign(result, { [key]: mergedValue });
  }

  return result;
}

// plain object 판별 헬퍼 함수
// (배열, null, Date 등을 제외한 순수 객체만 true)
export function isPlainObject<Value>(value: Value): value is Value & object {
  return (
    value !== null &&
    isObjectValue(value) &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

// Convert Fastify headers to standard Headers object
export function convertFastifyHeadersToStandard(headers: FastifyRequest["headers"]): Headers {
  const headersObj = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    if (value) headersObj.append(key, value.toString());
  });
  return headersObj;
}
