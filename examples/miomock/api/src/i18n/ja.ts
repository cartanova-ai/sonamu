import { defineLocale } from "./sd.generated";

/**
 * Project JA Dictionary
 * i18n SD fallback 테스트를 위한 최소한의 일본어 딕셔너리입니다.
 */
export default defineLocale({
  "test.jaOnly": "日本語のみ",
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- ko에 없는 키로 supportedLocale fallback 테스트 시 필요
} as any);
