# Plan Document: Vite 8 / TypeScript 6.0 / Oxfmt+Oxlint Migration

**Branch:** `vite-8`
**Date:** 2026-04-06
**unresolved_questions_count:** 0

---

## Global Objective

Migrate the Sonamu monorepo toolchain across three sequential phases:

- Phase 1: Vite 7.3.0 → 8.0.3, Vitest ^4.0.10 → ^4.1.2
- Phase 2: TypeScript ^5.9.3 → 6.0
- Phase 3: Biome ^2.3.13 + ESLint → Oxfmt + Oxlint (full replacement)

**All phases are strictly sequential.** Each phase depends on the previous completing successfully.

---

## Execution Constraint

CRITICAL: No parallel groups anywhere. All units are strictly sequential (P-1 through P-3 are ordered phases, not concurrent groups). Each unit depends on the previous unit completing with all gates passing.

---

## Phase 1: Vite 8 + Vitest 4.1.2

### Scope

| Package                                                          | Change type                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm-workspace.yaml` catalog                                    | Version bumps                                                |
| `modules/react-components/vite.config.ts`                        | rollupOptions → rolldownOptions (external only, rename safe) |
| `examples/miomock/web/vite.config.ts`                            | rollupOptions → rolldownOptions + manualChunks redesign      |
| `modules/create-sonamu/template/src/packages/web/vite.config.ts` | rollupOptions → rolldownOptions + manualChunks redesign      |
| `modules/react-sui/vite.config.ts`                               | EXCLUDED (react-sui excluded from all phases)                |
| `modules/sonamu/ui-web/vite.config.ts`                           | No rollupOptions — verify only                               |
| `modules/tasks/vite.config.ts`                                   | No rollupOptions — verify only                               |
| `modules/cdd/vite.config.ts`                                     | No rollupOptions — verify only                               |
| `modules/sonamu/src/testing/dev-vitest-manager.ts`               | Smoke-test vitest/node API compatibility                     |
| `modules/sonamu/src/testing/naite-vitest-reporter.ts`            | Smoke-test reporter API compatibility                        |
| `examples/miomock/api/custom-sequencer.ts`                       | Smoke-test sequencer API compatibility                       |
| `modules/create-sonamu/template/src/package.json`                | Direct version update (outside workspace catalog)            |

### Target Versions (from Codex MCP analysis, 2026-04-06)

- `vite`: `8.0.3` (exact pin, same as current pinning style)
- `vitest`: `^4.1.2`
- `@vitest/coverage-v8`: `^4.1.2`
- `@vitejs/plugin-react`: `6.0.1` (exact pin, same as current `4.7.0` style)
- `@vitejs/plugin-react-swc`: `^4.3.0`

### Key Risks

1. **manualChunks object form no longer supported in Rolldown:** `examples/miomock/web` and template `web` both use object-form `manualChunks`. Must be replaced. Recommended strategy: remove `manualChunks` entirely and rely on Rolldown's default code-splitting, OR convert to function form (`manualChunks: (id) => { ... }`). Function form is supported in Rolldown. For a simple vendor split, the function form is: `manualChunks: (id) => { if (id.includes("react")) return "vendor-react"; ... }`.

2. **react-sui vite.config.ts also has rollupOptions:** react-sui is excluded from migration but still lives in the repo. Its `rollupOptions` field will remain as-is (Vite 8 continues to accept `rollupOptions` as a compatibility alias for `rolldownOptions`). Verify the alias still works in Vite 8.0.3 by confirming in Vite 8 migration docs before deciding whether to rename.

3. **Vitest internals (vitest/node API):** `dev-vitest-manager.ts` imports `createVitest` and `Vitest` from `vitest/node`. The `naite-vitest-reporter.ts` implements custom reporter. `custom-sequencer.ts` implements custom sequencer. These must be verified against Vitest 4.1 API. Run `pnpm --filter miomock-api test` as regression gate.

4. **Node.js floor:** Vite 8 requires `^20.19.0 || >=22.12.0`. Current local node is v25.3.0, which satisfies. No blocker.

5. **esbuild → oxc config:** Vite 8 replaces esbuild with oxc for transforms. The `esbuild` catalog entry (`^0.27.0`) may no longer be needed as a Vite dependency. Check if any package uses esbuild directly outside of Vite before removing. The `build.esbuild` → `build.oxc` option rename: scan all vite configs for `esbuild:` keys.

### Ordering Within Phase 1

1. Bump catalog versions in `pnpm-workspace.yaml`
2. Update template's `package.json` (outside catalog)
3. Run `pnpm install`
4. Rename `rollupOptions` → `rolldownOptions`, convert `manualChunks` in affected configs
5. Run `pnpm --filter react-components build`
6. Run `pnpm --filter ui-web build`
7. Run `pnpm --filter miomock-web build`
8. Run `pnpm --filter sonamu build`
9. Run `pnpm --filter miomock-api test` (regression gate for Vitest internals)

---

## Phase 2: TypeScript 6.0

### Scope

**Catalog bump:**

- `typescript`: `^5.9.3` → `6.0` (exact or `^6.0.0`)

**tsconfig changes — `types` additions:**

| File                                                                 | Current `types`                 | Add                          |
| -------------------------------------------------------------------- | ------------------------------- | ---------------------------- |
| `modules/sonamu/tsconfig.json`                                       | `["fastify-sse-v2"]`            | `["fastify-sse-v2", "node"]` |
| `examples/miomock/api/tsconfig.json`                                 | (absent)                        | `["node"]`                   |
| `modules/create-sonamu/tsconfig.json`                                | (absent)                        | `["node"]`                   |
| `modules/create-sonamu/template/src/packages/api/tsconfig.json`      | (absent)                        | `["node"]`                   |
| `modules/sonamu/ui-web/tsconfig.json`                                | (absent)                        | `["node"]`                   |
| `modules/react-components/tsconfig.json`                             | (absent)                        | `["node"]`                   |
| `modules/react-components/tsconfig.node.json`                        | (absent)                        | `["node"]`                   |
| `examples/miomock/web/tsconfig.app.json`                             | (absent)                        | `["node"]`                   |
| `examples/miomock/web/tsconfig.node.json`                            | (absent)                        | `["node"]`                   |
| `modules/create-sonamu/template/src/packages/web/tsconfig.app.json`  | (absent)                        | `["node"]`                   |
| `modules/create-sonamu/template/src/packages/web/tsconfig.node.json` | (absent)                        | `["node"]`                   |
| `modules/hmr-hook/tsconfig.json`                                     | (absent, extends Adonis preset) | `["node"]` — add explicitly  |
| `modules/hmr-runner/tsconfig.json`                                   | (absent, extends Adonis preset) | `["node"]` — add explicitly  |
| `modules/ts-loader/tsconfig.json`                                    | (absent)                        | `["node"]`                   |
| `modules/tasks/tsconfig.json`                                        | (absent)                        | `["node"]`                   |
| `modules/cdd/tsconfig.json`                                          | (absent)                        | `["node"]`                   |

Do NOT add `types` to: `tsconfig.schemas.json`, `tsconfig.types.json`, `tsconfig.test.json`, wrapper reference-only `tsconfig.json` files that extend leaf configs.

**noUncheckedSideEffectImports risk:**

- TS 6.0 strict mode enables `noUncheckedSideEffectImports` by default.
- Packages with CSS imports (web packages, storybook): `react-components`, `ui-web`, `miomock/web`, template `web`.
- Fix: add `"noUncheckedSideEffectImports": false` to affected tsconfigs, OR ensure `vite-env.d.ts` is included in `include` paths.
- `modules/react-components/tsconfig.json` has a specific risk: `vite-env.d.ts` may not be in `include`. Must add it or set flag.
- After all tsconfig fixes, verify build passes before pushing.

**Safe in TS 6.0 (no action needed):**

- `experimentalDecorators` + `emitDecoratorMetadata` — unchanged in TS 6.0
- `verbatimModuleSyntax` + `isolatedDeclarations` (ts-loader) — safe
- No `enum` keyword usage in codebase — no migration needed
- `baseUrl` + `paths` usage — check with `ts5to6` tool if any exist

### Ordering Within Phase 2

1. Bump `typescript` in catalog
2. Run `pnpm install`
3. Add `"types": ["node"]` to all listed tsconfigs
4. Add `"noUncheckedSideEffectImports": false` to web tsconfigs with CSS imports
5. Run `pnpm --filter sonamu test:type`
6. Run `pnpm --filter sonamu build`
7. Run `pnpm --filter miomock-api test`
8. Run `pnpm --filter ui-web build`
9. Run `pnpm --filter react-components build`
10. Run `pnpm --filter miomock-web build`

---

## Phase 3: Biome + ESLint → Oxfmt + Oxlint

### Scope

**Install:**

- Add `oxfmt` to workspace catalog and root devDeps
- Add `oxlint` to workspace catalog and root devDeps
- Remove `@biomejs/biome`, `@biomejs/js-api`, `@biomejs/wasm-nodejs` from catalog and all package.json files

**Config files to create:**

- Root `.oxfmtrc.json` (from `biome.json` formatter settings)
- Root `.oxlintrc.json` (from `biome.json` linter settings)

**Oxfmt option mapping (from Codex MCP analysis):**

| Biome                                         | Oxfmt                                              |
| --------------------------------------------- | -------------------------------------------------- |
| `indentStyle: "space"`                        | `useTabs: false`                                   |
| `indentWidth: 2`                              | `tabWidth: 2`                                      |
| `lineWidth: 100`                              | `printWidth: 100`                                  |
| `lineEnding: "lf"`                            | `endOfLine: "lf"`                                  |
| `quoteStyle: "double"`                        | `singleQuote: false`                               |
| `jsxQuoteStyle: "double"`                     | `jsxSingleQuote: false`                            |
| `trailingCommas: "all"`                       | `trailingComma: "all"`                             |
| `semicolons: "always"`                        | `semi: true`                                       |
| `bracketSpacing: true`                        | `bracketSpacing: true`                             |
| Import sorting (Biome assist.organizeImports) | `experimentalSortImports: true` in `.oxfmtrc.json` |

**Oxlint rule mapping from `biome.json` linter:**

- `noUnusedImports (warn+safe)` → `eslint/no-unused-vars` with fix options in `.oxlintrc`
- `noDoubleEquals (error)` → `eqeqeq: "error"`
- `noFocusedTests (warn)` → map to equivalent oxlint rule or leave as warn
- Recommended rules: enable `oxlint:recommended` as base
- Disabled biome rules: map to oxlint equivalents and disable them

**formatter.ts rewrite (CRITICAL):**

File: `modules/sonamu/src/utils/formatter.ts`

Current flow:

1. `biome.formatContent(...)` → formatted
2. `biome.lintContent(..., safeAndUnsafeFixes)` → linted (fixes noUnusedImports + organizeImports)
3. `biome.formatContent(...)` → final

New flow (using oxfmt Node.js API + oxlint CLI):

1. `import { format, type FormatOptions } from "oxfmt"` → `await format(filePath, code, options)` → formatted (returns `{ code }`)
2. Write to temp file → `oxlint --fix --fix-suggestions <tempFile>` → read back (removes unused imports)
3. `await format(filePath, formattedCode, options)` → final (also handles import sorting via `experimentalSortImports`)

FormatOptions to use:

```ts
const formatOptions: FormatOptions = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  singleQuote: false,
  jsxSingleQuote: false,
  trailingComma: "all",
  semi: true,
  endOfLine: "lf",
  bracketSpacing: true,
  experimentalSortImports: true,
};
```

For JSON parser: use `await format(filePath, code, { ...options, parser: "json" })` — verify oxfmt accepts `parser` option. If not, oxfmt auto-detects by file extension; use `.json` extension in temp file name.

**ESLint removal:**

- Delete `modules/sonamu/ui-web/.eslintrc.cjs`
- Update `modules/react-components/package.json` lint script (`eslint src` → `oxlint src`)
- Remove ESLint devDeps from affected packages: `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`

**biome-ignore comment migration:**

- 278 `biome-ignore` comments across modules — must be converted to `oxlint-disable` equivalents or removed
- Priority: only convert comments where the suppressed rule maps to an oxlint rule; remove others
- `biome-ignore lint/suspicious/noExplicitAny:` → `// oxlint-disable-next-line no-explicit-any`
- Other biome-ignore lint rules: assess per rule whether oxlint has equivalent
- Source file suppressions in `ui-web/src/` (11 instances), `sonamu/src/` (70 instances), `miomock/api/src/` (18 instances)

**scripts/verify.ts:**

- Replace `exec("pnpm biome check")` → `exec("pnpm check")` (the root `check` script will be updated to call oxlint+oxfmt)

**create-sonamu/template:**

- `modules/create-sonamu/template/src/biome.json` → replace with `.oxfmtrc.json` + `.oxlintrc.json`
- Template `package.json` scripts: replace biome → oxfmt/oxlint

**Root package.json scripts:**

- `"format": "biome format --write"` → `"format": "oxfmt --write ."`
- `"check": "biome check"` → `"check": "oxlint . && oxfmt --check ."`
- `"check:fix": "biome check --write --unsafe"` → `"check:fix": "oxlint --fix --fix-suggestions . && oxfmt --write ."`

**All per-package biome scripts** (sonamu, cdd, hmr-hook, hmr-runner, tasks, create-sonamu):

- `"lint": "biome check"` → `"lint": "oxlint"`
- `"format": "biome format --write"` → `"format": "oxfmt --write"`

### Ordering Within Phase 3

1. Install oxfmt + oxlint (add to catalog, update devDeps)
2. Create root `.oxfmtrc.json` and `.oxlintrc.json`
3. Rewrite `modules/sonamu/src/utils/formatter.ts`
4. Remove `@biomejs/js-api` and `@biomejs/wasm-nodejs` from `modules/sonamu/package.json`
5. Update all package.json scripts (biome → oxfmt/oxlint)
6. Delete `modules/sonamu/ui-web/.eslintrc.cjs`, remove ESLint deps
7. Update `scripts/verify.ts`
8. Migrate `create-sonamu/template/src/biome.json` → oxfmt/oxlint configs
9. Migrate `biome-ignore` comments → oxlint-disable equivalents (or remove where no equivalent exists)
10. Remove `@biomejs/biome` from root and all packages, run `pnpm install`
11. Run `pnpm check` (oxlint + oxfmt pass at root)
12. Run `pnpm --filter sonamu build`
13. Run `pnpm --filter miomock-api test`
14. Run full reformat pass: `pnpm format` (oxfmt --write)

---

## Validation Matrix

| Gate                                   | Phase 1  | Phase 2  | Phase 3      |
| -------------------------------------- | -------- | -------- | ------------ |
| `pnpm install` (clean)                 | Required | Required | Required     |
| `pnpm check` (root)                    | Biome    | Biome    | Oxfmt+Oxlint |
| `pnpm --filter sonamu build`           | Required | Required | Required     |
| `pnpm --filter sonamu test:type`       | Required | Required | Required     |
| `pnpm --filter miomock-api test`       | Required | Required | Required     |
| `pnpm --filter ui-web build`           | Required | Required | Required     |
| `pnpm --filter react-components build` | Required | Required | Required     |
| `pnpm --filter miomock-web build`      | Required | Optional | Required     |

---

## Non-Goals

- react-sui migration (explicitly excluded)
- Deployment or migration execution
- Adding new features beyond toolchain upgrade
- Changing application logic
- Editing generated files (`*.generated.ts`, `sonamu.generated.*`, `queries.generated.ts`)

---

## Risk Register

| Risk                                                            | Phase | Severity | Mitigation                                    |
| --------------------------------------------------------------- | ----- | -------- | --------------------------------------------- |
| manualChunks object form dropped in Rolldown                    | 1     | High     | Convert to function form or remove            |
| Vitest 4.1 vitest/node API change for custom reporter/sequencer | 1     | Medium   | Smoke test, type-check vitest manager         |
| noUncheckedSideEffectImports breaks CSS imports in web packages | 2     | Medium   | Add explicit `false` to web tsconfigs         |
| vite-env.d.ts not in react-components tsconfig include          | 2     | Medium   | Add to include or set flag                    |
| oxfmt Node.js API signature differs from assumed form           | 3     | Medium   | Verify API shape before rewrite               |
| 278 biome-ignore comments need migration                        | 3     | Medium   | Systematic pass, remove where no equivalent   |
| formatter.ts temp-file approach may have race conditions        | 3     | Low      | Use unique temp filenames (crypto.randomUUID) |
| create-sonamu template version drift (outside catalog)          | 1     | Low      | Manual update in each phase                   |

---

## Commit Boundary Plan

Each unit produces one commit. Commit message format: `[scope] type: short title` (Korean).

- U-101: `[sonamu, miomock] chore: Vite 8.0.3 + Vitest 4.1.2 카탈로그 및 설정 마이그레이션`
- U-201: `[*] chore: TypeScript 6.0 업그레이드 및 tsconfig types/noUncheckedSideEffectImports 수정`
- U-301: `[sonamu] refactor: formatter.ts Biome Node.js API → oxfmt + oxlint CLI 교체`
- U-302: `[*] chore: Biome + ESLint 제거 및 Oxfmt + Oxlint 전환 완료`
