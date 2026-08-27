import { type SDReturnType } from "@sonamu-kit/react-components";
import { atom, useAtomValue, useSetAtom } from "jotai";

import en from "./en";
import ko from "./ko";

export type Locale = "ko" | "en";
export type DictKey = keyof typeof ko;
export type UiWebDictionary = typeof ko;

const localeAtom = atom<Locale>("ko");

const dictionaries = { ko, en } as const;

/**
 * 현재 로케일을 가져옵니다.
 */
export function useLocale(): Locale {
  return useAtomValue(localeAtom);
}

/**
 * 로케일을 변경하는 함수를 반환합니다.
 */
export function useSetLocale() {
  return useSetAtom(localeAtom);
}

/**
 * SD 함수를 반환하는 훅입니다.
 * 컴포넌트 내에서 사용합니다.
 */
export function useSD() {
  const locale = useLocale();

  function translate<K extends DictKey>(key: K): SDReturnType<UiWebDictionary, K>;
  function translate(key: DictKey): UiWebDictionary[DictKey] {
    // 1. 현재 locale에서 조회
    if (dictionaries[locale]?.[key] !== undefined) {
      return dictionaries[locale][key];
    }

    // 2. default locale (ko)에서 조회
    if (locale !== "ko" && ko[key] !== undefined) {
      return ko[key];
    }

    // 3. supported locales 순회
    for (const { value: supportedLocale } of SUPPORTED_LOCALES) {
      if (supportedLocale !== locale && supportedLocale !== "ko") {
        if (dictionaries[supportedLocale]?.[key] !== undefined) {
          return dictionaries[supportedLocale][key];
        }
      }
    }

    // 4. key 반환
    return key;
  }

  return translate;
}

/**
 * 로케일 스위처 컴포넌트에서 사용할 수 있는 로케일 목록
 */
export const SUPPORTED_LOCALES: { value: Locale; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
];
