# Sonamu UI - Tanstack Query 마이그레이션 플랜

## 개요

Sonamu UI 웹 프로젝트를 SWR에서 Tanstack Query로 마이그레이션합니다.
이 프로젝트는 API 모델/서비스 자동 생성 방식이 아닌 일반 서비스 파일 구조를 사용합니다.

## 현재 상태 분석

### SWR 사용 위치

1. **sonamu-ui.service.ts** - 3개의 useSWR 훅:
   - `useEntities()` - Entity 목록 조회
   - `useTypeIds()` - Type ID 목록 조회
   - `useMigrationStatus()` - Migration 상태 조회
   - `useScaffoldingStatus()` - Scaffolding 상태 조회

2. **main.tsx** - SWRConfig Provider 설정

3. **sonamu.shared.ts** - SWR fetcher 함수들:
   - `swrFetcher` - GET 요청용
   - `swrPostFetcher` - POST 요청용

### 의존성

- package.json에 `swr: ^2.2.2` 포함
- 다른 패키지들과의 의존성 없음 (독립적으로 제거 가능)

### 페이지 파일 (잠재적 영향)

```
/pages/migrations/index.tsx
/pages/fixture/index.tsx
/pages/scaffolding/index.tsx
/pages/entities/show.tsx
/pages/entities/_layout.tsx
```

## 마이그레이션 계획

### STEP 1: Tanstack Query 설정

**1.1 의존성 추가**

```bash
cd /Users/minsangk/Development/sonamu/modules/sonamu/ui-web
pnpm add @tanstack/react-query
```

**1.2 main.tsx - Provider 변경**

- SWRConfig → QueryClientProvider로 교체
- QueryClient 생성 및 설정

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 3,
      retryDelay: 3000,
    },
  },
});
```

### STEP 2: sonamu-ui.service.ts 마이그레이션

**2.1 useEntities() 변경**

```typescript
// Before
export function useEntities(): SWRResponse<{ entities: ExtendedEntity[] }, SWRError> {
  return useSWR<{ entities: ExtendedEntity[] }, SWRError>([`/sonamu-ui/api/entity/findMany`]);
}

// After
export function useEntities() {
  return useQuery({
    queryKey: ["entities", "findMany"],
    queryFn: () =>
      fetch({
        method: "GET",
        url: `/sonamu-ui/api/entity/findMany`,
      }),
  });
}
```

**2.2 useTypeIds() 변경**

```typescript
// Before
export function useTypeIds(
  filter?: "enums" | "types",
): SWRResponse<{ typeIds: string[] }, SWRError> {
  return useSWR<{ typeIds: string[] }, SWRError>([
    `/sonamu-ui/api/entity/typeIds`,
    { filter, reload: "1" },
  ]);
}

// After
export function useTypeIds(filter?: "enums" | "types") {
  return useQuery({
    queryKey: ["entity", "typeIds", filter],
    queryFn: () =>
      fetch({
        method: "GET",
        url: `/sonamu-ui/api/entity/typeIds`,
        params: { filter, reload: "1" },
      }),
  });
}
```

**2.3 useMigrationStatus() 변경**

```typescript
// Before
export function useMigrationStatus(): SWRResponse<{ status: MigrationStatus }, SWRError> {
  return useSWR<{ status: MigrationStatus }, SWRError>([`/sonamu-ui/api/migrations/status`]);
}

// After
export function useMigrationStatus() {
  return useQuery({
    queryKey: ["migrations", "status"],
    queryFn: () =>
      fetch({
        method: "GET",
        url: `/sonamu-ui/api/migrations/status`,
      }),
  });
}
```

**2.4 useScaffoldingStatus() 변경**

```typescript
// Before
export function useScaffoldingStatus(
  params: ScaffoldingGetStatusParams,
): SWRResponse<{ statuses: ScaffoldingStatus[] }, SWRError> {
  const route = (() => {
    if (params.entityIds.length === 0 || params.templateKeys.length === 0) {
      return null;
    } else if (params.templateGroupName === "Enums" && params.enumIds.length === 0) {
      return null;
    }
    return [`/sonamu-ui/api/scaffolding/getStatus`, params];
  })();
  return useSWR<{ statuses: ScaffoldingStatus[] }, SWRError>(route, swrPostFetcher);
}

// After
export function useScaffoldingStatus(params: ScaffoldingGetStatusParams) {
  const enabled = (() => {
    if (params.entityIds.length === 0 || params.templateKeys.length === 0) {
      return false;
    } else if (params.templateGroupName === "Enums" && params.enumIds.length === 0) {
      return false;
    }
    return true;
  })();

  return useQuery({
    queryKey: ["scaffolding", "getStatus", params],
    queryFn: () =>
      fetch({
        method: "POST",
        url: `/sonamu-ui/api/scaffolding/getStatus`,
        data: params,
      }),
    enabled,
  });
}
```

### STEP 3: 페이지 파일 수정

**3.1 검색 및 확인**

- 모든 페이지 파일에서 `mutate()` 호출 확인
- `data`, `error`, `isLoading` 등의 반환값 사용 확인
- 필요시 `refetch()` 또는 `queryClient.invalidateQueries()` 사용으로 변경

**주요 체크 포인트:**

- `/pages/entities/show.tsx` - 엔티티 CRUD 후 리스트 갱신
- `/pages/migrations/index.tsx` - 마이그레이션 실행 후 상태 갱신
- `/pages/scaffolding/index.tsx` - 스캐폴딩 실행 후 상태 갱신

### STEP 4: sonamu.shared.ts 정리

**4.1 제거할 항목**

- `swrFetcher` 함수
- `swrPostFetcher` 함수
- SWRError 타입 (필요시 유지)

**4.2 유지할 항목**

- `fetch` 함수 - 그대로 사용
- `SonamuError` 클래스
- `isSonamuError` 함수
- `defaultCatch` 함수

### STEP 5: Import 문 정리

**5.1 sonamu-ui.service.ts**

```typescript
// 제거
import useSWR, { type SWRResponse } from "swr";
import { fetch, swrPostFetcher } from "./sonamu.shared";

// 추가
import { useQuery } from "@tanstack/react-query";
import { fetch } from "./sonamu.shared";
```

**5.2 main.tsx**

```typescript
// 제거
import { SWRConfig } from "swr";
import { swrFetcher } from "./services/sonamu.shared.ts";

// 추가
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
```

### STEP 6: 의존성 제거

**6.1 package.json 수정**

```bash
pnpm remove swr
```

**6.2 확인**

- 빌드 에러 없는지 확인
- 타입 에러 없는지 확인

## 타입 변경 사항

### SWR → Tanstack Query 타입 매핑

```typescript
// SWR
SWRResponse<Data, Error>
- data?: Data
- error?: Error
- isLoading: boolean
- mutate: () => Promise<Data>

// Tanstack Query
UseQueryResult<Data, Error>
- data?: Data
- error?: Error
- isLoading: boolean
- refetch: () => Promise<QueryObserverResult<Data, Error>>
```

### 페이지에서 사용 예시

```typescript
// Before (SWR)
const { data, error, mutate } = SonamuUIService.useEntities();
// 갱신: mutate()

// After (Tanstack Query)
const { data, error, refetch } = SonamuUIService.useEntities();
// 갱신: refetch()
```

## 잠재적 이슈 및 해결방안

### 1. Conditional Fetching

**SWR:**

```typescript
useSWR(shouldFetch ? key : null);
```

**Tanstack Query:**

```typescript
useQuery({ queryKey, queryFn, enabled: shouldFetch });
```

### 2. POST 요청을 Query로 사용하는 경우

- `useScaffoldingStatus`는 POST 요청이지만 Query처럼 사용됨
- Tanstack Query에서도 동일하게 useQuery 사용 가능 (queryFn에서 POST 호출)

### 3. 전역 캐시 무효화

**필요한 경우:**

```typescript
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();
queryClient.invalidateQueries({ queryKey: ["entities"] });
```

## 테스트 계획

### 1. 기능 테스트

- [ ] Entity 목록 로딩 확인
- [ ] Entity CRUD 후 자동 갱신 확인
- [ ] Migration 상태 조회 및 실행 확인
- [ ] Scaffolding 상태 조회 및 생성 확인
- [ ] Fixture import/export 확인

### 2. 성능 테스트

- [ ] 초기 로딩 시간
- [ ] 캐싱 동작 확인
- [ ] 자동 리페치 동작 확인

### 3. 에러 핸들링

- [ ] 네트워크 에러 처리
- [ ] Retry 동작 확인
- [ ] SonamuError 처리 확인

## 체크리스트

- [ ] STEP 1: Tanstack Query 의존성 추가 및 Provider 설정
- [ ] STEP 2: sonamu-ui.service.ts 4개 훅 마이그레이션
- [ ] STEP 3: 페이지 파일 수정 (mutate → refetch)
- [ ] STEP 4: sonamu.shared.ts에서 SWR fetcher 제거
- [ ] STEP 5: 모든 import 문 정리
- [ ] STEP 6: swr 패키지 제거
- [ ] 빌드 성공 확인
- [ ] 기능 테스트 통과 확인

## 예상 작업 시간

- STEP 1-2: 30분
- STEP 3: 30분 (페이지별 확인)
- STEP 4-6: 15분
- 테스트: 30분

**총 예상 시간: 약 2시간**
