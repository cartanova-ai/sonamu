// 자동 생성 파일 - sonamu sync로 갱신됨
// 초기 빈 상태 - sonamu dev 실행 시 실제 내용으로 대체됩니다.

import { type Dictionary } from "@sonamu-kit/react-components";

const DEFAULT_LOCALE = "ko" as const;
export const SUPPORTED_LOCALES = ["ko", "en"] as const;
let currentLocale: (typeof SUPPORTED_LOCALES)[number] = DEFAULT_LOCALE;

export function setLocale(locale: (typeof SUPPORTED_LOCALES)[number]) {
  currentLocale = locale;
}

export function getCurrentLocale(): (typeof SUPPORTED_LOCALES)[number] {
  return currentLocale;
}

const dictionaries = {
  ko: { "common.logout": "로그아웃" },
  en: { "common.logout": "Logout" },
} as const;

export type MergedDictionary = Dictionary;
export type DictKey = keyof MergedDictionary;

type DictionaryFunction = Exclude<MergedDictionary[string], string>;

function isDictionaryFunction(value: MergedDictionary[string]): value is DictionaryFunction {
  return Object.prototype.toString.call(value) === "[object Function]";
}

/** locale에 맞는 번역 텍스트를 반환합니다. */
export function SD<K extends DictKey>(key: K): string {
  const dictionary: MergedDictionary = dictionaries[currentLocale];
  const value = dictionary[key] ?? key;
  return isDictionaryFunction(value) ? value() : value;
}
