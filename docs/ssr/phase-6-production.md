# Phase 6: Production 준비

> **목표**: 프로덕션 환경 빌드 설정 및 최적화

## 6.1 Web SSR 빌드 설정

### Vite 빌드 설정

**파일**: `web/vite.config.ts`

```typescript
import react from "@vitejs/plugin-react-swc";
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "vite";

dotenv.config({ path: ".sonamu.env" });

export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 10281,
    proxy: {
      "/api": `http://${process.env.API_HOST}:${process.env.API_PORT}`,
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    ssrManifest: true,  // SSR을 위한 manifest 생성
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

### Web 빌드 스크립트

**파일**: `web/package.json`

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

### 빌드 결과 확인

```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/web
pnpm build
```

**생성되는 파일**:
```
web/
  dist/
    client/              # CSR 빌드
      index.html
      assets/
        index-[hash].js
        index-[hash].css
      .vite/
        ssr-manifest.json
    server/              # SSR 빌드
      entry-server.generated.js
```

### 확인 사항
- [ ] `dist/client` 폴더 생성 확인
- [ ] `dist/server/entry-server.generated.js` 생성 확인
- [ ] ssr-manifest.json 생성 확인
- [ ] TypeScript 컴파일 에러 없음

---

## 6.2 API 빌드 스크립트

### API 빌드 스크립트

**파일**: `api/package.json`

```json
{
  "scripts": {
    "dev": "sonamu dev",
    "build": "pnpm build:web && pnpm build:api",
    "build:web": "cd ../web && pnpm build && cd ../api && pnpm copy:web",
    "copy:web": "cp -r ../web/dist/client public/web && cp -r ../web/dist/server ssr",
    "build:api": "sonamu build",
    "start": "sonamu start"
  }
}
```

### public/ssr 폴더 생성

```bash
mkdir -p /Users/minsangk/Development/sonamu/examples/miomock/api/public/web
mkdir -p /Users/minsangk/Development/sonamu/examples/miomock/api/ssr
```

### .gitignore 업데이트

**파일**: `api/.gitignore`

```
public/web
ssr
```

### 테스트

```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/api
pnpm build
```

**확인**:
```
api/
  public/
    web/
      index.html
      assets/
  ssr/
    entry-server.generated.js
  dist/
    # API 빌드 결과물
```

### 확인 사항
- [ ] `public/web`에 클라이언트 파일 복사 확인
- [ ] `ssr/entry-server.generated.js` 복사 확인
- [ ] API 빌드 정상 완료

---

## 6.3 Production SSR 동작 구현

### Sonamu withFastify에 Production SSR 추가

**파일**: `/Users/minsangk/Development/sonamu/modules/sonamu/src/api/sonamu.ts`

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
    // Dev 모드 (이미 구현됨)
    const vite = await this.createViteDevServer();
    // ... Vite middleware 등록
  } else {
    // Production 모드
    const webDistPath = path.join(this.apiRootPath, 'public', 'web');
    const ssrPath = path.join(this.apiRootPath, 'ssr');
    
    // SSR entry 로드 (앱 시작 시 한 번만)
    let ssrRender: any = null;
    try {
      const entryServerPath = path.join(ssrPath, 'entry-server.generated.js');
      const entryModule = await import(entryServerPath);
      ssrRender = entryModule.render;
    } catch (e) {
      console.error('Failed to load SSR entry:', e);
    }
    
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
    
    // SPA/SSR routing
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
      
      if (match && ssrRender) {
        // SSR 렌더링
        try {
          const preloadConfig = match.route.preload 
            ? match.route.preload(match.params) 
            : [];
          
          const { html: appHtml, dehydratedState } = await ssrRender(url, preloadConfig);
          
          // index.html 읽기
          const fs = await import('fs/promises');
          let template = await fs.readFile(
            path.join(webDistPath, 'index.html'),
            'utf-8'
          );
          
          // SSR 데이터 스크립트
          const ssrDataScript = `
    <script>
      window.__SONAMU_SSR__ = ${JSON.stringify(dehydratedState).replace(/</g, '\\u003c')};
    </script>
          `.trim();
          
          // head 생성
          const headTags = match.route.head 
            ? this.generateHeadTags(match.route.head(dehydratedState))
            : '';
          
          // 치환
          const html = template
            .replace('<!--app-head-->', headTags + '\n' + ssrDataScript)
            .replace('<!--app-html-->', appHtml);
          
          reply.type('text/html').send(html);
          return;
        } catch (e) {
          console.error('SSR Error:', e);
          // fallback to CSR
        }
      }
      
      // CSR fallback - index.html
      const fs = await import('fs/promises');
      reply.type('text/html').send(
        await fs.readFile(
          path.join(webDistPath, 'index.html'),
          'utf-8'
        )
      );
    });
  }
  
  // ... API 라우팅 설정
}

// head 태그 생성 헬퍼
private generateHeadTags(head: any): string {
  const tags: string[] = [];
  
  if (head.title) {
    tags.push(`<title>${this.escapeHtml(head.title)}</title>`);
  }
  
  if (head.meta) {
    for (const meta of head.meta) {
      const attrs: string[] = [];
      if (meta.name) attrs.push(`name="${this.escapeHtml(meta.name)}"`);
      if (meta.property) attrs.push(`property="${this.escapeHtml(meta.property)}"`);
      attrs.push(`content="${this.escapeHtml(meta.content)}"`);
      tags.push(`<meta ${attrs.join(' ')} />`);
    }
  }
  
  return tags.join('\n    ');
}

private escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### Production 모드 테스트

```bash
cd /Users/minsangk/Development/sonamu/examples/miomock/api
pnpm build
NODE_ENV=production pnpm start
```

**확인**:
```
http://localhost:10280/users/1
```

- [ ] SSR 정상 동작
- [ ] 정적 파일 캐싱
- [ ] 에러 시 CSR fallback

---

## 6.4 에러 핸들링 강화

### Browser API 사용 가이드

**문서 작성**: `docs/ssr/browser-api-guide.md`

```markdown
# SSR에서 Browser API 사용 시 주의사항

SSR 환경에서는 `window`, `document` 등의 브라우저 API를 사용할 수 없습니다.

## 체크 방법

### 1. import.meta.env.SSR 사용

```tsx
if (!import.meta.env.SSR) {
  window.addEventListener('resize', handleResize);
}
```

### 2. useEffect 사용 (권장)

```tsx
// useEffect는 자동으로 클라이언트에서만 실행
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

### 3. 동적 import

```tsx
const [Component, setComponent] = useState(null);

useEffect(() => {
  import('./ClientOnlyComponent').then(mod => {
    setComponent(() => mod.default);
  });
}, []);

return Component ? <Component /> : null;
```

## 주의가 필요한 API

- `window` / `document`
- `localStorage` / `sessionStorage`
- `window.location`
- `navigator`
- 브라우저 전용 이벤트 리스너
- DOM 조작 라이브러리

## 컴포넌트 예시

```tsx
function MyComponent() {
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  if (!isClient) {
    return <div>Loading...</div>;
  }
  
  // 클라이언트에서만 렌더링
  return <div>{window.innerWidth}px</div>;
}
```
```

### 에러 로깅 설정

**파일**: `api/src/ssr/error-handler.ts` (선택사항)

```typescript
export function logSSRError(error: Error, url: string, route: string) {
  console.error('[SSR Error]', {
    url,
    route,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });
  
  // 외부 로깅 서비스로 전송
  // Sentry, DataDog 등
}
```

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
# 잘못된 hash로 요청
curl -I http://localhost:10280/assets/index-old123.js
# 응답: 302 → /assets/index-new456.js

curl http://localhost:10280/assets/index-new456.js
# 응답: 200 OK
```

### 확인 사항
- [ ] 롤링 업데이트 시나리오 테스트
- [ ] Asset hash 불일치 대응 확인
- [ ] 리다이렉트 정상 동작

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
