# Phase 3: 단일 서버 통합 (CSR)

> **목표**: API 서버에서 Web을 함께 서빙 (아직 SSR 아님, CSR만)

## 3.1 Sonamu에 Vite Middleware 통합 (Dev 모드)

### 작업 파일

`/Users/minsangk/Development/sonamu/modules/sonamu/src/api/sonamu.ts`

### 1. Vite 관련 imports 추가

```typescript
import type { ViteDevServer } from "vite";
import path from "path";
```

### 2. SonamuClass에 viteDevServer 프로퍼티 추가

```typescript
export class SonamuClass {
  // ... 기존 프로퍼티들

  private _viteDevServer: ViteDevServer | null = null;
  get viteDevServer(): ViteDevServer | null {
    return this._viteDevServer;
  }
}
```

### 3. createViteDevServer 메서드 추가

```typescript
private async createViteDevServer(): Promise<ViteDevServer> {
  const { createServer } = await import('vite');
  const webRootPath = path.join(this.appRootPath, 'web');

  const vite = await createServer({
    root: webRootPath,
    server: {
      middlewareMode: true,
      hmr: {
        port: this.config.server.listen?.port ?? 3000,
      },
    },
    appType: 'custom',
  });

  this._viteDevServer = vite;
  return vite;
}
```

### 4. withFastify 메서드에 Vite 미들웨어 등록

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

  // Sonamu UI API
  const { sonamuUIApiPlugin } = await import("../ui/api");
  server.register(sonamuUIApiPlugin);

  // === Web 서빙 추가 ===

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

      // 나머지는 Vite로
      const url = request.url;
      try {
        // index.html 읽고 변환
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
    // Production 모드: 빌드된 파일 서빙
    const webDistPath = path.join(this.apiRootPath, 'web-dist', 'client');

    // 롤링 업데이트 대응: asset hash 불일치 처리
    server.get('/assets/index-*.js', async (request, reply) => {
      const fs = await import('fs/promises');
      const assetsDir = path.join(webDistPath, 'assets');
      const files = await fs.readdir(assetsDir);
      const indexJs = files.find(f => f.startsWith('index-') && f.endsWith('.js'));

      if (indexJs) {
        return reply.redirect(`/assets/${indexJs}`);
      }
      reply.status(404).send('Not found');
    });

    server.get('/assets/index-*.css', async (request, reply) => {
      const fs = await import('fs/promises');
      const assetsDir = path.join(webDistPath, 'assets');
      const files = await fs.readdir(assetsDir);
      const indexCss = files.find(f => f.startsWith('index-') && f.endsWith('.css'));

      if (indexCss) {
        return reply.redirect(`/assets/${indexCss}`);
      }
      reply.status(404).send('Not found');
    });

    // static files
    server.register(await import('@fastify/static'), {
      root: path.join(webDistPath, 'assets'),
      prefix: '/assets/',
      decorateReply: false,
    });

    // SPA fallback
    server.all('*', async (request, reply) => {
      // Sonamu UI는 skip
      if (request.url.startsWith('/sonamu-ui')) {
        return;
      }

      // API는 skip
      if (request.url.startsWith(this.config.api.route.prefix)) {
        return;
      }

      // index.html
      const fs = await import('fs/promises');
      reply.type('text/html').send(
        await fs.readFile(
          path.join(webDistPath, 'index.html'),
          'utf-8'
        )
      );
    });
  }

  // API 라우팅 설정
  // ... 기존 코드
}
```

### 5. destroy 메서드에 Vite 정리 추가

```typescript
async destroy(): Promise<void> {
  const { BaseModel } = await import("../database/base-model");
  await BaseModel.destroy();
  await this._workflows?.destroy();
  await this.watcher?.close();
  this.storage?.destroy();

  // Vite dev server 종료
  if (this._viteDevServer) {
    await this._viteDevServer.close();
  }
}
```

### 커스텀 라우트 예시 (선택사항)

robots.txt, AASA 같은 특수 파일이 필요하면:

```typescript
// withFastify 메서드 안에서

// robots.txt
server.get("/robots.txt", async (request, reply) => {
  if (isProduction()) {
    const fs = await import("fs/promises");
    reply.type("text/plain").send(await fs.readFile(path.join(webDistPath, "robots.txt"), "utf-8"));
  } else {
    reply.type("text/plain").send("User-agent: *\nDisallow: /");
  }
});

// AASA
server.get("/.well-known/apple-app-site-association", async (request, reply) => {
  const fs = await import("fs/promises");
  reply
    .type("application/json")
    .send(await fs.readFile(path.join(webDistPath, ".well-known/aasa"), "utf-8"));
});
```

### 확인 사항

- [ ] miomock-api 서버 실행 (`pnpm dev`)
- [ ] `http://localhost:10280` 접속 시 web 화면 표시
- [ ] HMR 정상 동작 (파일 수정 시 자동 리로드)
- [ ] `/api/*` 경로는 API 응답
- [ ] `/sonamu-ui/*` 경로는 Sonamu UI 응답
- [ ] 나머지 경로는 React 앱 표시

---

## 3.2 Production 빌드 설정

### Web 빌드 설정

**파일**: `web/vite.config.ts`

```typescript
export default defineConfig({
  // ... 기존 설정
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    ssrManifest: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-tanstack": ["@tanstack/react-query", "@tanstack/react-router"],
        },
      },
    },
  },
});
```

### Web 빌드 스크립트

**파일**: `web/package.json`

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

### API 빌드 스크립트

**파일**: `api/package.json`

```json
{
  "scripts": {
    "dev": "sonamu dev",
    "build": "pnpm build:web && pnpm build:api",
    "build:web": "cd ../web && pnpm build && cp -r dist ../api/web-dist",
    "build:api": "sonamu build",
    "start": "sonamu start"
  }
}
```

### public 폴더 생성

```bash
mkdir -p /Users/minsangk/Development/sonamu/examples/miomock/api/web-dist
```

### .gitignore 업데이트

**파일**: `api/.gitignore`

```
web-dist
```

### 테스트

```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/api
pnpm build
NODE_ENV=production pnpm start
```

### 확인 사항

- [ ] `web/dist/client` 폴더 생성 확인
- [ ] `api/web-dist`에 파일 복사 확인
- [ ] index.html, assets 폴더 확인
- [ ] production 모드로 서버 실행
- [ ] `http://localhost:10280` 접속 시 정상 동작
- [ ] 네트워크 탭에서 정적 파일 캐싱 확인

---

## 3.3 경로 분기 정리 및 테스트

### 최종 라우팅 구조

```
http://localhost:10280
  ├─ /api/*           → Fastify API handlers
  ├─ /sonamu-ui/*     → Sonamu UI (static)
  ├─ /assets/*        → Web static files (dev: Vite, prod: @fastify/static)
  └─ /*               → Web app (dev: Vite HMR, prod: index.html)
```

### 테스트 시나리오

#### 1. API 엔드포인트

```bash
curl http://localhost:10280/api/user/me
# 응답: JSON
```

#### 2. Sonamu UI

```bash
# 브라우저에서
http://localhost:10280/sonamu-ui
# 확인: Sonamu UI 표시
```

#### 3. Web 앱

```bash
# 브라우저에서
http://localhost:10280/
http://localhost:10280/users
http://localhost:10280/users/123
# 확인: React 앱 정상 표시, 라우팅 동작
```

#### 4. 정적 파일

```bash
# 네트워크 탭에서 확인
http://localhost:10280/assets/index-abc123.js
# 확인: JS/CSS 파일 로드
```

#### 5. 롤링 업데이트 테스트

```bash
# 잘못된 hash로 요청
curl -I http://localhost:10280/assets/index-old.js
# 응답: 302 리다이렉트 → /assets/index-new.js
```

### 확인 사항

- [ ] 모든 경로 분기 정상 동작
- [ ] Dev 모드와 Production 모드 동일하게 동작
- [ ] 404 페이지 정상 표시
- [ ] 브라우저 콘솔 에러 없음
- [ ] 롤링 업데이트 시나리오 대응 확인

---

## 완료 체크리스트

- [ ] Vite Middleware 통합 (Dev)
- [ ] Production 빌드 설정
- [ ] 빌드 스크립트 작성
- [ ] 경로 분기 구현
- [ ] 롤링 업데이트 대응
- [ ] 커스텀 라우트 (선택)
- [ ] 전체 테스트

---

이전: [Phase 2: Tanstack Router](./phase-2-tanstack-router.md)  
다음: [Phase 4: SSR 기본 구조](./phase-4-ssr-structure.md)
