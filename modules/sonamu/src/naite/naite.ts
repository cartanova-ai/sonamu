import { Sonamu } from "../api/sonamu";

export class Naite {
  // 테스트 로그 기록
  static t(name: string, value: any) {
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
  }

  // 테스트에서 값 가져오기
  static get(name: string): any {
    const context = Sonamu.getContext();
    if (!context?.naiteStore || !context.naiteStore.has(name)) {
      throw new Error(`Naite.get: \`${name}\` not found`);
    }
    return context?.naiteStore?.get(name);
  }

  // expect 래퍼 (CJS-ESM 이슈로 현재 사용불가)
  // static expect(name: string) {
  //   if (!this.vitestExpect) {
  //     throw new Error("Vitest is not initialized");
  //   }
  //   return this.vitestExpect(this.get(name));
  // }

  // 일반 로그 레벨
  static d(_message: string) {
    // TODO: Logger 연결
    console.log(`[DEBUG] ${_message}`);
  }
  static i(_message: string) {
    // TODO: Logger 연결
    console.log(`[INFO] ${_message}`);
  }
  static w(_message: string) {
    // TODO: Logger 연결
    console.log(`[WARN] ${_message}`);
  }
  static e(_message: string) {
    // TODO: Logger 연결
    console.log(`[ERROR] ${_message}`);
  }
}
