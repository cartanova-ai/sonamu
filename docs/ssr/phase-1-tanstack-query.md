# Phase 1: Tanstack Query 기반 다지기

> **목표**: SWR을 Tanstack Query로 전환하고 services.generated.ts 단일 파일 구조 구축

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
  ) => queryOptions({
    queryKey: ['getUser', subset, id],
    queryFn: () => getUser(subset, id)  // ← axios 함수 재사용
  });
  
  // 3. useQuery hook (clients에 'tanstack-query' 포함 시)
  export const useUser = <T extends UserSubsetKey>(
    subset: T,
    id: number
  ) => useQuery(getUserQueryOptions(subset, id));
  
  // 4. useMutation hook (clients에 'tanstack-mutation' 포함 시)
  export async function save(spa: UserSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/user/save`,
      data: { spa },
    });
  }
  
  export const useSaveMutation = () => useMutation({
    mutationFn: (spa: UserSaveParams[]) => save(spa)
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
    httpMethod: 'GET',
    clients: ['axios', 'tanstack-query']  // ← queryOptions + useQuery 생성
  })
  async findById<T extends UserSubsetKey>(
    subset: T,
    id: number
  ): Promise<UserSubsetMapping[T]> {
    // ...
  }
  
  @api({ 
    httpMethod: 'POST',
    clients: ['axios', 'tanstack-mutation']  // ← useMutation 생성
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './admin-common/auth';
import { loadDynamicRoutes } from '@sonamu-kit/react-sui';
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

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
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
import { queryOptions, useQuery, useMutation } from '@tanstack/react-query';
import type { UserSubsetKey, UserSubsetMapping } from './sonamu.generated';
import { fetch } from './sonamu.shared';
import qs from 'qs';

export namespace UserService {
  // axios 함수
  export async function getUser<T extends UserSubsetKey>(
    subset: T,
    id: number,
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
  ) => queryOptions({
    queryKey: ['getUser', subset, id],
    queryFn: () => getUser(subset, id)
  });
  
  // useQuery hook
  export const useUser = <T extends UserSubsetKey>(
    subset: T,
    id: number
  ) => useQuery(getUserQueryOptions(subset, id));
}
```

### 테스트

기존 SWR 사용 페이지 하나를 수정:

```tsx
// Before (SWR)
import { UserService } from '@/services/user/user.service';
const { data: user } = UserService.useUser('A', userId);

// After (Tanstack Query)
import { UserService } from '@/services/user-test';
const { data: user } = UserService.useUser('A', userId);
```

### 확인 사항
- [ ] QueryClient 정상 설정
- [ ] useUser hook 정상 동작
- [ ] React Query Devtools에서 쿼리 확인
- [ ] 데이터 캐싱 동작 확인

---

## 1.2 Sonamu에 clients 옵션 추가

### ApiDecoratorOptions 타입 확장

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/types/types.ts`

```typescript
export const ApiDecoratorOptions = z.object({
  httpMethod: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  resourceName: z.string().optional(),
  guards: z.array(z.string()).optional(),
  clients: z.array(z.enum(['axios', 'tanstack-query', 'tanstack-mutation'])).optional(),
  // ... 기존 옵션들
});
```

### 기본값 설정

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/api/decorators.ts`

```typescript
export function api(options: ApiDecoratorOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // 기본 clients 설정
    if (!options.clients) {
      if (options.httpMethod === 'GET') {
        options.clients = ['axios', 'tanstack-query'];
      } else {
        options.clients = ['axios', 'tanstack-mutation'];
      }
    }
    
    // ... 기존 로직
  };
}
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

  render({ }: TemplateOptions["services"]) {
    const { apis } = Sonamu.syncer;
    
    // 모델별로 그룹화
    const apisByModel = new Map<string, typeof apis>();
    for (const api of apis) {
      const modelName = api.modelName.replace(/Model$/, '').replace(/Frame$/, '');
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
        const typeParamsDef = typeParametersAsTsType ? `<${typeParametersAsTsType}>` : "";
        
        const paramsDef = apiParamToTsCode(paramsWithoutContext, importKeys);
        const returnTypeDef = apiParamTypeToTsType(
          assertDefined(unwrapPromiseOnce(api.returnType)),
          importKeys
        );
        
        const paramNames = paramsWithoutContext.map(p => p.name).join(', ');
        const dataOrParams = api.options.httpMethod === 'GET' ? 'params' : 'data';
        const hasParams = paramsWithoutContext.length > 0;
        
        // 1. axios 함수 (항상 생성)
        functions.push(`
  export async function ${api.methodName}${typeParamsDef}(${paramsDef}): Promise<${returnTypeDef}> {
    return fetch({
      method: "${api.options.httpMethod}",
      url: \`${api.route}${api.options.httpMethod === 'GET' && hasParams ? '?${qs.stringify({' + paramNames + '})}' : ''}\`,
      ${api.options.httpMethod !== 'GET' && hasParams ? `${dataOrParams}: { ${paramNames} },` : ''}
    });
  }
        `.trim());
        
        const clients = api.options.clients || [];
        
        // 2. queryOptions + useQuery (tanstack-query)
        if (clients.includes('tanstack-query')) {
          const hookName = api.options.resourceName
            ? inflection.camelize(api.options.resourceName, true)
            : inflection.camelize(api.methodName, true);
          
          functions.push(`
  export const ${api.methodName}QueryOptions = ${typeParamsDef}(${paramsDef}) => queryOptions({
    queryKey: ['${api.methodName}'${paramNames ? `, ${paramNames}` : ''}],
    queryFn: () => ${api.methodName}(${paramNames})
  });
          `.trim());
          
          functions.push(`
  export const use${inflection.camelize(hookName)} = ${typeParamsDef}(${paramsDef}) => 
    useQuery(${api.methodName}QueryOptions(${paramNames}));
          `.trim());
        }
        
        // 3. useMutation (tanstack-mutation)
        if (clients.includes('tanstack-mutation')) {
          const hookName = inflection.camelize(api.methodName);
          const mutationParamType = paramsWithoutContext.length > 0
            ? `{ ${paramsWithoutContext.map(p => `${p.name}: ${apiParamTypeToTsType(p.type, [])}`).join(', ')} }`
            : 'void';
          const mutationParamNames = paramsWithoutContext.length > 0
            ? paramsWithoutContext.map(p => `params.${p.name}`).join(', ')
            : '';
          
          functions.push(`
  export const use${hookName}Mutation = ${typeParamsDef}() => useMutation({
    mutationFn: (params: ${mutationParamType}) => ${api.methodName}(${mutationParamNames})
  });
          `.trim());
        }
      }
      
      namespaces.push(`
export namespace ${modelName}Service {
${functions.join('\n\n')}
}
      `.trim());
    }
    
    return {
      ...this.getTargetAndPath(),
      body: namespaces.join('\n\n'),
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
  await generateTemplate('services', {});
}
```

### 확인 사항
- [ ] User 모델 재생성 (`pnpm sonamu sync`)
- [ ] `services.generated.ts` 파일 생성 확인
- [ ] namespace 구조 확인
- [ ] TypeScript 타입 에러 없음

---

## 1.4 miomock 전체 모델 전환

### 작업 순서

1. **API에 clients 옵션 명시**:

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

2. **모든 entity 재생성**:
```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/api
pnpm sonamu sync
```

3. **기존 SWR 코드를 Tanstack Query로 전환**:

**변환 패턴 1: Query (GET)**
```tsx
// Before
import { UserService } from '@/services/user/user.service';
const { data } = UserService.useUser('A', userId);

// After
import { UserService } from '@/services/services.generated';
const { data } = UserService.useUser('A', userId);
```

**변환 패턴 2: Mutation (POST/PUT/DELETE)**
```tsx
// Before
import { UserService } from '@/services/user/user.service';
const handleSave = async () => {
  await UserService.save(params);
  mutate();
};

// After
import { UserService } from '@/services/services.generated';
const { mutate: save } = UserService.useSaveMutation();
const handleSave = () => {
  save(params, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['getUser'] });
    }
  });
};
```

4. **변환 대상**:
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
- [ ] services.generated.ts 정상 생성
- [ ] 모든 페이지에서 SWR import 제거
- [ ] 모든 페이지에서 Tanstack Query hooks 사용
- [ ] CRUD 기능 전체 정상 동작
- [ ] 네트워크 탭에서 중복 요청 없음 (캐싱 동작)
- [ ] React Query Devtools에서 쿼리 상태 확인

---

## 완료 체크리스트

- [ ] miomock-web에 Tanstack Query 수동 적용
- [ ] Sonamu에 clients 옵션 추가
- [ ] services.template.ts 생성
- [ ] TemplateKey 추가
- [ ] Syncer 수정
- [ ] miomock API에 clients 옵션 명시
- [ ] miomock 전체 모델 전환
- [ ] SWR 제거
- [ ] sonamu.shared.ts 정리
- [ ] 기존 서비스 폴더 제거

---

다음: [Phase 2: Tanstack Router 적용](./phase-2-tanstack-router.md)
