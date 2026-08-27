/**
 * Sonamu 내부용 SD (Sonamu Dictionary) 함수
 * sonamu 코어 내부에서 사용하는 i18n 함수입니다.
 */

import { type SonamuConfig } from "../api/config";
import en from "./en";
import ko from "./ko";
import { type LocalizedString } from "./types";

type SonamuDict = typeof ko;
type DictKey = keyof SonamuDict;

type MergedDictionary = {
  [K in keyof SonamuDict]: SonamuDict[K] extends (...args: infer P) => string
    ? (...args: P) => string
    : string;
};
interface DictionariesByLocale {
  [locale: string]: MergedDictionary;
}
const dictionaries: DictionariesByLocale = {
  ko,
  en,
};
let currentI18nConfig: SonamuConfig["i18n"] | null = null;

type SDReturnType<K extends DictKey> = SonamuDict[K] extends (...args: infer P) => string
  ? (...args: P) => LocalizedString
  : LocalizedString;

function getCurrentI18nConfig(): SonamuConfig["i18n"] {
  if (currentI18nConfig === null) {
    throw new Error("Sonamu i18n config has not been initialized");
  }

  return currentI18nConfig;
}

export function setSDConfig(i18nConfig: SonamuConfig["i18n"]): void {
  currentI18nConfig = i18nConfig;
}

function getDictValue<K extends DictKey>(key: K, locale: string): SDReturnType<K> {
  const { defaultLocale, supportedLocales } = getCurrentI18nConfig();

  // 1. 지정된 locale에서 조회
  const dict = dictionaries[locale];
  if (dict?.[key] !== undefined) {
    return /* SAFETY: 동기화된 사전 계약에서 문자열 브랜드만 추가한다. */ dict[
      key
    ] as SDReturnType<K>;
  }

  // 2. default locale에서 조회
  if (locale !== defaultLocale && dictionaries[defaultLocale]?.[key] !== undefined) {
    return /* SAFETY: 동기화된 사전 계약에서 문자열 브랜드만 추가한다. */ dictionaries[
      defaultLocale
    ][key] as SDReturnType<K>;
  }

  // 3. supported locales 순회
  for (const supportedLocale of supportedLocales) {
    if (supportedLocale !== locale && supportedLocale !== defaultLocale) {
      if (dictionaries[supportedLocale]?.[key] !== undefined) {
        return /* SAFETY: 동기화된 사전 계약에서 문자열 브랜드만 추가한다. */ dictionaries[
          supportedLocale
        ][key] as SDReturnType<K>;
      }
    }
  }

  // 4. 모두 실패 시 key 반환
  const missingValue: MergedDictionary[DictKey] = key;
  return /* SAFETY: 누락 키 문자열에 LocalizedString 브랜드만 추가한다. */ missingValue as SDReturnType<K>;
}

/**
 * Sonamu 내부용 SD 함수
 * sonamu 코어 내부에서만 사용합니다.
 *
 * @example
 * SD("error.notFound")  // → "찾을 수 없습니다" 또는 "Not found" (LocalizedString)
 * SD("error.entityNotFound")("User", 1)  // → "존재하지 않는 User ID 1" (LocalizedString)
 */
export function SD<K extends DictKey>(key: K): SDReturnType<K> {
  const configLocale = getCurrentI18nConfig().defaultLocale;
  return getDictValue(key, configLocale);
}
