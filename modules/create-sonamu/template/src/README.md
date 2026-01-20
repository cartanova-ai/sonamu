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
└── pnpm-workspace.yaml         # pnpm workspace 설정
```

**참고**: `application/`과 `services/` 하위의 많은 파일들은 Sonamu UI에서 첫 번째 엔티티를 생성한 후 자동으로 생성됩니다.

## 🚀 빠른 시작

### 1. 의존성 설치 (프로젝트 루트에서)

```bash
pnpm install
```

### 2. 데이터베이스 시작

```bash
cd packages/api
pnpm docker:up
```

### 3. API 서버 시작

```bash
cd packages/api
pnpm dev
```

API 서버가 시작되면 다음 주소로 접속할 수 있습니다:
- **API 서버**: http://localhost:1028
- **Sonamu UI**: http://localhost:1028/sonamu-ui (엔티티 관리)

### 4. 첫 번째 엔티티 생성

1. Sonamu UI 열기: http://localhost:1028/sonamu-ui
2. **Entities** 탭 → **"+ Entity"** 클릭
3. 엔티티 정의 (예: `User`, `Post`)
4. `api/src/application/`과 `web/src/services/`에 파일이 자동으로 생성됩니다

### 5. Web 서버 시작 (새 터미널에서)

```bash
cd packages/web
pnpm dev
```

http://localhost:3028 을 열어서 앱을 확인하세요!

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

| 서비스      | 포트                    | URL                             |
| ----------- | ----------------------- | ------------------------------- |
| API 서버    | `BASE_PORT` (기본 1028) | http://localhost:1028           |
| Sonamu UI   | -                       | http://localhost:1028/sonamu-ui |
| Web 클라이언트 | `BASE_PORT + 2000`      | http://localhost:3028           |
| PostgreSQL  | 5432                    | -                               |

## 📜 주요 스크립트

### Root (workspace)

| 명령어          | 설명                        |
| --------------- | --------------------------- |
| `pnpm install`  | 모든 패키지 의존성 설치     |
| `pnpm -r build` | 모든 패키지 빌드 (api, web) |
| `pnpm -r test`  | 모든 패키지 테스트 실행     |

### API (`packages/api/`)

| 명령어              | 설명                                   |
| ------------------- | -------------------------------------- |
| `pnpm dev`          | 개발 서버 시작 (HMR, Sonamu UI 포함)   |
| `pnpm build`        | 프로덕션 빌드                          |
| `pnpm start`        | 프로덕션 서버 시작                     |
| `pnpm test`         | 테스트 실행                            |
| `pnpm docker:up`    | Docker DB 시작                         |
| `pnpm docker:down`  | Docker DB 중지                         |
| `pnpm docker:reset` | Docker DB 초기화 (볼륨 삭제 후 재시작) |
| `pnpm dump`         | 테스트 DB 덤프 생성                    |
| `pnpm seed`         | 덤프를 fixture DB에 적용               |

### Web (`packages/web/`)

| 명령어         | 설명               |
| -------------- | ------------------ |
| `pnpm dev`     | 개발 서버 시작     |
| `pnpm build`   | 프로덕션 빌드      |
| `pnpm preview` | 빌드 결과 미리보기 |

## 🛠️ 개발 워크플로우

### 1. 엔티티 생성

1. API 서버 시작 후 Sonamu UI 열기 (http://localhost:1028/sonamu-ui)
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
pnpm dump

# 3. Git에 커밋
git add database/dumps/
git commit -m "feat: 테스트 데이터 추가"

# --- 팀원이 pull 받은 후 ---

# 4. fixture DB에 덤프 적용
pnpm seed

# 5. test DB에 fixture 동기화
pnpm sonamu fixture sync
```

## 데이터베이스

### 데이터베이스 구성

| DB 이름                 | 용도            |
| ----------------------- | --------------- |
| `{name}`                | 메인 개발 DB    |
| `{name}_test`           | 테스트 실행용   |
| `{name}_fixture_remote` | 팀 공유 fixture |

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

- [Sonamu 문서](https://rurruur.github.io/test-docs)
- [Sonamu GitHub](https://github.com/ping-alive/sonamu)
- [Fastify 문서](https://www.fastify.io/)
- [TanStack Router](https://tanstack.com/router)
- [TanStack Query](https://tanstack.com/query)
