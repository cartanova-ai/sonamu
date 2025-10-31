/**
 * 비동기 조건으로 배열을 필터링합니다
 * @example
 * const filtered = await filterAsync([1, 2, 3], async (x) => x > 1);
 */
export async function filterAsync<T>(
  arr: T[],
  predicate: (item: T, index: number, array: T[]) => Promise<boolean>
): Promise<T[]> {
  const results = await Promise.all(
    arr.map((item, index) =>
      predicate(item, index, arr).then((keep) => ({ item, keep }))
    )
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
  predicate: (item: T, index: number, array: T[]) => Promise<boolean>
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
  mapper: (item: T, index: number, array: T[]) => Promise<U>
): Promise<U[]> {
  return Promise.all(
    arr.map((item, index) => mapper(item, index, arr))
  );
}

/**
 * 비동기 리듀서로 배열을 축약합니다
 * @example
 * const sum = await reduceAsync([1, 2, 3], async (acc, x) => acc + x, 0);
 */
export async function reduceAsync<T, U>(
  arr: T[],
  reducer: (accumulator: U, currentValue: T, index: number, array: T[]) => Promise<U>,
  initialValue: U
): Promise<U> {
  let accumulator = initialValue;
  for (let i = 0; i < arr.length; i++) {
    accumulator = await reducer(accumulator, arr[i], i, arr);
  }
  return accumulator;
}
