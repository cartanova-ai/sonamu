# Phase 2: Tanstack Router 적용

> **목표**: react-router-dom을 Tanstack Router로 전환하고 파일 기반 라우팅 구축

## ⚠️ 중요: 작업 연기 결정 (2024-12-24)

**이 Phase는 @sonamu-kit/react-components 완성 후 진행해야 합니다.**

### 발견된 문제
트러블슈팅 과정에서 다음 사실을 발견했습니다:

1. **@sonamu-kit/react-sui가 react-router-dom에 강하게 결합됨**
   - `package.json`의 dependencies에 `react-router-dom: ^6.3.0` 포함
   - workspace 의존성이므로 개별 프로젝트에서 제거 불가

2. **react-sui의 핵심 컴포넌트들이 react-router-dom 사용**
   - AddButton, BackLink, EditButton
   - useListParams, useGoBack 훅

3. **react-router-dom 제거 시 react-sui 사용 불가**
   - 라우팅 마이그레이션과 UI 컴포넌트 교체를 동시에 진행해야 함
   - 작업을 분리할 수 없음

### 변경된 계획

**Phase 2는 다음 순서로 진행:**
1. **사전 작업**: @sonamu-kit/react-components를 workspace에 추가 (팀원 작업)
2. **통합 작업**: Tanstack Router 마이그레이션 + react-components로 교체를 한 번에 진행

자세한 트러블슈팅 과정은 문서 하단의 "트러블슈팅 기록" 섹션을 참고하세요.

## 2.1 Tanstack Router 기본 설정

### 패키지 설치

```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/web
pnpm install @tanstack/react-router
pnpm install -D @tanstack/router-vite-plugin @tanstack/router-devtools
```

### Vite 설정 수정

**파일**: `vite.config.ts`

```typescript
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "vite";

dotenv.config({ path: ".sonamu.env" });

export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 10281,
    proxy: {
      "/api": `http://${process.env.API_HOST}:${process.env.API_PORT}`,
    },
  },
});
```

### tsconfig.json 수정

```json
{
  "compilerOptions": {
    // ... 기존 설정
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "src",
    "src/routeTree.gen.ts"
  ]
}
```

### 확인 사항
- [ ] Vite plugin 정상 동작
- [ ] dev 서버 실행 시 에러 없음

---

## 2.2 라우트 구조 마이그레이션

### 기존 구조 (react-router-dom)

```
src/
  pages/
    users/
      index.tsx      → /users
      [id].tsx       → /users/:id
    employees/
      index.tsx      → /employees
```

### 새로운 구조 (Tanstack Router)

```
src/
  routes/
    __root.tsx              → 루트 레이아웃
    index.tsx               → /
    users/
      index.tsx             → /users
      $id.tsx               → /users/$id
    employees/
      index.tsx             → /employees
```

### 작업 순서

#### 1. routes 폴더 생성

```bash
mkdir -p /Users/minsangk/Development/sonamu/examples/miomock/web/src/routes
```

#### 2. __root.tsx 생성

```tsx
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import { AuthProvider } from '@/admin-common/auth';
import App from '@/App';

export const Route = createRootRoute({
  component: () => (
    <AuthProvider>
      <App>
        <Outlet />
      </App>
      <TanStackRouterDevtools />
    </AuthProvider>
  ),
});
```

#### 3. index.tsx (홈) 생성

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return <div>Home Page</div>;
}
```

#### 4. 기존 pages 폴더를 routes로 변환

**변환 패턴**:
```bash
# pages/users/index.tsx → routes/users/index.tsx
# pages/users/[id].tsx → routes/users/$id.tsx
```

**파일별 변환 예시**:

```tsx
// Before (pages/users/index.tsx)
export default function UsersPage() {
  return <div>Users List</div>;
}

// After (routes/users/index.tsx)
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/users/')({
  component: UsersPage,
});

function UsersPage() {
  return <div>Users List</div>;
}
```

**동적 라우트 변환**:

```tsx
// Before (pages/users/[id].tsx)
import { useParams } from 'react-router-dom';

export default function UserDetailPage() {
  const { id } = useParams();
  return <div>User {id}</div>;
}

// After (routes/users/$id.tsx)
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/users/$id')({
  component: UserDetailPage,
});

function UserDetailPage() {
  const { id } = Route.useParams();
  return <div>User {id}</div>;
}
```

#### 5. main.tsx 수정

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import ReactDOM from 'react-dom/client';
import { routeTree } from './routeTree.gen';
import "semantic-ui-css/semantic.min.css";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 3,
    },
  },
});

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: 'intent',
});

// TypeScript용 router 타입 등록
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);
```

### 확인 사항
- [ ] routeTree.gen.ts 자동 생성 확인
- [ ] 모든 라우트 정상 접근
- [ ] 동적 라우트 파라미터 정상 동작
- [ ] 404 페이지 동작
- [ ] 네비게이션 정상 동작

---

## 2.3 @sonamu-kit/react-sui 제거

### loadDynamicRoutes 제거

```bash
# main.tsx에서 import 제거
# BrowserRouter, Routes, Route 전부 제거
```

### 의존성 확인

```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/web
# react-sui가 다른 곳에서도 쓰이는지 확인
grep -r "@sonamu-kit/react-sui" src/
```

### 제거 (라우팅 전용인 경우)

```bash
pnpm uninstall @sonamu-kit/react-sui
```

### react-router-dom 제거

```bash
pnpm uninstall react-router-dom
```

### 확인 사항
- [ ] 빌드 에러 없음
- [ ] 런타임 에러 없음
- [ ] 모든 페이지 정상 동작

---

## 완료 체크리스트

- [ ] Tanstack Router 패키지 설치
- [ ] Vite 설정 수정
- [ ] routes 폴더 구조 생성
- [ ] __root.tsx 생성
- [ ] 모든 페이지 라우트로 변환
- [ ] main.tsx 수정
- [ ] @sonamu-kit/react-sui 제거
- [ ] react-router-dom 제거
- [ ] 전체 라우팅 동작 확인

---

## 트러블슈팅 기록 (2024-12-24)

이 섹션은 Phase 2 작업 중 발견한 문제들과 해결 시도를 기록합니다.

### 발견된 핵심 문제

#### 1. @sonamu-kit/react-sui의 react-router-dom 강의존성

**문제:**
- `@sonamu-kit/react-sui/package.json`에 `react-router-dom: ^6.3.0`이 dependencies로 포함
- workspace 의존성이므로 miomock-web에서 제거해도 자동으로 설치됨
- react-sui를 import하면 react-router-dom도 함께 로드됨

**영향:**
- Tanstack Router로 마이그레이션해도 react-router-dom과 충돌
- 두 라우팅 라이브러리가 동시에 존재하여 에러 발생

#### 2. react-sui 컴포넌트의 react-router-dom 직접 사용

**문제가 있는 파일들:**
```
modules/react-sui/src/base-components/AddButton.tsx
  → import { Link } from "react-router-dom"

modules/react-sui/src/base-components/BackLink.tsx
  → useGoBack 훅 사용 (내부적으로 react-router-dom 사용)

modules/react-sui/src/helpers/helpers.tsx
  → useListParams: useSearchParams 사용
  → useGoBack: useLocation, useNavigate 사용
```

**영향:**
- 이 컴포넌트들을 사용하는 모든 페이지에서 에러 발생
- react-sui를 사용하는 한 react-router-dom 제거 불가

#### 3. Semantic UI Button과 Tanstack Router Link 비호환

**문제:**
```tsx
// 이 패턴이 작동하지 않음
<Button as={Link} to="/path" />
```

**에러:**
```
useHref() may be used only in the context of a <Router> component
```

**원인:**
- Semantic UI의 `as` prop과 Tanstack Router의 Link가 제대로 통합되지 않음
- react-router-dom의 Link와 달리 인터페이스가 다름

### 시도한 해결 방법

#### 시도 1: legacy-react-sui-components.tsx 생성

**방법:**
- AddButton, EditButton, BackLink, useGoBack, useListParams를 Tanstack Router 버전으로 재구현
- 별도 파일에 모아서 import 경로만 변경

**코드 예시:**
```tsx
// src/components/legacy-react-sui-components.tsx
export function AddButton({ currentRoute, label, ...props }: AddButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    const formPath = `${currentRoute.split("?")[0]}/form`;
    router.navigate({ to: formPath as any });
  };

  return (
    <Button
      color="blue"
      size="tiny"
      content={label}
      onClick={handleClick}
      {...props}
    />
  );
}
```

**결과:**
- ✅ 컴포넌트 자체는 정상 작동
- ❌ react-sui의 다른 유틸리티(formatDateTime, useTypeForm 등)를 사용하면 여전히 react-router-dom이 로드됨
- ❌ 근본적인 해결책이 아님

#### 시도 2: react-sui의 helpers.tsx 직접 수정

**방법:**
```tsx
// modules/react-sui/src/helpers/helpers.tsx
// import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
```
- react-router-dom import 주석 처리
- useListParams, useGoBack 함수 주석 처리

**결과:**
- ❌ 다른 프로젝트들이 react-sui를 사용 중이므로 깨짐
- ❌ workspace 공유 모듈을 한 프로젝트를 위해 수정할 수 없음

#### 시도 3: react-sui 유틸리티 전체 복사

**방법:**
- formatDateTime, useTypeForm, useSelection, AppBreadcrumbs, DelButton 등을 프로젝트로 복사
- `src/utils/react-sui-utils.tsx`와 `src/components/react-sui-components.tsx` 생성

**결과:**
- ❌ 의존성이 너무 많음 (date-fns, radashi, zod 등)
- ❌ 복사한 코드의 유지보수 어려움
- ❌ 기술 부채만 증가

#### 시도 4: miomock-web에서 react-router-dom만 제거

**방법:**
```bash
cd examples/miomock/web
pnpm remove react-router-dom
```

**결과:**
- ❌ workspace 의존성이므로 react-sui를 통해 다시 설치됨
- ❌ 제거 불가능

### 발생한 주요 에러들

#### 에러 1: AuthProvider 훅 에러
```
useRouter must be used inside a <RouterProvider> component!
Cannot read properties of null (reading '__store')
```

**원인:**
- `main.tsx`에서 AuthProvider가 RouterProvider 밖에 위치
- AuthProvider 내부에서 useRouter, useRouterState 사용

**해결:**
```tsx
// __root.tsx로 이동
export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <AuthProvider>  {/* Router context 내부 */}
      <App>
        <Outlet />
      </App>
    </AuthProvider>
  ),
});
```

#### 에러 2: useListParams의 useSearchParams 에러
```
useLocation() may be used only in the context of a <Router> component
at react-sui.es.js:10380:18 in useListParams
```

**원인:**
- react-sui의 useListParams가 react-router-dom의 useSearchParams 사용

**해결:**
- legacy-react-sui-components.tsx에 Tanstack Router 버전 재구현
```tsx
export function useListParams<U extends z.ZodType<any>, T extends z.infer<U>>(
  zType: U,
  defaultValue: T,
) {
  const router = useRouter();
  const search = useSearch({ strict: false });

  useEffect(() => {
    router.navigate({
      to: newPath as any,
      replace: equal(oldSP, newSP),
    });
  }, [listParams]);
}
```

#### 에러 3: useHref 에러 (AddButton, EditButton)
```
useHref() may be used only in the context of a <Router> component
```

**원인:**
- `<Button as={Link} />` 패턴 사용
- Semantic UI Button과 Tanstack Router Link 비호환

**해결:**
- onClick 방식으로 변경
```tsx
export function AddButton({ currentRoute, label, ...props }: AddButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    router.navigate({ to: formPath as any });
  };

  return <Button onClick={handleClick} {...props} />;
}
```

### 최종 결론

**react-sui 의존성을 완전히 제거해야 Tanstack Router 마이그레이션 가능**

이유:
1. react-sui는 react-router-dom에 깊게 결합되어 있음
2. workspace 의존성이므로 개별 프로젝트에서 제거 불가
3. 부분적 해결책은 모두 기술 부채만 증가시킴
4. 라우팅 마이그레이션과 UI 컴포넌트 교체는 동시에 진행되어야 함

**새로운 접근 방법:**
1. 팀원이 개발 중인 @sonamu-kit/react-components (shadcn/ui 기반)을 완성
2. Tanstack Router 마이그레이션과 동시에 react-components로 전환
3. 한 번의 큰 PR로 react-sui와 react-router-dom을 동시에 제거

---

이전: [Phase 1: Tanstack Query](./phase-1-tanstack-query.md)
다음: [Phase 3: 단일 서버 통합](./phase-3-single-server.md)
