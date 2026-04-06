/**
 * Sonamu 내부용 SD (Sonamu Dictionary) 함수
 * sonamu 코어 내부에서 사용하는 i18n 함수입니다.
 */

import { Sonamu } from "../api/sonamu";
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
const dictionaries: Record<string, MergedDictionary> = {
  ko,
  en,
};

type SDReturnType<K extends DictKey> = SonamuDict[K] extends (...args: infer P) => string
  ? (...args: P) => LocalizedString
  : LocalizedString;

function getDictValue<K extends DictKey>(key: K, locale: string): SDReturnType<K> {
  const { defaultLocale, supportedLocales } = Sonamu.config.i18n;

  // 1. 지정된 locale에서 조회
  const dict = dictionaries[locale];
  if (dict?.[key] !== undefined) {
    return dict[key] as unknown as SDReturnType<K>;
  }

  // 2. default locale에서 조회
  if (locale !== defaultLocale && dictionaries[defaultLocale]?.[key] !== undefined) {
    return dictionaries[defaultLocale][key] as unknown as SDReturnType<K>;
  }

  // 3. supported locales 순회
  for (const supportedLocale of supportedLocales) {
    if (supportedLocale !== locale && supportedLocale !== defaultLocale) {
      if (dictionaries[supportedLocale]?.[key] !== undefined) {
        return dictionaries[supportedLocale][key] as unknown as SDReturnType<K>;
      }
    }
  }

  // 4. 모두 실패 시 key 반환
  return key as unknown as SDReturnType<K>;
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
  const configLocale = Sonamu.config.i18n.defaultLocale;
  return getDictValue(key, configLocale);
}
