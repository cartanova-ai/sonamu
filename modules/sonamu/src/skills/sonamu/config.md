---
name: sonamu-config
description: Sonamu 프로젝트 설정. .env 환경변수, sonamu.config.ts 설정. Use when configuring a new Sonamu project.
---

# Sonamu 프로젝트 설정

프로젝트 생성 후 `.env`와 `sonamu.config.ts` 설정 가이드.

## .env 파일

위치: `packages/api/.env`

### 기본 환경변수 (create-sonamu 생성)

```env
# Database Configuration
DB_HOST=0.0.0.0
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=1234
CONTAINER_NAME=myproject-container
DATABASE_NAME=myproject
PROJECT_NAME=myproject
```

### 추가 환경변수 (필요시)

```env
# Session (프로덕션에서 반드시 변경)
SESSION_SECRET=your-secret-key-change-in-production
SESSION_SALT=random-16-char-salt

# AWS S3 (파일 업로드용)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_REGION=ap-northeast-2
S3_BUCKET=your-bucket-name

# Slack 알림 (마이그레이션 확인용)
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_CHANNEL_ID=C0123456789
```

### 환경변수 설명

| 변수 | 필수 | 설명 |
|-----|-----|------|
| `DB_HOST` | ✓ | DB 호스트 (Docker: `0.0.0.0`, 외부 DB: 해당 IP) |
| `DB_PORT` | ✓ | DB 포트 (기본값: `5432`) |
| `DB_USER` | ✓ | DB 사용자명 (기본값: `postgres`) |
| `DB_PASSWORD` | ✓ | DB 비밀번호 |
| `DATABASE_NAME` | ✓ | 데이터베이스명 |
| `PROJECT_NAME` | ✓ | 프로젝트명 (Docker, config에서 사용) |
| `CONTAINER_NAME` | | Docker 컨테이너명 |
| `SESSION_SECRET` | | 세션 암호화 키 (프로덕션 필수) |
| `SESSION_SALT` | | 세션 salt (16자) |
| `AWS_ACCESS_KEY_ID` | | S3 사용 시 필수 |
| `AWS_SECRET_ACCESS_KEY` | | S3 사용 시 필수 |
| `S3_REGION` | | S3 리전 (기본값: `ap-northeast-2`) |
| `S3_BUCKET` | | S3 버킷명 |

---

## sonamu.config.ts

위치: `packages/api/src/sonamu.config.ts`

### 전체 구조

```typescript
import path from "node:path";
import { CachePresets, defineConfig } from "sonamu";
import { drivers as cacheDrivers, store } from "sonamu/cache";
import { drivers } from "sonamu/storage";

const host = "localhost";
const port = 34900;

export default defineConfig({
  projectName: process.env.PROJECT_NAME ?? "MyProject",
  api: { /* API 설정 */ },
  i18n: { /* 다국어 설정 */ },
  sync: { /* 동기화 설정 */ },
  database: { /* DB 설정 */ },
  logging: { /* 로깅 설정 (false로 비활성화 가능) */ },
  test: { /* 테스트 설정 */ },
  server: { /* 서버 설정 */ },
  slackConfirm: { /* Production 마이그레이션 Slack 승인 */ },
});
```

### 주요 섹션별 설정

#### projectName

```typescript
projectName: process.env.PROJECT_NAME ?? "MyProject",
```

#### api

```typescript
api: {
  dir: "api",              // API 디렉토리명
  timezone: "Asia/Seoul",  // 타임존
  route: {
    prefix: "/api",        // API 라우트 prefix
  },
},
```

#### i18n

```typescript
i18n: {
  defaultLocale: "ko",
  supportedLocales: ["ko", "en"],
},
```

자세한 내용은 `i18n.md` 참조.

#### sync

```typescript
sync: {
  targets: ["web"],  // 타입 동기화 대상 패키지
},
```

#### database

```typescript
database: {
  database: "pg",  // PostgreSQL
  name: process.env.DATABASE_NAME ?? "database_name",
  defaultOptions: {
    connection: {
      host: process.env.DB_HOST || "0.0.0.0",
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD,
    },
  },
},
```

자세한 내용은 `database.md` 참조.

#### test

```typescript
test: {
  parallel: true,   // 병렬 테스트 활성화
  maxWorkers: 4,    // Worker 수
  devRunner: {      // Dev 서버 내 Vitest 상주 인스턴스
    enabled: true,
    watch: true,
  },
},
```

자세한 내용은 `testing.md`, `testing-devrunner.md` 참조.

#### server

```typescript
server: {
  listen: { port: 34900, host: "localhost" },
  plugins: { /* 플러그인 설정 */ },
  auth: true,
  apiConfig: { /* API 설정 */ },
  storage: { /* 스토리지 설정 */ },
  cache: { /* 캐시 설정 */ },
  lifecycle: { /* 라이프사이클 훅 */ },
},
```

---

## server.auth 상세 (better-auth 인증)

Sonamu는 **better-auth**를 사용한 인증 시스템을 제공한다.

### 1. 엔티티 자동 생성

```bash
pnpm sonamu auth generate
```

생성되는 엔티티:
- **User** - 사용자 (id, name, email, email_verified, image)
- **Session** - 세션 (token, expires_at, user_id)
- **Account** - 계정 (provider_id, access_token 등)
- **Verification** - 이메일 인증

### 2. server.auth 설정

```typescript
server: {
  // 기본 설정 (emailAndPassword 활성화)
  auth: {
    emailAndPassword: { enabled: true },
  },

  // 소셜 로그인 추가
  // auth: {
  //   emailAndPassword: { enabled: true },
  //   socialProviders: {
  //     google: {
  //       clientId: process.env.GOOGLE_CLIENT_ID!,
  //       clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  //     },
  //   },
  // },
}
```

### 3. 인증 API 엔드포인트

`/api/auth/*` 경로로 자동 등록:

| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| `/api/auth/sign-up/email` | POST | 회원가입 |
| `/api/auth/sign-in/email` | POST | 로그인 |
| `/api/auth/sign-out` | POST | 로그아웃 |
| `/api/auth/get-session` | GET | 세션 조회 |

### 4. Context에서 user/session 접근

```typescript
@api({ httpMethod: "GET", guards: ["user"] })
async me(): Promise<UserSubsetA | null> {
  const { user, session } = Sonamu.getContext();
  if (!user) return null;
  return this.findById("A", user.id);
}
```

### 5. 필드 매핑 (camelCase → snake_case)

better-auth는 camelCase, Sonamu는 snake_case 사용. 자동 매핑 적용:

| better-auth | Sonamu |
|-------------|--------|
| `emailVerified` | `email_verified` |
| `createdAt` | `created_at` |
| `userId` | `user_id` |
| `expiresAt` | `expires_at` |

---

## Guards 시스템 (권한 제어)

Sonamu 권한 시스템은 2가지 요소로 구성:

1. **GuardKeys** - 권한 키 정의
2. **guardHandler** - 권한 검사 로직

### 1. GuardKeys 확장 (커스텀 권한)

**소스코드:** `modules/sonamu/src/api/decorators.ts` (GuardKeys 인터페이스)

기본 제공: `query`, `admin`, `user`

커스텀 권한 추가 시 `src/typings/sonamu.d.ts`에서 확장:

**파일 위치:** `src/typings/sonamu.d.ts`

```typescript
import {} from "sonamu";

declare module "sonamu" {
  export interface GuardKeys {
    query: true;
    admin: true;
    user: true;
    manager: true;      // 추가
    superadmin: true;   // 추가
  }
}
```

### 2. @api 데코레이터에서 guards 사용

```typescript
// user.model.ts
import { api } from "sonamu";

class UserModelClass extends BaseModelClass {
  @api({ httpMethod: "GET", guards: ["user"] })
  async me(): Promise<UserSubsetA | null> {
    // 로그인한 사용자만 접근
  }

  @api({ httpMethod: "DELETE", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    // 관리자만 접근
  }

  @api({ httpMethod: "GET", guards: ["admin", "manager"] })
  async adminList(): Promise<UserSubsetA[]> {
    // admin 또는 manager 권한
  }
}
```

### 3. guardHandler 구현

```typescript
import { Sonamu } from "sonamu";

// sonamu.config.ts
apiConfig: {
  guardHandler: (guard, request, api) => {
    // better-auth Context에서 user 접근
    const { user } = Sonamu.getContext();

    switch (guard) {
      case "user":
        // 로그인 필수
        if (!user) {
          throw new Error("로그인이 필요합니다");
        }
        break;

      case "admin":
        // 관리자 권한 (User 엔티티에 role 필드 추가 필요)
        if (!user || (user as any).role !== "admin") {
          throw new Error("관리자만 접근 가능합니다");
        }
        break;

      case "manager":
        // 매니저 권한 (커스텀 Guard 예시)
        if (!user || ![“admin”, “manager”].includes((user as any).role)) {
          throw new Error("매니저 권한이 필요합니다");
        }
        break;

      case "query":
        // 모든 사용자 허용 (비로그인 포함)
        break;
    }
  },
},
```

**NOTE:** better-auth의 기본 User 엔티티는 `role` 필드가 없다. 권한 기반 인증이 필요하면 User 엔티티에 `role` 필드를 추가하거나, 별도 Role 엔티티를 만들어야 한다.

### 권한별 메뉴/화면 접근 제어

권한별 UI 접근 제어는 **프론트엔드에서** 처리한다:

```typescript
// web/src/lib/auth.ts
export const menuPermissions = {
  dashboard: ["user", "admin", "manager"],
  userManagement: ["admin"],
  settings: ["admin", "manager"],
  reports: ["admin", "manager"],
};

export function canAccess(userRole: string, menu: keyof typeof menuPermissions) {
  return menuPermissions[menu].includes(userRole);
}
```

```tsx
// web/src/components/Sidebar.tsx
{canAccess(user.role, "userManagement") && (
  <MenuItem href="/admin/users">사용자 관리</MenuItem>
)}
```

---

## server.plugins 상세

### session (세션 관리)

```typescript
session: {
  secret: process.env.SESSION_SECRET || "change-this-in-production",
  salt: process.env.SESSION_SALT || "mq9hDxBCDbsQDR6N",
  cookie: {
    domain: "localhost",  // 프로덕션에서 실제 도메인으로 변경
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 10,  // 10년
  },
},
```

**프로덕션 체크리스트:**
- `SESSION_SECRET`: 반드시 강력한 무작위 문자열로 변경
- `SESSION_SALT`: 16자 무작위 문자열로 변경
- `cookie.domain`: 실제 도메인으로 변경

### static (정적 파일)

```typescript
static: {
  root: path.join(import.meta.dirname, "/../", "public"),
  prefix: "/api/public",
},
```

### multipart (파일 업로드)

```typescript
multipart: {
  limits: {
    fileSize: 1024 * 1024 * 30,  // 30MB
  },
},
```

---

## server.storage 상세

### 로컬 파일 시스템

```typescript
storage: {
  drivers: {
    fs: drivers.fs({
      location: path.join(import.meta.dirname, "/../public/uploaded"),
      visibility: "public",
      urlBuilder: {
        async generateURL(key) {
          return `/api/public/uploaded/${key}`;
        },
        async generateSignedURL(key) {
          return `/api/public/uploaded/${key}`;
        },
      },
    }),
  },
},
```

### AWS S3

```typescript
storage: {
  drivers: {
    s3: drivers.s3({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
      region: process.env.S3_REGION ?? "ap-northeast-2",
      bucket: process.env.S3_BUCKET ?? "my-bucket",
      visibility: "private",
    }),
  },
},
```

---

## server.cache 상세

Sonamu는 **BentoCache**를 사용한다.

```typescript
import { drivers as cacheDrivers, store } from "sonamu/cache";

cache: {
  default: "main",
  stores: {
    main: store().useL1Layer(cacheDrivers.memory({ maxSize: "50mb" })),
  },
  ttl: "5m",
  prefix: "",
},
```

**사용 가능한 드라이버:**
- `memory` - 메모리 캐시 (기본)
- `file` - 파일 기반 캐시
- `redis` - Redis 캐시
- `knex` - DB 기반 캐시

다른 드라이버 사용 시 [BentoCache 문서](https://bentocache.dev/) 참조.

---

## server.apiConfig 상세

### contextProvider

요청마다 Context에 추가 정보 주입:

```typescript
contextProvider: (defaultContext, request) => {
  return {
    ...defaultContext,
    ip: request.ip,
    session: request.session,
    body: request.body,
    // 커스텀 필드 추가 가능
  };
},
```

### guardHandler

API 가드 처리:

```typescript
guardHandler: (guard, request, api) => {
  // guard 값에 따라 접근 제어
  if (guard === "admin" && request.user?.role !== "admin") {
    throw new Error("관리자만 접근 가능합니다");
  }
},
```

### cacheControlHandler

HTTP 캐시 헤더 설정:

```typescript
cacheControlHandler: (req) => {
  switch (req.type) {
    case "assets":
      if (req.path.match(/-[a-f0-9]+\./)) {
        return CachePresets.immutable;  // 해시 포함 파일
      }
      return CachePresets.longLived;

    case "api":
      if (req.method === "GET") {
        return CachePresets.shortLived;
      }
      return CachePresets.noCache;

    case "ssr":
      return CachePresets.ssr;

    case "csr":
      return CachePresets.shortLived;
  }
},
```

---

## server.lifecycle 상세

```typescript
lifecycle: {
  onStart: () => {
    console.log(`🌲 Server listening on http://${host}:${port}`);
  },
  onShutdown: () => {
    console.log("graceful shutdown");
    // DB 연결 종료, 리소스 정리 등
  },
  onError: (error, request, reply) => {
    console.error(error);
    reply.status(500).send({
      name: error.name,
      message: error.message,
    });
  },
},
```

---

## Sonamu 로컬 개발 환경 설정

**언제 필요한가:**
- Sonamu 프레임워크 소스코드를 수정하며 개발하는 경우
- 로컬의 Sonamu 저장소와 프로젝트를 연동하여 작업하는 경우

**문제 상황:**

pnpm link로 Sonamu를 연결하면 빌드 시 타입 에러 발생:

```
error TS2345: Argument of type 'ZodNumber' is not assignable to parameter...
  Type '2' is not assignable to type '3'.
```

**원인:**

- 링크된 Sonamu와 프로젝트가 각자의 `node_modules`를 유지
- 공통 의존성(zod 등)의 버전이 달라서 TypeScript 타입 불일치 발생
- TypeScript가 두 개의 다른 타입 정의를 동시에 참조하여 에러 발생

**해결 방법:**

### 1. pnpm-workspace.yaml에 override 추가

프로젝트 루트의 `pnpm-workspace.yaml`:

```yaml
overrides:
  sonamu: link:../../sonamu/modules/sonamu
```

### 2. packages/api/package.json에 배포 버전 명시

```json
{
  "dependencies": {
    "sonamu": "^0.7.45"  // 최신 배포 버전으로 명시
  }
}
```

### 3. 설치 실행

```bash
pnpm install
```

### 4. 빌드 확인

```bash
cd packages/api
pnpm build
```

**작동 원리:**

- **TypeScript 타입 체크**: `package.json`의 배포 버전을 보고 npm registry의 타입 정의 참조
- **실제 런타임**: `pnpm overrides`의 로컬 링크가 우선순위를 가져 로컬 소스코드 실행
- 타입 체크와 런타임을 분리하여 버전 불일치 문제 해결

**주의사항:**

- Sonamu 소스코드를 수정한 후 프로젝트에서 즉시 반영됨
- Sonamu 빌드 후 프로젝트 재시작 필요
- 일반 프로젝트 개발 시에는 npm 버전 사용 권장

---

## 환경별 설정

### 개발 환경

```env
# packages/api/.env
DB_HOST=0.0.0.0
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=1234
DATABASE_NAME=myproject
PROJECT_NAME=myproject
```

### 프로덕션 환경

```env
# packages/api/.env.production
DB_HOST=your-rds-endpoint.amazonaws.com
DB_PORT=5432
DB_USER=produser
DB_PASSWORD=strong-password-here
DATABASE_NAME=myproject_prod
PROJECT_NAME=myproject

SESSION_SECRET=very-long-random-string-at-least-32-chars
SESSION_SALT=random16charstr!

AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_REGION=ap-northeast-2
S3_BUCKET=myproject-prod-bucket
```

---

## server 추가 옵션

### baseUrl

```typescript
server: {
  baseUrl: "https://api.example.com",  // 외부 접근 URL (기본: host:port)
}
```

### fastify

Fastify 서버 옵션을 직접 전달합니다 (`logger` 제외).

### plugins 전체 목록

| 플러그인 | 타입 | 설명 |
|----------|------|------|
| `compress` | `boolean \| FastifyCompressOptions` | 응답 압축 (@fastify/compress) |
| `cors` | `boolean \| FastifyCorsOptions` | CORS 설정 |
| `formbody` | `boolean \| FastifyFormbodyOptions` | x-www-form-urlencoded 파싱 |
| `multipart` | `boolean \| FastifyMultipartOptions` | 파일 업로드 |
| `qs` | `boolean \| QsPluginOptions` | 쿼리 스트링 파싱 |
| `session` | 세션 설정 | 세션 관리 |
| `sse` | `boolean \| SsePluginOptions` | Server-Sent Events |
| `static` | `boolean \| FastifyStaticOptions` | 정적 파일 서빙 |
| `custom` | `(server: FastifyInstance) => void` | 커스텀 플러그인 등록 함수 |

## logging

로깅 설정을 정의합니다. `false`로 설정하면 로깅을 완전히 비활성화합니다.

```typescript
logging: false,  // 로깅 비활성화
// 또는
logging: {
  sinks: { /* 로그 출력 대상 정의 */ },
  filters: { /* 필터 정의 */ },
},
```

## slackConfirm

Production DB 마이그레이션 시 Slack을 통한 승인 프로세스를 활성화합니다.

```typescript
slackConfirm: {
  targets: ["production"],       // 승인이 필요한 DB 키 목록
  botToken: process.env.SLACK_BOT_TOKEN ?? "",  // Slack Bot Token (xoxb-...)
  channelId: process.env.SLACK_CHANNEL_ID ?? "", // Slack Channel ID (C...)
},
```

---

## 설정 후 체크리스트

1. `.env` 파일 생성 확인
2. Docker 실행: `pnpm docker:up`
3. 빌드 확인: `pnpm build`
4. 서버 실행: `pnpm dev`
5. Sonamu UI 접속: http://localhost:34900/sonamu-ui

프로덕션 배포 전:
- [ ] `SESSION_SECRET` 변경
- [ ] `SESSION_SALT` 변경
- [ ] `cookie.domain` 실제 도메인으로 변경
- [ ] S3 설정 (필요시)
- [ ] 에러 핸들링 로직 추가
