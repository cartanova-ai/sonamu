/**
 * dict 파일 파싱 결과 타입
 * - value: 실제 값 (문자열은 따옴표 없이, 함수는 원본 소스)
 * - isFunction: 함수 여부
 */
export type DictEntry = {
  key: string;
  value: string;
  isFunction: boolean;
};

/**
 * Dictionary row 타입
 */
export type DictionaryRow = {
  key: string;
  source: "entity" | "project";
  isFunction: boolean;
  [locale: string]: string | boolean | undefined;
};

/**
 * Entity key 파싱 결과 타입
 */
export type EntityKeyInfo =
  | { type: "entityTitle"; entityId: string }
  | { type: "propDesc"; entityId: string; propName: string }
  | { type: "enumLabel"; enumId: string; enumValue: string }
  | { type: "other" };

/**
 * Dictionary 수집 결과 타입
 */
export type DictionaryResult = {
  rows: DictionaryRow[];
  locales: string[];
  defaultLocale: string;
  stats: Record<string, { total: number; filled: number; percent: number }>;
};

/**
 * Import 결과 타입
 */
export type ImportResult = {
  success: boolean;
  updatedEntities: number;
  updatedLocales: number;
};

/**
 * Usage 검사 결과 타입
 */
export type UsageResult = {
  unusedKeys: string[];
  usedKeysCount?: number;
  error?: string;
};

/**
 * i18n 설정 타입
 */
export type I18nConfig = {
  defaultLocale: string;
  supportedLocales: string[];
};

export type LocalizedString = string & { __brand: "LocalizedString" };
