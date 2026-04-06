# Phase 7 완료 리포트

> **주요 커밋**: `c9366d97` - [sonamu] feat: SSR 통합 Phase7 (Full Document Rendering)
> **날짜**: 2025-12-27
> **변경 파일**: 13개 (1,421 additions, 143 deletions)
>
> **관련 커밋**:
>
> - `74521f75` - React/ReactDOM 18 → 19 업그레이드
> - `576ce91a` - React 19 대응, react-router-dom 의존성 제거
> - `854af752` - react-sui 의존성 제거

---

## 개요

Phase 7은 **Full Document Rendering** 방식을 도입하여 `<html>` 전체를 React가 관리하도록 아키텍처를 전환한 작업입니다.

### 아키텍처 전환

**이전 방식 (Partial Rendering)**:

```
index.html 템플릿
  → <!--app-head--> 치환 (head 태그)
  → <!--app-html--> 치환 (#root 안에)
```

**새로운 방식 (Full Document Rendering)**:

```
RouterProvider만 렌더링
  → __root가 <html>...</html> 전체 생성
  → HeadContent로 route별 meta 자동 관리
  → Vite 스크립트만 추가 주입
```

### 핵심 목표

1. TanStack Router의 권장 아키텍처 준수
2. SSR/CSR 구조 완전 일치 (hydration 안정성 향상)
3. Meta 관리 책임 명확화 (Route 파일 = 라우팅 + 렌더링 + Meta)
4. 코드 단순화 (템플릿 치환 로직 제거)
5. Hydration 이슈 선별적 회피 가능

---

## 주요 변경 사항

### 1. 핵심 아키텍처 변경

#### 1.1 `__root.tsx` - Full Document 렌더링

**이전 (17줄)**:

```tsx
export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <AuthProvider>
      <App>
        <Outlet />
      </App>
    </AuthProvider>
  ),
});
```

**변경 후 (44줄)**:

```tsx
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

**핵심 변경**:

- ✅ `<html>`, `<head>`, `<body>` 전체 구조 추가
- ✅ `HeadContent` 컴포넌트로 route별 meta 자동 관리
- ✅ `Scripts` 컴포넌트로 TanStack Router 스크립트 관리
- ✅ `QueryClientProvider`를 내부로 이동 (Main 제거)
- ✅ `head` 옵션으로 기본 meta 정의

#### 1.2 `entry-client.tsx` - Document 전체 렌더링

**이전**:

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

**변경 후**:

```tsx
// SSR/CSR 모두 document 전체에 렌더링
if (document.documentElement.innerHTML && dehydratedState) {
  // SSR 페이지
  if (ssrConfig?.disableHydrate) {
    console.log("[Sonamu] Hydration disabled, rendering as CSR");
    ReactDOM.createRoot(document).render(<RouterProvider router={router} />);
  } else {
    ReactDOM.hydrateRoot(document, <RouterProvider router={router} />);
  }
} else {
  // Pure CSR 페이지
  ReactDOM.createRoot(document).render(<RouterProvider router={router} />);
}
```

**핵심 변경**:

- ❌ `#root` 요소 → ✅ `document` 전체에 렌더링
- ❌ `<Main>` 래퍼 제거
- ✅ `__SONAMU_SSR_CONFIG__` 타입 추가
- ✅ `disableHydrate` 분기 로직 추가
- ✅ SSR/CSR 구조 완전 통일

**React 19 필수**: React 18에서는 타입 정의상 `document`를 받을 수 없었으나, React 19에서 정식 지원

#### 1.3 `entry-server.generated.tsx` - RouterProvider만 렌더링

**이전**:

```tsx
const appHtml = renderToString(
  <Suspense fallback={null}>
    <Main queryClient={queryClient}>
      <RouterProvider router={router} />
    </Main>
  </Suspense>,
);
```

**변경 후**:

```tsx
const appHtml = renderToString(
  <Suspense fallback={null}>
    <RouterProvider router={router} />
  </Suspense>,
);
```

**핵심 변경**:

- ❌ `Main` import 및 래퍼 제거
- ✅ `RouterProvider`만 렌더링
- ✅ `Suspense`로 래핑 (Hydration Mismatch 방지 - 클라이언트와 구조 일치)

#### 1.4 `index.html` - 최소 구조로 단순화

**이전 (14줄)**:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/sonamu.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Miomock: Sonamu shines evergreen-</title>
    <!--app-head-->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
```

**변경 후 (7줄)**:

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

**핵심 변경**:

- ❌ `<meta>`, `<link>`, `<title>` 제거 (→ `__root`로 이동)
- ❌ `<!--app-head-->`, `<!--app-html-->` 플레이스홀더 제거
- ✅ Vite와의 통신 매개체로만 사용
- ✅ 최소한의 HTML 구조 유지

---

### 2. renderer.ts - 스크립트 추출 방식으로 대대적 변경

**핵심 변경**:

#### 2.1 템플릿 치환 제거

```typescript
// ❌ 제거
let template: string;
const html = template
  .replace("<!--app-head-->", `${headTags}\n${ssrDataScript}`)
  .replace("<!--app-html-->", appHtml);
```

#### 2.2 스크립트 추출 방식 도입

```typescript
// ✅ 추가: extractScriptTags() 함수
function extractScriptTags(html: string): string {
  const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>|<link[^>]*>/gi;
  const matches = html.match(scriptRegex) || [];
  return matches.join("\n");
}

// Dev: Vite transformIndexHtml 후 스크립트 추출
const transformedHtml = await vite.transformIndexHtml(url, originalHtml);
viteScripts = extractScriptTags(transformedHtml);

// Prod: 빌드된 index.html에서 스크립트 추출
const builtHtml = fs.readFileSync(path.join(webDistPath, "index.html"), "utf-8");
viteScripts = extractScriptTags(builtHtml);
```

#### 2.3 Full Document에 스크립트 주입

```typescript
// RouterProvider 렌더링 (full document)
const { html: fullDocHtml, dehydratedState } = await render(url, preloadedData);

// SSR 데이터 스크립트
const ssrDataScript = dehydratedState
  ? `<script>window.__SONAMU_SSR__ = ${JSON.stringify(dehydratedState).replace(/</g, "\\u003c")};</script>`
  : "";

// disableHydrate 설정 스크립트
const ssrConfigScript = route.disableHydrate
  ? `<script>window.__SONAMU_SSR_CONFIG__ = ${JSON.stringify({ disableHydrate: true })};</script>`
  : "";

// </body> 직전에 주입
const finalHtml = fullDocHtml.replace(
  "</body>",
  `${ssrConfigScript}\n${ssrDataScript}\n${viteScripts}\n</body>`,
);
```

**제거된 함수**:

- ❌ `generateHeadTags()` - HeadContent가 자동 처리
- ❌ `escapeHtml()` - 불필요

**장점**:

- Dev/Prod 스크립트 처리 방식 통일
- 템플릿 의존성 제거
- 코드 단순화 (99줄 → 105줄, 실질적으로는 더 간결)

---

### 3. Meta 관리 통합

#### 3.1 SSRRoute 타입 변경

```typescript
// modules/sonamu/src/ssr/types.ts
export type SSRRoute = {
  path: string;
  preload?: (params: Record<string, string>) => PreloadConfig;
  // ❌ head 제거
  // head?: (dehydratedState: unknown) => { title?: string; meta?: Array<...> };

  // ✅ 추가
  disableHydrate?: boolean;
};
```

#### 3.2 registerSSR에서 head 제거

**이전**:

```typescript
// api/src/ssr/routes.ts
registerSSR({
  path: "/admin/companies",
  head: () => ({
    title: "Miomock - Companies List",
  }),
  preload: () => [
    /*...*/
  ],
});
```

**변경 후**:

```typescript
registerSSR({
  path: "/admin/companies",
  // head 제거
  preload: () => [
    /*...*/
  ],
});
```

#### 3.3 Route 파일에 head 추가

```typescript
// web/src/routes/admin/companies/index.tsx
export const Route = createFileRoute("/admin/companies/")({
  head: () => ({
    meta: [
      { title: "Miomock - Companies List" },
      { name: "description", content: "회사 목록 관리" },
    ],
  }),
  component: CompanyList,
});
```

**장점**:

- Meta 관리가 Route 파일로 일원화
- TanStack Router의 `head` 옵션 활용
- `HeadContent` 컴포넌트가 자동으로 `<head>`에 주입
- 코드 위치가 자연스러움 (UI 파일에 UI meta)

---

### 4. 신규 기능: disableHydrate 옵션

#### 4.1 목적

Hydration Mismatch 해결이 어려운 경우 선별적으로 Hydration을 건너뛰고 CSR로 전환

#### 4.2 사용 방법

```typescript
// api/src/ssr/routes.ts
registerSSR({
  path: "/admin/dashboard",
  preload: () => [
    /*...*/
  ],
  disableHydrate: true, // ← Hydration 건너뛰기
});
```

#### 4.3 동작 방식

```
1. 서버: SSR 렌더링
   → window.__SONAMU_SSR_CONFIG__ = { disableHydrate: true } 주입

2. 브라우저: 서버 HTML 표시 (SEO 유지)

3. 클라이언트: disableHydrate 체크
   → hydrateRoot() 건너뛰기
   → createRoot(document)로 완전히 새로 렌더링

4. 결과: 약간의 깜빡임 후 정상 동작
```

**트레이드오프**:

- ✅ SEO 유지 (서버에서 HTML 생성)
- ✅ 초기 HTML 표시 (빈 화면 방지)
- ✅ 개발 속도 향상 (디버깅 시간 절약)
- ❌ 약간의 깜빡임 (SSR HTML → CSR 재렌더링)
- ❌ 약간의 성능 손실 (완전히 새로 렌더링)

---

### 5. React 19 업그레이드

#### 5.1 버전 변경 (`pnpm-workspace.yaml`)

```yaml
# React 관련 패키지 업그레이드
catalog:
  react: ^18.2.0 → ^19.2.3
  react-dom: ^18.2.0 → ^19.2.3
  @types/react: ^18.2.43 → ^19.2.7
  @types/react-dom: ^18.2.17 → ^19.2.3
```

#### 5.2 필수성

**React 18의 제한**:

```typescript
// React 18 타입 정의
export function createRoot(container: Container, options?: RootOptions): Root;
export type Container = Element | DocumentFragment;
// ❌ Document를 받을 수 없음 (타입 에러)
```

**React 19의 개선**:

```typescript
// React 19에서 정식 지원
ReactDOM.createRoot(document).render(<App />);
ReactDOM.hydrateRoot(document, <App />);
// ✅ document를 첫 번째 매개변수로 받을 수 있음
```

**영향**:

- Full Document Rendering의 핵심 기반
- React가 `<html>` 전체를 관리 가능
- SSR/CSR 구조 완전 통일 가능

---

### 6. 관련 정리 작업

#### 6.1 react-router-dom 완전 제거 (`576ce91a`)

**제거된 파일**:

- `modules/react-components/src/router/dynamic-routes.tsx` (80줄)
- `modules/react-components/src/router/index.ts`

**제거된 기능**:

- react-router-dom 기반 동적 라우트 로딩
- `loadDynamicRoutes` 유틸리티

**이유**: TanStack Router로 완전 전환 완료

#### 6.2 react-sui 의존성 제거 (`854af752`)

**제거된 의존성**:

```json
{
  "@sonamu-kit/react-sui",
  "class-variance-authority",
  "luxon",
  "prop-types",
  "react-router-dom",
  "autoprefixer",
  "postcss"
}
```

**임시 조치**:

- `ImageUploader` 컴포넌트 주석 처리 (FIXME 마킹)
- 향후 react-components 기반으로 재구현 필요

---

## 삭제된 코드

### 파일 삭제

1. `examples/miomock/web/src/main.tsx` (13줄)
   - QueryClientProvider 로직이 `__root.tsx`로 이동

2. `modules/react-components/src/router/dynamic-routes.tsx` (80줄)
   - react-router-dom 기반 동적 라우팅 유틸리티

3. `modules/react-components/src/router/index.ts`
   - router 관련 export

### 함수 삭제

1. `modules/sonamu/src/ssr/renderer.ts`
   - `generateHeadTags()` - HeadContent가 대체
   - `escapeHtml()` - 불필요

---

## 기술적 세부사항

### 1. React 19의 document 렌더링

```typescript
// React 19부터 공식 지원
ReactDOM.createRoot(document).render(<RouterProvider />);
ReactDOM.hydrateRoot(document, <RouterProvider />);
```

**동작 방식**:

- React가 `document`의 children을 `__root`가 리턴한 `<html>`로 **완전히 교체**
- `<html>` 안에 `<html>`이 중첩되지 않음 (document.documentElement를 사용하면 중첩됨)

### 2. Suspense로 Hydration Mismatch 해결

**문제**:

- 클라이언트: `RouterProvider`가 내부적으로 `Suspense` 사용
- 서버: `renderToString(<RouterProvider />)` - `Suspense` 없음
- 결과: 컴포넌트 트리 구조 불일치

**해결**:

```tsx
// entry-server.generated.tsx
const appHtml = renderToString(
  <Suspense fallback={null}>
    <RouterProvider router={router} />
  </Suspense>,
);
```

서버에서도 `Suspense`로 감싸서 클라이언트와 동일한 구조 유지

### 3. extractScriptTags로 Dev/Prod 통일

```typescript
function extractScriptTags(html: string): string {
  const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>|<link[^>]*>/gi;
  const matches = html.match(scriptRegex) || [];
  return matches.join("\n");
}
```

**Dev**: `transformIndexHtml` 결과에서 추출
**Prod**: 빌드된 `index.html`에서 추출

동일한 함수로 처리하여 로직 통일

---

## 영향도 분석

### 코드 품질 개선

- **코드 단순화**: 100줄 이상 제거 (generateHeadTags, Main, dynamic-routes 등)
- **책임 명확화**: Meta 관리가 Route 파일로 일원화
- **타입 안정성**: React 19 타입 적용

### 아키텍처 개선

- **SSR/CSR 구조 통일**: Hydration 안정성 대폭 향상
- **TanStack Router 철학**: 권장 아키텍처 완전 준수
- **Full Document Rendering**: `<html>` 전체를 React가 관리

### 기능 확장

- **HeadContent**: Route별 meta 자동 관리
- **Scripts**: TanStack Router 스크립트 자동 주입
- **disableHydrate**: Hydration 이슈 선별적 회피

### 성능

- **Hydration 안정성**: SSR/CSR 구조 일치로 mismatch 최소화
- **번들 크기**: 불필요한 의존성 제거 (react-router-dom, react-sui 등)
- **React 19**: 최신 React 성능 개선 혜택

---

## 다음 단계

### 1. 향후 작업 필요

- [ ] **ImageUploader 재구현**: react-components 기반으로 전환
  - 현재 상태: FIXME 주석으로 임시 비활성화
  - 위치: `examples/miomock/web/src/admin-common/ImageUploader.tsx`

### 2. 선택적 최적화

- [ ] **Streaming SSR** (React 18+)

  ```tsx
  import { renderToPipeableStream } from "react-dom/server";
  const { pipe } = renderToPipeableStream(<RouterProvider />);
  pipe(reply.raw);
  ```

- [ ] **Selective SSR** (TanStack Router)
  ```tsx
  export const Route = createFileRoute("/dashboard")({
    ssr: false, // CSR only
    component: Dashboard,
  });
  ```

### 3. 모니터링

- [ ] SSR vs CSR 성능 비교
- [ ] Hydration 에러 모니터링
- [ ] 번들 크기 추이 관찰

---

## 결론

Phase 7은 SSR 통합 작업의 **아키텍처 완성** 단계로, TanStack Router의 Full Document Rendering 방식을 도입하여 코드 품질, 안정성, 확장성을 모두 개선했습니다.

**핵심 성과**:

1. ✅ Full Document Rendering 완성
2. ✅ React 19 업그레이드 완료
3. ✅ SSR/CSR 구조 완전 통일
4. ✅ Meta 관리 책임 명확화
5. ✅ Hydration 이슈 대응 방안 마련
6. ✅ 100줄 이상 코드 제거

Phase 7로 Sonamu의 SSR 구현은 **프로덕션 레벨의 안정성과 확장성**을 갖추게 되었으며, TanStack Router의 모든 기능을 완전히 활용할 수 있는 기반이 마련되었습니다.
