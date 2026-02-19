// 자동 생성 파일 - sonamu sync로 갱신됨
// 초기 빈 상태 - sonamu dev 실행 시 실제 내용으로 대체됩니다.

const DEFAULT_LOCALE = "ko" as const;
export const SUPPORTED_LOCALES = ["ko", "en"] as const;
let _currentLocale: (typeof SUPPORTED_LOCALES)[number] = DEFAULT_LOCALE;

export function setLocale(locale: (typeof SUPPORTED_LOCALES)[number]) {
  _currentLocale = locale;
}

export function getCurrentLocale(): (typeof SUPPORTED_LOCALES)[number] {
  return _currentLocale;
}

// 초기 빈 dictionary
const dictionaries: Record<string, Record<string, string | ((...args: any[]) => string)>> = {
  ko: {
    "common.logout": "로그아웃",
  },
  en: {
    "common.logout": "Logout",
  },
};

// react-components의 Dictionary 타입과 호환되는 타입
export type MergedDictionary = Record<string, string | ((...args: any[]) => string)>;
export type DictKey = string;

/**
 * Sonamu Dictionary 함수
 * locale에 맞는 번역 텍스트를 반환합니다.
 */
export function SD<K extends DictKey>(key: K): string {
  const dict = dictionaries[_currentLocale] ?? dictionaries[DEFAULT_LOCALE];
  const value = dict?.[key] ?? key;
  if (typeof value === "function") {
    return value();
  }
  return value;
}
