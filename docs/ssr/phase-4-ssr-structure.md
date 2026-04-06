# Phase 4: SSR 기본 구조

> **목표**: SSR 렌더링 파이프라인 구축 및 타입 안전한 preload 설정 구조

## 핵심 설계 변경

### SSR 데이터 로딩 방식

**기존 계획 (HTTP 경유):**

```
registerSSR → preloadConfig 생성
→ entry-server.js에서 web의 Services 호출 (axios)
→ API 서버 HTTP 요청
→ queryClient.prefetchQuery
```

**새로운 방식 (직접 호출):**

```
registerSSR → preloadConfig 생성
→ Sonamu.invokeApiForSSR로 API Model 메소드 직접 호출
→ 결과를 entry-server.js에 전달
→ queryClient.setQueryData로 직접 주입
```

**장점:**

1. HTTP 오버헤드 제거 (서버 내부에서 직접 호출)
2. SonamuContext의 세션 정보 완벽 동기화 (ALS 활용)

---

## 4.1 Entry 파일 구조 생성

### 작업 위치

`/Users/minsangk/Development/sonamu/examples/miomock/web/src`

### 1. entry-client.tsx 생성

```tsx
import { QueryClient, QueryClientProvider, HydrationBoundary } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import Main from "./Main";
import { routeTree } from "./routeTree.gen";

// SSR 데이터 타입
declare global {
  interface Window {
    __SONAMU_SSR__?: any;
  }
}

// QueryClient 생성
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 3,
    },
  },
});

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

// Root element
const root = document.getElementById("root")!;

// SSR 데이터
const dehydratedState = window.__SONAMU_SSR__;

// SSR 데이터 있으면 hydrate, 없으면 render
if (root.innerHTML && dehydratedState) {
  ReactDOM.hydrateRoot(
    root,
    <Main queryClient={queryClient}>
      <HydrationBoundary state={dehydratedState}>
        <RouterProvider router={router} />
      </HydrationBoundary>
    </Main>,
  );
} else {
  ReactDOM.createRoot(root).render(
    <Main queryClient={queryClient}>
      <RouterProvider router={router} />
    </Main>,
  );
}
```

### 2. Main.tsx 생성 (커스터마이징 가능)

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AuthProvider } from "./admin-common/auth";

export default function Main({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: any;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### 3. entry-server.template.tsx 작성 (Sonamu가 생성할 템플릿)

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/template/implementations/entry-server.template.ts`

```typescript
import { Template } from "../template";
import type { TemplateOptions } from "../../types/types";

export class Template__entry_server extends Template {
  constructor() {
    super("entry-server");
  }

  getTargetAndPath() {
    return {
      target: ":target/src",
      path: `entry-server.generated.tsx`,
    };
  }

  render({}: TemplateOptions["entry-server"]) {
    const body = `
import { QueryClient, dehydrate } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { renderToString } from 'react-dom/server';
import Main from './Main';
import { routeTree } from './routeTree.gen';

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
  
  // Router 생성
  const router = createRouter({
    routeTree,
    context: { queryClient },
  });
  
  // 현재 URL로 router 초기화
  await router.load();
  
  // 렌더링
  const appHtml = renderToString(
    <Main queryClient={queryClient}>
      <RouterProvider router={router} />
    </Main>
  );
  
  return {
    html: appHtml,
    dehydratedState,
  };
}
    `.trim();

    return {
      ...this.getTargetAndPath(),
      body,
      importKeys: [],
      customHeaders: [],
    };
  }
}
```

### 4. index.html 수정 (플레이스홀더 추가)

```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
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

### 확인 사항

- [ ] entry-client.tsx 정상 동작 (CSR)
- [ ] Main.tsx 커스터마이징 가능
- [ ] entry-server.template.ts 작성 완료
- [ ] index.html 플레이스홀더 위치 확인

---

## 4.2 queries.generated.ts 구조 (API 프로젝트)

### SSRQuery 타입 정의

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/ssr/types.ts`

```typescript
// Branded type - 실수로 일반 객체 사용 방지
export type SSRQuery = {
  modelName: string; // 'UserModel'
  methodName: string; // 'findById'
  params: any[]; // [subset, id] - Context 제외한 실제 파라미터
} & { __brand: "SSRQuery" };

export type PreloadConfig = SSRQuery[];

export type SSRRoute = {
  path: string;
  preload?: (params: Record<string, string>) => PreloadConfig;
  head?: (dehydratedState: any) => {
    title?: string;
    meta?: Array<{ name?: string; property?: string; content: string }>;
  };
};

export type PreloadedData = {
  queryKey: any[];
  data: any;
};
```

### queries.template.ts 생성

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/template/implementations/queries.template.ts`

```typescript
import inflection from "inflection";
import { apiParamToTsCode, apiParamTypeToTsType } from "../../api/code-converters";
import { Sonamu } from "../../api/sonamu";
import { Template } from "../template";
import type { TemplateOptions } from "../../types/types";
import { ApiParamType } from "../../types/types";

export class Template__queries extends Template {
  constructor() {
    super("queries");
  }

  getTargetAndPath() {
    return {
      target: ":target/src",
      path: `queries.generated.ts`,
    };
  }

  render({}: TemplateOptions["queries"]) {
    const { apis } = Sonamu.syncer;

    // tanstack-query를 포함한 API만 필터링
    const queryApis = apis.filter((api) => api.options.clients?.includes("tanstack-query"));

    // 모델별로 그룹화
    const apisByModel = new Map<string, typeof queryApis>();
    for (const api of queryApis) {
      const modelName = api.modelName.replace(/Model$/, "").replace(/Frame$/, "");
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
            !(param.optional === true && param.name.startsWith("_")),
        );

        const typeParametersAsTsType = api.typeParameters
          .map((typeParam) => apiParamTypeToTsType(typeParam, importKeys))
          .join(", ");
        const typeParamsDef = typeParametersAsTsType ? `<${typeParametersAsTsType}>` : "";

        const paramsDef = apiParamToTsCode(paramsWithoutContext, importKeys);
        const paramNames = paramsWithoutContext.map((p) => p.name).join(", ");

        // getUser 형태로 생성 (실제로는 Model의 findById 호출)
        functions.push(
          `
  export const ${api.methodName} = ${typeParamsDef}(${paramsDef}): SSRQuery => ({
    modelName: '${api.modelName}',
    methodName: '${api.methodName}',
    params: [${paramNames}]
  } as SSRQuery);
        `.trim(),
        );
      }

      namespaces.push(
        `
export namespace ${modelName}Service {
${functions.join("\n\n")}
}
      `.trim(),
      );
    }

    return {
      ...this.getTargetAndPath(),
      body: namespaces.join("\n\n"),
      importKeys: [...new Set(importKeys)],
      customHeaders: [`import type { SSRQuery } from 'sonamu/ssr';`],
    };
  }
}
```

### TemplateKey 추가

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/types/types.ts`

```typescript
export const TemplateKey = z.enum([
  // ... 기존 것들
  "queries",
  "entry-server",
]);
```

### Syncer 수정

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/syncer/syncer.ts`

```typescript
if (diffGroups.entity.length > 0 || diffGroups.model.length > 0) {
  // ... 기존 로직

  // queries.generated.ts 재생성 (api 프로젝트)
  await generateTemplate("queries", {});

  // entry-server.generated.tsx 재생성 (web 프로젝트)
  await generateTemplate("entry-server", {});
}
```

### 확인 사항

- [ ] queries.generated.ts 생성 확인 (api 프로젝트)
- [ ] entry-server.generated.tsx 생성 확인 (web 프로젝트)
- [ ] TypeScript 타입 에러 없음
- [ ] namespace 구조 확인

---

## 4.3 Sonamu SSR 헬퍼 구현

### 작업 위치

`/Users/minsangk/Development/sonamu/modules/sonamu/src/ssr` (신규 폴더)

### 1. 폴더 생성

```bash
mkdir -p /Users/minsangk/Development/sonamu/modules/sonamu/src/ssr
```

### 2. types.ts

```typescript
export type SSRQuery = {
  modelName: string;
  methodName: string;
  params: any[];
} & { __brand: "SSRQuery" };

export type PreloadConfig = SSRQuery[];

export type SSRRoute = {
  path: string;
  preload?: (params: Record<string, string>) => PreloadConfig;
  head?: (dehydratedState: any) => {
    title?: string;
    meta?: Array<{ name?: string; property?: string; content: string }>;
  };
};

export type PreloadedData = {
  queryKey: any[];
  data: any;
};
```

### 3. registry.ts 생성

```typescript
import type { SSRRoute } from "./types";

const ssrRoutes: SSRRoute[] = [];

export function registerSSR(route: SSRRoute): void {
  ssrRoutes.push(route);
}

export function getSSRRoutes(): SSRRoute[] {
  return ssrRoutes;
}

export function clearSSRRoutes(): void {
  ssrRoutes.length = 0;
}

export function matchSSRRoute(
  url: string,
): { route: SSRRoute; params: Record<string, string> } | null {
  for (const route of ssrRoutes) {
    const params = matchPath(route.path, url);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
}

// 간단한 path matching
export function matchPath(pattern: string, url: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const urlParts = url.split("?")[0].split("/").filter(Boolean);

  if (patternParts.length !== urlParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const urlPart = urlParts[i];

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = urlPart;
    } else if (patternPart !== urlPart) {
      return null;
    }
  }

  return params;
}
```

### 4. index.ts 생성 (exports)

```typescript
export { registerSSR, getSSRRoutes, matchSSRRoute, clearSSRRoutes } from "./registry";
export type { SSRRoute, SSRQuery, PreloadConfig, PreloadedData } from "./types";
```

### 확인 사항

- [ ] TypeScript 컴파일 에러 없음
- [ ] 모듈 import 정상 동작

---

## 4.4 Sonamu에 invokeApiForSSR 추가

### 작업 파일

`/Users/minsangk/Development/sonamu/modules/sonamu/src/api/sonamu.ts`

### invokeApiForSSR 메소드 추가

기존 `createContext`, `invokeModelMethod`를 재사용하여 SSR 전용 API 호출 메소드 추가:

```typescript
/**
 * SSR용 API 호출 (HTTP 오버헤드 없이 직접 호출)
 * createApiHandler의 로직을 재사용하되, request 파싱 대신 params 직접 사용
 */
async invokeApiForSSR(
  api: ExtendedApi,
  params: any[],
  config: SonamuFastifyConfig,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<unknown> {
  // Context 생성 (기존 메소드 재사용)
  const context = await this.createContext(config, request, reply);

  // args 생성: Context 파라미터는 주입, 나머지는 params에서 가져오기
  const { ApiParamType } = await import("../types/types");
  let paramsIndex = 0;
  const args = api.parameters.map((param) => {
    if (ApiParamType.isContext(param.type)) {
      return context;
    }
    return params[paramsIndex++];
  });

  // 모델 메소드 호출 (기존 메소드 재사용)
  return this.invokeModelMethod(api, args, context, reply);
}
```

### 확인 사항

- [ ] TypeScript 컴파일 에러 없음
- [ ] createContext, invokeModelMethod 재사용 확인

---

## 4.5 Syncer에 autoloadSSRRoutes 추가

### 작업 파일

`/Users/minsangk/Development/sonamu/modules/sonamu/src/syncer/syncer.ts`

### 1. import 추가

```typescript
import { clearSSRRoutes } from "../ssr";
```

### 2. autoloadSSRRoutes 메서드 추가

```typescript
async autoloadSSRRoutes(): Promise<void> {
  const ssrConfigPath = path.join(Sonamu.apiRootPath, 'src/ssr');

  // 기존 routes 초기화
  clearSSRRoutes();

  // ssr 폴더 없으면 스킵
  if (!(await exists(ssrConfigPath))) {
    return;
  }

  // ssr 폴더 안의 모든 .ts 파일 로드
  const glob = (await import('glob')).glob;
  const files = await glob(`${ssrConfigPath}/**/*.ts`);

  for (const file of files) {
    try {
      await import(file);
    } catch (e) {
      console.error(`Failed to load SSR route: ${file}`, e);
    }
  }
}
```

### 3. init 메서드에 추가

```typescript
async init(
  doSilent: boolean = false,
  enableSync: boolean = true,
  apiRootPath?: AbsolutePath,
  forTesting: boolean = false,
) {
  // ... 기존 코드

  // SSR routes autoload 추가
  const { isLocal, isTest } = await import("../utils/controller");
  if (isLocal() && !isTest()) {
    await this.autoloadSSRRoutes();
  }

  // ... 기존 코드
}
```

### 4. syncFromWatcher에 SSR 파일 감지 추가

```typescript
async syncFromWatcher(event: string, filePath: AbsolutePath): Promise<void> {
  // ... 기존 코드

  // SSR 설정 파일 변경 감지
  if (filePath.includes('/src/ssr/')) {
    const chalk = (await import("chalk")).default;
    console.log(chalk.bold.yellow('SSR config changed - reloading...'));
    await this.autoloadSSRRoutes();
    await this.finishHMR();
    return;
  }

  // ... 기존 코드
}
```

### 확인 사항

- [ ] TypeScript 컴파일 에러 없음
- [ ] Sonamu 재시작 시 autoloadSSRRoutes 호출 확인

---

## 완료 체크리스트

- [ ] entry-client.tsx 생성
- [ ] entry-server.template.ts 생성
- [ ] Main.tsx 생성
- [ ] index.html 수정
- [ ] queries.template.ts 생성
- [ ] SSRQuery 타입 정의
- [ ] ssr 폴더 및 헬퍼 파일 생성
- [ ] Sonamu에 invokeApiForSSR 추가
- [ ] Syncer autoloadSSRRoutes 구현
- [ ] HMR 동작 확인

---

이전: [Phase 3: 단일 서버 통합](./phase-3-single-server.md)  
다음: [Phase 5: SSR 동작](./phase-5-ssr-implementation.md)
