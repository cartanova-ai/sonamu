---
title: miomock-web Storybook 셋업
type: feat
status: active
date: 2026-04-28
issue: SON-386
deepened: 2026-04-28
revised: 2026-04-28 (수동적 컴포넌트만 포함하는 기조로 범위 축소)
---

# miomock-web Storybook 셋업

## Enhancement Summary

**Deepened on:** 2026-04-28 (병렬 7개 sub-agent 합성)
**Revised on:** 2026-04-28 (사용자 결정에 따른 범위 축소)

### 핵심 결정 (revision)

본 사이클은 **"셋업 자체가 자산 + 만만하고 쓸만한 쇼케이스 정도"** 기조. 1차 stories는 **프리미티브에 가까운 수동적 컴포넌트**(인프라 부수효과·글로벌 state 등록 없음)만 포함:

- **CompanySearchInput**: Default + Controlled (2개)
- **Sidebar**: Default + AdminCompanies (2개)
- **CommonModal**: Default (1개)

= **3 컴포넌트 / 5 시나리오**. ApiLogViewer는 default axios 글로벌 인터셉터 격리 계약 비용이 본 사이클의 "만만" 기준과 충돌하여 별도 사이클로 이연.

### Sub-agent 보강 (이전 deepen에서 합성된 항목 — 유지)

- **사실 정정**: 진입점은 `entry-client.tsx` + `App.tsx` (SSR/CSR 하이브리드). SSR 로직 storybook 범위 제외
- **AppProviders 분리 → preview.tsx 인라인** (architecture + simplicity 합의)
- **better-auth `useSession()`은 throw 안 함**: 진짜 위험은 `/api/auth/get-session` fetch 실패 → preview에서 `globalThis.fetch` 가로채 200+null
- **모듈 글로벌 state 격리 계약** (jotai / better-auth fetch / tanstack-router): preview decorator에서 매 story 새 인스턴스 (`useMemo([ctx.id])` + `key={pathname}`)
- **stories 보일러플레이트 표준 블록** 단계 4에 박제, 단계 5~6 단일 참조
- **i18n decorator** (`globalTypes.locale` + `initialGlobals`)
- catalog 5개 키 모두 root catalog에 존재 (확인 완료)
- examples 격리 선언 (devDeps만, `*.stories.tsx`/`.storybook/` 외 storybook import 금지)
- 포트 컨벤션 메모 + CI 회귀 게이트 후속 명시

---

## 개요

`sonamu/examples/miomock/web` 에 Storybook 인스턴스를 도입한다. 셋업 자체를 자산으로 가져가는 것이 1차 목표이며, **1차 stories는 프리미티브에 가까운 수동적 컴포넌트 3종 / 5 시나리오**로 한정한다 ("쓰는 법 표본"으로서의 쇼케이스 가치).

본 작업은 SON-384(Storybook + Agentation) 우산 아래 자매 이슈인 SON-385(react-components 1차 확충, master 단일 커밋 `95701063` 푸시 완료)의 인프라·컨벤션을 그대로 재사용해 비용을 최소화한다.

## 목표

- miomock-web 디렉토리에 동작하는 Storybook 인스턴스 도입
- 1차 stories 5 시나리오 (CompanySearchInput Default/Controlled, Sidebar Default/AdminCompanies, CommonModal Default) — 셋업 부팅 + 다층 데코레이터(router + auth + jotai) 실전 검증 + 다음 사이클의 "복붙 모범"
- catalog 일관성 유지 (react-components와 동일 storybook 버전)
- 단일 커밋 단위로 정리 (SON-385 squash 운영 방식 계승)

## 비목표

- **ApiLogViewer stories** — default axios 글로벌 인터셉터 격리 비용으로 별도 사이클
- **CommonModal WithForm/CustomClassName** variant — Default 1개로 jotai 모범 충분
- ***SearchInput 잔여 6개** (User/Department/Employee/Project/Tag/File) — 100% 패턴 동일, 별도 파일 가치 낮음
- *SearchInput 도메인 variants 묶음 (CompanySearchInput stories 안에서) — 본 사이클 미포함
- miomock-web 컴포넌트 소스 수정 (셋업 단계에서는 stories만 추가)
- miomock-web 진입점(`entry-client.tsx`/`App.tsx`)의 SSR 로직 손대기
- novaid web Storybook 셋업 (별개 이슈 MED-295)
- novaid app stories 추가 (별개 이슈 MED-533)
- CI에 `build-storybook` 회귀 게이트 추가 (별도 후속 이슈)

## 컴포넌트 선별 기준

**프리미티브에 가까운 수동적 컴포넌트** = 컴포넌트 자체가 모듈 글로벌 state를 능동적으로 등록·변형하지 않고, props/children/Provider 컨텍스트를 받아 렌더만 하는 컴포넌트. preview decorator 인프라 안에서 격리가 끝나는 것들.

| 컴포넌트 | 경로 | 의존 | 분류 | 시나리오 |
| --- | --- | --- | --- | --- |
| `CompanySearchInput` | `src/components/company/` | EnumSelect + Input + Button. 의존 없음 | **포함 (수동 / 의존 0)** | Default · Controlled |
| `Sidebar` | `src/components/Sidebar.tsx` | `useRouterState` + `auth.useSession()` | **포함 (수동 / 컨텍스트만 읽음)** | Default · AdminCompanies |
| `CommonModal` | `src/admin-common/CommonModal.tsx` (91줄) | `commonModalAtom` (jotai) + Dialog | **포함 (수동 / atom 읽음)** | Default |
| `ApiLogViewer` | `src/admin-common/ApiLogViewer.tsx` (285줄) | **default axios 글로벌 인터셉터 등록** + Card | **후속 (능동 / 인프라 부수효과)** | — |
| `*SearchInput` 잔여 6개 | 각 도메인 디렉토리 | CompanySearchInput과 100% 동일 | 후속 (가치 낮음) | — |
| 라우트 페이지 (`src/routes/admin/**`) | — | 페이지 | 제외 | — |
| `sonamu-provider` | `src/contexts/` | Provider | 제외 (Provider 자체) | — |

## 컨텍스트 / 참고

- 부모: SON-384 (Storybook + Agentation 우산)
- 자매: SON-385 (react-components 1차 확충, 일단락)
- 작업 위치: sonamu 레포 `master` 브랜치 (SON-385와 동일 운영)
- 자매 작업 reference (이번 셋업의 모범):
  - `sonamu/modules/react-components/.storybook/main.ts` — viteFinal mergeConfig + Tailwind v4 + unplugin-icons + `@/` alias
  - `sonamu/modules/react-components/.storybook/preview.tsx` — SonamuProvider + Agentation
  - `sonamu/modules/react-components/.storybook/tsconfig.json` — Storybook 파일 전용 tsconfig
  - `sonamu/modules/react-components/package.json` — storybook deps catalog 참조 패턴
  - `sonamu/modules/react-components/src/components/ui/button.stories.tsx` 등 — 보일러플레이트 모범
- miomock-web 환경 (사실 정정):
  - `sonamu/examples/miomock/web/vite.config.ts` — react + tailwindcss + Icons(autoInstall:true) + tanstackRouter, `@/` alias
  - `sonamu/examples/miomock/web/package.json` — `@sonamu-kit/react-components: workspace:^`, jotai, react-query, react-router, better-auth, sass 등
  - `sonamu/examples/miomock/web/src/entry-client.tsx` + `src/App.tsx` — **SSR/CSR 하이브리드 진입점**. SSR hydration·document 루트 마운트·router IIFE async 로딩 포함. **storybook 범위에서는 SSR 로직 제외**
  - `sonamu/examples/miomock/web/src/components/Sidebar.tsx` — `useRouterState` + `useSonamuContext().auth.useSession()` 의존
  - `sonamu/examples/miomock/web/src/components/company/CompanySearchInput.tsx` — EnumSelect + Input + Button. router/auth 의존 없음
  - `sonamu/examples/miomock/web/src/admin-common/CommonModal.tsx` — `commonModalAtom` (jotai). line 40-44 `useEffect([open, onControlledOpen])` 함정 (콜백 `useCallback` 의무)
- SON-385 닫힌루프 자산 (재사용):
  - `/tmp/son-385-stories/run-e2e.sh` — iframe readiness + console.error + 스크린샷
  - `mcp__codex-cli__review { commit, workingDirectory, title }` — 커밋 SHA 기반 codex 리뷰
  - reviewer 서브에이전트 spawn 패턴

## 현황

- `.storybook/` 없음
- stories 0개
- catalog의 storybook 관련 5개 키(`@storybook/addon-a11y`, `@storybook/addon-docs`, `@storybook/react-vite`, `storybook`, `agentation`) 모두 root catalog에 등록되어 있음 (확인 완료)

## 접근 방식

### 단일 원칙

- react-components의 `.storybook` 디렉토리를 모범으로 두고, **차이 나는 부분만 미세 조정**한다. 새 패턴을 발명하지 않는다.
- 브랜치는 기본 브랜치(`master`)에서 직접 작업. 별도 feature 브랜치 없음 (SON-385와 동일).
- 푸시는 본 plan 범위 밖. 사용자가 직접 수행.
- **수동적 컴포넌트만 stories**: 프리미티브에 가까운 수동 컴포넌트(props/Provider 컨텍스트만 소비)에 한정. 글로벌 axios 인터셉터처럼 능동적/부수효과 컴포넌트는 별도 사이클.
- **격리 우선**: 모듈 글로벌 state 3종(jotai · better-auth fetch · tanstack-router)은 stories 간 누수 위험. preview decorator에서 매 story 격리를 명시 계약으로 선언.

### 차이 나는 축

| 축 | react-components | miomock-web | 처리 |
| --- | --- | --- | --- |
| 라우터 컨텍스트 | 일부 stories만 필요 | Sidebar는 필수 (`useRouterState`) | preview decorator에서 `createMemoryHistory` + `createRouter`, `useMemo([pathname, ctx.id])` + `key={pathname}`로 매 story 새 인스턴스 |
| auth context | preview에는 미적용 | Sidebar는 필수 (`auth.useSession()`) | SonamuProvider가 better-auth wrap. **`useSession()`은 throw하지 않으나** `/api/auth/get-session` fetch 실패 시 console.error 폭주 → preview에서 `globalThis.fetch` 가로채 200+null 응답 |
| jotai store | preview는 default 사용 | CommonModal은 `commonModalAtom` 의존 | preview에서 `<Provider store={createStore()}>` 매 story 새 store |
| 스타일 entry | `../src/styles/globals.css` | `App.tsx`/`entry-client.tsx`가 import하는 css 경로 (단계 0 확정) | preview 최상단에서 동일 css import |
| Icons autoInstall | `false` | vite.config는 `true` | Storybook viteFinal에서도 `true` 일관 |
| dev script | `storybook dev -p 6006` | 6006 충돌 → `-p 6007` | port 분리 (sonamu 6006/6007 모노레포 컨벤션) |
| 빌드 게이트 | `pnpm --filter @sonamu-kit/react-components lint/build` | `pnpm --filter miomock-web lint/build` | scope만 다름 |

### 단계별 분해

각 단계는 commit-sized · conflict-minimizing 단위로 짜되, 최종적으로 SON-385 운영 방식대로 단일 커밋으로 squash 정리한다.

#### 단계 0 — 사전 점검

- [x] `git fetch origin master` + `git status` (workspace clean)
- [x] sonamu master HEAD 동기화 상태 확인 (a1612a63 → d5d1486b 풀 완료, docs만 변경 — 본 작업 무관)
- [x] **`src/entry-client.tsx` + `src/App.tsx` Provider 구조 정독**. entry-client.tsx는 `<RouterProvider router={router} />` 단일 루트. SSR/CSR 분기는 storybook 범위 밖. App.tsx는 `Sidebar + Outlet` 레이아웃 (라우트 트리 안). preview decorator에는 SonamuProvider만 wrap (BaseSonamuProvider가 better-auth client + uploader 내장)
- [x] `App.tsx`의 `setLocale`은 useEffect 안 (모듈 top-level 부수효과 없음). 단, browser locale 감지 로직이 stories에서도 발동 가능 — preview decorator에서 `setLocale("ko")` 명시 호출로 격리
- [x] css entry 경로 확정: `import "./styles/tailwind.css"` (entry-client.tsx). preview에서 `../src/styles/tailwind.css`로 import
- [x] miomock-web `package.json`이 `tailwindcss` + `@tailwindcss/vite` + `@tailwindcss/postcss` 모두 catalog 의존 (확인 완료)
- [x] pnpm-workspace.yaml에 `examples/miomock/web` 포함 확인 (이미 포함)
- [x] catalog 5개 키 (`@storybook/addon-a11y`, `@storybook/addon-docs`, `@storybook/react-vite`, `storybook`, `agentation`) 모두 root catalog에 존재 (확인 완료)
- [x] 6007 포트 free (`lsof -i :6007`)
- [x] 1차 컴포넌트 3개의 i18n 의존: CompanySearchInput·Sidebar는 `SD()` 호출, CommonModal은 i18n 의존 없음. 모두 렌더 함수 내부 호출 (메모리 `feedback_sd_call_inside_render.md` 정렬)
- [x] miomock-api `.env` `MIOMOCK_DB_PORT=5433` 정상 (사용자 지시 점검)

검증: `git status --short`로 변경 없음 확인.

#### 단계 1 — devDependencies 추가

`examples/miomock/web/package.json` 의 devDependencies에 catalog 참조 추가:

```jsonc
{
  "devDependencies": {
    // 기존 항목 유지 + 아래 추가
    "@storybook/addon-a11y": "catalog:",
    "@storybook/addon-docs": "catalog:",
    "@storybook/react-vite": "catalog:",
    "agentation": "catalog:",
    "storybook": "catalog:"
  }
}
```

`pnpm install` 후 lockfile 변경 확인.

검증:
- [x] `pnpm install` 0 errors (peer warnings는 기존 환경 상태, 본 작업 무관)
- [x] miomock-web `node_modules/.bin/storybook` 존재 확인
- [x] 루트 `node_modules/@types/react` orphan 디렉토리 없음 (hoisted 안 됨, 정상)
- [x] lockfile 21+/-6 변경 (storybook deps만)

#### 단계 2 — `.storybook/` 셋업

다음 3 파일 신규:

##### `examples/miomock/web/.storybook/main.ts`

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type StorybookConfig } from "@storybook/react-vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  async viteFinal(config) {
    const { mergeConfig } = await import("vite");
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    const Icons = (await import("unplugin-icons/vite")).default;

    return mergeConfig(config, {
      plugins: [tailwindcss(), Icons({ compiler: "jsx", jsx: "react", autoInstall: true })],
      resolve: {
        alias: {
          "@": path.resolve(dirname, "../src"),
        },
      },
    });
  },
};

export default config;
```

차이: `autoInstall: true` (miomock-web vite.config와 일관). `@/` alias는 `../src`로 해석. `mergeConfig`/`tailwindcss`/`Icons` 모두 dynamic import (top-level import 시 Storybook 부팅 실패 회피).

##### `examples/miomock/web/.storybook/preview.tsx` (인라인 Provider 트리)

AppProviders 별도 모듈 분리는 **하지 않는다** (architecture-strategist + simplicity-reviewer 합의). 이유: miomock-web 진입점은 SSR/CSR 하이브리드라 Provider 트리를 추출하면 SSR 응집도 훼손. 현재 사용처 0의 추상화.

골자 (실제 코드는 단계 0의 `entry-client.tsx`/`App.tsx` 정독 결과로 미세 조정):

```tsx
import { type Decorator, type Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Provider as JotaiProvider, createStore } from "jotai";
import { Agentation } from "agentation";
import { useMemo } from "react";

import { SonamuProvider } from "@/contexts/sonamu-provider";
import "../src/styles/globals.css"; // 단계 0 확정 경로로 교체

// === better-auth fetch mock (모듈 top-level, 1회 install) ===
// /api/auth/get-session 호출은 Storybook iframe에서 닿지 않으므로 200 + null로 즉시 응답.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes("/api/auth/get-session")) {
    return new Response(JSON.stringify(null), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
};

// === minimal route tree (catch-all splat) ===
const rootRoute = createRootRoute({ component: () => <Outlet /> });
const splatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  component: () => null, // story는 RouterProvider defaultComponent에서 렌더
});
const routeTree = rootRoute.addChildren([splatRoute]);

// === decorators ===
const withProviders: Decorator = (Story, ctx) => {
  const pathname = (ctx.parameters.router?.pathname as string) ?? "/admin";

  // story마다 새 인스턴스 — 글로벌 state 누수 차단
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  }), [ctx.id]);
  const jotaiStore = useMemo(() => createStore(), [ctx.id]);
  const router = useMemo(() => createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  }), [pathname, ctx.id]);

  return (
    <SonamuProvider>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={jotaiStore}>
          <RouterProvider key={pathname} router={router} defaultComponent={() => <Story />} />
          <Agentation endpoint="http://localhost:4747" />
        </JotaiProvider>
      </QueryClientProvider>
    </SonamuProvider>
  );
};

const preview: Preview = {
  parameters: {
    router: { pathname: "/admin" },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
  globalTypes: {
    locale: {
      name: "Locale",
      description: "Internationalization locale",
      toolbar: {
        icon: "globe",
        items: [
          { value: "ko", title: "한국어" },
          { value: "en", title: "English" },
          { value: "ja", title: "日本語" },
          { value: "uk", title: "Українська" },
        ],
        showName: true,
      },
    },
  },
  initialGlobals: { locale: "ko" }, // Storybook 8.2+
  decorators: [withProviders],
};

export default preview;
```

핵심 격리 계약:

| 글로벌 state | 격리 방식 |
| --- | --- |
| TanStack Router | `createMemoryHistory` + `useMemo([pathname, ctx.id])` + `key={pathname}` 강제 remount. browser history 절대 금지 |
| jotai store | `createStore()` per-story Provider |
| react-query client | `new QueryClient()` per-story + `retry: false` + `refetchOnWindowFocus: false` |
| better-auth fetch | preview top-level 1회 fetch wrapper. `/api/auth/*` 200 + null 즉시 응답 |
| i18n locale | `globalTypes.locale` toolbar + `initialGlobals.locale = "ko"` |

##### `examples/miomock/web/.storybook/tsconfig.json`

react-components 모범 그대로:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "noEmit": true,
    "strict": true,
    "jsx": "react-jsx",
    "paths": { "@/*": ["../src/*"] }
  },
  "include": ["main.ts", "preview.tsx"]
}
```

검증:
- `pnpm --filter miomock-web exec tsc -p .storybook/tsconfig.json --noEmit` (가능하면)
- `pnpm --filter miomock-web exec storybook dev -p 6007 --no-open` 부팅
- readiness: `until curl -sSf http://localhost:6007/iframe.html; do sleep 2; done`
- index.json: `curl -sSf http://localhost:6007/index.json` (stories 0이라도 200 OK)

#### 단계 3 — package.json scripts

```jsonc
{
  "scripts": {
    "storybook": "storybook dev -p 6007"
  }
}
```

`build-storybook`은 두지 않음 — 정적 호스팅 계획 없음. CI 회귀 게이트 도입 시점(후속 이슈)에 추가.

검증: `pnpm --filter miomock-web run storybook` 부팅 확인 (수동).

#### 단계 4 — 1차 story (a): CompanySearchInput

router/auth 의존 없음. 셋업 자체가 동작하는지 확인하는 부팅 테스트 + 가장 단순한 보일러플레이트 모범.

##### Stories 보일러플레이트 표준 (단계 5~6 공통 참조)

```tsx
import { type Meta, type StoryObj } from "@storybook/react-vite";
import { CompanySearchInput } from "./CompanySearchInput";

const meta = {
  component: CompanySearchInput,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { /* 기본 시연값 */ },
} satisfies Meta<typeof CompanySearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;
```

**Discriminated union props 함정** (메모리 `storybook-discriminated-union-props-type-workaround`): EnumSelect 같은 union props 컴포넌트가 args 시연을 막으면 `type MetaArgs = typeof meta.args` → `StoryObj<MetaArgs>` 패턴으로 우회. 1차 stories는 EnumSelect를 prop으로 직접 노출하지 않으므로 기본 패턴 OK.

##### 시나리오

`examples/miomock/web/src/components/company/CompanySearchInput.stories.tsx`:

- 한국어 UI, 이모지 금지
- 시나리오:
  - **Default** — input/dropdown unmanaged 기본 시연
  - **Controlled** — `useState`로 keyword + searchField 관리, 검색 시 console.log. `render: function Render(args) { ... }` 패턴 (text input 커서 점프 회피, SON-385 컨벤션)
- mock 데이터는 placeholder 금지. 카르타노바·소나무 톤

검증:
- [x] iframe 접속 + `#storybook-root` 자식 ≥ 1 (Default · Controlled 둘 다)
- [x] console.error 0 (favicon 404 노이즈는 무시. Agentation 트래픽도 안 잡힘)
- [x] i18n 동작 확인 ("회사명" 라벨)
- 스크린샷은 playwright-cli sandbox 제약으로 미보존 (검증은 자식 + console로 충분)

#### 단계 5 — 1차 story (b): Sidebar

router + auth 데코레이터 실전 검증. 다층 데코레이터 모범.

##### `Sidebar.stories.tsx` (단계 4 보일러플레이트 그대로)

- 시나리오:
  - **Default** — `pathname: "/admin"`, unauthenticated 기본 상태. preview의 fetch wrapper로 `/api/auth/get-session` 즉시 200+null → `useSession()` data null → 헤더 user 미노출, signOut 버튼 미노출
  - **AdminCompanies** — `parameters: { router: { pathname: "/admin/companies" } }` — active 토글 시연

##### better-auth 동작 명확화

- `useSession()`은 **throw 하지 않는다**. `{ data, isPending, error, refetch }` 반환. unauthenticated 시 `data === null`, `error === null`, `isPending === false`
- 실제 위험은 `/api/auth/get-session` fetch 실패 → console.error 폭주 → preview top-level fetch wrapper로 차단 (단계 2)

검증:
- [x] iframe 접속 + `#storybook-root` 자식 ≥ 1 (Default · AdminCompanies)
- [x] console.error 0 (favicon 외 정상)
- [x] pathname active 토글: Default→/admin active, AdminCompanies→/admin/companies active, /admin inactive
- [x] `<Link>` 클릭 후 `window.location.pathname` = "/iframe.html" 불변 (memory history 보증)
- [x] Link 클릭 후 라우터 내부 active도 토글 (/admin/users 클릭 시 active=true)
- [x] better-auth fetch wrapper 동작 — unauthenticated 깔끔 (헤더 user 미노출, signOut 버튼 미노출)

#### 단계 6 — 1차 story (c): CommonModal

jotai 모범. 다음에 atom 쓰는 stories를 추가할 때 베끼는 표본.

##### 컴포넌트 함정 (julik-frontend-races-reviewer)

`CommonModal.tsx:40-44`:
```tsx
useEffect(() => {
  if (open && onControlledOpen) onControlledOpen();
}, [open, onControlledOpen]);
```

**`onControlledOpen`을 인라인 함수로 넘기면 reference가 매 render 새 함수 → effect 재실행 → 무한 루프 가능성**. story render의 콜백은 `useCallback`으로 안정화 의무.

##### 시나리오

`CommonModal.stories.tsx` (단계 4 보일러플레이트 그대로):

- **Default** — render 안에 trigger 버튼. 클릭 시 `useSetAtom(commonModalAtom)`으로 `{ open: true, reactNode: <SampleContent /> }` 주입

##### 시연 코드 골자

```tsx
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { Button } from "@sonamu-kit/react-components";
import { CommonModal, commonModalAtom } from "./CommonModal";

export const Default: Story = {
  render: function Render() {
    const setModal = useSetAtom(commonModalAtom);
    const onCompleted = useCallback(() => console.log("completed"), []);
    const onClose = useCallback(() => console.log("closed"), []);

    return (
      <>
        <Button onClick={() => setModal({
          open: true,
          reactNode: <div className="p-6">샘플 콘텐츠</div>,
          onCompleted,
          onControlledClose: onClose,
        })}>
          모달 열기
        </Button>
        <CommonModal />
      </>
    );
  },
};
```

검증:
- [x] iframe 접속 + 트리거 버튼 클릭 → `[role="dialog"]` 1개 출현, 콘텐츠 정상 노출
- [x] ESC 키로 닫힘 (`[role="dialog"]` → 0)
- [x] console.error 0 — "Maximum update depth exceeded" 없음 (`useCallback` 안정화 효과)
- [x] DialogTitle 누락 a11y warning은 stories 콘텐츠에 `DialogTitle` 추가로 해소 (본체 수정 없음)

#### 단계 7 — 검증 게이트

기본:
- `pnpm --filter miomock-web lint` (있으면 0 errors). `.storybook/`, `*.stories.tsx`가 oxlint config에 포함되는지 확인
- 루트 `pnpm check` (oxlint + oxfmt) 통과
- `storybook dev -p 6007` 부팅 + iframe.html readiness OK

stories 동작:
- CompanySearchInput · Default/Controlled 렌더 + console.error 0
- Sidebar · Default/AdminCompanies 렌더 + pathname active 토글 + console.error 0
- CommonModal · Default 렌더 + dialog 열기/닫기 + console.error 0

격리 계약:
- better-auth get-session 호출 정확히 1회 (retry 폭주 없음)
- `<Link>` 클릭 후 `window.location.pathname` 불변
- jotai atom 상태가 stories 간 누수되지 않음 (autodocs 페이지에서 모달이 정확한 story에만 표시)

이 게이트 모두 통과해야 단계 8로 진입.

#### 단계 8 — 리뷰 루프

SON-385 운영 방식 그대로:

1. 변경 diff 정리. 중간 커밋이 쌓였다면 단계 9에서 단일 커밋으로 squash 후 SHA 확보
2. **reviewer 서브에이전트** 1~2개 병렬 spawn (`run_in_background: true`):
   - 입력: 임시 커밋 SHA · `must_verify_behaviors` · 게이트 결과
   - 산출: 경미 지적은 자율 반영, 설계급은 사용자 결정 대기
3. **codex MCP review**: `mcp__codex-cli__review { commit, workingDirectory: "/Users/potados/Projects/sonamu", title }`
   - 정상 모드: 응답 받으면 `AskUserQuestion`으로 사용자 confirm 후 `codex-reply`
   - 응답이 끊기면 ToolSearch 재폴링 또는 사용자에게 `/mcp` 재접속 요청

#### 단계 9 — 단일 커밋 정리

- 사용자 흐름 따라 중간 커밋이 쌓이면 단일 커밋으로 squash (SON-385 운영)
- 커밋 메시지 컨벤션: `[scope] type: short title` 한국어
  - 예: `[miomock-web] feat: Storybook 셋업 및 1차 스토리 추가 (SON-386)`
- scope는 `miomock-web`
- AGENTS.md에 따라 sync artifact는 source edit과 동일 커밋. 본 작업에서는 `pnpm-lock.yaml` 변경이 source edit과 함께 묶임 — 정상
- 커밋 정리까지가 본 plan의 종착점. 이후 푸시는 사용자가 직접 수행한다.

## 의존성 / 리스크

### 의존성

| 항목 | 출처 | 비고 |
| --- | --- | --- |
| `@storybook/react-vite` 등 catalog 5개 | 루트 `pnpm-workspace.yaml` | react-components가 이미 사용 중. 추가 catalog 등록 불필요 (확인 완료) |
| `@sonamu-kit/react-components` | workspace | 이미 의존 |
| `@tailwindcss/vite` | catalog | 이미 의존 |
| `tailwindcss` | catalog | miomock-web `package.json`에 명시적 의존 확인 (pnpm hoisting 회피) |
| `unplugin-icons` | catalog | 이미 의존 |
| `@tanstack/react-router` | catalog | preview decorator 사용 |
| `@tanstack/react-query` | catalog | preview decorator 사용 |
| `jotai` | catalog | preview decorator 사용 |

**lockstep 결합 인지**: react-components와 miomock-web이 같은 catalog 키 5개 공유 → storybook 버전이 lockstep으로 묶임. 한쪽이 호환성 문제로 못 올리면 다른 쪽도 발이 묶임. 본 작업은 이 결합을 수용.

### 리스크 매트릭스

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| **better-auth `useSession()` fetch 실패 → console.error 폭주** (정정: throw 아님) | Sidebar story console.error 게이트 위반 | preview top-level `globalThis.fetch` 가로채 `/api/auth/get-session` 200+null 응답 (단계 2) |
| TanStack Router 인스턴스 공유 시 stale state | story switch 후 active 토글 안 됨 | `useMemo([pathname, ctx.id])` + `key={pathname}` 강제 remount (단계 2) |
| jotai default store 사용 시 atom 누수 | story 간 모달 열림 상태 누수 | `<Provider store={createStore()}>` per-story (단계 2) |
| `useEffect`에서 `onControlledOpen` 인라인 콜백 | CommonModal 무한 루프 | story render의 콜백을 `useCallback` 안정화 (단계 6) |
| Tailwind v4 entry css 경로가 entry-client.tsx와 어긋남 | Storybook 스타일 깨짐 | 단계 0에서 정확 경로 확정. entry-client.tsx import 그대로 따라감 |
| catalog 키 미등록 | 의존 설치 실패 | 단계 1 검증에서 `pnpm install` 실패로 즉시 노출 (확인 완료, 5개 모두 등록됨) |
| 6007 포트 충돌 | dev 서버 부팅 실패 | 6008 등 fallback. dev/HMR 충돌 검사 (`lsof -i :6007`) |
| `<Link>`/router navigate가 Storybook iframe URL과 핑퐁 | iframe URL 깨짐, manager reload | `createMemoryHistory` 강제 (단계 2). browser history 절대 금지 |
| `App.tsx`의 모듈 top-level 부수효과(setLocale 등) 누수 | stories 간 locale 리셋 | preview decorator에서 명시적 setLocale("ko") 또는 globalTypes로 대체 (단계 2) |
| sync artifact가 다른 작업의 미커밋 결과로 함께 들어올 위험 | 커밋 단위 오염 | 단계 0에서 workspace clean 확인. `git stash` 사용 시 메모리 정책(체인 금지) 준수 |
| `@types/react` orphan 디렉토리 | 타입 오류 폭발 | 단계 1 검증에서 root `node_modules/@types/react` symlink 확인 |
| sonamu sync 체크섬 실패 (병합 후) | 생성 액션 스킵 | 단계 1 후 `pnpm install` → 필요 시 `rm sonamu.lock` 후 재싱크 |

### 함정 노트

- **TanStack Router 데코레이터는 `_context` 인자 명시 필수** — Storybook controls 라이브 업데이트 버그 #33163 회피
- **viteFinal에서 `mergeConfig`/`tailwindcss`/`Icons` 모두 dynamic import 강제** — top-level import 시 부팅 실패 가능성
- **jotai default store 절대 금지** — `useHydrateAtoms`는 store당 1회만 적용 (rerender 시 미반영)
- **memory history 강제** — `createBrowserHistory` 절대 금지 (Storybook iframe URL 핑퐁)
- **콜백은 `useCallback`** — CommonModal `useEffect` 의존성 함정 회피
- **`git stash && pop` 한 줄 체인 금지** (메모리). 분리 명령으로
- **codex MCP review는 commit + prompt 동시 사용 불가** (SON-385 메모). commit 단독
- **`playwright-cli eval`은 JS 표현식만**. `const`/`let` 선언 시 SyntaxError (SON-385 메모)
- **better-auth `baseURL`에 포트 포함** — 로컬 환경 (메모리). preview fetch wrapper로 충분하지만 SonamuProvider가 BaseURL을 설정한다면 정합 확인

## 검증 게이트 / 종료 조건

다음 모두 통과해야 본 plan을 완료로 간주한다:

기본:
- [ ] `.storybook/main.ts` · `.storybook/preview.tsx` · `.storybook/tsconfig.json` 신규
- [ ] `package.json` `storybook` script 추가 (build-storybook은 호스팅 계획 없어 제외)
- [ ] `pnpm install` 0 errors
- [ ] `storybook dev -p 6007` 부팅 + iframe.html readiness OK

stories 동작:
- [ ] CompanySearchInput · Default/Controlled 렌더 + console.error 0
- [ ] Sidebar · Default/AdminCompanies 렌더 + pathname active 토글 + console.error 0
- [ ] CommonModal · Default 렌더 + dialog 열기/닫기 + console.error 0

격리 계약:
- [ ] better-auth get-session 호출이 정확히 1회 (retry 폭주 없음)
- [ ] `<Link>` 클릭 후 `window.location.pathname` 불변 (memory history 보증)
- [ ] autodocs 페이지에서 모달이 정확한 story에만 표시 (jotai store 격리)

빌드/린트:
- [ ] `pnpm --filter miomock-web lint` 0 errors (config가 .storybook/ + *.stories.tsx 포함하는지 확인)
- [ ] 루트 `pnpm check` 통과

리뷰:
- [ ] reviewer 서브에이전트 1~2개 + codex MCP review 통과 (경미는 반영, 설계급은 사용자 결정)

마무리:
- [ ] 단일 커밋으로 squash 정리 (push는 사용자 영역, 본 plan 범위 밖)

## 운영 정책

### 브랜치

- 기본 브랜치(`master`) 직접 작업. 별도 feature 브랜치 없음 (SON-385와 동일)

### 커밋

- AGENTS.md `[scope] type: title` 한국어
- scope: `miomock-web`
- 단일 커밋 단위는 "SON-386 miomock-web Storybook 셋업 및 1차 stories" 하나
- 중간 커밋이 쌓이면 단일 커밋으로 squash 정리

### 푸시

- 본 plan의 범위 밖. 사용자가 직접 수행한다. plan 종착점은 단계 9(단일 커밋 정리)

### Examples 격리 선언

- miomock-web의 storybook은 sonamu 자체 도구 검증용. miomock을 템플릿으로 쓰는 사용자가 storybook을 제거할 수 있도록 격리 유지
- storybook deps는 devDependencies에만
- `*.stories.tsx`/`.storybook/` 외 파일에 storybook import 금지

### Linear 운영

- SON-386 댓글 금지. 진행 경과는 본 plan에 누적 또는 SON-386 document에 갱신
- 본 plan 파일은 sonamu 레포의 `docs/plans/` 에 두고, Linear SON-386 에는 본 plan을 옮긴 가이드 document 첨부

### 메모리

- 본 작업이 일단락되면 SON-385 메모리(`project_son385_closed_loop_handoff.md`) 옆에 짧은 SON-386 메모리 추가
- 새로 발견된 함정(better-auth fetch wrapper, RouterProvider mock 격리, jotai store 격리)은 별도 reference 메모리로
- 포트 컨벤션 합의(sonamu 6006/6007, novaid 별 prefix) 메모리 등록

## 구현 결과 (2026-04-28)

**상태**: plan 종착점 도달. 단일 커밋 squash 정리 완료. 푸시는 사용자 영역(미수행).

**최종 커밋**: `4755e300` (sonamu master에 rebase, ahead 1 / behind 0)
- 메시지: `[miomock-web] feat: Storybook 셋업 및 1차 스토리 추가 (SON-386)`
- 9 files / +993 / -6 (devDep + lockfile + .storybook/ 3개 + stories 3개 + plan)

**구현 산출물**:
- `.storybook/main.ts` — viteFinal mergeConfig + Tailwind v4 + unplugin-icons + `@/` alias (모두 dynamic import)
- `.storybook/preview.tsx` — 인라인 Provider 트리(QueryClient → Jotai → SonamuProvider), `createMemoryHistory` + `useMemo([pathname, ctx.id])` + `key={pathname:id}` per-story 격리, `globalThis.fetch` wrapper로 `/api/auth/get-session` 200+null, `globalTypes.locale` ko/en/ja 토글 + `SUPPORTED_LOCALES` SSoT 정합 캐스팅
- `.storybook/tsconfig.json` — react-components 모범 그대로
- `package.json` — storybook deps 5개 catalog + scripts 1개(`storybook` only, build-storybook은 호스팅 계획 없음으로 제외)
- 1차 stories 3 컴포넌트 / 5 시나리오: CompanySearchInput Default·Controlled, Sidebar Default·AdminCompanies, CommonModal Default

**검증 통과**:
- storybook dev `:6007` 부팅 + iframe.html readiness OK
- 5 시나리오 모두 `#storybook-root` 자식 ≥ 1, console.error 0 (favicon 외)
- Sidebar pathname active 토글 (Default→/admin, AdminCompanies→/admin/companies, Link 클릭 → /admin/users 토글)
- `<Link>` 클릭 후 `window.location.pathname` = `/iframe.html` 불변 (memory history)
- CommonModal 모달 열기/닫기 동작, "Maximum update depth" 없음 (`useCallback` 안정화)
- autodocs 페이지 jotai 누수 없음 (dialog 0)
- 루트 `pnpm check` 통과 (oxlint + oxfmt, 0 errors)
- `tsc -p .storybook/tsconfig.json --noEmit` — 본 작업 회귀 0 (남은 1건 css side-effect 타입 누락은 react-components 모범도 동일)

**리뷰 결과 (2026-04-28)**:
- **codex MCP review**: `showName: true` 타입 누락(TS2353) 1건 발견 → 즉시 amend 반영
- **reviewer 서브에이전트**:
  - F-001 [medium · 자율 반영 완료]: locale toolbar `ja` 누락 + `setLocale` 타입 캐스팅 우회(메모리 `feedback_no_type_casting_workaround.md` 위반) → `ja` 추가 + `SUPPORTED_LOCALES` import + `(typeof SUPPORTED_LOCALES)[number]` SSoT 캐스팅으로 amend 반영
  - F-002 [medium · 사용자 결정 대기]: Agentation이 RouterProvider 형제라 story 전환마다 재마운트(WebSocket 재연결). 기능 버그 아님, 자매 자산도 동일 패턴. 본 사이클 현 구조 유지 권고
- 통과 항목: viteFinal dynamic import / jotai per-story 격리 / memory history 강제 / Provider 순서 / `useCallback` 안정화 / examples 격리 / fetch wrapper 분기 완전성 / CSS 경로 / braces 정책 — 전부 정상

## 후속 (별개 이슈/사이클)

- **ApiLogViewer stories** — default axios 글로벌 인터셉터 격리(`AbortController` + `config.adapter` mock + cleanup + story switch 4회 검증). 본체 리팩(`axiosInstance?: AxiosInstance` prop 추가) 동반 가능. 별도 사이클
- **CommonModal WithForm/CustomClassName variant** — Default 1개로 jotai 모범 충분. variant는 향후 사용처 발생 시
- ***SearchInput 잔여 6개 stories** — 패턴 동일이라 가치 낮음
- ***SearchInput 도메인 variants** (CompanySearchInput stories 안에서) — 본 사이클 미진행
- 후속 라이브 시연 시 routeTree 의존 컴포넌트 (관리자 페이지 컴포넌트) — 별도 결정 필요
- miomock-web common 컴포넌트 누적 시 추가 stories 사이클
- **CI 회귀 게이트 추가** — `build-storybook`을 `build-and-publish.yml`에 통합. react-components + miomock-web 두 storybook을 회귀 게이트로. 별도 이슈 발의 필요
- **포트 컨벤션 합의** — 모노레포 차원 정리 (sonamu 6006/6007, novaid 별 prefix)

## References

### 내부

- `sonamu/modules/react-components/.storybook/main.ts`
- `sonamu/modules/react-components/.storybook/preview.tsx`
- `sonamu/modules/react-components/.storybook/tsconfig.json`
- `sonamu/modules/react-components/package.json` (catalog 패턴)
- `sonamu/modules/react-components/src/components/ui/button.stories.tsx` (보일러플레이트 모범)
- `sonamu/examples/miomock/web/vite.config.ts`
- `sonamu/examples/miomock/web/src/entry-client.tsx` + `App.tsx` (Provider 트리 모범, **SSR 로직 제외**)
- `sonamu/examples/miomock/web/src/components/Sidebar.tsx`
- `sonamu/examples/miomock/web/src/components/company/CompanySearchInput.tsx`
- `sonamu/examples/miomock/web/src/admin-common/CommonModal.tsx`
- `sonamu/docs/plans/2026-03-18-feat-storybook-react-components-plan.md` (SON-385 plan)
- `sonamu/docs/brainstorms/2026-03-18-storybook-react-components-brainstorm.md`
- `sonamu/docs/solutions/integration-issues/storybook-discriminated-union-props-type-workaround.md`
- `novaid/docs/solutions/integration-issues/native-storybook-missing-font-and-decorator-config.md`
- `novaid/docs/solutions/integration-issues/git-stash-pop-blind-chain-conflict.md`
- `novaid/docs/solutions/integration-issues/better-auth-logout-and-cache-sync.md`
- `novaid/docs/solutions/build-errors/sonamu-sync-silent-failure-after-merge.md`
- `novaid/docs/solutions/build-errors/types-react-version-mismatch-pnpm-monorepo.md`

### 외부

- [Storybook Decorators](https://storybook.js.org/docs/writing-stories/decorators) / [Mocking Providers](https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-providers) / [Toolbars & Globals](https://storybook.js.org/docs/essentials/toolbars-and-globals)
- [Storybook #33163 — TanStack Router decorator + Controls live update bug](https://github.com/storybookjs/storybook/issues/33163)
- [TanStack Router History Types](https://tanstack.com/router/latest/docs/guide/history-types)
- [Better Auth Basic Usage](https://better-auth.com/docs/basic-usage) — `useSession()` 반환 형태
- [Jotai Provider](https://jotai.org/docs/core/provider) / [Initialize on Render](https://jotai.org/docs/guides/initialize-atom-on-render) / [Testing](https://jotai.org/docs/guides/testing)
- [Tailwind v4 + Storybook Vite #16451](https://github.com/tailwindlabs/tailwindcss/discussions/16451)
- [TanStack Router fake mock for Storybook (jaens gist)](https://gist.github.com/jaens/693bd767b0f18d6577265815f6831c7a)

### Linear

- SON-384 — 우산 (Storybook + Agentation)
- SON-385 — react-components 1차 확충 (일단락)
- SON-386 — 본 이슈 (miomock-web 셋업)
- MED-295 — novaid web Storybook 도입 (병행)
- MED-296 — novaid app Storybook 초기 셋업 (완료)
- MED-533 — novaid app 도메인 stories 추가 (병행)
