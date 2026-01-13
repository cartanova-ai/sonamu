import { atom, useAtomValue, useSetAtom } from "jotai";
import en from "./en";
import ko from "./ko";

export type Locale = "ko" | "en";
export type DictKey = keyof typeof ko;

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
  return (key: DictKey): string => {
    const dict = dictionaries[locale];
    return dict[key] ?? ko[key] ?? key;
  };
}

/**
 * 로케일 스위처 컴포넌트에서 사용할 수 있는 로케일 목록
 */
export const SUPPORTED_LOCALES: { value: Locale; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
];
