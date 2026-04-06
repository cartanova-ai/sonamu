# Phase 5: SSR 동작

> **목표**: SSR 렌더링 및 데이터 prefetch 구현

## 5.1 테스트용 SSR 라우트 등록

### 작업 위치

`/Users/minsangk/Development/sonamu/examples/miomock/api/src/ssr` (신규 폴더)

### 1. 폴더 생성

```bash
mkdir -p /Users/minsangk/Development/sonamu/examples/miomock/api/src/ssr
```

### 2. routes.ts 생성

```typescript
import { registerSSR } from "sonamu/ssr";
import { UserService } from "@/queries.generated";

// 테스트용: 홈페이지 SSR
registerSSR({
  path: "/",
  preload: () => [],
  head: () => ({
    title: "Miomock - Home",
  }),
});

// 테스트용: 사용자 상세 페이지 SSR
registerSSR({
  path: "/users/:id",
  preload: (params) => [
    UserService.getUser("A", Number(params.id)), // ← 타입 체크 완벽!
  ],
  head: (dehydratedState) => {
    // dehydratedState.queries에서 데이터 찾기
    const queries = Object.values(dehydratedState.queries || {});
    const userQuery = queries.find(
      (q: any) => q.queryKey?.[0] === "User" && q.queryKey?.[1] === "getUser",
    );
    const user = userQuery?.state?.data;

    return {
      title: user ? `User: ${user.name}` : "User",
      meta: [
        { property: "og:title", content: user?.name || "User" },
        { property: "og:type", content: "profile" },
      ],
    };
  },
});
```

### 사용 예시: 복수 데이터 preload

```typescript
import { UserService, EmployeeService } from "@/queries.generated";

registerSSR({
  path: "/dashboard/:userId",
  preload: (params) => {
    const userId = Number(params.userId);

    return [
      // 사용자 정보
      UserService.getUser("A", userId),

      // 사용자의 직원 목록
      EmployeeService.getEmployees("B", {
        userId,
        limit: 20,
      }),
    ];
  },
  head: (dehydratedState) => ({
    title: "Dashboard",
  }),
});
```

### 확인 사항

- [ ] 파일 생성 후 HMR로 자동 로드
- [ ] 콘솔에 'SSR config changed' 메시지 확인
- [ ] TypeScript에서 UserService.getUser 자동완성 동작
- [ ] 타입 에러 없음

---

## 5.2 renderSSR 함수 구현

### 작업 파일

`/Users/minsangk/Development/sonamu/modules/sonamu/src/ssr/renderer.ts` (신규)

### renderer.ts 생성

```typescript
import type { ViteDevServer } from "vite";
import type { FastifyRequest, FastifyReply } from "fastify";
import path from "path";
import type { SSRRoute, PreloadedData } from "./types";
import type { SonamuFastifyConfig } from "../types/types";

export async function renderSSR(
  url: string,
  route: SSRRoute,
  params: Record<string, string>,
  request: FastifyRequest,
  reply: FastifyReply,
  config: SonamuFastifyConfig,
  vite: ViteDevServer,
): Promise<string> {
  const { Sonamu } = await import("../api/sonamu");

  // 1. preload 실행 → SSRQuery[] 획득
  const preloadConfig = route.preload ? route.preload(params) : [];

  // 2. Sonamu.invokeApiForSSR로 API 직접 호출
  const preloadedData: PreloadedData[] = [];

  for (const { modelName, methodName, params: apiParams } of preloadConfig) {
    // ExtendedApi 찾기
    const api = Sonamu.syncer.apis.find(
      (a) => a.modelName === modelName && a.methodName === methodName,
    );

    if (!api) {
      console.warn(`API not found: ${modelName}.${methodName}`);
      continue;
    }

    try {
      // API 직접 호출 (HTTP 오버헤드 없음)
      const result = await Sonamu.invokeApiForSSR(api, apiParams, request, reply, config);

      // queryKey 생성: [엔티티명, 메소드명, ...파라미터]
      const entityName = modelName.replace("Model", "").replace("Frame", "");
      preloadedData.push({
        queryKey: [entityName, methodName, ...apiParams],
        data: result,
      });
    } catch (e) {
      console.error(`Failed to preload ${modelName}.${methodName}:`, e);
      // 에러 발생 시 해당 쿼리는 스킵 (CSR로 fallback)
    }
  }

  // 3. index.html 읽기
  const fs = await import("fs/promises");
  const indexHtmlPath = path.join(vite.config.root, "index.html");
  let template = await fs.readFile(indexHtmlPath, "utf-8");
  template = await vite.transformIndexHtml(url, template);

  // 4. entry-server 로드 및 렌더링
  const { render } = await vite.ssrLoadModule("/src/entry-server.generated.tsx");
  const { html: appHtml, dehydratedState } = await render(url, preloadedData);

  // 5. SSR 데이터 스크립트 생성
  const ssrDataScript = `
    <script>
      window.__SONAMU_SSR__ = ${JSON.stringify(dehydratedState).replace(/</g, "\\u003c")};
    </script>
  `;

  // 6. head 생성
  const headTags = route.head ? generateHeadTags(route.head(dehydratedState)) : "";

  // 7. 치환
  const html = template
    .replace("<!--app-head-->", headTags + "\n    " + ssrDataScript)
    .replace("<!--app-html-->", appHtml);

  return html;
}

function generateHeadTags(head: ReturnType<NonNullable<SSRRoute["head"]>>): string {
  const tags: string[] = [];

  if (head.title) {
    tags.push(`<title>${escapeHtml(head.title)}</title>`);
  }

  if (head.meta) {
    for (const meta of head.meta) {
      const attrs: string[] = [];
      if (meta.name) attrs.push(`name="${escapeHtml(meta.name)}"`);
      if (meta.property) attrs.push(`property="${escapeHtml(meta.property)}"`);
      attrs.push(`content="${escapeHtml(meta.content)}"`);
      tags.push(`<meta ${attrs.join(" ")} />`);
    }
  }

  return tags.join("\n    ");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

### ssr/index.ts에 export 추가

```typescript
export { renderSSR } from "./renderer";
export { registerSSR, getSSRRoutes, matchSSRRoute, clearSSRRoutes } from "./registry";
export type { SSRRoute, SSRQuery, PreloadConfig, PreloadedData } from "./types";
```

### 확인 사항

- [ ] TypeScript 컴파일 에러 없음
- [ ] 임포트 에러 없음

---

## 5.3 Sonamu withFastify에 SSR 렌더링 통합

### 작업 파일

`/Users/minsangk/Development/sonamu/modules/sonamu/src/api/sonamu.ts`

### withFastify 메서드의 Vite 미들웨어 부분 수정

```typescript
async withFastify(
  server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  config: SonamuFastifyConfig,
  options?: {
    enableSync?: boolean;
    doSilent?: boolean;
  },
) {
  // ... 기존 코드

  const { isLocal } = await import("../utils/controller");

  if (isLocal()) {
    // Dev 모드: Vite dev server
    const vite = await this.createViteDevServer();

    // Vite middleware 등록
    server.all('*', async (request, reply) => {
      // Sonamu UI는 skip
      if (request.url.startsWith('/sonamu-ui')) {
        return;
      }

      // API는 skip
      if (request.url.startsWith(this.config.api.route.prefix)) {
        return;
      }

      const url = request.url;

      // SSR 라우트 체크
      const { matchSSRRoute } = await import('../ssr');
      const match = matchSSRRoute(url);

      if (match) {
        // SSR 렌더링
        try {
          const { renderSSR } = await import('../ssr');
          const html = await renderSSR(
            url,
            match.route,
            match.params,
            request,
            reply,
            config,
            vite
          );
          reply.type('text/html').send(html);
          return;
        } catch (e) {
          console.error('SSR Error:', e);
          console.log('Falling back to CSR...');
          // fallback to CSR (아래 로직 실행)
        }
      }

      // CSR (기존 로직)
      try {
        const fs = await import('fs/promises');
        let template = await fs.readFile(
          path.join(vite.config.root, 'index.html'),
          'utf-8'
        );
        template = await vite.transformIndexHtml(url, template);

        reply.type('text/html').send(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        console.error(e);
        reply.status(500).send((e as Error).message);
      }
    });
  } else {
    // Production 모드 (Phase 6에서 구현)
    // ...
  }

  // API 라우팅 설정
  // ... 기존 코드
}
```

### 확인 사항

- [ ] TypeScript 컴파일 에러 없음
- [ ] 서버 재시작 에러 없음

---

## 5.4 SSR 동작 테스트

### 테스트 시나리오

#### 1. 서버 재시작

```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/api
pnpm dev
```

#### 2. 홈페이지 SSR 확인

```
http://localhost:10280/
```

**확인 사항**:

- [ ] View Source에서 HTML에 컨텐츠 포함
- [ ] title 태그: "Miomock - Home"
- [ ] React 정상 hydrate
- [ ] 콘솔 에러 없음

#### 3. 사용자 상세 페이지 SSR 확인

```
http://localhost:10280/users/1
```

**확인 사항**:

- [ ] View Source에서 사용자 데이터 포함
- [ ] title 태그: "User: [사용자명]"
- [ ] og:title meta 태그 존재
- [ ] window.**SONAMU_SSR** 확인 (개발자 도구)
- [ ] 네트워크 탭: `/api/user/findById` 요청 없음 (SSR에서 처리됨)

#### 4. 개발자 도구 확인

```javascript
// 콘솔에서
window.__SONAMU_SSR__;
// 확인: { queries: { ... }, mutations: { ... } }

// queries 내부 구조 확인
Object.keys(window.__SONAMU_SSR__.queries);
// 확인: queryHash 목록

// 특정 쿼리 데이터 확인
const queries = Object.values(window.__SONAMU_SSR__.queries);
queries.find((q) => q.queryKey[0] === "User");
```

#### 5. Hydration 확인

**체크 포인트**:

- [ ] 페이지 로드 후 즉시 interactive
- [ ] React Query Devtools에서 캐시된 데이터 확인
- [ ] 네트워크 탭에서 중복 요청 없음
- [ ] 브라우저 콘솔에 hydration 에러 없음
- [ ] 버튼 클릭 등 interaction 정상 동작

#### 6. 비SSR 라우트 확인

```
http://localhost:10280/employees
```

**확인 사항**:

- [ ] CSR로 정상 동작
- [ ] View Source에는 빈 HTML (`<!--app-html-->`)
- [ ] 클라이언트에서 데이터 fetch
- [ ] React Query Devtools에서 쿼리 상태 확인

### 네트워크 흐름 분석

#### SSR 라우트 (/users/1)

```
1. 브라우저 → GET /users/1
2. Sonamu → SSR 렌더링
   2-1. registerSSR의 preload 실행
   2-2. Sonamu.invokeApiForSSR로 UserModel.findById 직접 호출 (ALS로 Context 주입)
   2-3. QueryClient.setQueryData로 데이터 주입
   2-4. React 렌더링
   2-5. dehydrate
3. Sonamu → HTML 응답 (데이터 포함)
4. 브라우저 → Hydrate (추가 요청 없음)
```

**장점 확인**:

- ✅ HTTP 오버헤드 없음 (서버 내부에서 직접 Model 호출)
- ✅ 세션 정보 자동 동기화 (ALS 활용)

#### CSR 라우트 (/employees)

```
1. 브라우저 → GET /employees
2. Sonamu → 빈 HTML 응답
3. 브라우저 → React 마운트
4. 브라우저 → GET /api/employee/findMany
5. 브라우저 → 데이터 렌더링
```

### 디버깅 팁

**SSR 에러 발생 시**:

1. 콘솔에서 에러 메시지 확인
2. `import.meta.env.SSR` 체크 누락 확인
3. Browser API 사용 여부 확인 (window, document 등)
4. invokeApiForSSR의 파라미터 매핑 확인
5. Context 파라미터 위치 확인

**Hydration mismatch 발생 시**:

1. 서버와 클라이언트 렌더링 결과 비교
2. 조건부 렌더링 제거 (useEffect로 이동)
3. 동일한 초기 상태 보장
4. Date.now() 같은 비결정적 값 제거

**타입 에러 발생 시**:

1. queries.generated.ts 재생성 확인
2. modelName, methodName 정확한지 확인
3. params 배열 순서 확인 (Context 제외)

**데이터가 안 나올 때**:

1. registerSSR의 preload 함수 리턴값 확인
2. Sonamu.syncer.apis에서 API 찾아지는지 확인
3. invokeApiForSSR 에러 로그 확인
4. dehydratedState에 데이터 들어있는지 확인

### 확인 사항

- [ ] SSR 라우트에서 HTML에 컨텐츠 포함
- [ ] head 태그 정상 렌더링
- [ ] preload된 데이터로 초기 렌더링
- [ ] hydration 에러 없음
- [ ] 이후 네비게이션 정상 동작
- [ ] 비SSR 라우트는 CSR로 동작
- [ ] 개발자 도구에서 데이터 흐름 확인
- [ ] HTTP 오버헤드 없음 확인 (서버 로그)

---

## 5.5 SSR 라우트 추가 예시

### 복잡한 페이지 예시

```typescript
// api/src/ssr/routes.ts
import { UserService, ProjectService, CommentService } from "@/queries.generated";

registerSSR({
  path: "/projects/:projectId",
  preload: (params) => {
    const projectId = Number(params.projectId);

    return [
      // 프로젝트 정보
      ProjectService.getProject("A", projectId),

      // 프로젝트 멤버들
      UserService.getUsers("B", {
        projectId,
        limit: 20,
      }),

      // 최근 댓글
      CommentService.getComments("C", {
        projectId,
        limit: 10,
        orderBy: "createdAt:desc",
      }),
    ];
  },
  head: (dehydratedState) => {
    const queries = Object.values(dehydratedState.queries || {});
    const projectQuery = queries.find(
      (q: any) => q.queryKey?.[0] === "Project" && q.queryKey?.[1] === "getProject",
    );
    const project = projectQuery?.state?.data;

    return {
      title: project ? `${project.name} - Projects` : "Project",
      meta: [
        { property: "og:title", content: project?.name || "Project" },
        { property: "og:description", content: project?.description || "" },
        { property: "og:type", content: "website" },
      ],
    };
  },
});
```

### 인증이 필요한 페이지

```typescript
registerSSR({
  path: "/my/profile",
  preload: (params) => [
    // ALS를 통해 Context가 자동 주입되므로
    // 현재 로그인한 사용자 정보를 가져올 수 있음
    UserService.getMe(),
  ],
  head: (dehydratedState) => {
    const queries = Object.values(dehydratedState.queries || {});
    const meQuery = queries.find(
      (q: any) => q.queryKey?.[0] === "User" && q.queryKey?.[1] === "getMe",
    );
    const me = meQuery?.state?.data;

    return {
      title: me ? `${me.name}'s Profile` : "My Profile",
    };
  },
});
```

### 조건부 preload

```typescript
registerSSR({
  path: "/dashboard",
  preload: (params) => {
    // URL에서 query string 추출 불가능하므로
    // 기본 데이터만 preload
    return [UserService.getMe(), ProjectService.getProjects("A", { limit: 10 })];
  },
});
```

---

## 완료 체크리스트

- [ ] 테스트용 SSR 라우트 등록
- [ ] renderSSR 함수 구현
- [ ] withFastify에 SSR 통합
- [ ] SSR 동작 테스트
- [ ] Hydration 확인
- [ ] 에러 핸들링 확인
- [ ] HTTP 오버헤드 없음 확인
- [ ] 세션 동기화 확인
- [ ] 추가 SSR 라우트 작성 (선택)

---

이전: [Phase 4: SSR 기본 구조](./phase-4-ssr-structure.md)  
다음: [Phase 6: Production 준비](./phase-6-production.md)
