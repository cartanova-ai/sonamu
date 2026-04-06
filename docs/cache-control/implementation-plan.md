# Cache-Control 통합 구현 계획

> **목표**: Sonamu 프레임워크에 통합된 Cache-Control 관리 시스템 구축
> **날짜**: 2025-12-27
> **상태**: 계획 단계

---

## 1. 개요 및 동기

### 배경

Sonamu는 이제 모든 라우팅을 관리한다:

- `/api/*` - Backend APIs (@api 데코레이터)
- `/assets/*` - 정적 파일 (Vite 빌드 결과물)
- SSR 라우트 - registerSSR()로 등록된 라우트
- CSR 라우트 - 위 모두가 아닌 fallback

따라서 Cache-Control 헤더도 프레임워크 레벨에서 관리하는 것이 자연스럽다.

### 핵심 철학

1. **프레임워크가 알아서**: 개발자가 명시하지 않아도 합리적인 기본값 제공
2. **타입 안전**: 문자열이 아닌 객체 기반으로 컴파일 타임 검증
3. **유연한 제어**: 전역 핸들러 + 개별 override 조합
4. **프리셋 제공**: 흔한 케이스는 간편하게 사용

### 1분 캐시의 마법

- 트래픽 폭발적 감소 (동시 요청 여러 개 → 1개)
- Invalidation 고민 제로 (1분이면 자연스럽게 갱신)
- UX 체감 차이 없음 (대부분의 케이스에서)

---

## 2. 아키텍처 설계

### 2.1 타입 정의

```typescript
// modules/sonamu/src/types/cache-control.ts

/**
 * Cache-Control 설정 객체
 */
export type CacheControlConfig = {
  visibility: "public" | "private" | "no-cache" | "no-store";
  maxAge?: number; // seconds
  sMaxAge?: number; // CDN용 (s-maxage)
  mustRevalidate?: boolean;
  immutable?: boolean;
  staleWhileRevalidate?: number;
  staleIfError?: number;
};

/**
 * 요청 타입별 정보
 */
export type CacheControlRequest = {
  type: "api" | "assets" | "ssr" | "csr" | "unknown";
  url: string; // '/api/companies?page=1'
  path: string; // '/api/companies'
  method: string; // 'GET', 'POST', etc.

  // type에 따라 추가 정보
  api?: ExtendedApi; // type === 'api'일 때
  route?: SSRRoute; // type === 'ssr'일 때
};

/**
 * 전역 Cache-Control 핸들러
 */
export type CacheControlHandler = (req: CacheControlRequest) => CacheControlConfig | undefined;
```

### 2.2 프리셋

```typescript
// modules/sonamu/src/utils/cache-control.ts

/**
 * 자주 사용하는 Cache-Control 프리셋
 */
export const CachePresets = {
  /**
   * 캐시 없음
   * 사용: API 응답, 실시간 데이터
   */
  noCache: {
    visibility: "no-cache" as const,
  },

  /**
   * 짧은 캐시 (1분)
   * 사용: CSR fallback, 자주 바뀌지 않는 API
   */
  shortLived: {
    visibility: "public" as const,
    maxAge: 60,
  },

  /**
   * SSR 캐시 (10초 + stale-while-revalidate)
   * 사용: SSR 페이지
   */
  ssr: {
    visibility: "public" as const,
    maxAge: 10,
    staleWhileRevalidate: 30,
  },

  /**
   * 중간 캐시 (5분)
   * 사용: 거의 안 바뀌는 데이터 (약관, 설정값 등)
   */
  mediumLived: {
    visibility: "public" as const,
    maxAge: 300,
  },

  /**
   * 긴 캐시 (1시간)
   * 사용: 정적 컨텐츠, 거의 안 바뀌는 리소스
   */
  longLived: {
    visibility: "public" as const,
    maxAge: 3600,
  },

  /**
   * 영구 캐시 (1년 + immutable)
   * 사용: Hash가 포함된 정적 파일 (/assets/index-abc123.js)
   */
  immutable: {
    visibility: "public" as const,
    maxAge: 31536000,
    immutable: true,
  },
} as const;

/**
 * CacheControlConfig 객체를 HTTP 헤더 문자열로 변환
 */
export function buildCacheControl(config: CacheControlConfig): string {
  const parts: string[] = [];

  parts.push(config.visibility);

  if (config.maxAge !== undefined) {
    parts.push(`max-age=${config.maxAge}`);
  }

  if (config.sMaxAge !== undefined) {
    parts.push(`s-maxage=${config.sMaxAge}`);
  }

  if (config.immutable) {
    parts.push("immutable");
  }

  if (config.mustRevalidate) {
    parts.push("must-revalidate");
  }

  if (config.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
  }

  if (config.staleIfError !== undefined) {
    parts.push(`stale-if-error=${config.staleIfError}`);
  }

  return parts.join(", ");
}
```

### 2.3 우선순위

```
1. 개별 지정 (@api.cacheControl, registerSSR.cacheControl)
   ↓ 없으면
2. config.cacheControlHandler(req)
   ↓ 없으면
3. Sonamu 내장 기본값
```

---

## 3. 사용 예시

### 3.1 sonamu.config.ts - 전역 설정

```typescript
import { CachePresets } from "sonamu/utils/cache-control";

export default {
  cacheControlHandler: (req) => {
    switch (req.type) {
      case "assets":
        // Hash 포함된 파일: 영구 캐시
        if (req.path.match(/-[a-f0-9]+\./)) {
          return CachePresets.immutable;
        }
        return CachePresets.longLived;

      case "api":
        // GET 요청만 캐싱 고려
        if (req.method === "GET") {
          // 특정 경로는 짧은 캐시
          if (req.path.startsWith("/api/static-data")) {
            return CachePresets.shortLived;
          }
          if (req.path.startsWith("/api/terms")) {
            return CachePresets.mediumLived;
          }
        }
        // 기본: 캐시 없음
        return CachePresets.noCache;

      case "ssr":
        // SSR 페이지: 10초 캐시
        return CachePresets.ssr;

      case "csr":
        // CSR fallback (index.html): 1분 캐시
        return CachePresets.shortLived;

      case "unknown":
        return CachePresets.noCache;
    }
  },
};
```

### 3.2 개별 API 캐싱

```typescript
// 프리셋 사용
@api({
  httpMethod: 'GET',
  cacheControl: CachePresets.mediumLived,
})
async getTerms(ctx: Context) {
  return await TermsModel.findAll();
}

// 커스텀 설정
@api({
  httpMethod: 'GET',
  cacheControl: {
    visibility: 'public',
    maxAge: 600,  // 10분
    staleWhileRevalidate: 1800,  // 30분
  }
})
async getCompanyList(ctx: Context, params: CompanyListParams) {
  return await CompanyModel.findMany(params);
}

// 캐시 없음 (기본값이므로 보통 명시 안 함)
@api({
  httpMethod: 'POST',
  cacheControl: CachePresets.noCache,
})
async createCompany(ctx: Context, data: CompanyInput) {
  return await CompanyModel.create(data);
}
```

### 3.3 SSR 라우트 캐싱

```typescript
// 프리셋 사용
registerSSR({
  path: "/admin/companies",
  cacheControl: CachePresets.ssr, // 10초 캐시
  preload: () => [UserService.me(), CompanyService.getCompanies("A", { num: 10, page: 1 })],
});

// 더 긴 캐시 (거의 안 바뀌는 페이지)
registerSSR({
  path: "/terms",
  cacheControl: CachePresets.mediumLived, // 5분
  preload: () => [TermsService.getTerms()],
});

// 실시간 업데이트 필요한 페이지
registerSSR({
  path: "/products/:id",
  cacheControl: CachePresets.noCache,
  preload: ({ id }) => [ProductService.getProduct("A", parseInt(id))],
});

// 커스텀 설정
registerSSR({
  path: "/blog/:slug",
  cacheControl: {
    visibility: "public",
    maxAge: 300, // 5분
    staleWhileRevalidate: 3600, // 1시간
  },
  preload: ({ slug }) => [BlogService.getPost("A", slug)],
});
```

---

## 4. 구현 계획

### 4.1 Phase 1: 타입 및 유틸리티

**파일**:

- `modules/sonamu/src/types/cache-control.ts`
- `modules/sonamu/src/utils/cache-control.ts`

**작업**:

1. `CacheControlConfig` 타입 정의
2. `CacheControlRequest` 타입 정의
3. `CacheControlHandler` 타입 정의
4. `CachePresets` 객체 생성
5. `buildCacheControl()` 함수 구현
6. 유닛 테스트 작성

### 4.2 Phase 2: Config 확장

**파일**:

- `modules/sonamu/src/types/sonamu-config.ts`

**작업**:

1. `SonamuFastifyConfig`에 `cacheControlHandler` 추가
2. JSDoc 문서 작성

````typescript
export type SonamuFastifyConfig = {
  // ... 기존 설정

  /**
   * 전역 Cache-Control 핸들러
   *
   * @example
   * ```typescript
   * cacheControlHandler: (req) => {
   *   if (req.type === 'api' && req.method === 'GET') {
   *     return CachePresets.shortLived;
   *   }
   *   return CachePresets.noCache;
   * }
   * ```
   */
  cacheControlHandler?: CacheControlHandler;
};
````

### 4.3 Phase 3: @api 데코레이터 확장

**파일**:

- `modules/sonamu/src/decorators/api.ts`
- `modules/sonamu/src/types/api.ts`

**작업**:

1. `ApiDecoratorOptions`에 `cacheControl` 필드 추가
2. `ExtendedApi`에 `cacheControl` 필드 포함

```typescript
export type ApiDecoratorOptions = {
  // ... 기존 옵션
  cacheControl?: CacheControlConfig;
};
```

### 4.4 Phase 4: API 라우터 적용

**파일**:

- `modules/sonamu/src/api/api-router.ts`

**작업**:

1. API 응답 전 Cache-Control 헤더 추가
2. 우선순위 로직 구현

```typescript
function getCacheControl(
  api: ExtendedApi,
  request: FastifyRequest,
  config: SonamuFastifyConfig,
): string {
  // 1. 개별 지정
  if (api.options.cacheControl) {
    return buildCacheControl(api.options.cacheControl);
  }

  // 2. 전역 핸들러
  if (config.cacheControlHandler) {
    const result = config.cacheControlHandler({
      type: "api",
      url: request.url,
      path: request.routeOptions.url,
      method: request.method,
      api,
    });
    if (result) {
      return buildCacheControl(result);
    }
  }

  // 3. 기본값
  return buildCacheControl(CachePresets.noCache);
}

// 응답 전
reply.header("Cache-Control", getCacheControl(api, request, config));
```

### 4.5 Phase 5: SSR 라우트 확장

**파일**:

- `modules/sonamu/src/ssr/types.ts`
- `modules/sonamu/src/ssr/renderer.ts`

**작업**:

1. `SSRRoute`에 `cacheControl` 필드 추가
2. `renderSSR` 함수에서 Cache-Control 헤더 설정

```typescript
export type SSRRoute = {
  path: string;
  preload?: (params: Record<string, string>) => PreloadConfig;
  head?: (dehydratedState: unknown) => HeadConfig;
  cacheControl?: CacheControlConfig; // ← 추가
};

// renderer.ts
function getCacheControl(route: SSRRoute, url: string, config: SonamuFastifyConfig): string {
  // 1. 개별 지정
  if (route.cacheControl) {
    return buildCacheControl(route.cacheControl);
  }

  // 2. 전역 핸들러
  if (config.cacheControlHandler) {
    const result = config.cacheControlHandler({
      type: "ssr",
      url,
      path: route.path,
      method: "GET",
      route,
    });
    if (result) {
      return buildCacheControl(result);
    }
  }

  // 3. 기본값
  return buildCacheControl(CachePresets.ssr);
}

// renderSSR 함수 내
reply.header("Cache-Control", getCacheControl(route, url, config));
```

### 4.6 Phase 6: 정적 파일 서빙 적용

**파일**:

- `modules/sonamu/src/api/sonamu.ts` (setupStaticWebServer)

**작업**:

1. Assets 서빙 시 Cache-Control 헤더 추가
2. CSR fallback 시 Cache-Control 헤더 추가

```typescript
// Assets 서빙
server.get("/assets/:filename", (request, reply) => {
  const { filename } = request.params;
  const url = `/assets/${filename}`;

  const cacheControl = getCacheControlForAssets(url, config);
  reply.header("Cache-Control", cacheControl);

  // ... serve file
});

// CSR fallback
server.setNotFoundHandler(async (request, reply) => {
  // ... SSR 체크 로직

  // CSR fallback
  const cacheControl = getCacheControlForCSR(request.url, config);
  reply.header("Cache-Control", cacheControl);

  const html = fs.readFileSync(indexPath, "utf-8");
  reply.type("text/html").send(html);
});
```

### 4.7 Phase 7: 문서화 및 마이그레이션 가이드

**작업**:

1. API 문서 작성
2. 마이그레이션 가이드 작성 (기존 프로젝트 대응)
3. 예제 프로젝트 업데이트 (miomock)

---

## 5. 테스트 시나리오

### 5.1 유닛 테스트

```typescript
describe("buildCacheControl", () => {
  it("should build basic no-cache header", () => {
    expect(buildCacheControl(CachePresets.noCache)).toBe("no-cache");
  });

  it("should build public cache with max-age", () => {
    expect(buildCacheControl(CachePresets.shortLived)).toBe("public, max-age=60");
  });

  it("should build immutable cache", () => {
    expect(buildCacheControl(CachePresets.immutable)).toBe("public, max-age=31536000, immutable");
  });

  it("should include stale-while-revalidate", () => {
    expect(buildCacheControl(CachePresets.ssr)).toBe(
      "public, max-age=10, stale-while-revalidate=30",
    );
  });
});
```

### 5.2 통합 테스트

```typescript
describe("Cache-Control Integration", () => {
  it("API: should use individual cacheControl", async () => {
    const response = await request(app).get("/api/terms");
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("API: should use global handler", async () => {
    const response = await request(app).get("/api/companies");
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
  });

  it("API: should default to no-cache for POST", async () => {
    const response = await request(app).post("/api/companies").send({});
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("SSR: should use individual cacheControl", async () => {
    const response = await request(app).get("/terms");
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("CSR: should use shortLived preset", async () => {
    const response = await request(app).get("/some-csr-route");
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
  });

  it("Assets: should use immutable for hashed files", async () => {
    const response = await request(app).get("/assets/index-abc123.js");
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });
});
```

### 5.3 수동 테스트

1. **Chrome DevTools Network 탭**:
   - Cache-Control 헤더 확인
   - 캐시 히트/미스 확인

2. **curl로 헤더 확인**:

   ```bash
   curl -I http://localhost:10280/api/companies
   curl -I http://localhost:10280/admin/companies
   curl -I http://localhost:10280/assets/index-abc123.js
   ```

3. **CloudFront 배포 후**:
   - CloudFront에서 Origin 헤더 존중 설정 확인
   - 실제 캐싱 동작 확인

---

## 6. 마이그레이션 전략

### 6.1 기존 프로젝트 영향도

- **Breaking Change 없음**: 모든 설정이 optional
- 기본값이 합리적이므로 별도 설정 없어도 동작
- 점진적 적용 가능

### 6.2 권장 마이그레이션 순서

1. **Phase 1**: sonamu.config.ts에 전역 핸들러 추가

   ```typescript
   cacheControlHandler: (req) => {
     if (req.type === "assets") return CachePresets.immutable;
     if (req.type === "ssr") return CachePresets.ssr;
     if (req.type === "csr") return CachePresets.shortLived;
     if (req.type === "api") return CachePresets.noCache;
   };
   ```

2. **Phase 2**: 자주 호출되는 GET API에 캐싱 추가

   ```typescript
   @api({
     httpMethod: 'GET',
     cacheControl: CachePresets.shortLived,
   })
   ```

3. **Phase 3**: SSR 라우트별로 캐시 정책 조정

4. **Phase 4**: CloudFront 설정 확인 및 테스트

---

## 7. 예상 효과

### 7.1 트래픽 감소

- **API 캐싱 (1분)**: 동일 요청 60초 내 반복 → CDN에서 처리
- **SSR 캐싱 (10초)**: SEO 크롤러 요청 → CDN에서 처리
- **Assets 캐싱 (1년)**: 브라우저 캐시 히트율 극대화

**예상 서버 부하 감소**: 60~80% (트래픽 패턴에 따라)

### 7.2 응답 속도 개선

- CloudFront 엣지 히트: ~10ms (vs 서버 왕복 100~200ms)
- 브라우저 캐시 히트: ~0ms

### 7.3 비용 절감

- Origin 요청 감소 → EC2/Lambda 비용 절감
- CloudFront 엣지 처리 비용이 훨씬 저렴

---

## 8. 향후 고려사항

### 8.1 Cache Invalidation

현재는 TTL 기반이지만, 필요시 추가 가능:

```typescript
// 모델 변경 시 자동 invalidation
class CompanyModel {
  async save(ctx: Context, data: CompanyInput) {
    const result = await super.save(data);

    // CloudFront invalidation (optional)
    if (ctx.config.cloudfront?.enabled) {
      await invalidateCloudFront(["/api/companies/*", "/admin/companies"]);
    }

    return result;
  }
}
```

### 8.2 Vary 헤더 지원

Accept-Language 등에 따라 다른 응답:

```typescript
cacheControl: {
  visibility: 'public',
  maxAge: 60,
  vary: ['Accept-Language', 'Accept-Encoding'],
}
```

### 8.3 조건부 요청 (ETag, Last-Modified)

304 Not Modified 응답으로 대역폭 절약:

```typescript
@api({
  httpMethod: 'GET',
  cacheControl: CachePresets.shortLived,
  etag: true,  // 자동 ETag 생성
})
```

---

## 9. 체크리스트

### Phase 1: 타입 및 유틸리티

- [ ] CacheControlConfig 타입 정의
- [ ] CacheControlRequest 타입 정의
- [ ] CachePresets 객체 생성
- [ ] buildCacheControl() 함수 구현
- [ ] 유닛 테스트 작성

### Phase 2: Config 확장

- [ ] SonamuFastifyConfig에 cacheControlHandler 추가
- [ ] JSDoc 문서 작성

### Phase 3: @api 데코레이터 확장

- [ ] ApiDecoratorOptions에 cacheControl 필드 추가
- [ ] ExtendedApi 타입 업데이트

### Phase 4: API 라우터 적용

- [ ] getCacheControl 함수 구현
- [ ] API 응답 전 헤더 추가
- [ ] 우선순위 로직 테스트

### Phase 5: SSR 라우트 확장

- [ ] SSRRoute에 cacheControl 필드 추가
- [ ] renderSSR에서 헤더 설정

### Phase 6: 정적 파일 서빙

- [ ] Assets 서빙 시 헤더 추가
- [ ] CSR fallback 시 헤더 추가

### Phase 7: 문서화

- [ ] API 문서 작성
- [ ] 마이그레이션 가이드 작성
- [ ] 예제 프로젝트 업데이트

### 테스트

- [ ] 유닛 테스트 통과
- [ ] 통합 테스트 통과
- [ ] Chrome DevTools 수동 테스트
- [ ] CloudFront 배포 후 검증

---

## 10. 참고 자료

- [MDN: Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
- [Web.dev: HTTP Caching](https://web.dev/articles/http-cache)
- [CloudFront: Caching Content](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html)
- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)
