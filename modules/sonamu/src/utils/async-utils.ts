import { glob } from "fs/promises";
import path from "path";

import { minimatch } from "minimatch";
import { debounce } from "radashi";

/**
 * 비동기 조건으로 배열을 필터링합니다
 * @example
 * const filtered = await filterAsync([1, 2, 3], async (x) => x > 1);
 */
export async function filterAsync<T>(
  arr: T[],
  predicate: (item: T, index: number, array: T[]) => Promise<boolean>,
): Promise<T[]> {
  const results = await Promise.all(
    arr.map((item, index) => predicate(item, index, arr).then((keep) => ({ item, keep }))),
  );
  return results.filter((r) => r.keep).map((r) => r.item);
}

/**
 * 비동기 조건이 모든 요소에 대해 참인지 확인합니다
 * @example
 * const allValid = await everyAsync([1, 2, 3], async (x) => x > 0);
 */
export async function everyAsync<T>(
  arr: T[],
  predicate: (item: T, index: number, array: T[]) => Promise<boolean>,
): Promise<boolean> {
  for (let i = 0; i < arr.length; i++) {
    if (!(await predicate(arr[i], i, arr))) {
      return false;
    }
  }
  return true;
}

/**
 * 비동기 변환 함수를 배열의 각 요소에 적용합니다
 * @example
 * const doubled = await mapAsync([1, 2, 3], async (x) => x * 2);
 */
export async function mapAsync<T, U>(
  arr: T[],
  mapper: (item: T, index: number, array: T[]) => Promise<U>,
): Promise<U[]> {
  return Promise.all(arr.map((item, index) => mapper(item, index, arr)));
}

/**
 * 비동기 리듀서로 배열을 축약합니다
 * @example
 * const sum = await reduceAsync([1, 2, 3], async (acc, x) => acc + x, 0);
 */
export async function reduceAsync<T, U>(
  arr: T[],
  reducer: (accumulator: U, currentValue: T, index: number, array: T[]) => Promise<U>,
  initialValue: U,
): Promise<U> {
  let accumulator = initialValue;
  for (let i = 0; i < arr.length; i++) {
    accumulator = await reducer(accumulator, arr[i], i, arr);
  }
  return accumulator;
}

/**
 * 비동기 glob 함수입니다.
 * AsyncIterableIterator로 날아오는 glob의 반환을 받아 끝까지 돌아서 배열로 반환합니다.
 *
 * @param pathPattern glob 패턴 (절대 경로 또는 상대 경로)
 * @param options.exclude 매치에서 제외할 패턴 목록 (예: `["**\/node_modules/**"]`).
 *   alternation을 포함하는 패턴이 의도치 않게 빌드 산출물 디렉토리를 휘말리게 하는 것을 막는 안전망.
 */
export async function globAsync(
  pathPattern: string,
  options?: { exclude?: string[] },
): Promise<string[]> {
  const files: string[] = [];
  const excludePatterns = options?.exclude;
  const iter = excludePatterns
    ? glob(path.resolve(pathPattern), {
        exclude: (filePath: string) =>
          excludePatterns.some((pat) => minimatch(filePath, pat, { dot: true })),
      })
    : glob(path.resolve(pathPattern));
  for await (const file of iter) {
    files.push(file);
  }
  return files;
}

/**
 * 키별로 trailing-edge debounce. 같은 key에 대해 delay 안에 여러 번 호출되면 마지막 args만
 * delay 후에 fn 호출. key가 다르면 timer 독립적.
 *
 * @example
 * const debounced = debounceByKey<string>(100, (path) => handleFileChange(path));
 * debounced("a.ts"); debounced("a.ts"); // 100ms 후 한 번만 호출
 * debounced("b.ts"); // a.ts와 별개로 100ms 후 호출
 */
export function debounceByKey<K, A extends unknown[]>(
  delay: number,
  fn: (key: K, ...args: A) => void | Promise<void>,
): (key: K, ...args: A) => void {
  const debouncersByKey = new Map<K, (key: K, ...args: A) => void>();
  return (key, ...args) => {
    let debounced = debouncersByKey.get(key);
    if (!debounced) {
      debounced = debounce({ delay }, (k: K, ...a: A) => {
        void fn(k, ...a);
      });
      debouncersByKey.set(key, debounced);
    }
    debounced(key, ...args);
  };
}

/**
 * 같은 key에 대한 호출 결과를 캐시. 같은 key로 다시 호출되면 fn 실행 없이 캐시값 반환.
 * 무효화는 프로세스 재시작 (또는 외부에서 invalidate). 호출자가 keyFn으로 args → string 매핑.
 *
 * @example
 * const cachedFmt = cached(formatCodeInternal, (code, filePath) => `${ext(filePath)}:${sha1(code)}`);
 * await cachedFmt(code, "a.ts"); // 실제 호출
 * await cachedFmt(code, "a.ts"); // 캐시 hit
 */
export function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyFn: (...args: A) => string,
): (...args: A) => Promise<R> {
  const cache = new Map<string, R>();
  return async (...args) => {
    const key = keyFn(...args);
    const hit = cache.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const result = await fn(...args);
    cache.set(key, result);
    return result;
  };
}
