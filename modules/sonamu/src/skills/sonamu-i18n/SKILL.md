---
name: sonamu-i18n
description: Guides Sonamu translations and locale-aware values. Use when adding a locale, key, entity or enum label, switching locale, diagnosing a raw-key fallback, selecting localized columns, pluralizing counts, choosing Korean particles, or formatting locale-aware numbers or dates. Covers pnpm sonamu sync, SD, SD.locale, SD.enumLabels, setLocale, localizedColumn, defineLocale, plural, josa, and createFormat.
---

# Sonamu i18n

The configured API directory is the source of truth for project locale files. Edit
`<api.dir>/src/i18n/<locale>.ts`, then run:

```bash
pnpm sonamu sync
```

Sync copies every supported locale file to each directory in `sync.targets` and overwrites
`sd.generated.ts` for the API and every target. Do not edit those copied or generated files.

Configure the locale set in `sonamu.config.ts`. `defaultLocale` must also appear in
`supportedLocales`; generated types and imports use the default locale as the dictionary contract.

```typescript
export default defineConfig({
  api: { dir: "api", route: { prefix: "/api" } },
  i18n: {
    defaultLocale: "ko",
    supportedLocales: ["ko", "en", "ja"],
  },
  sync: { targets: ["web", "app"] },
  // ...
});
```

Read the reference matching the task:

- [Dictionary authoring and locale resolution](references/dictionaries.md) — adding keys or
  languages, `SD`, `SD.locale`, `SD.enumLabels`, entity labels, fallback, and `LocalizedString`.
- [Localized values and dictionary helpers](references/localized-values.md) — exact
  `localizedColumn` priority and the `plural`, `josa`, and `createFormat` helpers.
