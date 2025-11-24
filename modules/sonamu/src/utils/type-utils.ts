type SetPath<T, P extends string, V> = P extends `${infer First}.${infer Rest}`
  ? First extends keyof T
    ? { [K in keyof T]: K extends First ? SetPath<T[K], Rest, V> : T[K] }
    : T & { [K in First]: SetPath<{}, Rest, V> }
  : T & { [K in P]: V };

/**
 * 불변성을 유지하면서 중첩 객체의 필드를 설정합니다.
 * @param obj 기본값 (예: { a: 1 })
 * @param path 경로 (예: "b.c.d")
 * @param value 값 (예: 0)
 * @returns 설정된 객체 (예: { a: 1, b: { c: { d: 0 } } })
 */
export function withProp<T extends object, P extends string, V>(
  obj: T,
  path: P,
  value: V,
): SetPath<T, P, V> {
  const keys = path.split(".");

  if (keys.length === 0) {
    throw new Error("Path cannot be empty");
  }

  const result = structuredClone(obj);
  let current: any = result;

  for (const [index, key] of keys.entries()) {
    if (index === keys.length - 1) {
      break;
    }

    // key가 없거나 객체가 아니면 빈 객체로 초기화
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  if (!lastKey) {
    throw new Error("Invalid path: empty last key");
  }

  current[lastKey] = value;
  return result as SetPath<T, P, V>;
}
