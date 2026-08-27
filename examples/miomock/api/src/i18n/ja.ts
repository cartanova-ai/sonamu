import { defineLocale } from "./sd.generated";

/**
 * Project JA Dictionary
 * i18n SD fallback 테스트를 위한 최소한의 일본어 딕셔너리입니다.
 */
const jaOnlyDictionary = Object.fromEntries([["test.jaOnly", "日本語のみ"]]);

export default defineLocale(jaOnlyDictionary);
