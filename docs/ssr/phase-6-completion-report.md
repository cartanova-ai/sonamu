# Phase 6 완료 리포트

> **커밋**: `06d00ba8` - [sonamu] feat: SSR 통합 Phase6
> **날짜**: 2025-12-27
> **변경 파일**: 7개 (156 additions, 40 deletions)

---

## 개요

Phase 6는 **Production 환경에서 SSR을 지원**하기 위한 작업입니다. Phase 3-5에서 구축한 Dev 환경 SSR을 기반으로, Production에서 빌드된 결과물을 사용하여 SSR을 제공하도록 확장했습니다.

핵심은 **`renderSSR` 함수의 dev/prod 통합**과 **`setupStaticWebServer`의 SSR 지원 추가**입니다.

---

## 주요 변경 사항

### 1. Web 빌드 설정 (Client/Server 분리)

#### 1.1 `vite.config.ts` - 함수형 설정으로 변경

**목적**: Client 빌드와 SSR 빌드를 다르게 설정

```typescript
export default defineConfig(({ isSsrBuild }) => ({
  // ... plugins, resolve, server ...
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: isSsrBuild
        ? {}  // SSR 빌드: manualChunks 사용 안 함
        : {
            manualChunks: {  // Client 빌드: vendor splitting
              "vendor-react": ["react", "react-dom"],
              "vendor-tanstack": ["@tanstack/react-query", "@tanstack/react-router"],
            },
          },
    },
  },
  ssr: {
    noExternal: true, // 모든 의존성을 번들에 포함
  },
}));
```

**핵심 변경**:
- `isSsrBuild` 파라미터로 빌드 타입 구분
- SSR 빌드 시 `manualChunks` 제외 (external 충돌 방지)
- **`ssr.noExternal: true`**: 모든 의존성을 번들에 포함하여 자체 완결적인 SSR entry 생성

**이유**:
- API 프로젝트와 Web 프로젝트가 분리되어 있음
- SSR entry가 API 쪽으로 복사되어 실행되므로, Web의 node_modules를 찾을 수 없음
- 따라서 모든 의존성(react, react-dom 등)을 SSR 번들에 포함시켜야 함

#### 1.2 `package.json` - 빌드 스크립트 분리

```json
{
  "scripts": {
    "build": "pnpm build:client && pnpm build:server",
    "build:client": "tsc && vite build --outDir dist/client",
    "build:server": "vite build --ssr src/entry-server.generated.tsx --outDir dist/server"
  }
}
```

**결과**:
- `web/dist/client/` - 클라이언트 번들 (index.html, assets/)
- `web/dist/server/` - SSR entry (entry-server.generated.js)

---

### 2. API 빌드 설정 (Web 결과물 복사)

#### 2.1 `.gitignore` - web-dist 추가

```diff
  dist/*
  .env
+ web-dist
```

#### 2.2 `package.json` - 복사 경로 변경

```json
{
  "scripts": {
    "build": "pnpm build:web && sonamu build",
    "build:web": "cd ../web && pnpm build && cd ../api && cp -r ../web/dist web-dist"
  }
}
```

**복사 결과**:
- `api/web-dist/client/` - 클라이언트 정적 파일 (index.html, assets/)
- `api/web-dist/server/` - SSR entry (entry-server.generated.js)

---

### 3. renderer.ts - Dev/Prod 통합

**목적**: `renderSSR` 함수를 dev와 prod 모두에서 사용

#### 3.1 vite 파라미터 optional로 변경

```typescript
export async function renderSSR(
  url: string,
  route: SSRRoute,
  params: Record<string, string>,
  request: FastifyRequest,
  reply: FastifyReply,
  config: SonamuFastifyConfig,
  vite?: ViteDevServer,  // optional
): Promise<string>
```

#### 3.2 Dev/Prod 분기 처리

```typescript
let template: string;
let render: (url: string, preloadedData: PreloadedData[]) => Promise<{ html: string; dehydratedState: unknown }>;

if (vite) {
  // Dev: Vite Dev Server 사용
  const fs = await import("node:fs/promises");
  const indexHtmlPath = path.join(vite.config.root, "index.html");
  template = await fs.readFile(indexHtmlPath, "utf-8");
  template = await vite.transformIndexHtml(url, template);
  const entryModule = await vite.ssrLoadModule("/src/entry-server.generated.tsx");
  render = entryModule.render;
} else {
  // Prod: 빌드된 파일 사용
  const fs = await import("node:fs");
  const webDistPath = path.join(Sonamu.apiRootPath, "web-dist", "client");
  const ssrPath = path.join(Sonamu.apiRootPath, "web-dist", "server");

  template = fs.readFileSync(path.join(webDistPath, "index.html"), "utf-8");
  const entryModule = await import(path.join(ssrPath, "entry-server.generated.js"));
  render = entryModule.render;
}
```

**핵심 차이점**:

| 항목 | Dev | Prod |
|------|-----|------|
| template | Vite가 변환 (`transformIndexHtml`) | 빌드된 index.html 그대로 사용 |
| entry | Vite가 동적 로드 (`ssrLoadModule`) | 빌드된 JS 파일 import |
| 경로 | web 프로젝트 소스 | api/web-dist/client, api/web-dist/server |
| CSS | 별도 링크 추가 필요 | index.html에 이미 포함 |

#### 3.3 CSS 처리 조건부 추가

```typescript
const devCssLinks = vite ? `<link rel="stylesheet" href="/src/styles/tailwind.css" />` : "";
```

Dev에서만 CSS 링크 추가 (Prod는 빌드 시 index.html에 포함됨)

---

### 4. setupStaticWebServer - SSR 지원 추가

**목적**: Production 환경에서 SSR 제공

#### 4.1 경로 설정 및 SSR 가용성 체크

```typescript
// 경로 명확화: api/web-dist/client, api/web-dist/server
const webDistPath = path.join(this.apiRootPath, "web-dist", "client");
const ssrPath = path.join(this.apiRootPath, "web-dist", "server");

if (!fs.existsSync(webDistPath)) {
  console.warn(`⚠ Web dist not found: ${webDistPath}`);
  return;
}

// SSR entry 존재 여부 확인
const ssrEntryPath = path.join(ssrPath, "entry-server.generated.js");
const ssrAvailable = fs.existsSync(ssrEntryPath);

if (!ssrAvailable) {
  console.warn(`⚠ SSR entry not found: ${ssrEntryPath}`);
  console.warn("  SSR will be disabled. Only CSR will work.");
}
```

#### 4.2 SSR 라우트 동적 로드

```typescript
// SSR 라우트 로드 (production에서만, 사용자 프로젝트의 ssr/routes.ts)
if (ssrAvailable) {
  const ssrRoutesPath = path.join(this.apiRootPath, "dist", "ssr", "routes.js");
  if (fs.existsSync(ssrRoutesPath)) {
    await import(ssrRoutesPath);
    console.log("✓ SSR routes loaded");
  } else {
    console.warn(`⚠ SSR routes not found: ${ssrRoutesPath}`);
  }
}
```

**중요**:
- Dev에서는 HMR을 위해 정적 import 사용 안 함
- Prod에서만 빌드된 `api/dist/ssr/routes.js`를 동적 import
- import 시점에 `registerSSR()` 호출이 실행됨

#### 4.3 롤링 업데이트 대응 (Asset 서빙)

```typescript
server.get("/assets/:filename", async (request, reply) => {
  const requestedFile = (request.params as { filename: string }).filename;
  const assetsDir = path.join(webDistPath, "assets");

  // index-*.js 또는 index-*.css 요청인 경우
  if (/^index-[a-f0-9]+\.(js|css)$/.test(requestedFile)) {
    const ext = requestedFile.split(".").pop();
    const files = fs.readdirSync(assetsDir);
    const currentFile = files.find((f) => f.startsWith("index-") && f.endsWith(`.${ext}`));

    if (currentFile) {
      const filePath = path.join(assetsDir, currentFile);
      const content = fs.readFileSync(filePath);
      reply.type(ext === "js" ? "application/javascript" : "text/css");
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      return reply.send(content);
    }
  }

  // 일반 파일 서빙
  const filePath = path.join(assetsDir, requestedFile);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath);
    const ext = requestedFile.split(".").pop();
    reply.type(ext === "js" ? "application/javascript" : ext === "css" ? "text/css" : "");
    if (requestedFile.includes("-")) {
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
    }
    return reply.send(content);
  }

  reply.code(404).send("Not found");
});
```

**목적**:
- 무중단 배포 시 asset hash 불일치 문제 해결
- 클라이언트가 요청한 hash와 다르면 현재 버전의 파일 서빙

#### 4.4 SSR/CSR Fallback 처리

```typescript
server.setNotFoundHandler(async (request, reply) => {
  // /api, /sonamu-ui는 404 그대로
  if (request.url.startsWith("/api") || request.url.startsWith("/sonamu-ui")) {
    reply.code(404).send({ error: "Not Found" });
    return;
  }

  const url = request.url;

  // SSR 라우트 체크
  if (ssrAvailable) {
    const { matchSSRRoute } = await import("../ssr");
    const match = matchSSRRoute(url);

    if (match) {
      try {
        // renderSSR 재사용 (vite 없이 호출 = production 모드)
        const { renderSSR } = await import("../ssr/renderer");
        const html = await renderSSR(url, match.route, match.params, request, reply, config);
        reply.type("text/html").send(html);
        return;
      } catch (e) {
        console.error("[SSR Error]", {
          url: request.url,
          route: match.route.path,
          error: e instanceof Error ? e.message : String(e),
          timestamp: new Date().toISOString(),
        });
        // CSR로 fallback
      }
    }
  }

  // CSR fallback (SSR 실패 시 또는 SSR 라우트가 아닌 경우)
  const indexPath = path.join(webDistPath, "index.html");
  const html = fs.readFileSync(indexPath, "utf-8");
  reply.type("text/html").send(html);
});
```

**핵심 로직**:
1. API 경로는 404 처리
2. SSR 라우트 매칭 시도
3. 매칭 성공 → `renderSSR()` 호출 (vite 파라미터 없음 = prod)
4. 매칭 실패 또는 에러 → CSR fallback

---

## 아키텍처 다이어그램

### Production 빌드 플로우

```
┌─────────────┐
│ web/        │
│  src/       │  pnpm build:client (vite build)
│  ├─routes/  │ ────────────────────────────────► dist/client/
│  └─entry-*  │                                    ├─index.html
└─────────────┘                                    └─assets/
       │
       │ pnpm build:server (vite build --ssr)
       ▼
  dist/server/
  └─entry-server.generated.js
       │
       │ cp (build:web)
       ▼
┌─────────────────────────┐
│ api/                    │
│  └─web-dist/           │ ◄─── web/dist/ 미러
│     ├─client/          │ ◄─── web/dist/client/*
│     │  ├─index.html    │
│     │  └─assets/       │
│     └─server/          │ ◄─── web/dist/server/*
│        └─entry-server.*│
└─────────────────────────┘
```

### Production 실행 플로우

```
Request: GET /admin/companies
       │
       ▼
setupStaticWebServer.setNotFoundHandler()
       │
       ├─ matchSSRRoute(url) ──► ssrRoutes 확인
       │                          (api/dist/ssr/routes.js에서 등록)
       ▼
   match 성공?
       │
       ├─ Yes ──► renderSSR(url, route, params, request, reply, config)
       │          │
       │          ├─ preload() 실행 → SSRQuery[] 획득
       │          ├─ invokeApiForSSR() → 데이터 로드
       │          ├─ import(api/web-dist/server/entry-server.generated.js)
       │          ├─ render(url, preloadedData) → HTML 생성
       │          └─ template 치환 → 최종 HTML 반환
       │
       └─ No/Error ──► CSR fallback
                       (api/web-dist/client/index.html 반환)
```

---

## 핵심 개념 정리

### 1. Dev vs Prod 차이점

| 항목 | Dev (setupViteDevServer) | Prod (setupStaticWebServer) |
|------|--------------------------|------------------------------|
| **Web Server** | Vite Dev Server | Fastify 정적 파일 서빙 |
| **SSR Entry** | 소스에서 동적 로드 | 빌드된 JS import |
| **Template** | Vite 변환 | 빌드된 HTML 사용 |
| **HMR** | 지원 | 없음 |
| **SSR Routes** | 정적 import 불가 | 빌드된 파일 동적 import |
| **renderSSR 호출** | `vite` 파라미터 전달 | `vite` 없이 호출 |

### 2. 왜 `ssr.noExternal: true`가 필요한가?

**문제 상황**:
```
api/web-dist/server/entry-server.generated.js
  └─ import { jsx } from "react/jsx-runtime"  ❌ Cannot find package 'react'
```

- API 프로젝트에는 `react`가 없음 (Web 프로젝트에만 존재)
- SSR entry가 API 쪽으로 복사되어 실행되므로 `react`를 찾을 수 없음

**해결책**:
```typescript
ssr: {
  noExternal: true  // 모든 의존성을 번들에 포함
}
```

- Vite가 `react`, `react-dom`, `@tanstack/*` 등 모든 의존성을 SSR 번들에 포함
- 결과물이 자체 완결적이 되어 외부 node_modules 불필요

### 3. 왜 `api/web-dist/` 경로를 사용하는가?

**디렉토리 구조**:
```
api/
├─ src/          # API 소스 코드
├─ dist/         # API 빌드 결과물
│  └─ ...        # API TypeScript 컴파일 결과
│                # (+ SSR 라우트: dist/ssr/routes.js)
└─ web-dist/     # Web 빌드 미러 (배포용)
   ├─ client/    # 클라이언트 정적 파일 (= web/dist/client)
   └─ server/    # SSR 번들 (= web/dist/server)
```

**이유**:
- `web-dist/` = web 빌드 결과물의 미러 (gitignore)
- `web-dist/client/` = 클라이언트 정적 파일(HTML, CSS, JS) 서빙용
- `web-dist/server/` = SSR entry 실행용

---

## 테스트 결과

### 빌드 성공

```bash
# Web 빌드
> pnpm build:client
✓ built in 3.75s
dist/client/index.html                              0.63 kB
dist/client/assets/index-G0qahrnX.css              87.10 kB
dist/client/assets/vendor-tanstack-BvfneGWW.js    112.69 kB
dist/client/assets/vendor-react-DiAAtd1u.js       141.66 kB
dist/client/assets/index-C4GFOiZx.js            1,232.85 kB

> pnpm build:server
✓ built in 2.13s
dist/server/entry-server.generated.js  2,002.03 kB
```

### Production 실행 성공

```bash
$ LR=remote NODE_ENV=production pnpm start
✓ SSR routes loaded
✓ Static web server configured with SSR support
🌲 Server listening on http://localhost:10280
```

### SSR 동작 확인

```bash
$ curl -s http://localhost:10280/admin/companies | grep -A 5 "<title>"
<title>Miomock - Companies List</title>
```

실제 렌더링된 HTML이 반환됨! (CSR이었다면 `<!--app-html-->` 주석만 있었을 것)

---

## 남은 과제

### 1. SSR 성능 최적화
- 현재 SSR entry가 2MB로 큼
- Code splitting 고려 필요 (일부 의존성만 external로)

### 2. 에러 처리 개선
- SSR 에러 로깅 강화
- 부분적 CSR fallback (특정 컴포넌트만 실패 시)

### 3. 캐싱 전략
- SSR 결과 캐싱 (Redis 등)
- 정적 페이지는 빌드 타임 생성 (SSG) 고려

### 4. 롤링 업데이트 고도화
- Asset versioning 개선
- 클라이언트 자동 리로드 메커니즘

---

## 결론

Phase 6를 통해 Sonamu SSR 시스템이 **Dev와 Prod 모두 지원**하게 되었습니다.

**핵심 성과**:
1. ✅ `renderSSR` 함수 통합 (dev/prod 재사용)
2. ✅ Production 빌드 파이프라인 구축 (web → api 복사)
3. ✅ 자체 완결적 SSR 번들 (`ssr.noExternal: true`)
4. ✅ 롤링 업데이트 대응 (asset hash 불일치 처리)
5. ✅ SSR/CSR 자동 fallback

**다음 단계**: Phase 7 - 성능 최적화 및 모니터링
