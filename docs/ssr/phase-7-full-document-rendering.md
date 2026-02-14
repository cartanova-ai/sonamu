# Phase 7: Full Document Rendering

> **목표**: TanStack Router의 full document rendering 방식 도입으로 `<html>` 전체를 React가 관리하도록 변경

## 시작하기 전에: Phase 6 완료 상태 확인

Phase 6에서 다음 항목들이 **완전히 구임**되었습니다:

### ✅ Production SSR (완료)

- `renderer.ts`의 dev/prod 분기 처리
- Production 빌드 설정 (`web/vite.config.ts`)
- 빌드 결과물 복사 (`api/web-dist`)
- `setupStaticWebServer()`에 SSR 렌더링 로직 추가
- 롤링 업데이트 대응
- 에러 핸들링 및 CSR fallback

### 🎯 Phase 7의 목표

Phase 7은 **TanStack Router의 권장 아키텍처**를 따라 `__root`가 `<html>` 전체를 렌더링하도록 변경합니다.

**현재 방식 (Partial Rendering):**

```
index.html 템플릿
  → <!--app-head--> 치환 (head 태그)
  → <!--app-html--> 치환 (#root 안에)
```

**새로운 방식 (Full Document Rendering):**

```
RouterProvider만 렌더링
  → __root가 <html>...</html> 전체 생성
  → HeadContent로 route별 meta 자동 관리
  → Vite 스크립트만 추가 주입
```

**주요 변경점:**

1. `__root.tsx`가 `<html>` 전체 렌더링
2. `entry-server.tsx`에서 `Main` 래퍼 제거, `RouterProvider`만 렌더
3. `entry-client.tsx`에서 **SSR/CSR 모두 `document` 전체**를 React가 관리
4. `index.html`을 Vite와의 통신 매개체로만 사용
5. Dev/Production 스크립트 추출 로직 통일
6. ➕ **registerSSR에서 head 제거** - Route 파일에서만 관리
7. ➕ **disableHydrate 옵션 추가** - Hydration 이슈 회피용

**장점:**

- TanStack Router의 `HeadContent` 기능 정상 작동
- Route별 meta 관리 통합 (react-helmet 불필요)
- SSR/CSR 구조 완전 일치 (hydration 안정성 향상)
- 코드 단순화 (head 생성 로직 제거)
- Meta 관리 책임 명확화 (Route 파일 = 라우팅 + 렌더링 + Meta)
- Hydration 이슈 선별적 회피 가능

---

## 7.0 registerSSR API 변경

### 현재 구조

**파일**: `api/src/ssr/routes.ts`

```typescript
registerSSR({
  path: "/admin/companies",
  // ❌ head가 여기 있음
  head: () => ({
    title: "Miomock - Companies List",
  }),
  preload: () => [
    UserService.me(),
    CompanyService.getCompanies("A", { ... }),
  ],
});
```

**문제점:**

- Meta 관리가 두 곳에 분산 (registerSSR + Route 파일)
- TanStack Router의 `head` 옵션과 중복
- 코드 위치가 부자연스러움 (SSR 설정 파일에 UI meta)

### 변경 후 구조

**파일**: `api/src/ssr/routes.ts`

```typescript
// ✅ preload만 정의
registerSSR({
  path: "/admin/companies",
  preload: () => [
    UserService.me(),
    CompanyService.getCompanies("A", { ... }),
  ],
});
```

**파일**: `web/src/routes/admin/companies/index.tsx`

```tsx
// ✅ head는 Route 파일에서 정의
export const Route = createFileRoute("/admin/companies/")({
  head: () => ({
    meta: [
      { title: "Companies - Miomock Admin" },
      { name: "description", content: "Manage companies" },
    ],
  }),
  component: CompaniesIndex,
});
```

**변경 사항:**

1. ❌ `registerSSR`의 `head` 옵션 제거
2. ❌ `renderer.ts`의 `generateHeadTags()` 제거
3. ✅ Route 파일의 `head` 옵션만 사용
4. ✅ `HeadContent` 컴포넌트가 자동 처리

**장점:**

- **코드 위치 명확화**: Route 파일 = 라우팅 + 렌더링 + Meta
- **중복 제거**: `head` 정의가 한 곳에만
- **TanStack Router 철학**: 권장 아키텍처 준수
- **타입 안전성**: Route의 loaderData 기반 동적 meta 가능

### SSRRoute 타입 수정

**파일**: `modules/sonamu/src/ssr/types.ts`

```typescript
export interface SSRRoute {
  path: string;
  // ❌ head 제거
  // head?: (dehydratedState?: unknown) => {
  //   title?: string;
  //   meta?: Array<{ name?: string; property?: string; content: string }>;
  // };
  preload?: (params: Record<string, string>) => SSRQuery[];
  // ➕ disableHydrate 추가
  disableHydrate?: boolean;
}
```

### 확인 사항

- [ ] `registerSSR` 호출에서 `head` 제거
- [ ] Route 파일에 `head` 옵션 추가
- [ ] `SSRRoute` 타입에서 `head` 제거
- [ ] `renderer.ts`에서 `generateHeadTags()` 제거 확인

---

## 7.1 \_\_root 구조 변경

### 현재 구조

**파일**: `web/src/routes/__root.tsx`

```tsx
export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => {
    const { queryClient } = Route.useRouteContext();

    return (
      <AuthProvider>
        <App>
          <Outlet />
        </App>
      </AuthProvider>
    );
  },
});
```

**문제점:**

- `<html>`, `<head>`, `<body>` 없음
- `HeadContent` 컴포넌트 사용 불가
- Route별 meta 관리 불가능

### 변경 후 구조

**파일**: `web/src/routes/__root.tsx`

```tsx
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Scripts } from "@tanstack/react-router";
import AuthProvider from "../components/AuthProvider";
import App from "../App";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Miomock: Sonamu shines evergreen" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/sonamu.svg" />
        <HeadContent />
      </head>
      <body>
        <div id="root">
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <App>
                <Outlet />
              </App>
            </AuthProvider>
          </QueryClientProvider>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
```

**변경 사항:**

1. ➕ `<html>`, `<head>`, `<body>` 추가
2. ➕ `<HeadContent />` 추가 (route별 meta 자동 관리)
3. ➕ `<Scripts />` 추가 (TanStack Router의 스크립트 관리)
4. ➕ `head` 옵션으로 기본 meta 정의
5. ✏️ `QueryClientProvider`를 `__root` 안으로 이동 (Main 제거)
6. ✏️ `component`를 별도 함수(`RootComponent`)로 분리

### 확인 사항

- [ ] `__root.tsx` 파일 수정 완료
- [ ] TypeScript 컴파일 에러 없음
- [ ] `HeadContent`, `Scripts` import 정상

---

## 7.2 entry-server 수정

### 현재 구조

**파일**: `web/src/entry-server.generated.tsx`

```tsx
const appHtml = renderToString(
  <Suspense fallback={null}>
    <Main queryClient={queryClient}>
      <RouterProvider router={router} />
    </Main>
  </Suspense>
);
```

**문제점:**

- `<Main>`이 `<RouterProvider>` 바깥에 있음
- `__root`가 `<html>`을 리턴하면 `<Main>` → `<html>` 순서가 됨 (잘못된 구조)

### 변경 후 구조

**파일**: `web/src/entry-server.generated.tsx`

```tsx
import { dehydrate, QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { routeTree } from "./routeTree.gen";

export type PreloadedData = {
  queryKey: any[];
  data: any;
};

export async function render(url: string, preloadedData: PreloadedData[] = []) {
  // QueryClient 생성
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
        retry: false,
      },
    },
  });

  // Preloaded 데이터를 queryClient에 직접 주입
  for (const { queryKey, data } of preloadedData) {
    queryClient.setQueryData(queryKey, data);
  }

  // Dehydrate
  const dehydratedState = dehydrate(queryClient);

  // SSR용 메모리 히스토리 생성
  const memoryHistory = createMemoryHistory({
    initialEntries: [url],
  });

  // Router 생성 (SSR 모드)
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: memoryHistory,
    defaultPreload: "intent",
  });

  // 라우터 초기화
  await router.load();

  // ✏️ RouterProvider만 렌더링 (Main 제거)
  const appHtml = renderToString(<RouterProvider router={router} />);

  return {
    html: appHtml,
    dehydratedState,
  };
}
```

**변경 사항:**

1. ❌ `Main` import 제거
2. ❌ `<Main>` 래퍼 제거
3. ❌ `<Suspense>` 제거 (TanStack Router가 내부적으로 처리)
4. ✏️ `<RouterProvider />`만 렌더링

### 확인 사항

- [ ] `entry-server.generated.tsx` 수정 완료
- [ ] `Main` import 제거 확인
- [ ] TypeScript 컴파일 에러 없음

---

## 7.3 entry-client 수정 (+ disableHydrate)

### 현재 구조

**파일**: `web/src/entry-client.tsx`

```tsx
const root = document.getElementById("root");

const app = (
  <Main queryClient={queryClient}>
    <RouterProvider router={router} />
  </Main>
);

if (root.innerHTML && dehydratedState) {
  ReactDOM.hydrateRoot(root, app);
} else {
  ReactDOM.createRoot(root).render(app);
}
```

**문제점:**

- `#root` 요소에 hydrate/render
- `__root`가 `<html>`을 리턴하면 구조 불일치
- Hydration 이슈 발생 시 대응 불가
- SSR/CSR 구조가 다름

### 변경 후 구조

**파일**: `web/src/entry-client.tsx`

```tsx
import { hydrate, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./styles/tailwind.css";
import { dateReviver } from "./services/sonamu.shared";

// SSR 데이터 타입
declare global {
  interface Window {
    __SONAMU_SSR__?: any;
    __SONAMU_SSR_CONFIG__?: {
      disableHydrate?: boolean;
    };
  }
}

// QueryClient 생성
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: false,
      refetchOnMount: false,
    },
  },
});

// SSR 데이터 복원
const dehydratedState = window.__SONAMU_SSR__
  ? JSON.parse(JSON.stringify(window.__SONAMU_SSR__), dateReviver)
  : undefined;
if (dehydratedState) {
  hydrate(queryClient, dehydratedState);
}

// SSR Config 확인
const ssrConfig = window.__SONAMU_SSR_CONFIG__;

// Router 생성
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

await router.load();

// ✏️ SSR/CSR 모두 document 전체에 렌더링
if (document.documentElement.innerHTML && dehydratedState) {
  // SSR 페이지
  if (ssrConfig?.disableHydrate) {
    // disableHydrate: document 전체 새로 렌더링
    console.log("[Sonamu] Hydration disabled, rendering as CSR");
    ReactDOM.createRoot(document).render(<router.RouterProvider />);
  } else {
    // 정상 hydration: document 전체 hydrate
    ReactDOM.hydrateRoot(document, <router.RouterProvider />);
  }
} else {
  // Pure CSR 페이지: document 전체 렌더링
  ReactDOM.createRoot(document).render(<router.RouterProvider />);
}

// Chrome Extension용 Devtools
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: typeof queryClient;
  }
}
window.__TANSTACK_QUERY_CLIENT__ = queryClient;
```

**변경 사항:**

1. ❌ `Main` import 제거
2. ❌ `<Main>` 래퍼 제거
3. ✏️ **SSR/CSR 모두 `document` 전체**에 렌더링
4. ➕ `__SONAMU_SSR_CONFIG__` 타입 추가
5. ➕ `disableHydrate` 분기 로직 추가

**핵심 변경:**

- ❌ Before: SSR은 `#root`, CSR은 `#root` (부분 렌더링)
- ✅ After: SSR은 `document`, CSR은 `document` (전체 렌더링)
- ➕ disableHydrate: SSR은 하되 Hydration 건너뛰기

### 확인 사항

- [ ] `entry-client.tsx` 수정 완료
- [ ] SSR/CSR 모두 `document` 사용 확인
- [ ] disableHydrate 분기 로직 확인
- [ ] TypeScript 컴파일 에러 없음

---

## 7.4 index.html 단순화

### 현재 구조

**파일**: `web/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/sonamu.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Miomock</title>
    <!--app-head-->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
```

**역할:**

- Dev: Vite가 transformIndexHtml로 스크립트 주입
- SSR: `<!--app-head-->`, `<!--app-html-->` 치환

### 변경 후 구조

**파일**: `web/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
```

**변경 사항:**

1. ❌ `<meta>`, `<link>`, `<title>` 제거 (→ `__root`로 이동)
2. ❌ `<!--app-head-->` 제거
3. ❌ `<!--app-html-->` 제거 (더 이상 사용 안함)
4. ✅ `<script>` 유지 (Vite 엔트리 포인트)
5. ✅ `<div id="root">` 유지 (빈 컨테이너, CSR 진입점용)

**새로운 역할:**

- **Vite와의 통신 매개체** (Dev: transformIndexHtml, Prod: build)
- **최소한의 HTML 구조** (CSR 진입점)

**중요:**

- CSR도 `document`에 렌더링하므로 `<!--app-html-->` 불필요
- `<div id="root">`는 남지만 실제로는 `document` 전체가 교체됨

### 확인 사항

- [ ] `index.html` 단순화 완료
- [ ] `<!--app-head-->`, `<!--app-html-->` 제거 확인

---

## 7.5 renderer.ts 수정 (핵심 + disableHydrate)

### 현재 구조

**파일**: `modules/sonamu/src/ssr/renderer.ts`

```typescript
export async function renderSSR(
  url: string,
  route: SSRRoute,
  params: Record<string, string>,
  request: FastifyRequest,
  reply: FastifyReply,
  config: SonamuFastifyConfig,
  vite?: ViteDevServer,
): Promise<string> {
  // ... preload 실행

  // Dev/Prod 분기
  let template: string;
  let render: ...;

  if (vite) {
    template = await vite.transformIndexHtml(url, originalHtml);
    // ...
  } else {
    template = fs.readFileSync(path.join(webDistPath, "index.html"), "utf-8");
    // ...
  }

  const { html: appHtml, dehydratedState } = await render(url, preloadedData);

  // head 생성
  const headTags = route.head ? generateHeadTags(route.head(dehydratedState)) : "";

  // 치환
  const html = template
    .replace("<!--app-head-->", `${devCssLinks}\n    ${headTags}\n    ${ssrDataScript}`)
    .replace("<!--app-html-->", appHtml);

  return html;
}
```

**문제점:**

- `index.html` 템플릿을 기반으로 치환
- `<!--app-head-->`, `<!--app-html-->` 의존
- `generateHeadTags()` 수동 생성 (HeadContent와 중복)
- disableHydrate 옵션 미지원

### 변경 후 구조

**파일**: `modules/sonamu/src/ssr/renderer.ts`

```typescript
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ViteDevServer } from "vite";
import type { SonamuFastifyConfig } from "../types/types";
import type { PreloadedData, SSRRoute } from "./types";

export async function renderSSR(
  url: string,
  route: SSRRoute,
  params: Record<string, string>,
  request: FastifyRequest,
  reply: FastifyReply,
  config: SonamuFastifyConfig,
  vite?: ViteDevServer
): Promise<string> {
  const { Sonamu } = await import("../api/sonamu");

  // 1. preload 실행 → SSRQuery[] 획득 (dev/prod 공통)
  const preloadConfig = route.preload ? route.preload(params) : [];
  const preloadedData: PreloadedData[] = [];

  for (const {
    modelName,
    methodName,
    params: apiParams,
    serviceKey,
  } of preloadConfig) {
    const api = Sonamu.syncer.apis.find(
      (a) => a.modelName === modelName && a.methodName === methodName
    );

    if (!api) {
      console.warn(`API not found: ${modelName}.${methodName}`);
      continue;
    }

    try {
      const result = await Sonamu.invokeApiForSSR(
        api,
        apiParams,
        config,
        request,
        reply
      );
      preloadedData.push({
        queryKey: [...serviceKey, ...apiParams],
        data: result,
      });
    } catch (e) {
      console.error(`Failed to preload ${modelName}.${methodName}:`, e);
    }
  }

  // 2. ➕ Dev/Prod 스크립트 추출
  let viteScripts: string;
  let render: (
    url: string,
    preloadedData: PreloadedData[]
  ) => Promise<{ html: string; dehydratedState: unknown }>;

  if (vite) {
    // Dev: Vite Dev Server
    const fs = await import("node:fs/promises");
    const indexHtmlPath = path.join(vite.config.root, "index.html");
    const originalHtml = await fs.readFile(indexHtmlPath, "utf-8");
    const transformedHtml = await vite.transformIndexHtml(url, originalHtml);

    // Vite가 주입한 스크립트 추출
    viteScripts = extractScriptTags(transformedHtml);

    const entryModule = await vite.ssrLoadModule(
      "/src/entry-server.generated.tsx"
    );
    render = entryModule.render;
  } else {
    // Prod: 빌드된 파일
    const fs = await import("node:fs");
    const webDistPath = path.join(Sonamu.apiRootPath, "web-dist", "client");
    const ssrPath = path.join(Sonamu.apiRootPath, "web-dist", "server");

    // 빌드된 index.html에서 스크립트 추출
    const builtHtml = fs.readFileSync(
      path.join(webDistPath, "index.html"),
      "utf-8"
    );
    viteScripts = extractScriptTags(builtHtml);

    const entryModule = await import(
      path.join(ssrPath, "entry-server.generated.js")
    );
    render = entryModule.render;
  }

  // 3. ➕ RouterProvider 렌더링 (full document)
  const { html: fullDocHtml, dehydratedState } = await render(
    url,
    preloadedData
  );

  // 4. ➕ SSR 데이터 스크립트 생성
  const ssrDataScript = dehydratedState
    ? `<script>window.__SONAMU_SSR__ = ${JSON.stringify(
        dehydratedState
      ).replace(/</g, "\\u003c")};</script>`
    : "";

  // 5. ➕ SSR Config 스크립트 생성 (disableHydrate)
  const ssrConfigScript = route.disableHydrate
    ? `<script>window.__SONAMU_SSR_CONFIG__ = ${JSON.stringify({
        disableHydrate: true,
      })};</script>`
    : "";

  // 6. ➕ Vite 스크립트와 SSR 데이터를 </body> 직전에 주입
  const finalHtml = fullDocHtml.replace(
    "</body>",
    `${ssrConfigScript}\n${ssrDataScript}\n${viteScripts}\n</body>`
  );

  return finalHtml;
}

/**
 * HTML에서 <script>, <link> 태그를 추출
 */
function extractScriptTags(html: string): string {
  const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>|<link[^>]*>/gi;
  const matches = html.match(scriptRegex) || [];
  return matches.join("\n");
}
```

**변경 사항:**

1. ❌ `template` 변수 제거 (index.html 템플릿 불필요)
2. ❌ `generateHeadTags()` 호출 제거 (HeadContent가 처리)
3. ❌ `<!--app-head-->`, `<!--app-html-->` 치환 제거
4. ➕ `extractScriptTags()` 함수 추가 (Dev/Prod 통일)
5. ➕ `fullDocHtml`에 스크립트 주입
6. ➕ `ssrConfigScript` 생성 및 주입 (disableHydrate 전달)

**핵심 아이디어:**

- `index.html`을 Vite와의 **통신 매개체**로만 사용
- Dev: `transformIndexHtml` → 스크립트 추출
- Prod: 빌드된 `index.html` → 스크립트 추출
- `__root`가 렌더링한 full document에 스크립트 주입
- disableHydrate 설정을 클라이언트에 전달

### 확인 사항

- [ ] `renderer.ts` 수정 완료
- [ ] `extractScriptTags()` 함수 추가
- [ ] `generateHeadTags()`, `escapeHtml()` 제거
- [ ] `ssrConfigScript` 생성 로직 추가
- [ ] TypeScript 컴파일 에러 없음

---

## 7.6 Main.tsx 제거

### 현재 상태

**파일**: `web/src/main.tsx`

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { QueryClient } from "@tanstack/react-query";

export default function Main({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

### 변경 후

`Main` 컴포넌트의 로직이 `__root.tsx`로 이동했으므로 파일 제거:

```bash
rm web/src/main.tsx
```

### 확인 사항

- [ ] `main.tsx` 파일 제거
- [ ] 다른 파일에서 `Main` import 확인 (없어야 함)

---

## 7.7 disableHydrate 사용 가이드

### 언제 사용하나요?

**Hydration mismatch 해결이 어려운 경우:**

- 서버/클라이언트 환경 차이로 인한 불일치
- 써드파티 라이브러리의 SSR 호환성 이슈
- 동적 콘텐츠가 많아 일관성 유지가 어려운 경우
- 디버깅 시간이 과도하게 소요되는 경우

**트레이드오프:**

- ✅ SEO 유지 (서버에서 HTML 생성)
- ✅ 초기 HTML 표시 (빈 화면 방지)
- ✅ 개발 속도 향상 (디버깅 시간 절약)
- ❌ 약간의 깜빡임 (SSR HTML → CSR 재렌더링)
- ❌ 약간의 성능 손실 (완전히 새로 렌더링)

### 사용 방법

**파일**: `api/src/ssr/routes.ts`

```typescript
// ✅ Hydration 문제가 있는 라우트
registerSSR({
  path: "/admin/dashboard",
  preload: () => [
    UserService.me(),
    DashboardService.getStats("A"),
  ],
  disableHydrate: true,  // ← Hydration 건너뛰기
});

// ✅ 정상 라우트 (기본값)
registerSSR({
  path: "/admin/companies",
  preload: () => [
    UserService.me(),
    CompanyService.getCompanies("A", { ... }),
  ],
  // disableHydrate 생략 = false (정상 hydration)
});
```

### 동작 방식

```
1. 서버: SSR 렌더링
   → <html>...(렌더링된 콘텐츠)...</html>
   → window.__SONAMU_SSR_CONFIG__ = { disableHydrate: true }

2. 브라우저: 서버 HTML 표시
   → 사용자는 즉시 콘텐츠 확인 가능

3. 클라이언트: disableHydrate 체크
   → hydrateRoot() 건너뛰기
   → ReactDOM.createRoot(document) 로 완전히 새로 렌더링

4. 결과: 약간의 깜빡임 후 정상 동작
```

### 주의사항

**선별적으로 사용하세요:**

```typescript
// ❌ 나쁜 예: 모든 라우트에 disableHydrate
registerSSR({
  path: "/admin/*",
  disableHydrate: true, // 너무 광범위
});

// ✅ 좋은 예: 문제가 있는 특정 라우트만
registerSSR({
  path: "/admin/realtime-dashboard", // 실시간 데이터로 인한 불일치
  disableHydrate: true,
});

registerSSR({
  path: "/admin/companies", // 정상 동작
  // disableHydrate 생략
});
```

**대안을 먼저 고려하세요:**

```tsx
// Option 1: useEffect로 클라이언트 전용 처리
useEffect(() => {
  // 클라이언트에서만 실행
}, []);

// Option 2: import.meta.env.SSR 체크
if (!import.meta.env.SSR) {
  // Browser API 사용
}

// Option 3: Suspense boundary
<Suspense fallback={<Loading />}>
  <ClientOnlyComponent />
</Suspense>;

// Option 4 (최후): disableHydrate
registerSSR({
  path: "/problematic-route",
  disableHydrate: true,
});
```

### 확인 사항

- [ ] disableHydrate 사용 케이스 이해
- [ ] 트레이드오프 이해
- [ ] 선별적 사용 원칙 숙지

---

## 7.8 Dev 모드 테스트

### 테스트 순서

```bash
cd examples/miomock/web

# 1. 개발 서버 시작
pnpm dev

# 2. 브라우저에서 확인
open http://localhost:5173
```

### 확인 사항

#### 1. SSR 라우트 (`/admin/companies`)

- [ ] 페이지 정상 로드
- [ ] 페이지 소스 보기:
  ```html
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <link rel="icon" type="image/svg+xml" href="/sonamu.svg" />
      <title>Companies - Miomock Admin</title>
      <!-- HeadContent가 자동 생성 -->
    </head>
    <body>
      <div id="root">
        <!-- 렌더링된 컨텐츠 -->
      </div>
      <script>
        window.__SONAMU_SSR__ = {...};
      </script>
      <script type="module" src="/@vite/client"></script>
      <script type="module" src="/src/entry-client.tsx"></script>
    </body>
  </html>
  ```
- [ ] 콘솔에 hydration 에러 없음
- [ ] HMR 정상 동작 (파일 수정 시 즉시 반영)

#### 2. CSR 라우트 (`/admin/projects`)

- [ ] 페이지 정상 로드
- [ ] 클라이언트 사이드 렌더링 동작
- [ ] 네비게이션 정상 동작
- [ ] `document` 전체가 React로 렌더링되어 있는지 확인

#### 3. disableHydrate 라우트 (테스트용)

- [ ] 페이지 소스에 `window.__SONAMU_SSR_CONFIG__` 확인
- [ ] 콘솔에 "Hydration disabled" 로그 확인
- [ ] 약간의 깜빡임 후 정상 렌더링

#### 4. DevTools

- [ ] React Query DevTools 동작 확인
- [ ] 네트워크 탭에서 API 호출 확인
- [ ] Elements 탭에서 DOM 구조 확인 (`<html>` 전체가 React 관리)

### 문제 해결

**Hydration 에러 발생 시:**

```
Warning: Prop `className` did not match. Server: "..." Client: "..."
```

**원인:**

- 서버/클라이언트 렌더링 결과 불일치
- Browser API 사용 (window, document)
- 랜덤 값 생성

**해결:**

```tsx
// 1. useEffect로 감싸기
useEffect(() => {
  // Browser API 사용
}, []);

// 2. import.meta.env.SSR 체크
if (!import.meta.env.SSR) {
  // Browser API 사용
}

// 3. 최후의 수단: disableHydrate
registerSSR({
  path: "/problematic-route",
  disableHydrate: true,
});
```

---

## 7.9 Production 모드 테스트

### 빌드 및 실행

```bash
cd examples/miomock/api

# 1. 빌드
pnpm build

# 2. 실행
NODE_ENV=production pnpm start

# 3. 브라우저에서 확인
open http://localhost:10280
```

### 확인 사항

#### 1. 빌드 결과

```
api/
  web-dist/
    client/
      index.html              # ← 빌드된 HTML
      assets/
        entry-client-[hash].js
        style-[hash].css
        vendor-react-[hash].js
        vendor-tanstack-[hash].js
    server/
      entry-server.generated.js
```

- [ ] `web-dist/client` 폴더 생성
- [ ] `web-dist/server` 폴더 생성
- [ ] 해시가 포함된 파일명 확인

#### 2. SSR 라우트 (`/admin/companies`)

- [ ] 페이지 소스 보기:
  ```html
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <link rel="icon" type="image/svg+xml" href="/sonamu.svg" />
      <title>Companies - Miomock Admin</title>
      <link rel="stylesheet" href="/assets/style-[hash].css" />
    </head>
    <body>
      <div id="root">
        <!-- 렌더링된 컨텐츠 -->
      </div>
      <script>
        window.__SONAMU_SSR__ = {...};
      </script>
      <script type="module" src="/assets/entry-client-[hash].js"></script>
    </body>
  </html>
  ```
- [ ] SEO 메타 태그 확인
- [ ] Hydration 에러 없음
- [ ] 정적 파일 캐싱 확인 (Cache-Control 헤더)

#### 3. disableHydrate 라우트

- [ ] 페이지 소스에 `window.__SONAMU_SSR_CONFIG__` 확인
- [ ] 정상 동작 확인

#### 4. CSR 라우트

- [ ] CSR 정상 동작 (`document` 전체 렌더링)
- [ ] 네비게이션 정상 동작

---

## 7.10 Route별 Meta 관리 테스트

### Route에 meta 추가

**파일**: `web/src/routes/admin/companies/index.tsx` (예시)

```tsx
export const Route = createFileRoute("/admin/companies/")({
  // ➕ head 옵션 추가
  head: () => ({
    meta: [
      { title: "Companies - Miomock Admin" },
      { name: "description", content: "Manage companies in Miomock" },
      { property: "og:title", content: "Companies - Miomock Admin" },
      { property: "og:description", content: "Manage companies in Miomock" },
    ],
  }),
  component: CompaniesIndex,
});
```

### 확인 사항

- [ ] 페이지 소스에서 `<title>` 확인
- [ ] `<meta>` 태그 확인
- [ ] 다른 Route로 이동 시 title 변경 확인
- [ ] Browser 탭 제목 변경 확인

### 동적 meta (예: 상세 페이지)

**파일**: `web/src/routes/admin/companies/$companyId.tsx`

```tsx
export const Route = createFileRoute("/admin/companies/$companyId")({
  loader: async ({ params }) => {
    // 데이터 로드
    const company = await fetchCompany(params.companyId);
    return { company };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData.company.name} - Miomock` },
      { name: "description", content: loaderData.company.description },
    ],
  }),
  component: CompanyDetail,
});
```

- [ ] 동적 title 생성 확인
- [ ] 데이터 기반 meta 생성 확인

---

## 7.11 최종 점검 및 정리

### 코드 정리

#### 1. 사용하지 않는 코드 제거

**파일**: `modules/sonamu/src/ssr/renderer.ts`

```typescript
// ❌ 제거할 함수들
function generateHeadTags(...) { ... }
function escapeHtml(...) { ... }
```

이미 7.5에서 제거했지만, 혹시 남아있다면 제거

#### 2. 주석 제거

Dev/Prod 분기 관련 불필요한 주석 제거

### 성능 체크

```bash
# Lighthouse 실행
npx lighthouse http://localhost:10280/admin/companies --view
```

**확인 항목:**

- [ ] Performance: > 90
- [ ] Accessibility: > 90
- [ ] Best Practices: > 90
- [ ] SEO: > 90

### 번들 크기 확인

```bash
cd examples/miomock/web
pnpm build
du -sh dist/client/assets/*
```

**목표:**

- vendor-react: < 200KB (gzipped)
- vendor-tanstack: < 150KB (gzipped)
- entry-client: < 100KB (gzipped)

### 문서 업데이트

- [ ] README.md 업데이트 (변경사항 반영)
- [ ] CHANGELOG.md 작성
- [ ] JSDoc 주석 추가

---

## 완료 체크리스트

### API 변경

- [ ] `registerSSR`에서 `head` 제거
- [ ] `SSRRoute` 타입에서 `head` 제거
- [ ] `disableHydrate` 옵션 추가

### 구조 변경

- [ ] `__root.tsx` 수정 (full document)
- [ ] `entry-server.tsx` 수정 (RouterProvider만)
- [ ] `entry-client.tsx` 수정 (document 전체 렌더링)
- [ ] `index.html` 단순화
- [ ] `renderer.ts` 수정 (스크립트 추출 + disableHydrate)
- [ ] `main.tsx` 제거

### 테스트

- [ ] Dev 모드 SSR 라우트 동작
- [ ] Dev 모드 CSR 라우트 동작 (document 렌더링)
- [ ] Dev 모드 HMR 동작
- [ ] Production 빌드 성공
- [ ] Production SSR 라우트 동작
- [ ] Production CSR 라우트 동작 (document 렌더링)
- [ ] Hydration 에러 없음
- [ ] disableHydrate 옵션 정상 동작

### Meta 관리

- [ ] Route별 meta 정의
- [ ] 동적 meta 생성
- [ ] HeadContent 정상 동작
- [ ] Browser 탭 제목 변경

### 성능 & 품질

- [ ] Lighthouse 점수 확인
- [ ] 번들 크기 확인
- [ ] 정적 파일 캐싱 동작
- [ ] 코드 정리 완료

---

## 다음 단계

### 1. 추가 최적화 (선택)

**Streaming SSR** (React 18):

```tsx
import { renderToPipeableStream } from "react-dom/server";

// streaming SSR
const { pipe } = renderToPipeableStream(<RouterProvider />);
pipe(reply.raw);
```

**Selective SSR** (TanStack Router):

```tsx
export const Route = createFileRoute("/dashboard")({
  ssr: false, // CSR only
  component: Dashboard,
});
```

### 2. 모니터링

- SSR vs CSR 성능 비교
- 번들 크기 추이
- 에러 로그 모니터링
- 사용자 경험 메트릭

### 3. 문서화

- 아키텍처 다이어그램
- 개발 가이드
- 트러블슈팅 가이드
- Best Practices

---

이전: [Phase 6: Production 준비](./phase-6-production.md)  
완료!
