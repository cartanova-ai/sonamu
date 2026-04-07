# Phase 1: Tanstack Query 기반 다지기

> **목표**: SWR을 Tanstack Query로 전환하고 services.generated.ts 단일 파일 구조 구축

## ⚠️ 주요 설계 결정 사항

### 1. QueryKey 전략: 엔티티 Prefix 필수

**문제**: 엔티티 prefix 없으면 캐시 충돌 발생

```typescript
// ❌ 잘못된 방법 (캐시 충돌)
UserService.findById(); // queryKey: ['findById', 'A', 1]
CompanyService.findById(); // queryKey: ['findById', 'A', 1] ← 동일!

// ✅ 올바른 방법
UserService.findById(); // queryKey: ['User', 'findById', 'A', 1]
CompanyService.findById(); // queryKey: ['Company', 'findById', 'A', 1]
```

**장점**:

- 엔티티 단위 캐시 무효화: `queryClient.invalidateQueries({ queryKey: ['User'] })`
- 명확한 디버깅

### 2. 조건부 쿼리 지원

SWR의 `swrOptions?.conditional`을 Tanstack Query의 `enabled` 옵션으로 변환:

```typescript
// 기존 (SWR)
UserService.useUser("A", id, { conditional: () => !!id });

// 변경 (Tanstack Query)
UserService.useUser("A", id, { enabled: !!id });
```

모든 useQuery 훅에 `options?: { enabled?: boolean }` 파라미터 추가.

### 3. 점진적 마이그레이션

- `ServiceClient` 타입에 `"swr"` 유지 (마이그레이션 기간 동안)
- AuthProvider 먼저 변환 (전체 앱 의존성)
- 엔티티별 변환 후 개별 커밋

---

## 개요

이 Phase에서는:

1. miomock-web에 Tanstack Query를 수동으로 적용하여 동작 확인
2. Sonamu 코드 생성에 services.generated.ts 생성 로직 추가 (namespace 구조)
3. @api decorator에 clients 옵션 추가 (`tanstack-query`, `tanstack-mutation`)
4. 전체 프로젝트를 Tanstack Query로 전환

## 핵심 설계 결정

### services.generated.ts 단일 파일 구조

**기존 (개별 파일):**

```
services/
  user/
    user.service.ts
  employee/
    employee.service.ts
```

**변경 (단일 파일 + namespace):**

```
services/
  services.generated.ts  ← 모든 서비스 통합
  sonamu.generated.ts
  sonamu.shared.ts
```

### Namespace 구조

```typescript
// services/services.generated.ts
export namespace UserService {
  // 1. axios 함수 (항상 생성)
  export async function getUser<T extends UserSubsetKey>(
    subset: T,
    id: number
  ): Promise<UserSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/user/findById?${qs.stringify({ subset, id })}`,
    });
  }

  // 2. queryOptions (clients에 'tanstack-query' 포함 시)
  export const getUserQueryOptions = <T extends UserSubsetKey>(
    subset: T,
    id: number
  ) =>
    queryOptions({
      queryKey: ["User", "getUser", subset, id], // ← 엔티티 prefix 추가
      queryFn: () => getUser(subset, id), // ← axios 함수 재사용
    });

  // 3. useQuery hook (clients에 'tanstack-query' 포함 시)
  export const useUser = <T extends UserSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean } // ← 조건부 쿼리 지원
  ) =>
    useQuery({
      ...getUserQueryOptions(subset, id),
      ...options,
    });

  // 4. useMutation hook (clients에 'tanstack-mutation' 포함 시)
  export async function save(spa: UserSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/user/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (spa: UserSaveParams[]) => save(spa),
    });
}

export namespace EmployeeService {
  // ...
}
```

### @api clients 옵션

```typescript
// api/src/application/user/user.api.ts
class UserApi {
  @api({
    httpMethod: "GET",
    clients: ["axios", "tanstack-query"], // ← queryOptions + useQuery 생성
  })
  async findById<T extends UserSubsetKey>(
    subset: T,
    id: number
  ): Promise<UserSubsetMapping[T]> {
    // ...
  }

  @api({
    httpMethod: "POST",
    clients: ["axios", "tanstack-mutation"], // ← useMutation 생성
  })
  async save(spa: UserSaveParams[]): Promise<number[]> {
    // ...
  }
}
```

---

## 1.1 miomock-web에 Tanstack Query 수동 적용

### 패키지 설치

```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/web
pnpm install @tanstack/react-query @tanstack/react-query-devtools
```

### main.tsx 수정

**파일**: `src/main.tsx`

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./admin-common/auth";
import { loadDynamicRoutes } from "@sonamu-kit/react-sui";
import "semantic-ui-css/semantic.min.css";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<App />}>
            {loadDynamicRoutes(import.meta.glob("./pages/**/*.tsx"))}
          </Route>
          <Route path="*" element={<div>404 Page Not Found</div>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);
```

### 테스트용 수동 구현

**파일**: `src/services/user-test.ts` (신규, 테스트용)

```tsx
import { queryOptions, useQuery, useMutation } from "@tanstack/react-query";
import type { UserSubsetKey, UserSubsetMapping } from "./sonamu.generated";
import { fetch } from "./sonamu.shared";
import qs from "qs";

export namespace UserService {
  // axios 함수
  export async function getUser<T extends UserSubsetKey>(
    subset: T,
    id: number
  ): Promise<UserSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/user/findById?${qs.stringify({ subset, id })}`,
    });
  }

  // queryOptions
  export const getUserQueryOptions = <T extends UserSubsetKey>(
    subset: T,
    id: number
  ) =>
    queryOptions({
      queryKey: ["User", "getUser", subset, id], // ← 엔티티 prefix
      queryFn: () => getUser(subset, id),
    });

  // useQuery hook
  export const useUser = <T extends UserSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean } // ← 조건부 쿼리 지원
  ) =>
    useQuery({
      ...getUserQueryOptions(subset, id),
      ...options,
    });
}
```

### 테스트

기존 SWR 사용 페이지 하나를 수정:

```tsx
// Before (SWR)
import { UserService } from "@/services/user/user.service";
const { data: user } = UserService.useUser("A", userId);

// After (Tanstack Query)
import { UserService } from "@/services/user-test";
const { data: user } = UserService.useUser("A", userId);
```

### 확인 사항

- [ ] QueryClient 정상 설정
- [ ] useUser hook 정상 동작
- [ ] React Query Devtools에서 쿼리 확인
- [ ] 데이터 캐싱 동작 확인

---

## 1.2 Sonamu에 clients 옵션 추가

### ServiceClient 타입 확장

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/api/decorators.ts`

```typescript
export type ServiceClient =
  | "axios"
  | "axios-multipart"
  | "swr" // 마이그레이션 기간 동안 유지
  | "tanstack-query" // ← 추가
  | "tanstack-mutation" // ← 추가
  | "window-fetch";

export type ApiDecoratorOptions = {
  httpMethod?: HTTPMethods;
  contentType?: string;
  clients?: ServiceClient[]; // ← 위 타입 사용
  path?: string;
  resourceName?: string;
  guards?: GuardKey[];
  description?: string;
  timeout?: number;
};
```

---

## 1.3 Sonamu 코드젠에 services.generated.ts 추가

### services.template.ts 생성

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/template/implementations/services.template.ts`

```typescript
import inflection from "inflection";
import {
  apiParamToTsCode,
  apiParamTypeToTsType,
  unwrapPromiseOnce,
} from "../../api/code-converters";
import { Sonamu } from "../../api/sonamu";
import { assertDefined } from "../../utils/utils";
import { Template } from "../template";
import type { TemplateOptions } from "../../types/types";
import { ApiParamType } from "../../types/types";

export class Template__services extends Template {
  constructor() {
    super("services");
  }

  getTargetAndPath() {
    return {
      target: ":target/src/services",
      path: `services.generated.ts`,
    };
  }

  render({}: TemplateOptions["services"]) {
    const { apis } = Sonamu.syncer;

    // 모델별로 그룹화
    const apisByModel = new Map<string, typeof apis>();
    for (const api of apis) {
      const modelName = api.modelName
        .replace(/Model$/, "")
        .replace(/Frame$/, "");
      if (!apisByModel.has(modelName)) {
        apisByModel.set(modelName, []);
      }
      apisByModel.get(modelName)!.push(api);
    }

    const importKeys: string[] = [];
    const namespaces: string[] = [];

    for (const [modelName, modelApis] of apisByModel) {
      const functions: string[] = [];

      for (const api of modelApis) {
        const paramsWithoutContext = api.parameters.filter(
          (param) =>
            !ApiParamType.isContext(param.type) &&
            !ApiParamType.isRefKnex(param.type) &&
            !(param.optional === true && param.name.startsWith("_"))
        );

        const typeParametersAsTsType = api.typeParameters
          .map((typeParam) => apiParamTypeToTsType(typeParam, importKeys))
          .join(", ");
        const typeParamsDef = typeParametersAsTsType
          ? `<${typeParametersAsTsType}>`
          : "";

        const paramsDef = apiParamToTsCode(paramsWithoutContext, importKeys);
        const returnTypeDef = apiParamTypeToTsType(
          assertDefined(unwrapPromiseOnce(api.returnType)),
          importKeys
        );

        const paramNames = paramsWithoutContext.map((p) => p.name).join(", ");
        const dataOrParams =
          api.options.httpMethod === "GET" ? "params" : "data";
        const hasParams = paramsWithoutContext.length > 0;

        // 1. axios 함수 (항상 생성)
        const urlPart =
          api.options.httpMethod === "GET" && hasParams
            ? `\`${api.route}?\${qs.stringify({ ${paramNames} })}\``
            : `\`${api.route}\``;
        const bodyPart =
          api.options.httpMethod !== "GET" && hasParams
            ? `data: { ${paramNames} },`
            : "";

        functions.push(
          `
  export async function ${api.methodName}${typeParamsDef}(${paramsDef}): Promise<${returnTypeDef}> {
    return fetch({
      method: "${api.options.httpMethod}",
      url: ${urlPart},
      ${bodyPart}
    });
  }
        `.trim()
        );

        const clients = api.options.clients || [];

        // 2. queryOptions + useQuery (tanstack-query)
        if (clients.includes("tanstack-query")) {
          const hookName = api.options.resourceName
            ? inflection.camelize(api.options.resourceName, true)
            : inflection.camelize(api.methodName, true);

          functions.push(
            `
  export const ${
    api.methodName
  }QueryOptions = ${typeParamsDef}(${paramsDef}) => queryOptions({
    queryKey: ['${modelName}', '${api.methodName}'${
              paramNames ? `, ${paramNames}` : ""
            }],
    queryFn: () => ${api.methodName}(${paramNames})
  });
          `.trim()
          );

          functions.push(
            `
  export const use${inflection.camelize(
    hookName
  )} = ${typeParamsDef}(${paramsDef}, options?: { enabled?: boolean }) =>
    useQuery({
      ...${api.methodName}QueryOptions(${paramNames}),
      ...options
    });
          `.trim()
          );
        }

        // 3. useMutation (tanstack-mutation)
        if (clients.includes("tanstack-mutation")) {
          const hookName = inflection.camelize(api.methodName);
          const mutationParamType =
            paramsWithoutContext.length > 0
              ? `{ ${paramsWithoutContext
                  .map((p) => `${p.name}: ${apiParamTypeToTsType(p.type, [])}`)
                  .join(", ")} }`
              : "void";
          const mutationParamNames =
            paramsWithoutContext.length > 0
              ? paramsWithoutContext.map((p) => `params.${p.name}`).join(", ")
              : "";

          functions.push(
            `
  export const use${hookName}Mutation = ${typeParamsDef}() => useMutation({
    mutationFn: (params: ${mutationParamType}) => ${api.methodName}(${mutationParamNames})
  });
          `.trim()
          );
        }
      }

      namespaces.push(
        `
export namespace ${modelName}Service {
${functions.join("\n\n")}
}
      `.trim()
      );
    }

    return {
      ...this.getTargetAndPath(),
      body: namespaces.join("\n\n"),
      importKeys: [...new Set(importKeys)],
      customHeaders: [
        `import { queryOptions, useQuery, useMutation } from '@tanstack/react-query';`,
        `import qs from 'qs';`,
        `import { fetch } from './sonamu.shared';`,
      ],
    };
  }
}
```

### TemplateKey 추가

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/types/types.ts`

```typescript
export const TemplateKey = z.enum([
  // ... 기존 것들
  "services",
]);
```

### Syncer 수정

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/syncer/syncer.ts`

`doSyncActions` 메서드에서 entity 변경 시 services.generated.ts 재생성:

```typescript
if (diffGroups.entity.length > 0 || diffGroups.model.length > 0) {
  // ... 기존 로직

  // services.generated.ts 재생성
  await generateTemplate("services", {});
}
```

### 기존 service.template.ts 제거

새로운 단일 파일 구조(services.template.ts)와 충돌 방지를 위해 기존 템플릿 제거:

**삭제할 파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/template/implementations/service.template.ts`

```bash
# 기존 템플릿 파일 삭제
rm /Users/minsangk/Development/sonamu/modules/sonamu/src/template/implementations/service.template.ts
```

**주의사항**:

- 기존 `service.template.ts`는 각 엔티티별로 개별 파일 생성 (`user.service.ts`, `employee.service.ts` 등)
- 새로운 `services.template.ts`는 단일 파일에 namespace로 통합 (`services.generated.ts`)
- 템플릿 제거 후에는 기존에 생성된 개별 서비스 파일들도 1.4 단계에서 제거 필요

### 확인 사항

- [ ] services.template.ts 생성 확인
- [ ] service.template.ts 삭제 확인

- [ ] User 모델 재생성 (`pnpm sonamu sync`)
- [ ] `services.generated.ts` 파일 생성 확인
- [ ] namespace 구조 확인
- [ ] TypeScript 타입 에러 없음

---

## 1.4 miomock 전체 모델 전환

### ⚠️ 중요: 변환 순서

**반드시 AuthProvider부터 변환**해야 합니다. AuthProvider는 전체 앱의 인증 상태를 관리하므로, 다른 페이지 변환 전에 완료해야 합니다.

### 작업 순서

#### 1단계: AuthProvider 변환 (최우선)

**파일**: `src/admin-common/auth.tsx`

```typescript
// Before (SWR)
const { data: user, isLoading: swrLoading, mutate } = UserService.useMe();

mutate().then(() => {
  navigate(from, { replace: true });
});

// After (Tanstack Query)
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();
const { data: user, isLoading } = UserService.useMe();

// mutate() 대신 queryClient 사용
await queryClient.invalidateQueries({ queryKey: ["User", "me"] });
await queryClient.refetchQueries({ queryKey: ["User", "me"] });
navigate(from, { replace: true });
```

**테스트**: 로그인/로그아웃이 정상 동작하는지 확인

---

#### 2단계: API에 clients 옵션 명시

```typescript
// api/src/application/user/user.api.ts
class UserApi {
  @api({
    httpMethod: 'GET',
    clients: ['axios', 'tanstack-query']
  })
  async findById(...) {}

  @api({
    httpMethod: 'POST',
    clients: ['axios', 'tanstack-mutation']
  })
  async save(...) {}
}
```

#### 3단계: 모든 entity 재생성

```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/api
pnpm sonamu sync
```

#### 4단계: 페이지별 변환

**순서**:

1. User 페이지 (템플릿으로 사용)
2. 다른 엔티티들 (한 번에 하나씩)
3. 각 엔티티 변환 후 개별 커밋

**변환 패턴 1: Query (GET)**

```tsx
// Before
import { UserService } from "@/services/user/user.service";
const { data } = UserService.useUser("A", userId);

// After
import { UserService } from "@/services/services.generated";
const { data } = UserService.useUser("A", userId);
```

**변환 패턴 2: Mutation (POST/PUT/DELETE)**

```tsx
// Before
import { UserService } from "@/services/user/user.service";
const { data, mutate } = UserService.useUsers("A", listParams);
const handleDelete = async () => {
  await UserService.del(ids);
  mutate(); // 캐시 갱신
};

// After - 방법 1: refetch 사용 (간단)
import { UserService } from "@/services/services.generated";
const { data, refetch } = UserService.useUsers("A", listParams);
const handleDelete = async () => {
  await UserService.del(ids);
  refetch(); // 캐시 갱신
};

// After - 방법 2: useMutation + invalidateQueries (권장)
import { useQueryClient } from "@tanstack/react-query";
import { UserService } from "@/services/services.generated";
const queryClient = useQueryClient();
const { data } = UserService.useUsers("A", listParams);
const { mutate: deleteUsers } = UserService.useDelMutation();
const handleDelete = () => {
  deleteUsers(ids, {
    onSuccess: () => {
      // User 엔티티 전체 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ["User"] });
    },
  });
};
```

**변환 패턴 3: 조건부 쿼리**

```tsx
// Before (SWR)
const { data } = UserService.useUser("A", userId, {
  conditional: () => !!userId,
});

// After (Tanstack Query)
const { data } = UserService.useUser("A", userId, {
  enabled: !!userId,
});
```

#### 5단계: 변환 대상 페이지들

- `src/pages/users/*.tsx`
- `src/pages/employees/*.tsx`
- `src/pages/departments/*.tsx`
- `src/pages/companies/*.tsx`
- `src/pages/projects/*.tsx`
- 기타 services 사용하는 모든 페이지

### SWR 제거

```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/web
pnpm uninstall swr
```

### sonamu.shared.ts 수정

**파일**: `src/services/sonamu.shared.ts`

SWR 관련 코드 제거:

- `swrFetcher`
- `swrPostFetcher`
- `handleConditional`
- `SwrOptions`
- `SWRError`

### 기존 서비스 폴더 제거

```bash
rm -rf src/services/user
rm -rf src/services/employee
# ... 모든 개별 서비스 폴더
```

### 확인 사항

**단계별 체크리스트**:

1. **AuthProvider 변환 후**:

   - [ ] 로그인 정상 동작
   - [ ] 로그아웃 정상 동작
   - [ ] 페이지 새로고침 시 인증 상태 유지

2. **services.generated.ts 생성 후**:

   - [ ] 파일 정상 생성 확인
   - [ ] namespace 구조 확인 (UserService, CompanyService 등)
   - [ ] queryKey에 엔티티 prefix 포함 확인 (['User', 'getUser', ...])
   - [ ] options 파라미터 포함 확인 (enabled 지원)

3. **페이지 변환 후**:

   - [ ] 모든 페이지에서 SWR import 제거
   - [ ] 모든 페이지에서 Tanstack Query hooks 사용
   - [ ] mutate() → refetch() 또는 invalidateQueries() 변환 완료
   - [ ] 조건부 쿼리 (conditional → enabled) 변환 완료

4. **통합 테스트**:
   - [ ] CRUD 기능 전체 정상 동작
   - [ ] 네트워크 탭에서 중복 요청 없음 (캐싱 동작)
   - [ ] React Query Devtools에서 쿼리 상태 확인
   - [ ] 엔티티별 캐시 무효화 정상 동작

---

## 완료 체크리스트

### 준비 단계

- [ ] miomock-web에 Tanstack Query 수동 적용 (1.1)
- [ ] QueryClient 설정 및 DevTools 추가

### Sonamu 코드젠 구현

- [ ] ServiceClient 타입에 tanstack-query, tanstack-mutation 추가 (1.2)
- [ ] services.template.ts 생성 - queryKey에 엔티티 prefix 포함 (1.3)
- [ ] services.template.ts - options 파라미터로 enabled 지원 (1.3)
- [ ] TemplateKey에 "services" 추가 (1.3)
- [ ] Syncer에 services.generated.ts 생성 로직 추가 (1.3)

### miomock 프로젝트 변환

- [ ] **AuthProvider 변환 (최우선)** (1.4-1단계)
- [ ] 모든 API에 clients 옵션 명시 (1.4-2단계)
- [ ] pnpm sonamu sync 실행 (1.4-3단계)
- [ ] User 페이지 변환 (템플릿으로 사용) (1.4-4단계)
- [ ] Employee, Company 등 나머지 엔티티 변환 (1.4-4단계)
- [ ] 각 엔티티별 개별 커밋

### 정리

- [ ] SWR 패키지 제거
- [ ] sonamu.shared.ts에서 SWR 유틸 제거
- [ ] 기존 서비스 폴더 제거 (user/, employee/ 등)
- [ ] 통합 테스트 완료

---

다음: [Phase 2: Tanstack Router 적용](./phase-2-tanstack-router.md)
