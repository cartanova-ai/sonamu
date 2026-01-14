/**
 * Sonamu 내부용 SD (Sonamu Dictionary) 함수
 * sonamu 코어 내부에서 사용하는 i18n 함수입니다.
 */

import { Sonamu } from "../api/sonamu";
import en from "./en";
import ko from "./ko";
import type { LocalizedString } from "./types";

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

const FALLBACK_LOCALE = "en";
function getDictValue<K extends DictKey>(key: K, locale: string): SDReturnType<K> {
  const dict = dictionaries[locale];
  const value = dict?.[key] ?? dictionaries[FALLBACK_LOCALE]?.[key] ?? key;
  return value as unknown as SDReturnType<K>;
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
