import { isFunctionValue } from "../utils/runtime-value";

export type PluralForms = {
  zero?: string | ((n: number) => string);
  one?: string | ((n: number) => string);
  other?: string | ((n: number) => string);
};

type PluralResolver = (n: number) => string;

function isPluralResolver(form: PluralForms[keyof PluralForms]): form is PluralResolver {
  return isFunctionValue(form);
}

export function plural(n: number, forms: PluralForms): string {
  const form = (n === 0 && forms.zero) || (n === 1 && forms.one) || forms.other;
  return isPluralResolver(form) ? form(n) : (form ?? n.toString());
}

export function createFormat(locale: string) {
  return {
    number: (n: number) => n.toLocaleString(locale),
    date: (d: Date) => d.toLocaleDateString(locale),
  };
}

export function josa(word: string, type: "은는" | "이가" | "을를" | "과와" | "으로") {
  const has받침 = (() => {
    const lastChar = word.charCodeAt(word.length - 1);
    if (lastChar < 0xac00 || lastChar > 0xd7a3)
      // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
      return false;
    return (lastChar - 0xac00) % 28 !== 0;
  })();

  const map = {
    은는: has받침 ? "은" : "는",
    이가: has받침 ? "이" : "가",
    을를: has받침 ? "을" : "를",
    과와: has받침 ? "과" : "와",
    으로: has받침 ? "으로" : "로",
  };

  return word + map[type];
}
