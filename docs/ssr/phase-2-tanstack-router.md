# Phase 2: Tanstack Router 적용

> **목표**: react-router-dom을 Tanstack Router로 전환하고 파일 기반 라우팅 구축

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
import react from "@vitejs/plugin-react-swc";
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

이전: [Phase 1: Tanstack Query](./phase-1-tanstack-query.md)  
다음: [Phase 3: 단일 서버 통합](./phase-3-single-server.md)
