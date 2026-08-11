# Localized values and dictionary helpers

## Select a localized column value

`localizedColumn(row, column)` supports three storage shapes for a base such as `name`:

```typescript
{ name: "Fallback", name_ko: "이름", name_en: "Name" }
{ name: { ko: "이름", en: "Name" } }
{ name: { ko: ["첫째", "둘째"], en: ["First", "Second"] } }
```

An unsupported current locale is normalized to `defaultLocale`. The function then returns the first
non-empty supported value in this exact order:

1. `<column>_<currentLocale>`.
2. `<column>[currentLocale]` from a nested locale map.
3. The direct base `<column>` value.
4. `<column>_<defaultLocale>`.
5. `<column>[defaultLocale]` from a nested locale map.
6. For each remaining `supportedLocales` entry in configuration order: its suffix value, then its
   nested-map value.

`null`, `undefined`, and `""` are skipped. Direct suffix and base values accept `string`, `string[]`,
`number`, `boolean`, and `bigint`; non-string scalars are returned as strings. Nested locale-map
values accept only `string` and `string[]`. Arrays remain arrays, and the result is `undefined` when
no candidate has a supported value.

```typescript
localizedColumn({ name: "Fallback", name_en: "Name" }, "name");
localizedColumn({ name: { ko: ["첫째"], en: ["First"] } }, "name");
```

The API version reads the request Context locale. Web/app versions read the module locale controlled
by `setLocale`.

## Dictionary helpers

Import these helpers from `sonamu/dict` in an API locale source. Sync rewrites that import in copied
client locale files.

### `plural`

`plural(n, forms)` chooses a truthy `zero` for `0`, a truthy `one` for `1`, and falls through to
`other` otherwise. Empty `zero` or `one` strings therefore use `other`, while an empty `other` is
returned as-is. A selected function receives `n` and its result is returned directly, even if it is
`undefined` at runtime. Only an absent or nullish non-function form falls back to `n.toString()`.

```typescript
plural(count, {
  zero: "No items",
  one: "1 item",
  other: (n) => `${n} items`,
});
```

### `josa`

`josa` selects a Korean particle by whether the final Hangul syllable has a final consonant. It
supports `"은는"`, `"이가"`, `"을를"`, `"과와"`, and `"으로"`.

```typescript
josa("사람", "은는"); // 사람은
josa("회사", "과와"); // 회사와
josa("바다", "으로"); // 바다로
```

The implementation has no special case for a final `ㄹ`, so `josa("서울", "으로")` returns
`"서울으로"`. A last character outside the Hangul syllable range is treated as having no final
consonant.

### `createFormat`

`createFormat(locale).number(value)` delegates to `value.toLocaleString(locale)`, and
`.date(value)` delegates to `value.toLocaleDateString(locale)`:

```typescript
const format = createFormat("en");
format.number(1234567);
format.date(new Date());
```

Exact punctuation, spacing, and field order depend on the runtime's locale implementation; do not
encode a fixed rendered result from this example.
