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
- **PostgreSQL** - Docker로 간편한 데이터베이스 설정
- **Sonamu UI** - 브라우저에서 엔티티 관리 및 마이그레이션

---

## 빠른 시작

```bash
pnpm create sonamu
```

```
? Project name: my-app
? Would you like to set up pnpm? Yes
? Would you like to set up a database using Docker? Yes
? Enter the Docker project name: my-app-container
? Enter the database user: postgres
? Enter the container name: my-app-pg
? Enter the database name: my-app
? Enter the database password: ****
```

### 실행하기

```bash
# 1. 데이터베이스 시작
cd my-app/api
pnpm db:up

# 2. API 서버 시작
pnpm dev

# 3. Web 서버 시작 (새 터미널)
cd my-app/web
pnpm dev

# 4. Sonamu UI에서 첫 번째 엔티티 생성
cd my-app/api
pnpm sonamu ui
```

🎉 **완료!**

- API: http://localhost:1028
- Sonamu UI: http://localhost:2028
- Web: http://localhost:3028

---

## 📁 생성되는 프로젝트 구조

```
my-app/
├── api/                          # 백엔드
│   ├── src/
│   │   ├── application/          # 엔티티, 모델, 타입 (자동 생성)
│   │   ├── testing/              # 테스트 유틸리티
│   │   └── index.ts              # 서버 엔트리포인트
│   ├── database/
│   │   ├── docker-compose.yml    # PostgreSQL 컨테이너
│   │   ├── fixtures/init.sql     # DB 초기화 스크립트
│   │   └── scripts/              # dump, seed 스크립트
│   ├── sonamu.config.ts          # Sonamu 설정
│   └── .env                      # 환경변수
│
├── web/                          # 프론트엔드
│   └── src/
│       ├── services/             # API 클라이언트 (자동 생성)
│       └── pages/
│
└── README.md
```

---

## 포트 구성

> 여러 프로젝트를 동시에 실행할 수 있습니다.

| 서비스         | 계산식             | 기본값 |
| -------------- | ------------------ | ------ |
| **API 서버**   | `BASE_PORT`        | 1028   |
| **Sonamu UI**  | `BASE_PORT + 1000` | 2028   |
| **Web**        | `BASE_PORT + 2000` | 3028   |
| **PostgreSQL** | 5432               | 5432   |

---

## 📜 스크립트 레퍼런스

### API (`api/`)

| 명령어           | 설명                                      |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | 개발 서버 시작 (HMR)                      |
| `pnpm build`     | 프로덕션 빌드                             |
| `pnpm start`     | 프로덕션 서버 실행                        |
| `pnpm sonamu ui` | Sonamu UI 실행 (엔티티 관리)              |
| `pnpm test`      | 테스트 실행                               |
| `pnpm db:up`     | Docker 데이터베이스 시작                  |
| `pnpm db:down`   | Docker 데이터베이스 중지                  |
| `pnpm db:reset`  | 데이터베이스 초기화 (볼륨 삭제 후 재시작) |
| `pnpm dump`      | 테스트 DB → 덤프 파일 생성                |
| `pnpm seed`      | 덤프 파일 → fixture DB 적용               |

### Web (`web/`)

| 명령어         | 설명               |
| -------------- | ------------------ |
| `pnpm dev`     | 개발 서버 시작     |
| `pnpm build`   | 프로덕션 빌드      |
| `pnpm preview` | 빌드 결과 미리보기 |

---

## 🔄 개발 워크플로우

### 1. 엔티티 생성

```bash
pnpm sonamu ui
```

브라우저에서 Sonamu UI 접속 → **Entities** 탭 → **+ Entity** 클릭

### 2. 자동 생성되는 파일들

엔티티를 생성하면 다음 파일들이 자동으로 생성됩니다:

```
api/src/application/
├── user/
│   ├── user.entity.json     # 엔티티 정의
│   ├── user.types.ts        # Zod 스키마 & 타입
│   └── user.model.ts        # 비즈니스 로직
├── sonamu.generated.ts      # 공통 타입 (자동 생성)
└── sonamu.generated.sso.ts  # 서버 전용 타입

web/src/services/
├── user/
│   ├── user.types.ts        # (api에서 복사됨)
│   └── user.service.ts      # API 클라이언트 (자동 생성)
└── sonamu.generated.ts      # (api에서 복사됨)
```

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
// web/src/pages/UserPage.tsx
import { UserService } from "src/services/user/user.service";

function UserPage() {
  const user = await UserService.findById(1);
  // user는 UserSubsetA | null 타입으로 자동 추론됨
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
