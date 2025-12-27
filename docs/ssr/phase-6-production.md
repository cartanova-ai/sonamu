# Phase 6: Production 준비

> **목표**: 프로덕션 환경 빌드 설정 및 최적화

## 시작하기 전에: Phase 3-5 완료 상태 확인

Phase 3-5에서 다음 항목들이 **완전히 구현**되었습니다:

### ✅ Dev 모드 SSR (완료)

**구현된 메서드:** `setupViteDevServer()` ([sonamu.ts:388-487](../../modules/sonamu/src/api/sonamu.ts#L388-L487))

- Vite Dev Server 통합
- SSR 라우트 매칭 및 렌더링
- API 직접 호출 (`invokeApiForSSR()`)
- Preload 데이터 로딩
- SEO 메타 태그 생성
- Hydration 지원
- HMR 지원

### ✅ SSR 인프라 (완료)

- **SSR 라우트 등록 시스템** (`registry.ts`)
- **SSR 렌더러** (`renderer.ts`) - `generateHeadTags()`, `escapeHtml()` 포함
- **SSRQuery 생성 시스템** (`queries.generated.ts`)
- **Entry Server 템플릿** (`entry-server.generated.tsx`)

### 🎯 Phase 6의 목표

Phase 6는 **Production 환경 빌드 및 배포 설정**에 집중합니다.

Dev 모드에서 이미 동작하는 SSR 로직을 Production 환경에서도 사용할 수 있도록 빌드 설정을 추가하고, `setupStaticWebServer()` 메서드에 SSR 렌더링 로직을 추가합니다.

---

## 6.1 Web SSR 빌드 설정

### 현재 상태

**파일**: `web/vite.config.ts`

현재 vite.config.ts는 dev 모드용 기본 설정만 있습니다:
- plugins (react, tailwindcss, TanStackRouter)
- resolve (alias)
- server (dev server 설정)

Production 빌드를 위한 `build` 옵션이 **없습니다**.

### Vite 빌드 설정 추가

`build` 옵션을 추가하여 client/server 빌드를 분리합니다:

```typescript
export default defineConfig({
  // ... 기존 plugins, resolve, server 설정 유지

  // ➕ 추가: Production 빌드 설정
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-tanstack': [
            '@tanstack/react-query',
            '@tanstack/react-router'
          ],
        },
      },
    },
  },
});
```

**설정 설명:**
- `outDir: 'dist/client'`: 클라이언트 빌드 결과물 위치
- `emptyOutDir: true`: 빌드 전 기존 파일 삭제
- `manualChunks`: vendor 라이브러리를 별도 chunk로 분리하여 캐싱 최적화

> **참고**: `ssrManifest`는 code splitting된 chunk들의 preload 최적화용인데, TanStack Router가 `defaultPreload: 'intent'`로 hover 시 자동 preload 해주므로 불필요합니다.

### Web 빌드 스크립트 추가

**파일**: `web/package.json`

**현재 상태:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",  // 단순 빌드만
    "preview": "vite preview"
  }
}
```

**수정 후:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "pnpm build:client && pnpm build:server",
    "build:client": "tsc && vite build --outDir dist/client",
    "build:server": "vite build --ssr src/entry-server.generated.tsx --outDir dist/server",
    "preview": "vite preview"
  }
}
```

**변경 사항:**
- ✏️ `build`: client와 server를 순차적으로 빌드
- ➕ `build:client`: 클라이언트 빌드 (브라우저용)
- ➕ `build:server`: 서버 빌드 (SSR용)

### 빌드 결과 확인

```bash
cd examples/miomock/web
pnpm build
```

**생성되는 파일:**
```
web/
  dist/
    client/              # 클라이언트 빌드 (브라우저용)
      index.html
      assets/
        index-[hash].js
        index-[hash].css
        vendor-react-[hash].js
        vendor-tanstack-[hash].js
    server/              # 서버 빌드 (SSR용)
      entry-server.generated.js
```

### 확인 사항
- [ ] `dist/client` 폴더 생성 확인
- [ ] `dist/server/entry-server.generated.js` 생성 확인
- [ ] TypeScript 컴파일 에러 없음

---

## 6.2 API 빌드 및 배포 설정

### public/web, ssr 폴더 생성

```bash
mkdir -p examples/miomock/api/public/web
mkdir -p examples/miomock/api/ssr
```

**설명:**
- `api/public/web`: 클라이언트 빌드 결과물 (CSS, JS, HTML) - `web/dist/client`에서 복사
- `api/ssr`: 서버 빌드 결과물 (entry-server.generated.js) - `web/dist/server`에서 복사

> **중요**: Production에서는 `web/dist`가 아니라 `api/public/web`, `api/ssr`를 사용합니다. 빌드 시 복사하는 이유는 API 서버가 단독으로 배포될 때 web 폴더 없이도 동작하게 하기 위함입니다.

### .gitignore 업데이트

**파일**: `api/.gitignore`

**추가할 내용:**
```
public/web
ssr
```

**이유:** 빌드 산출물은 git에 추가하지 않음

### API 빌드 스크립트 수정

**파일**: `api/package.json`

**현재 상태:**
```json
{
  "scripts": {
    "build": "pnpm build:web && sonamu build",
    "build:web": "cd ../web && pnpm build",  // ✅ 이미 있음
    "start": "sonamu start"
  }
}
```

**수정 후:**
```json
{
  "scripts": {
    "build": "pnpm build:web && sonamu build",
    "build:web": "cd ../web && pnpm build && cd ../api && cp -r ../web/dist/client public/web && cp -r ../web/dist/server ssr",
    "start": "sonamu start"
  }
}
```

**변경 사항:**
- ✏️ `build:web`: Web 빌드 후 결과물을 `public/web`, `ssr` 폴더로 복사하는 로직 추가
- ✅ `build`: 변경 없음 (build:web → sonamu build 순서 유지)

### 빌드 테스트

```bash
cd examples/miomock/api
pnpm build
```

**확인:**
```
api/
  public/
    web/              # ← 복사됨
      index.html
      assets/
        index-[hash].js
        ...
  ssr/                # ← 복사됨
    entry-server.generated.js
  dist/               # ← sonamu build 결과
    # API 빌드 결과물
```

### 확인 사항
- [ ] `public/web`에 클라이언트 파일 복사 확인
- [ ] `ssr/entry-server.generated.js` 복사 확인
- [ ] API 빌드 정상 완료 (`dist` 폴더 생성)

---

## 6.3 Production SSR 동작 구현

### 현재 코드 구조

**파일**: `modules/sonamu/src/api/sonamu.ts`

`withFastify()` 메서드는 다음과 같이 Dev/Production을 분기합니다:

```typescript
// sonamu.ts의 withFastify() 메서드 내부
if (isLocal()) {
  // ✅ Phase 3-5에서 완전히 구현됨
  await this.setupViteDevServer(server, webPath, config);
} else {
  // ❌ CSR만 지원, SSR 렌더링 로직 없음
  await this.setupStaticWebServer(server, webPath, config);
}
```

**Dev 모드 (`setupViteDevServer`)는 Phase 3-5에서 완전히 구현되었습니다.**
- SSR 라우트 매칭
- Preload 실행 및 렌더링
- HTML 생성 및 주입
- CSR fallback

**Production 모드 (`setupStaticWebServer`)는 현재 CSR만 지원합니다.**
- 정적 파일 서빙만 구현
- SPA fallback만 구현
- SSR 렌더링 로직 없음

### 수정 대상: `setupStaticWebServer()` 메서드

**현재 구현:** [sonamu.ts:490-530](../../modules/sonamu/src/api/sonamu.ts#L490-L530)

```typescript
private async setupStaticWebServer(
  server: FastifyInstance,
  webPath: string,
  _config: SonamuFastifyConfig,
): Promise<void> {
  const distPath = path.join(webPath, "dist");

  // 1. /assets/* 정적 파일 서빙 (이미 구현됨)
  server.register(await import("@fastify/static"), {
    root: path.join(distPath, "assets"),
    prefix: "/assets",
    // ...
  });

  // 2. SPA fallback (CSR만 지원)
  server.setNotFoundHandler(async (request, reply) => {
    // /api, /sonamu-ui는 404
    if (request.url.startsWith("/api") || request.url.startsWith("/sonamu-ui")) {
      reply.code(404).send({ error: "Not Found" });
      return;
    }

    // ❌ 모든 경로에서 CSR (index.html만 반환)
    const indexPath = path.join(distPath, "index.html");
    const html = fs.readFileSync(indexPath, "utf-8");
    reply.type("text/html").send(html);
  });
}
```

**문제점:**
- SSR 라우트 체크 없음
- SSR 렌더링 로직 없음
- 모든 경로에서 CSR (index.html만 반환)

### 수정 방안

**핵심 아이디어:** `renderer.ts`의 `renderSSR` 함수를 dev/prod 공용하도록 수정합니다.

#### 1단계: renderer.ts 수정

**파일:** `modules/sonamu/src/ssr/renderer.ts`

`vite` 파라미터를 optional로 받아서 내부에서 분기:

```typescript
export async function renderSSR(
  url: string,
  route: SSRRoute,
  params: Record<string, string>,
  request: FastifyRequest,
  reply: FastifyReply,
  config: SonamuFastifyConfig,
  vite?: ViteDevServer,  // 있으면 dev, 없으면 prod
): Promise<string> {
  const { Sonamu } = await import("../api/sonamu");

  // 1. preload 실행 → SSRQuery[] 획득 (dev/prod 공통)
  const preloadConfig = route.preload ? route.preload(params) : [];
  const preloadedData: PreloadedData[] = [];

  for (const { modelName, methodName, params: apiParams, serviceKey } of preloadConfig) {
    const api = Sonamu.syncer.apis.find(
      (a) => a.modelName === modelName && a.methodName === methodName,
    );
    if (!api) continue;

    try {
      const result = await Sonamu.invokeApiForSSR(api, apiParams, config, request, reply);
      preloadedData.push({
        queryKey: [...serviceKey, ...apiParams],
        data: result,
      });
    } catch (e) {
      console.error(`Failed to preload ${modelName}.${methodName}:`, e);
    }
  }

  // 2. ➕ dev/prod 분기
  let template: string;
  let render: (url: string, preloadedData: PreloadedData[]) => Promise<{ html: string; dehydratedState: any }>;

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
    const webDistPath = path.join(Sonamu.apiRootPath, "public", "web");
    const ssrPath = path.join(Sonamu.apiRootPath, "ssr");
    
    template = fs.readFileSync(path.join(webDistPath, "index.html"), "utf-8");
    const entryModule = await import(path.join(ssrPath, "entry-server.generated.js"));
    render = entryModule.render;
  }

  // 3. SSR 렌더링 (dev/prod 공통)
  const { html: appHtml, dehydratedState } = await render(url, preloadedData);

  // 4. SSR 데이터 스크립트 생성
  const ssrDataScript = `
    <script>
      ${dehydratedState ? `window.__SONAMU_SSR__ = ${JSON.stringify(dehydratedState).replace(/</g, "\\u003c")};` : ""}
    </script>
  `;

  // 5. head 생성
  const headTags = route.head ? generateHeadTags(route.head(dehydratedState)) : "";
  
  // 6. Dev에서만 CSS 링크 추가 (prod는 빌드된 index.html에 이미 포함)
  const devCssLinks = vite ? `<link rel="stylesheet" href="/src/styles/tailwind.css" />` : "";

  // 7. 치환
  const html = template
    .replace("<!--app-head-->", `${devCssLinks}\n    ${headTags}\n    ${ssrDataScript}`)
    .replace("<!--app-html-->", appHtml);

  return html;
}
```

#### 2단계: setupStaticWebServer 수정

**파일:** `modules/sonamu/src/api/sonamu.ts`

```typescript
private async setupStaticWebServer(
  server: FastifyInstance,
  webPath: string,
  config: SonamuFastifyConfig,
): Promise<void> {
  // ➕ 경로 명확화: prod에서는 api/public/web, api/ssr 사용
  const webDistPath = path.join(this.apiRootPath, "public", "web");
  const ssrPath = path.join(this.apiRootPath, "ssr");

  if (!fs.existsSync(webDistPath)) {
    console.warn(`⚠ Web dist not found: ${webDistPath}`);
    return;
  }

  // 1. ➕ SSR entry 로드 확인 (앱 시작 시 한 번만)
  let ssrEnabled = false;
  try {
    const entryServerPath = path.join(ssrPath, "entry-server.generated.js");
    if (fs.existsSync(entryServerPath)) {
      ssrEnabled = true;
      console.log("✓ SSR entry found:", entryServerPath);
    }
  } catch (e) {
    console.warn("⚠ SSR entry not found. Only CSR will work.");
  }

  // 2. 정적 파일 서빙
  server.register(await import("@fastify/static"), {
    root: path.join(webDistPath, "assets"),
    prefix: "/assets",
    decorateReply: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes("-") && (filePath.endsWith(".js") || filePath.endsWith(".css"))) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  });

  // 3. ✏️ SPA/SSR 라우팅 + 롤링 업데이트 대응
  server.setNotFoundHandler(async (request, reply) => {
    // /api, /sonamu-ui는 404
    if (request.url.startsWith("/api") || request.url.startsWith("/sonamu-ui")) {
      reply.code(404).send({ error: "Not Found" });
      return;
    }

    // ➕ 롤링 업데이트 대응: 이전 버전 asset 요청 시 현재 버전으로 서빙
    const assetMatch = request.url.match(/^\/assets\/(index-[^/]+\.(js|css))$/);
    if (assetMatch) {
      const [, , ext] = assetMatch;
      const assetsDir = path.join(webDistPath, "assets");
      const files = fs.readdirSync(assetsDir);
      const currentFile = files.find(f => f.startsWith("index-") && f.endsWith(`.${ext}`));
      
      if (currentFile) {
        const filePath = path.join(assetsDir, currentFile);
        const content = fs.readFileSync(filePath);
        reply
          .type(ext === "js" ? "application/javascript" : "text/css")
          .header("Cache-Control", "public, max-age=31536000, immutable")
          .send(content);
        return;
      }
    }

    const url = request.url;

    // ➕ SSR 라우트 체크
    if (ssrEnabled) {
      const { matchSSRRoute, renderSSR } = await import("../ssr");
      const match = matchSSRRoute(url);

      if (match) {
        try {
          // ➕ renderSSR 공유 (vite 없이 호출 = prod 모드)
          const html = await renderSSR(
            url,
            match.route,
            match.params,
            request,
            reply,
            config,
            // vite 없음 = prod
          );
          reply.type("text/html").send(html);
          return;
        } catch (e) {
          console.error("[SSR Error]", {
            url: request.url,
            route: match.route.path,
            error: e instanceof Error ? e.message : String(e),
            timestamp: new Date().toISOString(),
          });
          // fallback to CSR
        }
      }
    }

    // CSR fallback
    const indexPath = path.join(webDistPath, "index.html");
    const html = fs.readFileSync(indexPath, "utf-8");
    reply.type("text/html").send(html);
  });

  console.log(`✓ Static web server configured${ssrEnabled ? " with SSR support" : ""}`);
}
```

**변경 요약:**
1. ➕ `renderSSR` 함수 dev/prod 공유 - 코드 중복 제거
2. ➕ 경로 명확화 - prod에서는 `api/public/web`, `api/ssr` 사용
3. ➕ 롤링 업데이트 대응 - `setNotFoundHandler` 내부에서 처리
4. ➕ SSR 라우트 매칭 및 렌더링
5. ➕ 에러 시 CSR fallback

### Production 모드 테스트

```bash
cd examples/miomock/api
pnpm build
NODE_ENV=production pnpm start
```

**확인:**
- 브라우저에서 `http://localhost:10280/admin/companies` 접속
- 페이지 소스 보기 → `<!--app-html-->` 안에 렌더링된 HTML 확인
- `<script>window.__SONAMU_SSR__ = ...</script>` 확인
- 콘솔에 Hydration 에러 없음 확인

### 확인 사항
- [ ] SSR entry 로드 성공 로그 출력
- [ ] SSR 라우트 정상 렌더링
- [ ] SEO 메타 태그 생성 확인
- [ ] Hydration 에러 없음
- [ ] SSR 실패 시 CSR fallback 동작
- [ ] 정적 파일 캐싱 동작

---

## 6.4 에러 핸들링 강화

### 현재 구현

Section 6.3에서 `setupStaticWebServer()`에 기본적인 에러 핸들링이 추가되었습니다:

```typescript
} catch (e) {
  console.error("[SSR Error]", {
    url: request.url,
    route: match.route.path,
    error: e instanceof Error ? e.message : String(e),
    timestamp: new Date().toISOString(),
  });
  // fallback to CSR
}
```

**현재 동작:**
- SSR 에러 발생 시 콘솔에 로그 출력
- 자동으로 CSR로 fallback
- 사용자는 에러를 인지하지 못함 (정상적으로 페이지 로드)

### 선택적 강화 방안

#### 1. 외부 로깅 서비스 연동 (Sentry, DataDog 등)

**파일:** `api/src/ssr/error-logger.ts` (선택사항)

```typescript
export function logSSRError(error: Error, context: {
  url: string;
  route: string;
}) {
  // Sentry 예시
  // Sentry.captureException(error, {
  //   tags: {
  //     type: 'ssr-error',
  //     route: context.route,
  //   },
  //   extra: context,
  // });

  // 기본 로그
  console.error('[SSR Error]', {
    ...context,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });
}
```

**사용:**
```typescript
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  logSSRError(error, {
    url: request.url,
    route: match.route.path,
  });
  // fallback to CSR
}
```

### Browser API 사용 가이드

**참고:** Phase 4.5N 문서에 일부 작성되어 있습니다.

SSR 환경에서는 `window`, `document` 등의 브라우저 API를 사용할 수 없습니다.

#### 체크 방법

##### 1. `import.meta.env.SSR` 사용

```tsx
if (!import.meta.env.SSR) {
  window.addEventListener('resize', handleResize);
}
```

##### 2. `useEffect` 사용 (권장)

```tsx
// useEffect는 자동으로 클라이언트에서만 실행
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

##### 3. 동적 import

```tsx
const [Component, setComponent] = useState(null);

useEffect(() => {
  import('./ClientOnlyComponent').then(mod => {
    setComponent(() => mod.default);
  });
}, []);

return Component ? <Component /> : null;
```

#### 주의가 필요한 API

- `window` / `document`
- `localStorage` / `sessionStorage`
- `window.location`
- `navigator`
- 브라우저 전용 이벤트 리스너
- DOM 조작 라이브러리

### 확인 사항
- [ ] SSR 에러 로그 형식 확인
- [ ] CSR fallback 동작 확인
- [ ] (선택) 외부 로깅 서비스 연동

---

## 6.5 최적화 및 캐싱 전략

### CloudFront 캐싱 전략 (참고용)

```markdown
# CloudFront 캐싱 전략

## 경로별 캐싱 설정

### Static Assets
- Path: `/assets/*`
- Cache: `max-age=31536000, immutable`
- 이유: 파일명에 hash 포함, 변경 불가

### SSR Pages
- Path: `/users/*`, `/projects/*` 등
- Cache: `max-age=60` (1분) 또는 `no-cache`
- 이유: 데이터 변경 가능성

### API
- Path: `/api/*`
- Cache: `no-cache`
- 이유: 동적 데이터

### Sonamu UI
- Path: `/sonamu-ui/*`
- Cache: `no-cache`
- 이유: 관리 인터페이스

## Cache-Control 헤더 설정

```typescript
// api에서 설정
server.addHook('onSend', async (request, reply) => {
  if (request.url.startsWith('/assets/')) {
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (request.url.startsWith('/api/')) {
    reply.header('Cache-Control', 'no-cache');
  } else {
    // SSR pages
    reply.header('Cache-Control', 'public, max-age=60');
  }
});
```

## 배포 프로세스

1. Web 빌드: `cd web && pnpm build`
2. Web 복사: `cd api && pnpm copy:web`
3. API 빌드: `pnpm build`
4. 배포 스크립트 실행
5. CloudFront invalidation: `/` 경로만 (필요시)
```

### 확인 사항
- [ ] 에러 핸들링 정상 동작
- [ ] Browser API 가이드 작성
- [ ] 캐싱 전략 이해

---

## 6.6 롤링 업데이트 대응 확인

### 테스트 시나리오

#### 1. 롤링 업데이트 시뮬레이션

```bash
# Terminal 1: 현재 버전 실행
cd api
pnpm start

# Terminal 2: 새 버전 빌드
cd web
# 코드 수정 (예: Main.tsx에 console.log 추가)
pnpm build
cd ../api
pnpm copy:web

# Terminal 3: 새 버전 실행 (다른 포트)
cd api
PORT=10281 pnpm start
```

#### 2. 요청 확인

```bash
# 잘못된 hash로 요청 (이전 버전 asset)
curl -I http://localhost:10280/assets/index-old123.js
# 응답: 200 OK (Cache-Control: public, max-age=31536000, immutable)
# 현재 버전의 index-[hash].js 내용이 서빙됨

curl http://localhost:10280/assets/index-new456.js
# 응답: 200 OK
```

> **참고**: 리다이렉트 대신 현재 버전 asset을 직접 서빙합니다. 이렇게 하면 브라우저가 추가 요청 없이 즉시 사용할 수 있어요.

### 확인 사항
- [ ] 롤링 업데이트 시나리오 테스트
- [ ] Asset hash 불일치 대응 확인
- [ ] 현재 버전 asset 정상 서빙

---

## 6.7 최종 점검

### 성능 체크

- [ ] TTFB (Time To First Byte): < 500ms
- [ ] FCP (First Contentful Paint): < 1.5s
- [ ] LCP (Largest Contentful Paint): < 2.5s
- [ ] 번들 크기: vendor chunks 적절히 분리

### 기능 체크

- [ ] SSR 라우트 정상 동작
- [ ] CSR 라우트 정상 동작
- [ ] Hydration 에러 없음
- [ ] 네비게이션 정상 동작
- [ ] 데이터 캐싱 정상 동작
- [ ] Production 빌드 정상 동작

### 에러 핸들링 체크

- [ ] SSR 실패 시 CSR fallback
- [ ] 404 페이지 정상 표시
- [ ] 네트워크 에러 처리
- [ ] Browser API 사용 시 체크

### 배포 체크

- [ ] 빌드 스크립트 정상 동작
- [ ] Production 모드 정상 동작
- [ ] 환경 변수 설정 확인
- [ ] 로그 설정 확인

---

## 완료 체크리스트

- [ ] Web SSR 빌드 설정
- [ ] API 빌드 스크립트 작성
- [ ] Production SSR 동작 구현
- [ ] 에러 핸들링 강화
- [ ] Browser API 가이드 작성
- [ ] 캐싱 전략 수립
- [ ] 롤링 업데이트 대응 확인
- [ ] 성능 측정
- [ ] 최종 점검

---

## 다음 단계

프로젝트 완료 후:

### 1. 성능 모니터링
- SSR vs CSR 성능 비교
- TTFB, FCP, LCP 측정
- 번들 크기 모니터링
- 서버 리소스 사용량 확인

### 2. SEO 검증
- 크롤러 테스트 (Google, Naver)
- og:tags 정상 노출 확인
- sitemap.xml 생성
- robots.txt 설정

### 3. 추가 최적화 (선택)
- Streaming SSR (React 18 Suspense)
- ISR (Incremental Static Regeneration)
- Edge Functions (Cloudflare Workers)
- 이미지 최적화 (next/image 스타일)

---

이전: [Phase 5: SSR 동작](./phase-5-ssr-implementation.md)  
완료!
