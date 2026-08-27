import {
  isBigIntValue,
  isFunctionValue,
  isNumberValue,
  isObjectValue,
  isStringValue,
  isSymbolValue,
} from "./runtime-value";

type Primitive = string | number | boolean | null | undefined;

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

type StructuredCloneable = Date | ArrayBuffer | TypedArray;

/** 직렬화 불가 타입 (명시적 제외용) */
type NonSerializable =
  | Function
  | Promise<unknown>
  | RegExp
  | symbol
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- WeakMap의 제네릭 파라미터
  | WeakMap<any, any>
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- WeakSet의 제네릭 파라미터
  | WeakSet<any>
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- WeakRef의 제네릭 파라미터
  | WeakRef<any>;

/** 재귀적 직렬화 가능 타입 */
export type Serializable =
  | Primitive
  | StructuredCloneable
  | SerializableArray
  | SerializableMap
  | SerializableSet
  | SerializableObject;

interface SerializableArray extends Array<Serializable> {}

interface SerializableMap extends Map<Serializable, Serializable> {}

interface SerializableSet extends Set<Serializable> {}

interface SerializableObject {
  [key: string]: Serializable;
}

/**
 * 주어진 타입 T가 직렬화 가능한지 검증하는 조건부 타입
 * 직렬화 불가한 값이 포함되어 있으면 never를 반환하여 타입 에러가 발생합니다
 */
export type AssertSerializable<T> = T extends NonSerializable
  ? never
  : T extends Primitive | StructuredCloneable
    ? T
    : T extends Map<infer K, infer V>
      ? Map<AssertSerializable<K>, AssertSerializable<V>>
      : T extends Set<infer U>
        ? Set<AssertSerializable<U>>
        : T extends Array<infer U>
          ? AssertSerializable<U>[]
          : T extends object
            ? { [K in keyof T]: AssertSerializable<T[K]> }
            : T;

export interface SerializableCheckResult {
  valid: boolean;
  reason?: string;
}

/**
 * 값이 Vitest worker/process 간 전달 가능한지 검증합니다.
 * Serializable하다는 것은 결국 message port와 process.send를 통해 전달 가능한 것을 의미합니다.
 *
 * @param value - 검증할 값
 * @param path - 현재 경로 (에러 메시지용, 내부 재귀에서 사용)
 * @param seen - 순환 참조 감지용 WeakSet (내부 재귀에서 사용)
 * @returns 검증 결과 { valid: boolean, reason?: string }
 *
 * @example
 * isSerializable({ a: 1, b: "hello" }) // { valid: true }
 * isSerializable({ fn: () => {} }) // { valid: false, reason: "Function at fn" }
 * isSerializable({ deep: { nested: Promise.resolve() } }) // { valid: false, reason: "Promise at deep.nested" }
 */
export function isSerializable<Value>(
  value: Value,
  path: string[] = [],
  seen: WeakSet<object> = new WeakSet(),
): SerializableCheckResult {
  // typeof null === 'object'이므로 먼저 처리
  if (value === null) {
    return { valid: true };
  }

  if (
    isStringValue(value) ||
    isNumberValue(value) ||
    value === true ||
    value === false ||
    value === undefined ||
    isBigIntValue(value)
  ) {
    return { valid: true };
  }

  if (isFunctionValue(value)) {
    return { valid: false, reason: `Function at ${formatPath(path)}` };
  }
  if (isSymbolValue(value)) {
    return { valid: false, reason: `Symbol at ${formatPath(path)}` };
  }

  if (isObjectValue(value)) {
    const obj = value;

    if (obj instanceof Promise) {
      return { valid: false, reason: `Promise at ${formatPath(path)}` };
    }

    if (obj instanceof RegExp) {
      return { valid: false, reason: `RegExp at ${formatPath(path)}` };
    }

    if (obj instanceof WeakMap) {
      return { valid: false, reason: `WeakMap at ${formatPath(path)}` };
    }
    if (obj instanceof WeakSet) {
      return { valid: false, reason: `WeakSet at ${formatPath(path)}` };
    }
    if ("WeakRef" in globalThis && obj instanceof WeakRef) {
      return { valid: false, reason: `WeakRef at ${formatPath(path)}` };
    }

    // 순환 참조 허용하되 무한루프 방지
    if (seen.has(obj)) {
      return { valid: true };
    }
    seen.add(obj);

    if (obj instanceof Date) {
      return { valid: true };
    }
    if (obj instanceof ArrayBuffer) {
      return { valid: true };
    }
    if (ArrayBuffer.isView(obj)) {
      return { valid: true };
    }

    if (obj instanceof Map) {
      let i = 0;
      for (const [k, v] of obj) {
        const keyResult = isSerializable(k, [...path, `Map.key[${i}]`], seen);
        if (!keyResult.valid) return keyResult;

        const valResult = isSerializable(v, [...path, `Map.value[${i}]`], seen);
        if (!valResult.valid) return valResult;
        i++;
      }
      return { valid: true };
    }

    if (obj instanceof Set) {
      let i = 0;
      for (const item of obj) {
        const result = isSerializable(item, [...path, `Set[${i}]`], seen);
        if (!result.valid) return result;
        i++;
      }
      return { valid: true };
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const result = isSerializable(obj[i], [...path, `[${i}]`], seen);
        if (!result.valid) return result;
      }
      return { valid: true };
    }

    // Vitest는 Error를 허용하지만 속성은 직렬화 필요
    if (obj instanceof Error) {
      const errorEntries = Object.entries(obj).filter(
        ([key]) => !["name", "message", "stack"].includes(key),
      );
      for (const [key, nestedValue] of errorEntries) {
        const result = isSerializable(nestedValue, [...path, key], seen);
        if (!result.valid) return result;
      }
      return { valid: true };
    }

    // Object.prototype 또는 null을 프로토타입으로 가지는 경우만 plain object
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      const constructorName = obj.constructor?.name ?? "Unknown";
      return {
        valid: false,
        reason: `Class instance (${constructorName}) at ${formatPath(path)}`,
      };
    }

    for (const [key, nestedValue] of Object.entries(obj)) {
      const result = isSerializable(nestedValue, [...path, key], seen);
      if (!result.valid) return result;
    }
    return { valid: true };
  }

  return { valid: false, reason: `Unknown value at ${formatPath(path)}` };
}

function formatPath(path: string[]): string {
  if (path.length === 0) return "(root)";
  return path.join(".");
}
