export type PluralForms = {
  zero?: string | ((n: number) => string);
  one?: string | ((n: number) => string);
  other?: string | ((n: number) => string);
};

export function plural(n: number, forms: PluralForms): string {
  const form = (n === 0 && forms.zero) || (n === 1 && forms.one) || forms.other;
  return typeof form === "function" ? form(n) : (form ?? n.toString());
}
