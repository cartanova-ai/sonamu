# 🌲 create-sonamu

> Sonamu 프로젝트를 30초 만에 시작하세요.

[![npm version](https://img.shields.io/npm/v/create-sonamu.svg)](https://www.npmjs.com/package/create-sonamu)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

Sonamu는 **Entity-driven 풀스택 TypeScript 프레임워크**입니다. 엔티티를 정의하면 타입, API, 프론트엔드 서비스 코드가 자동으로 생성됩니다.

---

## 주요 특징

- **즉시 시작** - 프로젝트 생성부터 개발 서버 실행까지 1분
- **코드 자동 생성** - 엔티티 정의 → 타입, API, 서비스 코드 자동 생성
- **타입 안전성** - Zod 스키마 기반 End-to-End 타입 보장
- **HMR 지원** - 코드 변경 시 서버 재시작 없이 즉시 반영
- **SSR 지원** - React Server-Side Rendering 기본 탑재
- **PostgreSQL** - Docker로 간편한 데이터베이스 설정
- **Sonamu UI** - 브라우저에서 엔티티 관리 및 마이그레이션
- **Modern Stack** - TanStack Router, React Query, Tailwind CSS

---

## 빠른 시작

### 대화형 모드

```bash
pnpm create sonamu
```

```
? Project name: my_app
? Would you like to set up pnpm? Yes
? Would you like to set up a database using Docker? Yes
? Enter the Docker project name: my-app-container
? Enter the database user: postgres
? Enter the container name: my-app-pg
? Enter the database name: my-app
? Enter the database password: ****
```

> **프로젝트명 규칙**
> - 공백(space) 사용 불가
> - 하이픈(`-`) 사용 불가 (PostgreSQL DB 이름, 환경변수 호환성)
> - 언더스코어(`_`) 권장 (예: `my_project`, `test_app`)

### CLI 옵션 모드

```bash
# 프로젝트명만 지정 (언더스코어 사용)
pnpm create sonamu my_project

# 모든 질문을 기본값으로 자동 응답
pnpm create sonamu my_project --yes

# pnpm 설치 스킵
pnpm create sonamu my_app --skip-pnpm

# Docker 설정 스킵
pnpm create sonamu my_app --skip-docker

# DB 정보 지정
pnpm create sonamu my_app \
  --db-user=postgres \
  --db-password=mypassword \
  --db-name=myapp \
  --container-name=myapp-pg \
  --docker-project=myapp-docker
```

#### 사용 가능한 옵션

| 옵션               | 설명                             | 기본값                 |
| ------------------ | -------------------------------- | ---------------------- |
| `--yes`, `-y`      | 모든 질문에 기본값으로 자동 응답 | -                      |
| `--skip-pnpm`      | pnpm 설치 건너뛰기               | false                  |
| `--skip-docker`    | Docker DB 설정 건너뛰기          | false                  |
| `--db-user`        | 데이터베이스 사용자              | postgres               |
| `--db-password`    | 데이터베이스 비밀번호            | (프롬프트로 입력)      |
| `--db-name`        | 데이터베이스 이름                | {프로젝트명}           |
| `--container-name` | Docker 컨테이너 이름             | {프로젝트명}-container |
| `--docker-project` | Docker Compose 프로젝트명        | {프로젝트명}-docker    |

### 실행하기

```bash
# 1. 데이터베이스 시작
cd my_app/packages/api
pnpm docker:up

# 2. API 서버 시작 (Sonamu UI 포함)
pnpm dev

# 3. Web 서버 시작 (새 터미널)
cd my_app/packages/web
pnpm dev
```

🎉 **완료!**

- API: http://localhost:1028
- Sonamu UI: http://localhost:1028/sonamu-ui (엔티티 관리)
- Web: http://localhost:3028

---

## 📁 생성되는 프로젝트 구조

```
├── packages/
│   ├── api/                    # 백엔드 (Sonamu based on Fastify)
│   │   ├── src/
│   │   │   ├── application/    # 엔티티, 모델, 타입 (Entity 추가 후 생성)
│   │   │   ├── i18n/           # 다국어 지원 (ko, en)
│   │   │   ├── testing/        # 테스트 유틸리티
│   │   │   ├── index.ts        # 서버 엔트리포인트
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
│           ├── services/       # API 클라이언트 (Entity 추가 후 생성)
│           ├── i18n/           # 다국어 지원
│           ├── contexts/       # React Context (Sonamu Provider)
│           ├── admin-common/   # 공통 컴포넌트 (ApiLogViewer 등)
│           ├── entry-client.tsx    # 클라이언트 엔트리
│           └── entry-server.generated.tsx  # SSR 엔트리
└── pnpm-workspace.yaml         # pnpm workspace 설정
```

---

## 포트 구성

> 여러 프로젝트를 동시에 실행할 수 있습니다.

| 서비스         | 포트               | URL                              |
| -------------- | ------------------ | -------------------------------- |
| **API 서버**   | `BASE_PORT` (1028) | http://localhost:1028            |
| **Sonamu UI**  | -                  | http://localhost:1028/sonamu-ui  |
| **Web 개발**   | `BASE_PORT + 2000` (3028) | http://localhost:3028     |
| **PostgreSQL** | 5432               | -                                |

**참고**:
- Sonamu UI는 API 서버에 통합되어 있어 별도 실행이 필요 없습니다
- Web은 개발 중에는 Vite dev 서버(3028)로, 프로덕션에서는 빌드 후 API 서버에서 서빙됩니다

---

## 📜 스크립트 레퍼런스

### API (`api/`)

| 명령어           | 설명                                      |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | 개발 서버 시작 (HMR, Sonamu UI 포함)      |
| `pnpm build`     | 프로덕션 빌드                             |
| `pnpm start`     | 프로덕션 서버 실행                        |
| `pnpm test`      | 테스트 실행                               |
| `pnpm db:up`     | Docker 데이터베이스 시작                  |
| `pnpm db:down`   | Docker 데이터베이스 중지                  |
| `pnpm db:reset`  | 데이터베이스 초기화 (볼륨 삭제 후 재시작) |
| `pnpm dump`      | 테스트 DB → 덤프 파일 생성                |
| `pnpm seed`      | 덤프 파일 → fixture DB 적용               |

### Web (`web/`)

| 명령어         | 설명                          |
| -------------- | ----------------------------- |
| `pnpm dev`     | 개발 서버 시작 (Vite)         |
| `pnpm build`   | 프로덕션 빌드 (Client + SSR)  |
| `pnpm preview` | 빌드 결과 미리보기            |

**참고**: `pnpm build`는 클라이언트와 SSR 서버를 모두 빌드합니다. 빌드 결과는 `api/public/web`과 `api/dist/ssr`에 복사됩니다.

---

## 🔄 개발 워크플로우

### 1. 엔티티 생성

API 서버를 실행한 상태에서 http://localhost:1028/sonamu-ui 접속 → **Entities** 탭 → **+ Entity** 클릭

### 2. 자동 생성되는 파일들

**주의**: 프로젝트를 처음 생성했을 때는 Entity가 없으므로 이 파일들이 생성되지 않습니다.
첫 번째 Entity를 추가하면 다음 파일들이 자동으로 생성됩니다:

```
api/src/application/
├── user/
│   ├── user.entity.json     # 엔티티 정의 (SSoT)
│   ├── user.types.ts        # Zod 스키마 & 타입
│   └── user.model.ts        # 비즈니스 로직
├── sonamu.generated.ts      # 모든 Entity의 공통 타입 (자동 생성)
└── sonamu.generated.sso.ts  # 서브셋 쿼리 (자동 생성)

web/src/services/
├── user/
│   ├── user.types.ts        # (api에서 복사됨)
│   └── user.service.ts      # API 클라이언트 (자동 생성)
├── sonamu.generated.ts      # (api에서 복사됨)
├── sonamu.shared.ts         # 공통 유틸 (josa, dateReviver 등)
└── services.generated.ts    # 통합 서비스 (자동 생성)
```

**초기 상태**: 빌드 가능하도록 최소한의 스텁 파일들이 포함되어 있습니다.
**Entity 추가 후**: 실제 코드 생성 파일들로 자동 교체됩니다.

### 3. API 작성

```typescript
// api/src/application/user/user.model.ts
import { api } from "sonamu";

class UserModelClass extends BaseModelClass {
  @api({ httpMethod: "GET" })
  async findById(id: number): Promise<UserSubsetA | null> {
    // 구현
  }

  @api({ httpMethod: "POST" })
  async create(params: UserCreateParams): Promise<number> {
    // 구현
  }
}
```

저장하면 프론트엔드 서비스 코드가 자동 생성됩니다:

```typescript
// web/src/services/user/user.service.ts (자동 생성)
export const UserService = {
  findById: (id: number) => fetch<UserSubsetA | null>({ ... }),
  create: (params: UserCreateParams) => fetch<number>({ ... }),
};
```

### 4. 프론트엔드에서 사용

```tsx
// web/src/routes/users/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserService } from "@/services/user/user.service";

export const Route = createFileRoute("/users/")({
  component: UserListPage,
});

function UserListPage() {
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => UserService.findMany({ num: 10, page: 1 }),
  });
  // users는 ListResult<UserSubsetA> 타입으로 자동 추론됨

  return <div>{/* ... */}</div>;
}
```

---

## 🗄️ 데이터베이스

### 데이터베이스 구성

| DB 이름                 | 용도            |
| ----------------------- | --------------- |
| `{name}`                | 메인 개발 DB    |
| `{name}_test`           | 테스트 실행용   |
| `{name}_fixture_remote` | 팀 공유 fixture |

### Fixture 워크플로우

```bash
# 테스트 데이터 수정 후
pnpm dump                      # 덤프 생성
git add database/dumps/
git commit -m "update fixture"

# 동료가 받을 때
git pull
pnpm seed                      # fixture DB에 적용
pnpm sonamu fixture sync       # 테스트 DB로 동기화
```

---

## 📋 요구사항

- **Node.js** >= 18
- **pnpm** >= 10
- **Docker** (데이터베이스용)

---

## ❓ FAQ

### Q: yarn이나 npm으로도 사용할 수 있나요?

- 프로젝트는 pnpm workspace를 사용하도록 설계되었습니다. pnpm 사용을 권장합니다.

### Q: MySQL을 사용할 수 있나요?

- PostgreSQL만 지원합니다. create-sonamu 템플릿은 PostgreSQL 기준으로 설정되어 있습니다.

### Q: 기존 프로젝트에 Sonamu를 추가할 수 있나요?

- `create-sonamu`는 새 프로젝트용입니다. 기존 프로젝트에는 `sonamu` 패키지를 직접 설치하고 설정하세요.

---

## 📚 더 알아보기

- 📖 [Sonamu 공식 문서](https://rurruur.github.io/test-docs)
- 💬 [이슈 & 피드백](https://github.com/cartanova-ai/sonamu/issues)

---

## 📄 라이선스

MIT
