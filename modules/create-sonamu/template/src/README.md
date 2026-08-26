# 🌲 Sonamu 프로젝트

> End-to-End 타입 안전성을 갖춘 Entity 중심 풀스택 TypeScript 프레임워크

## 📁 프로젝트 구조

```
├── packages/
│   ├── api/                    # 백엔드 (Sonamu - Fastify 기반)
│   │   ├── src/
│   │   │   ├── application/    # 엔티티, 모델, 타입 (엔티티 생성 후 자동 생성)
│   │   │   ├── i18n/           # 다국어 지원 (ko, en)
│   │   │   ├── testing/        # 테스트 유틸리티
│   │   │   ├── index.ts        # 서버 진입점
│   │   │   └── sonamu.config.ts # Sonamu 설정
│   │   ├── database/
│   │   │   ├── docker-compose.yml
│   │   │   ├── fixtures/       # DB 초기화 스크립트
│   │   │   └── scripts/        # dump, seed 스크립트
│   │   └── vitest.config.ts    # 테스트 설정
│   │
│   └── web/                    # 프론트엔드 (React + Vite + SSR)
│       └── src/
│           ├── routes/         # TanStack Router (파일 기반 라우팅)
│           ├── services/       # API 클라이언트 (엔티티 생성 후 자동 생성)
│           ├── i18n/           # 다국어 지원
│           ├── contexts/       # React Context (Sonamu Provider)
│           ├── admin-common/   # 공통 컴포넌트 (ApiLogViewer 등)
│           ├── entry-client.tsx    # 클라이언트 진입점
│           └── entry-server.generated.tsx  # SSR 진입점
├── mise.toml                   # Node.js, pnpm, 루트 작업 설정
├── mise.lock                   # 플랫폼별 도구 버전 잠금
└── pnpm-workspace.yaml         # pnpm workspace 설정
```

**참고**: `application/`과 `services/` 하위의 많은 파일들은 Sonamu UI에서 첫 번째 엔티티를 생성한 후 자동으로 생성됩니다.

## 🚀 빠른 시작

이 프로젝트는 mise 전용입니다. 먼저 [mise](https://mise.jdx.dev/getting-started.html)를
설치한 뒤, 프로젝트에 고정된 도구로 명령을 실행하세요.

### 1. 개발 도구와 의존성 설치 (프로젝트 루트에서)

```bash
mise install --locked
mise exec -- pnpm install
```

### 2. 데이터베이스 시작

```bash
cd packages/api
mise exec -- pnpm docker:up
```

### 3. 개발 서버 시작

```bash
cd packages/api
mise exec -- pnpm dev
```

개발 서버가 시작되면 다음 주소로 접속할 수 있습니다:

- **API + Web (통합)**: <http://localhost:34900>
- **Sonamu UI**: <http://localhost:34900/sonamu-ui> (엔티티 관리)

> `mise exec -- pnpm dev`는 `sonamu dev`를 실행하며, 기본적으로 API와 Web을 하나의 포트로 통합 서빙합니다 (`sonamu dev all`과 동일).

### 4. 첫 번째 엔티티 생성

1. Sonamu UI 열기: <http://localhost:34900/sonamu-ui>
2. **Entities** 탭 → **"+ Entity"** 클릭
3. 엔티티 정의 (예: `User`, `Post`)
4. `api/src/application/`과 `web/src/services/`에 파일이 자동으로 생성됩니다

### 5. 앱 확인

<http://localhost:34900> 을 열어서 앱을 확인하세요!

> Web만 별도로 실행하고 싶다면 `mise exec -- pnpm sonamu dev web`을 사용할 수 있습니다 (`--` 뒤에 Vite 옵션 전달 가능).

---

## 📝 자동 생성되는 파일들

첫 번째 엔티티를 생성하면 다음 파일들이 자동으로 생성됩니다:

### API 측

```
api/src/application/
├── user/
│   ├── user.entity.json     # 엔티티 정의 (단일 진실 공급원)
│   ├── user.types.ts        # Zod 스키마 & TypeScript 타입
│   ├── user.model.ts        # 비즈니스 로직
│   └── user.model.test.ts   # 테스트 파일
├── sonamu.generated.ts      # 모든 엔티티의 공통 타입
└── sonamu.generated.sso.ts  # 서브셋 쿼리
```

### Web 측

```
web/src/services/
├── user/
│   └── user.service.ts      # API 클라이언트 (자동 생성)
├── sonamu.generated.ts      # 타입 (API에서 복사)
├── sonamu.shared.ts         # 공유 유틸리티 (josa, dateReviver 등)
└── services.generated.ts    # 통합 서비스 내보내기
```

## 🌐 포트 구성

| 서비스           | 포트                     | URL                                |
| ---------------- | ------------------------ | ---------------------------------- |
| API + Web (통합) | `BASE_PORT` (기본 34900) | <http://localhost:34900>           |
| Sonamu UI        | -                        | <http://localhost:34900/sonamu-ui> |
| PostgreSQL       | 5432                     | -                                  |

## 📜 주요 스크립트

### Root (workspace)

| 명령어                      | 설명                        |
| --------------------------- | --------------------------- |
| `mise exec -- pnpm install` | 모든 패키지 의존성 설치     |
| `mise run build`            | 모든 패키지 빌드 (api, web) |
| `mise run dev`              | 모든 패키지 개발 서버 실행  |
| `mise run format`           | 모든 패키지 코드 포맷팅     |
| `mise run check`            | 모든 패키지 코드 검사       |

### API (`packages/api/`)

| 명령어                           | 설명                                      |
| -------------------------------- | ----------------------------------------- |
| `mise exec -- pnpm dev`          | 통합 개발 서버 시작 (= `sonamu dev all`)  |
| `mise exec -- pnpm build`        | 전체 프로덕션 빌드 (= `sonamu build all`) |
| `mise exec -- pnpm build api`    | API만 빌드 (= `sonamu build api`)         |
| `mise exec -- pnpm build web`    | Web만 빌드 (= `sonamu build web`)         |
| `mise exec -- pnpm start`        | 프로덕션 서버 시작                        |
| `mise exec -- pnpm test`         | 테스트 실행                               |
| `mise exec -- pnpm docker:up`    | Docker DB 시작                            |
| `mise exec -- pnpm docker:down`  | Docker DB 중지                            |
| `mise exec -- pnpm docker:reset` | Docker DB 초기화 (볼륨 삭제 후 재시작)    |
| `mise exec -- pnpm dump`         | 테스트 DB 덤프 생성                       |
| `mise exec -- pnpm seed`         | 덤프를 fixture DB에 적용                  |

### 개발 서버 모드

| 명령어                                                              | 설명                            |
| ------------------------------------------------------------------- | ------------------------------- |
| `mise exec -- pnpm sonamu dev` / `mise exec -- pnpm sonamu dev all` | 통합 모드 (one-port: API + Web) |
| `mise exec -- pnpm sonamu dev api`                                  | API-only 모드                   |
| `mise exec -- pnpm sonamu dev web`                                  | Vite 단독 실행                  |
| `mise exec -- pnpm sonamu dev web -- --port 3028 --host 0.0.0.0`    | Vite 옵션 전달                  |

## 🛠️ 개발 워크플로우

### 1. 엔티티 생성

1. API 서버 시작 후 Sonamu UI 열기 (<http://localhost:34900/sonamu-ui>)
2. **Entities** 탭 → **"+ Entity"** 클릭
3. 엔티티 정보 입력 (이름, 필드 등)
4. **Create** 클릭 - 파일이 자동으로 생성됩니다!

### 2. 비즈니스 로직 작성

`api/src/application/{entity}/{entity}.model.ts` 파일 편집:

```typescript
import { api, BaseModelClass } from "sonamu";

class UserModelClass extends BaseModelClass {
  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  async findById(id: number): Promise<UserSubsetA | null> {
    // 비즈니스 로직 작성
    return this.findOne("A", { where: { id } });
  }
}

export const UserModel = new UserModelClass();
```

저장 → `web/src/services/user/`에 Web 서비스 코드가 자동으로 생성됩니다!

### 3. 프론트엔드에서 사용

```tsx
// web/src/routes/users/$id.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserService } from "@/services/user/user.service";

export const Route = createFileRoute("/users/$id")({
  component: UserDetailPage,
});

function UserDetailPage() {
  const { id } = Route.useParams();
  const { data: user } = useQuery({
    queryKey: ["user", id],
    queryFn: () => UserService.findById(Number(id)),
  });

  return <div>{user?.name}</div>;
}
```

### 4. 데이터베이스 마이그레이션

1. Sonamu UI 열기 → **"DB Migration"** 탭
2. 스키마 변경사항 확인
3. 마이그레이션 파일 생성
4. 마이그레이션 적용

### 5. 테스트 데이터 관리 (Fixtures)

```bash
# 1. DB 클라이언트(TablePlus 등)로 테스트 데이터 수정

# 2. 덤프 생성
mise exec -- pnpm dump

# 3. Git에 커밋
git add database/dumps/
git commit -m "feat: 테스트 데이터 추가"

# --- 팀원이 pull 받은 후 ---

# 4. fixture DB에 덤프 적용
mise exec -- pnpm seed

# 5. test DB에 fixture 동기화
mise exec -- pnpm sonamu fixture sync
```

---

## 🤖 AI 개발 도우미 (Skills)

Sonamu Skills는 프레임워크 사용법을 에이전트에 제공하는 별도 외부 패키지입니다.
필요할 때 아래 경로 중 하나를 선택해 사용자가 직접 설치할 수 있습니다.

### npx skills

```bash
mise exec -- npx skills@latest add cartanova-ai/skills
```

### Claude Code 플러그인

```bash
claude plugin marketplace add cartanova-ai/skills
claude plugin install sonamu@cartanova-ai
```

### Codex 플러그인

```bash
codex plugin marketplace add cartanova-ai/skills
codex plugin add sonamu@cartanova-ai
```

프로젝트 생성, 의존성 설치, Sonamu 패키지 lifecycle에서는 Skills를 설치하지 않으며,
외부 또는 비공개 저장소를 자동으로 가져오거나 인증하지 않습니다.

이전 버전으로 생성한 프로젝트의 `packages/api/package.json`에
`postinstall: sonamu skills sync`가 남아 있다면 해당 스크립트를 제거합니다. 호환 명령은
설치를 실패시키지 않고 외부 설치 경로만 안내하며 Skills 파일을 변경하지 않습니다.

### Claude Code 사용 예시

Skills를 설치한 뒤 Claude에게 다음과 같이 요청할 수 있습니다:

```
"User 엔티티를 생성하고 CRUD API를 만들어줘"
"Post와 Comment의 관계를 설정해줘"
"API 테스트 코드를 작성해줘"
```

에이전트는 설치된 Sonamu 스킬을 참조해 프레임워크 방식에 맞는 코드를 작성합니다.

---

## 데이터베이스

### Docker 이미지

기본적으로 `pgvector/pgvector:pg18` 이미지를 사용합니다. 이 이미지에는 다음 extension이 포함되어 있습니다:

- **pgvector** - 벡터 검색 (AI/임베딩용)

> **pgroonga (전문 검색)가 필요한 경우**
>
> pgroonga는 C 라이브러리 기반으로 별도 컴파일이 필요하여 기본 이미지에 포함되어 있지 않습니다.
> 전문 검색이 필요하다면 [pgroonga Docker 이미지](https://hub.docker.com/r/groonga/pgroonga)를 사용하거나,
> 직접 Dockerfile을 작성하여 pgroonga를 설치하세요.

### 데이터베이스 구성

| DB 이름          | 용도          |
| ---------------- | ------------- |
| `{name}`         | 메인 개발 DB  |
| `{name}_fixture` | fixture DB    |
| `{name}_test`    | 테스트 실행용 |

## 🔧 기술 스택

### 백엔드

- **Sonamu** - 엔티티 중심 프레임워크
- **Fastify** - 빠르고 오버헤드가 적은 웹 프레임워크
- **Knex.js** - SQL 쿼리 빌더
- **Zod** - TypeScript 우선 스키마 검증
- **Vitest** - 테스팅 프레임워크

### 프론트엔드

- **React 19** - UI 라이브러리
- **Vite** - 빌드 도구
- **TanStack Router** - 타입 안전 라우팅
- **TanStack Query** - 데이터 패칭 및 캐싱
- **Tailwind CSS** - 유틸리티 우선 CSS
- **SSR** - 서버 사이드 렌더링 지원

---

## 📚 더 알아보기

- [Sonamu 문서](https://sonamu.cartanova.ai)
- [Sonamu GitHub](https://github.com/cartanova-ai/sonamu)
- [Fastify 문서](https://www.fastify.io/)
- [TanStack Router](https://tanstack.com/router)
- [TanStack Query](https://tanstack.com/query)
