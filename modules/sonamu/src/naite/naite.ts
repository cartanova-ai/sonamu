/** biome-ignore-all lint/suspicious/noExplicitAny: Naite는 expect와 호응하도록 any를 허용함 */

import { expect } from "vitest";
import { Sonamu } from "../api/sonamu";

export type NaiteStore = Map<string, any>;
export interface NaiteMockRegistry {
  [key: string]: any;
}
// Mock 설정 엔트리
type MockConfigEntry =
  | { when: any[]; returns: any }
  | { when: any[]; throws: Error }
  | { handler: Function }; // 추가

// Naite 싱글턴 객체 (추후 logger 연결 등의 상태 관리 필요성 고려)
export const Naite = {
  // 테스트 로그 기록
  t(name: string, value: any) {
    // 이 t 함수는 테스트 환경에서만 작동해야 합니다.
    // 그리고 테스트 환경 판단에 왜 isTest() 함수를 사용하지 않았냐면요,,
    // 이렇게 하는게 유틸 함수 불러와서 사용하는 것보다 조금이나마 빠를 것 같았기 때문입니다.
    if (process.env.NODE_ENV !== "test") {
      return;
    }

    try {
      const context = Sonamu.getContext();
      const store = context?.naiteStore;

      if (!store) {
        return;
      }
      if (store.has(name)) {
        // 이미 값이 있는 경우
        if (Array.isArray(store.get(name))) {
          // 배열에 추가
          store.set(name, [...store.get(name), value]);
        } else {
          // 배열이 아닌 경우 배열로 변환
          store.set(name, [store.get(name), value]);
        }
      } else {
        // 값이 없는 경우 추가
        store.set(name, value);
      }
    } catch {
      // Context 없는 상황에서 Naite.t 호출
    }
  },

  // 테스트에서 값 가져오기 (없는 경우 에러 throw)
  get(name: string): any {
    const context = Sonamu.getContext();
    if (!context?.naiteStore || !context.naiteStore.has(name)) {
      throw new Error(`Naite.get: \`${name}\` not found`);
    }
    return context?.naiteStore?.get(name);
  },

  // safe 값 가져오기 (없는 경우 undefined 반환)
  safeGet(name: string): any {
    const context = Sonamu.getContext();
    if (!context?.naiteStore || !context.naiteStore.has(name)) {
      return undefined;
    }
    return context?.naiteStore?.get(name);
  },

  // 임의의 값 지정 (강제)
  set(name: string, value: any) {
    const context = Sonamu.getContext();
    if (!context?.naiteStore) {
      return;
    }
    context.naiteStore.set(name, value);
  },

  // 전체 리스트 가져오기
  getAll(): { [key: string]: any } {
    const context = Sonamu.getContext();
    if (!context?.naiteStore) {
      return {};
    }
    return Object.fromEntries(context.naiteStore.entries());
  },

  // expect 래퍼
  expect(name: string) {
    return expect(this.get(name));
  },

  createStore(): NaiteStore {
    return new Map<string, any>();
  },

  // 일반 로그 레벨
  d(_message: string) {
    // TODO: Logger 연결
    console.log(`[DEBUG] ${_message}`);
  },
  i(_message: string) {
    // TODO: Logger 연결
    console.log(`[INFO] ${_message}`);
  },
  w(_message: string) {
    // TODO: Logger 연결
    console.log(`[WARN] ${_message}`);
  },
  e(_message: string) {
    // TODO: Logger 연결
    console.log(`[ERROR] ${_message}`);
  },

  /*
    For mocking
  */
  useMock<K extends keyof NaiteMockRegistry>(moduleKey: K) {
    type Module = NaiteMockRegistry[K];

    const builder = {
      when<M extends keyof Module>(
        method: M,
        args: Module[M] extends (...args: infer A) => any ? A : never,
      ) {
        type ReturnType = Module[M] extends (...args: any[]) => infer R ? Awaited<R> : never;

        return {
          returns(value: ReturnType) {
            const storeKey = `mock:${String(moduleKey)}.${String(method)}`;
            const existing = Naite.safeGet(storeKey) ?? [];
            existing.push({ when: args, returns: value });
            Naite.set(storeKey, existing);
            return builder;
          },
          throws(error: Error) {
            const storeKey = `mock:${String(moduleKey)}.${String(method)}`;
            const existing = Naite.safeGet(storeKey) ?? [];
            existing.push({ when: args, throws: error });
            Naite.set(storeKey, existing);
            return builder;
          },
        };
      },

      handle<M extends keyof Module>(method: M, fn: Module[M]) {
        const storeKey = `mock:${String(moduleKey)}.${String(method)}`;
        const existing = Naite.safeGet(storeKey) ?? [];
        existing.push({ handler: fn });
        Naite.set(storeKey, existing);
        return builder;
      },
    };

    return builder;
  },

  getMockConfig<K extends keyof NaiteMockRegistry, M extends keyof NaiteMockRegistry[K]>(
    moduleKey: K,
    method: M,
    args: any[],
  ): MockConfigEntry | undefined {
    const storeKey = `mock:${String(moduleKey)}.${String(method)}`;
    const configs = Naite.safeGet(storeKey) as MockConfigEntry[] | undefined;

    if (!configs) {
      return undefined;
    }

    // 1. when 매칭 먼저 시도
    const matched = configs.find((c) => "when" in c && isArgsMatch(c.when, args));
    if (matched) {
      return matched;
    }

    // 2. handler fallback
    return configs.find((c) => "handler" in c);
  },

  resetMocks(): void {
    const context = Sonamu.getContext();
    if (!context?.naiteStore) {
      return;
    }
    const naiteStore = context.naiteStore;

    for (const key of naiteStore.keys()) {
      if (key.startsWith("mock:")) {
        naiteStore.delete(key);
      }
    }
  },

  wrapMockProxy<K extends keyof NaiteMockRegistry>(
    moduleKey: K,
    actual: any,
  ): NaiteMockRegistry[K] {
    const proxy: any = { ...actual };

    for (const key of Object.keys(actual)) {
      const value = actual[key];
      if (typeof value === "function") {
        proxy[key] = (...args: any[]) => {
          const config = Naite.getMockConfig(moduleKey, key, args);
          if (!config) {
            return value(...args);
          }

          Naite.t(`mocked:${String(moduleKey)}.${key}`, { args, config });

          if ("handler" in config) {
            return config.handler(...args);
          }
          if ("throws" in config) {
            return Promise.reject(config.throws);
          }
          return Promise.resolve(config.returns);
        };
      }
    }

    return proxy;
  },
};

function isArgsMatch(expected: any[], actual: any[]): boolean {
  // expected 길이만큼만 비교 (optional 파라미터 무시)
  return expected.every((exp, i) => JSON.stringify(exp) === JSON.stringify(actual[i]));
}
