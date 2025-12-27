# Phase 3-5 완료 리포트

> **커밋**: `f88ad822` - [sonamu] feat: SSR통합 Phase3-5 (HydrationMismatch 픽스)
> **날짜**: 2025-12-27
> **변경 파일**: 31개 (1,283 additions, 303 deletions)

---

## 개요

Phase 3-5는 TanStack Router와 React Query를 사용하는 SSR 환경에서 발생하는 **Hydration Mismatch 문제**를 해결하고, **SSR 라우트 등록 시스템**과 **SSR Query 생성 시스템**을 완성한 통합 작업입니다.

---

## 핵심 문제와 해결

### 1. Hydration Mismatch 근본 원인 발견

#### 문제 증상
- 새 창에서 페이지 열 때: Hydration 에러 발생
- 새로고침(F5): 정상 동작
- 콘솔 에러: `This Suspense boundary received an update before it finished hydrating`

#### 근본 원인 분석
**원인 1: Suspense 마커 불일치**
```
서버:     <div class="app">...
클라이언트: <!--$--><div class="app">...<!--/$-->
```

- TanStack Router의 `RouterProvider`가 **클라이언트에서만** 내부적으로 Suspense를 추가
- 서버 렌더링에서는 Suspense 래퍼가 없어서 HTML 구조가 다름

**해결책**: 서버에서도 동일하게 `<Suspense fallback={null}>` 추가

**원인 2: Hydration 중 상태 업데이트**
```tsx
// ❌ 문제 코드 (AuthProvider)
const [loading, setLoading] = useState<boolean>(isLoading);

useEffect(() => {
  setLoading(isLoading);  // Hydration 중 실행됨!
}, [isLoading]);
```

- `useState` + `useEffect` 패턴이 hydration 중에 상태를 업데이트
- React는 hydration 중에는 DOM을 변경하지 않아야 함

**해결책**: React Query의 상태를 직접 사용 (mutation의 `isPending` 활용)

```tsx
// ✅ 수정 코드
const { data: user, isLoading, refetch } = UserService.useMe();
const loginMutation = UserService.useLoginMutation();
const logoutMutation = UserService.useLogoutMutation();

const value = {
  user: user ?? null,
  loading: isLoading || loginMutation.isPending || logoutMutation.isPending,
  // ...
};
```

---

## 주요 변경 사항

### 1. SSR 인프라 구축 (`modules/sonamu/src/ssr/`)

#### 1.1 SSR 라우트 등록 시스템 (`registry.ts`)

**목적**: SSR이 필요한 라우트를 선언적으로 등록

```typescript
export function registerSSR(route: SSRRoute): void {
  ssrRoutes.push(route);
}

export function matchSSRRoute(url: string): { route: SSRRoute; params: Record<string, string> } | null {
  for (const route of ssrRoutes) {
    const params = matchPath(route.path, url);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
}
```

**특징**:
- 간단한 path matching 구현 (`:id` 같은 동적 파라미터 지원)
- 등록된 라우트들을 순회하며 URL과 매칭
- 매칭 성공 시 추출된 params와 함께 route 반환

#### 1.2 SSR 렌더러 (`renderer.ts`)

**목적**: 실제 SSR 렌더링 로직 구현

**핵심 플로우**:
```typescript
export async function renderSSR(
  url: string,
  route: SSRRoute,
  params: Record<string, string>,
  request: FastifyRequest,
  reply: FastifyReply,
  config: SonamuFastifyConfig,
  vite: ViteDevServer,
): Promise<string>
```

1. **Preload 실행**: `route.preload(params)` → `SSRQuery[]` 획득
2. **API 직접 호출**: `Sonamu.invokeApiForSSR()`로 HTTP 오버헤드 없이 데이터 로드
3. **QueryClient에 주입**: preloaded 데이터를 `queryClient.setQueryData()`로 주입
4. **렌더링**: `entry-server.generated.tsx`의 `render()` 함수 호출
5. **HTML 생성**:
   - `index.html` 템플릿 로드
   - `<!--app-head-->` 위치에 SSR 데이터 스크립트 주입
   - `<!--app-html-->` 위치에 렌더링된 앱 HTML 주입

**SSR 데이터 주입**:
```typescript
const ssrDataScript = `
  <script>
    ${dehydratedState ? `window.__SONAMU_SSR__ = ${JSON.stringify(dehydratedState).replace(/</g, "\\u003c")};` : ""}
  </script>
`;
```

**SEO 메타 태그 생성**:
```typescript
const headTags = route.head ? generateHeadTags(route.head(dehydratedState)) : "";
```

#### 1.3 타입 정의 (`types.ts`)

**SSRQuery 타입**:
```typescript
export type SSRQuery = {
  modelName: string;   // 'UserModel' - 서버 모델 호출용
  methodName: string;  // 'findById' - 서버 메서드 호출용
  params: unknown[];   // [subset, id] - Context 제외한 실제 파라미터
  serviceKey: [string, string]; // ['User', 'getUsers'] - React Query queryKey용
} & { __brand: "SSRQuery" };
```

**Branded Type 사용 이유**:
- 일반 객체와 구분하여 타입 안전성 확보
- SSR 전용 쿼리임을 명확히 표시

**SSRRoute 타입**:
```typescript
export type SSRRoute = {
  path: string;
  preload?: (params: Record<string, string>) => PreloadConfig;
  head?: (dehydratedState: unknown) => {
    title?: string;
    meta?: Array<{ name?: string; property?: string; content: string }>;
  };
};
```

---

### 2. Queries 생성 시스템 (`modules/sonamu/src/template/implementations/queries.template.ts`)

**목적**: SSR preload에서 사용할 수 있는 type-safe한 query 함수 자동 생성

**생성 로직**:
1. `@api()` 데코레이터의 `clients` 옵션에 `'tanstack-query'` 포함된 API만 필터링
2. 모델별로 그룹화 (`UserService`, `CompanyService` 등)
3. 각 API마다 SSRQuery 생성 함수 생성

**핵심 코드**:
```typescript
// serviceMethodName 계산 (services.template.ts와 동일한 로직)
const serviceMethodName = api.options.resourceName
  ? `get${inflection.camelize(api.options.resourceName)}`
  : api.methodName;

// SSRQuery 함수 생성 (함수명도 serviceMethodName 사용)
functions.push(
  `
  export const ${serviceMethodName} = ${typeParamsDef}(${paramsDef}): SSRQuery =>
    createSSRQuery('${api.modelName}', '${api.methodName}', [${paramNames}], ['${modelName}', '${serviceMethodName}']);
  `.trim(),
);
```

**생성된 코드 예시**:
```typescript
export namespace UserService {
  export const getUser = <T extends UserSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery('UserModel', 'findById', [subset, id], ['User', 'getUser']);

  export const me = (): SSRQuery =>
    createSSRQuery('UserModel', 'me', [], ['User', 'me']);
}

export namespace CompanyService {
  export const getCompanies = <T extends CompanySubsetKey, LP extends CompanyListParams>(
    subset: T,
    rawParams?: LP
  ): SSRQuery =>
    createSSRQuery('CompanyModel', 'findMany', [subset, rawParams], ['Company', 'getCompanies']);
}
```

**핵심 특징**:
- **서비스 메서드 이름 사용**: 함수명은 `serviceMethodName` (예: `getCompanies`)
- **내부적으로 모델 정보 전달**: `createSSRQuery('CompanyModel', 'findMany', ...)`
- **Services와 동일한 시그니처**: SSR에서도 Services와 똑같은 API 사용
- **타입 파라미터 유지**: `<T extends UserSubsetKey>` 같은 제네릭 타입 그대로 전달
- **파라미터 검증**: TypeScript가 컴파일 타임에 파라미터 타입 검증
- **serviceKey 자동 계산**: `resourceName` 옵션 사용 시 `get${ResourceName}` 형태로 변환

---

### 3. Entry Server 템플릿 (`modules/sonamu/src/template/implementations/entry-server.template.ts`)

**핵심 수정**: Suspense 래퍼 추가

```typescript
const appHtml = renderToString(
  <Suspense fallback={null}>
    <Main queryClient={queryClient}>
      <RouterProvider router={router} />
    </Main>
  </Suspense>,
);
```

**이유**:
- TanStack Router의 `RouterProvider`가 클라이언트에서 내부적으로 Suspense 사용
- 서버에서도 동일한 Suspense 구조를 만들어 Hydration Mismatch 방지

**전체 플로우**:
1. `QueryClient` 생성 (서버용 설정)
2. Preloaded 데이터를 `queryClient.setQueryData()`로 주입
3. 메모리 히스토리 생성 (`createMemoryHistory`)
4. Router 생성 및 초기화 (`await router.load()` 필수!)
5. `renderToString`으로 HTML 문자열 생성
6. `dehydratedState` 반환 (클라이언트에서 hydration용)

---

### 4. Sonamu 코어 수정 (`modules/sonamu/src/api/sonamu.ts`)

#### 4.1 `invokeApiForSSR` 메서드 추가

**목적**: SSR에서 HTTP 오버헤드 없이 API를 직접 호출

```typescript
async invokeApiForSSR(
  api: ExtendedApi,
  params: any[],
  config: SonamuFastifyConfig,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<any>
```

**핵심 로직**:
1. API 파라미터 중 `Context` 타입 찾기
2. Context 객체 생성 (DB, request, reply, config 등)
3. 파라미터 배열에 Context 주입
4. Model 메서드 직접 호출
5. 결과 반환

**장점**:
- HTTP 요청 오버헤드 제거
- 네트워크 레이어 우회
- 서버 사이드에서만 동작 (보안)

#### 4.2 SSR Routes Autoload

```typescript
await this.syncer.autoloadSSRRoutes();
```

- `src/ssr/routes.ts` 파일 자동 로드
- `registerSSR()` 호출 실행하여 라우트 등록

---

### 5. 실제 사용 예시 (`examples/miomock/api/src/ssr/routes.ts`)

```typescript
import { registerSSR } from "sonamu/ssr";
import { CompanyService, UserService } from "../application/queries.generated";

// 회사 목록 페이지 SSR
registerSSR({
  path: "/admin/companies",
  head: () => ({
    title: "Miomock - Companies List",
  }),
  preload: () => [
    UserService.me(),
    CompanyService.findMany("A", {
      num: 10,
      page: 1,
      search: "id",
      keyword: "",
      orderBy: "id-desc",
    }),
  ],
});

// Admin 로그인 페이지
registerSSR({
  path: "/admin/login",
  head: () => ({
    title: "Miomock - Admin Login",
  }),
  preload: () => [],
});
```

**특징**:
- **Type-safe**: `CompanyService.findMany()`의 파라미터가 타입 검증됨
- **선언적**: preload할 데이터를 함수 배열로 간단히 선언
- **SEO 친화적**: `head` 함수로 메타 태그 동적 생성 가능

---

### 6. AuthProvider 수정 (`examples/miomock/web/src/admin-common/auth.tsx`)

**문제**: `useState` + `useEffect`로 인한 Hydration 중 상태 업데이트

**수정 전**:
```tsx
const [loading, setLoading] = useState<boolean>(isLoading);

useEffect(() => {
  setLoading(isLoading);
}, [isLoading]);

const login = (params) => {
  setLoading(true);
  UserService.login(params).then(...).finally(() => setLoading(false));
};
```

**수정 후**:
```tsx
const loginMutation = UserService.useLoginMutation();
const logoutMutation = UserService.useLogoutMutation();

const value = {
  loading: isLoading || loginMutation.isPending || logoutMutation.isPending,
  login: (loginParams) => {
    loginMutation.mutate({ params: loginParams }, {
      onSuccess: async ({ user: _user }) => {
        await queryClient.invalidateQueries({ queryKey: ["User", "me"] });
        await queryClient.refetchQueries({ queryKey: ["User", "me"] });
        navigate({ to: "/admin", replace: true });
      },
    });
  },
};
```

**핵심 차이**:
- `useState` 제거 → React Query의 `isPending` 직접 사용
- `useEffect` 제거 → Hydration 중 상태 업데이트 없음
- Mutation hook 사용 → React Query가 로딩 상태 관리

---

### 7. 클라이언트 Hydration (`examples/miomock/web/src/entry-client.tsx`)

**디버깅 유틸리티 추가**:

```typescript
function detectHydrationMismatch(serverHTML: string, clientHTML: string) {
  // 1. 콘솔에 첫 1000자 출력
  // 2. 길이 비교
  // 3. 첫 번째 불일치 위치 찾기 (character-level diff)
  // 4. 불일치 주변 100자 컨텍스트 출력
  // 5. HTML 파일로 다운로드 (VSCode diff 뷰용)
}

function saveHTMLForDiff(serverHTML: string, clientHTML: string) {
  // Blob으로 파일 생성
  // ssr-server.html, ssr-client.html로 다운로드
  // VSCode에서 "Compare Selected"로 diff 확인 가능
}
```

**Hydration 로직**:
```typescript
if (root.innerHTML && dehydratedState) {
  const serverHTML = root.innerHTML;

  ReactDOM.hydrateRoot(root, app);

  setTimeout(() => {
    const clientHTML = root.innerHTML;
    detectHydrationMismatch(serverHTML, clientHTML);
  }, 100);
} else {
  ReactDOM.createRoot(root).render(app);
}
```

---

### 8. DevTools 재추가

#### 8.1 React Query Devtools
- 위치: `main.tsx` (`QueryClientProvider` 내부)
- 설정: `initialIsOpen={false}`

#### 8.2 TanStack Router Devtools
- 위치: `App.tsx` (라우터 컨텍스트 내부)
- 조건부 렌더링: `import.meta.env.DEV`만 활성화
- 이유: `useLocation()` 같은 라우터 훅을 사용하기 때문에 라우터 컨텍스트 안에 있어야 함

```tsx
// App.tsx
function App({ children }: AppProps) {
  return (
    <div className="app">
      {/* ... */}
      {import.meta.env.DEV && <TanStackRouterDevtools initialIsOpen={false} />}
    </div>
  );
}
```

---

### 9. Sonamu UI 빈 페이지 버그 픽스 (`modules/sonamu/ui-web/vite.config.ts`)

**문제**: `http://localhost:10280/sonamu-ui` 접속 시 빈 페이지 표시

**근본 원인**: Vite의 `base` 설정에 trailing slash 포함

**변경 내용**:
```typescript
// ❌ Before
base: process.env.NODE_ENV === "production" ? "/sonamu-ui/" : "/",

// ✅ After
base: process.env.NODE_ENV === "production" ? "/sonamu-ui" : "/",
```

**이유**:
- Trailing slash가 있으면 `/sonamu-ui/`로 리다이렉트되면서 라우팅 문제 발생
- Vite는 trailing slash 없는 경로를 권장
- 이제 `/sonamu-ui` 접속 시 정상적으로 UI 로드

---

### 10. HMR 버그 픽스 (`modules/sonamu/src/syncer/syncer.ts`)

**문제**: HMR로 SSR 라우트 파일 저장 시 라우트가 초기화되는 버그

**근본 원인**:
- Node.js의 모듈 캐싱 메커니즘
- SSR 파일 변경 시 `clearSSRRoutes()` 후 `importMembers()`를 호출하지만
- 모듈이 이미 캐시되어 있어 `registerSSR()`이 다시 실행되지 않음

**해결책**:
```typescript
// SSR 설정 파일 변경 감지
if (diffFilePath.includes("/src/ssr/")) {
  console.log(chalk.bold.yellow("SSR config changed - reloading..."));
  // SSR 파일도 invalidate 후 reload
  if (!isTest()) {
    await hot.invalidateFile(diffFilePath, event);  // ← 추가!
  }
  await this.autoloadSSRRoutes();
  this.eventEmitter.emit("onHMRCompleted");
  return;
}
```

**HMR 동작 순서**:
1. `/src/ssr/routes.ts` 파일 저장
2. `hot.invalidateFile()` 실행 → 모듈 캐시 무효화
3. `clearSSRRoutes()` → 기존 routes 배열 초기화
4. `importMembers(file)` → 캐시가 없으므로 파일을 실제로 다시 실행
5. `registerSSR()` 호출 실행 → routes 배열에 다시 등록 ✅

**로그 개선**:
- 추가: `[SSR] Matched route: /admin/companies` - SSR 라우트 매칭 시 출력
- 제거: 불필요한 디버깅 로그들 (Registered routes, No match found, Rendering route 등)

---

## 문서화

### Phase 4.5N 문서 작성 (`docs/ssr/phase-45N-ssr-tanstack-router-fix.md`)

**내용**:
1. 문제 진단 (증상, 에러 메시지)
2. 근본 원인 2가지 분석
3. TanStack Start 방식을 사용하지 않는 이유
4. 변경 사항 요약
5. SSR 안전한 컴포넌트 패턴
6. 확인 체크리스트
7. Suspense 마커 참고 자료

**핵심 교훈**:
- TanStack Router의 SSR API (`RouterServer`, `RouterClient`)는 **TanStack Start 전용**
- Sonamu는 `renderToString` + `RouterProvider` 방식 유지
- **Suspense 마커는 제거할 대상이 아님** - hydration 후 자동 제거되는 정상 메커니즘
- 서버/클라이언트 **동일한 Suspense 구조** 유지가 핵심

---

## 기술적 의사결정

### 1. TanStack Start 방식을 사용하지 않은 이유

| | Sonamu 철학 | TanStack Start |
|---|---|---|
| **시작점** | `index.html` | `__root.tsx` |
| **멘탈 모델** | CSR 유지, 백엔드가 SSR 처리 | SSR-first |
| **HTML 생성** | 앱 컴포넌트만 주입 | 전체 문서 생성 (`<!DOCTYPE>` 포함) |

**결론**: Sonamu의 "CSR 기본, SSR은 옵션" 철학을 유지하기 위해 `renderToString` + `RouterProvider` 방식 유지

### 2. SSRQuery vs 직접 API 호출

**선택**: SSRQuery 타입 도입

**이유**:
- 타입 안전성 확보
- 서버 모델 호출 정보와 클라이언트 queryKey를 함께 관리
- Branded type으로 실수 방지
- 자동 생성으로 개발자 부담 최소화

### 3. HTTP vs 직접 호출

**선택**: `Sonamu.invokeApiForSSR()` 메서드로 직접 호출

**이유**:
- HTTP 요청 오버헤드 제거 (네트워크 레이어 우회)
- 직렬화/역직렬화 과정 생략
- 에러 발생 시 더 명확한 스택 트레이스

---

## 성능 개선

1. **SSR Preload**: 초기 로딩 시간 단축
2. **직접 API 호출**: HTTP 오버헤드 제거
3. **QueryClient 캐싱**: dehydrated 상태로 클라이언트에 전달

---

## 남은 과제

### 1. Production Build
- SSR 프로덕션 빌드 설정
- CSS 처리 (현재는 dev 모드만)
- 성능 최적화

### 2. 에러 처리
- SSR 중 API 실패 시 fallback 전략
- 에러 페이지 렌더링

### 3. 캐싱 전략
- SSR 결과 캐싱
- Stale-While-Revalidate 패턴

### 4. 더 많은 Route 지원
- 동적 라우트 매칭 개선
- 와일드카드 패턴 지원

---

## 체크리스트

- [x] Hydration Mismatch 해결
- [x] SSR 라우트 등록 시스템 구축
- [x] SSRQuery 생성 시스템 구축 (서비스 메서드 이름 사용)
- [x] AuthProvider 수정 (useState/useEffect 제거)
- [x] DevTools 재추가
- [x] Hydration 디버깅 유틸리티 추가 (VSCode diff 지원)
- [x] Sonamu UI 빈 페이지 버그 픽스 (trailing slash 제거)
- [x] HMR 버그 픽스 (모듈 캐시 무효화)
- [x] 디버깅 로그 정리
- [x] Phase 4.5N 문서 작성
- [x] 새 창에서 Hydration 에러 없음
- [x] 새로고침에서 정상 동작
- [x] 콘솔에 경고/에러 없음
- [x] HMR 후에도 SSR 라우트 정상 동작
- [x] Sonamu UI 정상 접속 (`/sonamu-ui`)

---

## 통계

- **변경된 파일**: 31개
- **추가된 줄**: 1,283줄
- **삭제된 줄**: 303줄
- **새로 생성된 파일**:
  - `modules/sonamu/src/ssr/` (4개 파일)
  - `modules/sonamu/src/template/implementations/queries.template.ts`
  - `examples/miomock/api/src/ssr/routes.ts`
  - `examples/miomock/api/src/application/queries.generated.ts`
  - `examples/miomock/web/src/entry-client.tsx`
  - `examples/miomock/web/src/entry-server.generated.tsx`

---

## 결론

Phase 3-5는 **TanStack Router + React Query 기반 SSR의 완전한 통합**을 달성했습니다.

**핵심 성과**:
1. ✅ Hydration Mismatch 근본 원인 분석 및 해결
2. ✅ Type-safe SSR preload 시스템 구축 (서비스와 동일한 API)
3. ✅ 선언적 SSR 라우트 등록 시스템
4. ✅ HTTP 오버헤드 없는 직접 API 호출
5. ✅ HMR 지원 (모듈 캐시 무효화로 라우트 재로딩)
6. ✅ 디버깅 유틸리티로 향후 문제 대응 준비 (VSCode diff 지원)

**개발자 경험 개선**:
- SSR preload에서 Services와 동일한 메서드 이름 사용 가능
- HMR로 SSR 라우트 실시간 업데이트
- Hydration mismatch 발생 시 자동으로 HTML 파일 다운로드 및 diff 분석

이제 Sonamu는 **CSR과 SSR을 자유롭게 선택**할 수 있는 유연한 프레임워크가 되었습니다.
