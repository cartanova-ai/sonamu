# 🌲 Sonamu Framework

> E2E Type-Safety Framework

## Project structure

```
├── packages/
│   ├── api/                # 백엔드 (Sonamu (based on Fastify))
│   │   ├── src/
│   │   │   ├── application/    # 엔티티, 모델, 타입 (자동 생성 with Scaffolding)
│   │   │   ├── testing/        # 테스트 유틸리티
│   │   │   └── index.ts        # 서버 엔트리포인트
│   │   ├── database/
│   │   │   ├── docker-compose.yml
│   │   │   ├── fixtures/       # DB 초기화 스크립트
│   │   │   └── scripts/        # dump, seed 스크립트
│   │   └── sonamu.config.ts    # Sonamu 설정
│   │
│   └── web/                # 프론트엔드 (React + Vite)
│       └── src/
│           ├── services/       # API 클라이언트 (자동 생성)
│           └── pages/
└── pnpm-workspace.yaml     # pnpm workspace 설정
```

## Let's Start

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

### 4. Web 서버 시작 (새 터미널)

```bash
cd packages/web
pnpm dev
```

### 5. Sonamu UI 접속 (엔티티 관리)

API 서버가 실행 중이면 자동으로 제공됩니다:

- http://localhost:1028/sonamu-ui

## 포트 구성

| 서비스     | 포트                    | URL                             |
| ---------- | ----------------------- | ------------------------------- |
| API 서버   | `BASE_PORT` (기본 1028) | http://localhost:1028           |
| Sonamu UI  | -                       | http://localhost:1028/sonamu-ui |
| Web        | `BASE_PORT + 2000`      | http://localhost:3028           |
| PostgreSQL | 5432                    | -                               |

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

## 🛠️ Development workflow

### Create New Entity

1. API 서버 실행 후 Sonamu UI 접속 (http://localhost:1028/sonamu-ui)
2. Entities 탭 → "+ Entity" 클릭
3. 엔티티 정보 입력 후 생성
4. 자동 생성되는 파일들:
   - `api/src/application/{entity}/{entity}.entity.json`
   - `api/src/application/{entity}/{entity}.types.ts`
   - `api/src/application/{entity}/{entity}.model.ts`
   - `api/src/application/sonamu.generated.ts`

### DB Migration

1. Sonamu UI → "DB Migration" 탭
2. 변경사항 확인 후 마이그레이션 파일 생성
3. 마이그레이션 적용

### Management Fixture data for testing

```bash
# 1. 테스트 DB에서 데이터 수정 (TablePlus 등)

# 2. 덤프 생성
pnpm dump

# 3. Git 커밋
git add database/dumps/
git commit -m "feat: add test data"

# --- 동료가 받을 때 ---

# 4. 덤프를 fixture DB에 적용
pnpm seed

# 5. fixture를 테스트 DB로 동기화
pnpm sonamu fixture sync
```

## Database

### Database Configuration

| DB 이름                 | 용도            |
| ----------------------- | --------------- |
| `{name}`                | 메인 개발 DB    |
| `{name}_test`           | 테스트 실행용   |
| `{name}_fixture_remote` | 팀 공유 fixture |

## 📚 더 알아보기

- [Sonamu 공식 문서](https://github.com/ping-alive/sonamu)
- [Fastify 문서](https://www.fastify.io/)
- [Knex.js 문서](https://knexjs.org/)
- [Zod 문서](https://zod.dev/)
