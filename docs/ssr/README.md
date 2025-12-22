# Sonamu SSR 통합 프로젝트

> **작성일**: 2025-12-23 (수정)  
> **대상**: miomock (api + web)

## 프로젝트 목표

Sonamu의 백엔드 중심 철학을 유지하면서 SSR 기능을 통합:
- API 서버와 Web 서버를 단일 서버로 통합
- 개발자는 순수 CSR + React 멘탈 모델로 개발
- SSR이 필요한 일부 라우트에만 선택적 SSR 적용
- 프론트엔드/백엔드 프로젝트 분리 유지 (타입 안전성 확보)

## Phase별 문서

1. [Phase 1: Tanstack Query](./phase-1-tanstack-query.md)
2. [Phase 2: Tanstack Router](./phase-2-tanstack-router.md)
3. [Phase 3: 단일 서버 통합](./phase-3-single-server.md)
4. [Phase 4: SSR 기본 구조](./phase-4-ssr-structure.md)
5. [Phase 5: SSR 동작](./phase-5-ssr-implementation.md)
6. [Phase 6: Production 준비](./phase-6-production.md)

## 핵심 설계

### 1. services.generated.ts - 단일 파일 통합

**구조**:
```typescript
// web/src/services/services.generated.ts
export namespace UserService {
  // axios 함수 (항상 생성)
  export async function getUser(subset, id) { /* fetch */ }
  
  // queryOptions (clients: ['tanstack-query'])
  export const getUserQueryOptions = (subset, id) => queryOptions({
    queryKey: ['getUser', subset, id],
    queryFn: () => getUser(subset, id)  // ← axios 재사용
  });
  
  // React hook (clients: ['tanstack-query'])
  export const useUser = (subset, id) => useQuery(getUserQueryOptions(subset, id));
  
  // Mutation (clients: ['tanstack-mutation'])
  export const useSaveMutation = () => useMutation({
    mutationFn: save
  });
}
```

**사용**:
```typescript
import { UserService } from '@/services/services.generated';

// Query
const { data } = UserService.useUser('A', 1);

// Mutation
const { mutate } = UserService.useSaveMutation();
```

### 2. queries.generated.ts - SSR용 타입 안전한 preload 설정

**구조**:
```typescript
// api/src/queries.generated.ts
export namespace UserService {
  export const getUser = (subset, id): SSRQuery => ({
    query: 'UserService.getUserQueryOptions',  // 실제 호출될 함수명
    params: [subset, id]
  } as SSRQuery);
}
```

**사용**:
```typescript
// api/src/ssr/routes.ts
import { UserService } from '@/queries.generated';

registerSSR({
  path: '/users/:id',
  preload: (params) => [
    UserService.getUser('A', Number(params.id))  // ← 타입 체크 완벽!
  ]
});
```

### 3. entry-server.generated.tsx - 자동 생성되는 SSR 엔트리

**Sonamu가 생성**:
```typescript
// web/src/entry-server.generated.tsx
import * as Services from './services/services.generated';

export async function render(url, preloadConfig) {
  for (const { query, params } of preloadConfig) {
    const [namespace, method] = query.split('.');
    const queryOptions = Services[namespace][method](...params);
    await queryClient.prefetchQuery(queryOptions);
  }
  // ... 렌더링
}
```

### 4. 빌드 프로세스

```bash
# Web 빌드
cd web
pnpm build              # CSR 빌드 → dist/client
pnpm build:ssr          # SSR 빌드 → dist/server/entry-server.js

# API 빌드
cd api
pnpm build:web          # web 빌드 결과물 복사
pnpm build              # API 빌드
```

**결과 구조**:
```
api/
  public/
    web/                # CSR 빌드 결과물
      index.html
      assets/
  ssr/
    entry-server.js     # SSR 빌드 결과물
  dist/                 # API 빌드 결과물
```

## 프로젝트 구조

```
sonamu/
  examples/miomock/
    api/
      src/
        application/
          user/
            user.api.ts          # @api({ clients: [...] })
        ssr/
          routes.ts              # registerSSR()
        queries.generated.ts     # Sonamu 생성 (SSR용)
      public/
        web/                     # 빌드된 클라이언트 파일
      ssr/
        entry-server.js          # 빌드된 SSR 서버
    web/
      src/
        services/
          services.generated.ts  # Sonamu 생성 (Web용)
        entry-client.tsx
        entry-server.generated.tsx  # Sonamu 생성
        Main.tsx
      dist/
        client/                  # CSR 빌드
        server/                  # SSR 빌드
```

## 개발 흐름

### 1. API 작성 (clients 옵션 지정)

```typescript
// api/src/application/user/user.api.ts
class UserApi {
  @api({ 
    httpMethod: 'GET',
    clients: ['axios', 'tanstack-query']  // ← Query 생성
  })
  async findById(...) {}
  
  @api({ 
    httpMethod: 'POST',
    clients: ['axios', 'tanstack-mutation']  // ← Mutation 생성
  })
  async save(...) {}
}
```

### 2. Sonamu Sync

```bash
pnpm sonamu sync
```

**생성되는 파일**:
- `api/src/queries.generated.ts` - SSR용
- `web/src/services/services.generated.ts` - Web용
- `web/src/entry-server.generated.tsx` - SSR 엔트리

### 3. SSR 라우트 등록 (필요한 경우)

```typescript
// api/src/ssr/routes.ts
import { UserService } from '@/queries.generated';

registerSSR({
  path: '/users/:id',
  preload: (params) => [
    UserService.getUser('A', Number(params.id))
  ],
  head: (dehydratedState) => ({
    title: 'User Detail'
  })
});
```

### 4. 프론트엔드 개발 (순수 CSR 멘탈 모델)

```typescript
// web/src/pages/users/[id].tsx
import { UserService } from '@/services/services.generated';

function UserDetailPage() {
  const { id } = useParams();
  const { data: user } = UserService.useUser('A', Number(id));
  
  return <div>{user?.name}</div>;
}
```

## 라우팅 구조

```
http://localhost:10280
  ├─ /api/*              → Fastify API handlers
  ├─ /sonamu-ui/*        → Sonamu UI (static)
  ├─ /users/:id          → SSR (registerSSR 등록된 라우트)
  ├─ /employees          → CSR (등록 안 된 라우트)
  └─ /assets/*           → Static files
```

## 주요 특징

### 타입 안전성
- API 프로젝트에서 SSR preload 설정 시 완전한 타입 체크
- `queries.generated.ts`와 `services.generated.ts` 시그니처 동기화
- Branded Type (SSRQuery)으로 실수 방지

### 프로젝트 분리 유지
- api/web은 별개 tsconfig.json
- 각각 독립적인 빌드 프로세스
- 프론트엔드는 순수 React/CSR 코드만 작성

### 선택적 SSR
- SEO가 필요한 일부 라우트만 SSR
- 대부분의 페이지는 CSR로 동작
- 복잡도 최소화

### 단일 서버 운영
- 개발: 하나의 포트 (10280)
- 프로덕션: 하나의 인프라
- CORS 문제 없음

## 다음 단계

각 Phase 문서를 순서대로 진행하세요:
1. Phase 1에서 Tanstack Query 기반 구축
2. Phase 2에서 Tanstack Router 적용
3. Phase 3에서 단일 서버 통합 (CSR)
4. Phase 4에서 SSR 구조 생성
5. Phase 5에서 SSR 동작 구현
6. Phase 6에서 프로덕션 준비
