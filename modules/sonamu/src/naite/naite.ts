/** biome-ignore-all lint/suspicious/noExplicitAny: Naite는 expect와 호응하도록 any를 허용함 */

import { expect } from "vitest";
import { Sonamu } from "../api/sonamu";

export type NaiteStore = Map<string, any>;

// Naite 싱글턴 객체 (추후 logger 연결 등의 상태 관리 필요성 고려)
export const Naite = {
  // 테스트 로그 기록
  t(name: string, value: any) {
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
  },

  // 테스트에서 값 가져오기
  get(name: string): any {
    const context = Sonamu.getContext();
    if (!context?.naiteStore || !context.naiteStore.has(name)) {
      throw new Error(`Naite.get: \`${name}\` not found`);
    }
    return context?.naiteStore?.get(name);
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
};
