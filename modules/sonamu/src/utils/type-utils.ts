import { isObjectValue } from "./runtime-value";
// 타입을 펼쳐서 보여주는 유틸리티 (객체에만 사용해야 함)
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

// 핵심 로직
type SetPath<T, P extends string, V> = T extends readonly (infer U)[] // [Step 1] 현재 타입이 배열인가? -> 요소(U)에 대해 재귀 호출 후 배열로 감쌈
  ? SetPath<U, P, V>[]
  : // [Step 2] 경로가 점(.)으로 나뉘는가?
    P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? // [Step 2-1] 키가 존재함
        Expand<{
          [Key in keyof T]: Key extends K
            ? SetPath<T[K], Rest, V> // 재귀 호출
            : T[Key];
        }>
      : // [Step 2-2] 키가 없음 (새로운 객체 경로 생성)
        Expand<T & { [Key in K]: SetPath<{}, Rest, V> }>
    : // [Step 3] 경로의 마지막 (Base Case)
      P extends keyof T
      ? // [Step 3-1] 기존 키 덮어쓰기 (교차 타입 & 대신 조건부 타입으로 완전 교체)
        Expand<{ [Key in keyof T]: Key extends P ? V : T[Key] }>
      : // [Step 3-2] 새 키 추가
        Expand<T & { [Key in P]: V }>;

export function withProp<T extends object, P extends string, V>(
  obj: T,
  path: P,
  value: V,
): SetPath<T, P, V> {
  const keys = path.split(".");
  if (keys.length === 0) throw new Error("Path cannot be empty");
  const result = structuredClone(obj);

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 범용 배열 요소 타입
  const setDeep = (current: any, pathKeys: string[]): void => {
    if (pathKeys.length === 0) return;
    const [key, ...rest] = pathKeys;

    if (rest.length === 0) {
      if (Array.isArray(current)) {
        current.forEach((item) => {
          item[key] = value;
        });
      } else {
        current[key] = value;
      }
    } else {
      if (!(key in current) || !isObjectValue(current[key])) {
        current[key] = {};
      }
      if (Array.isArray(current[key])) {
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 범용 배열 요소 타입
        current[key].forEach((item: any) => {
          setDeep(item, rest);
        });
      } else {
        setDeep(current[key], rest);
      }
    }
  };

  setDeep(result, keys);
  // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
  return result as SetPath<T, P, V>;
}

interface ChainWrapper<T> {
  // 경로에 값을 설정하고 변경된 타입의 새로운 체인 래퍼를 반환합니다.
  set<P extends string, V>(path: P, value: V): ChainWrapper<SetPath<T, P, V>>;

  // 최종 결과 객체를 반환합니다.
  value(): T;
}

/**
 * 객체를 감싸서 체이닝을 시작합니다.
 */
export function withProps<T extends object>(obj: T): ChainWrapper<T> {
  return {
    set: <P extends string, V>(path: P, value: V) => {
      const nextObj = withProp(obj, path, value);
      return withProps(nextObj);
    },
    value: () => obj,
  };
}
