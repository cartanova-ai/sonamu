# Phase 4.5N: TanStack Router SSR Hydration 문제 해결

> **목표**: TanStack Router 사용 시 Hydration Mismatch 문제 해결

## 문제 진단

### 증상

1. 새 창에서 페이지 열 때 Hydration 에러 발생
2. 새로고침(F5)에서는 정상 동작
3. 콘솔에 Suspense 관련 에러 메시지

### 에러 메시지

```
Uncaught Error: This Suspense boundary received an update before it finished hydrating.
This caused the boundary to switch to client rendering.
The usual way to fix this is to wrap the original update in startTransition.
```

---

## 근본 원인 (2가지)

### 원인 1: Suspense 마커 불일치

**현상**: 서버와 클라이언트의 HTML 구조가 다름

| 환경       | 렌더링 결과                             |
| ---------- | --------------------------------------- |
| 서버       | `<div class="app">...`                  |
| 클라이언트 | `<!--$--><div class="app">...<!--/$-->` |

**원인**: TanStack Router의 `RouterProvider`가 **클라이언트에서만** 내부적으로 최상위 Suspense를 추가함.

**해결**: 서버에서도 동일하게 Suspense로 감싸기

```tsx
// entry-server.generated.tsx
import { Suspense } from "react";

const appHtml = renderToString(
  <Suspense fallback={null}>
    <Main queryClient={queryClient}>
      <RouterProvider router={router} />
    </Main>
  </Suspense>,
);
```

### 원인 2: Hydration 중 상태 업데이트

**현상**: Hydration 도중에 `useState` + `useEffect`로 상태 업데이트 발생

**문제 코드** (AuthProvider):

```tsx
// ❌ 잘못된 방식
const { data: user, isLoading, refetch } = UserService.useMe();
const [loading, setLoading] = useState<boolean>(isLoading);

useEffect(() => {
  setLoading(isLoading);  // Hydration 중 상태 업데이트!
}, [isLoading]);

const value = {
  loading,
  login: (params) => {
    setLoading(true);  // 별도 state로 로딩 관리
    UserService.login(params).then(...).finally(() => setLoading(false));
  },
};
```

**해결**: Mutation hook의 `isPending`을 직접 사용

```tsx
// ✅ 올바른 방식
const { data: user, isLoading: isMeLoading, refetch } = UserService.useMe();
const loginMutation = UserService.useLogin();
const logoutMutation = UserService.useLogout();

const value = {
  user: user ?? null,
  loading: isMeLoading || loginMutation.isPending || logoutMutation.isPending,
  login: (params) => {
    loginMutation.mutate(params, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ["User", "me"] });
        navigate({ to: "/admin", replace: true });
      },
      onError: (error) => {
        console.error("Login failed:", error);
        alert("로그인에 실패했습니다");
      },
    });
  },
  logout: () => {
    logoutMutation.mutate(undefined, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ["User", "me"] });
      },
    });
  },
  refetch,
};
```

---

## TanStack Start 방식을 사용하지 않는 이유

TanStack Router는 SSR 전용 API를 제공함:

```tsx
// TanStack Start 방식
import { RouterServer } from "@tanstack/react-router/ssr/server";
import { RouterClient } from "@tanstack/react-router/ssr/client";
```

하지만 이 방식은 **Sonamu 철학과 충돌**:

|           | Sonamu 목표                 | TanStack Start                     |
| --------- | --------------------------- | ---------------------------------- |
| 시작점    | `index.html`                | `__root.tsx`                       |
| 멘탈 모델 | CSR 유지, 백엔드가 SSR 처리 | SSR-first                          |
| HTML 생성 | 앱 컴포넌트만 주입          | 전체 문서 생성 (`<!DOCTYPE>` 포함) |

**결론**: `renderToString` + `RouterProvider` 방식 유지, Suspense 래퍼로 해결

---

## 변경 사항 요약

### 1. entry-server 템플릿

- `<Suspense fallback={null}>`로 전체 앱 감싸기

### 2. SSR 환경에서 컴포넌트 작성 규칙

- Hydration 중 상태 업데이트 금지
- `useState` + `useEffect` 대신 React Query의 상태 직접 사용
- Mutation은 `useMutation` hook 사용 → `isPending`으로 로딩 상태 관리

---

## SSR 안전한 컴포넌트 패턴

### ❌ 피해야 할 패턴

```tsx
const [loading, setLoading] = useState(false);

useEffect(() => {
  setLoading(someCondition); // Hydration 중 실행됨
}, [someCondition]);
```

### ✅ 권장 패턴

```tsx
// React Query 상태 직접 사용
const { isLoading } = useQuery(...);
const mutation = useMutation(...);

const loading = isLoading || mutation.isPending;
```

---

## 확인 체크리스트

- [x] 서버에서 `<Suspense fallback={null}>` 래퍼 추가
- [x] AuthProvider에서 useState/useEffect 제거, mutation hook 사용
- [x] 새 창에서 Hydration 에러 없음
- [x] 새로고침에서 정상 동작
- [x] 콘솔에 경고/에러 없음

---

## 참고: Suspense 마커

React 19의 Suspense boundary 마커:

- `<!--$-->`: boundary 시작 (resolved)
- `<!--$!-->`: boundary 시작 (suspended)
- `<!--/$-->`: boundary 끝

이 마커들은 hydration을 위한 **정상적인 메커니즘**이며, hydration 후 자동 제거됨.
