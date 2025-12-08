# 🌲 Sonamu Framework

> E2E Type-Safety Framework

## Project structure

```
├── api/                    # 백엔드 (Sonamu (based on Fastify))
│   ├── src/
│   │   ├── application/    # 엔티티, 모델, 타입 (자동 생성 with Scaffolding)
│   │   ├── testing/        # 테스트 유틸리티
│   │   └── index.ts        # 서버 엔트리포인트
│   ├── database/
│   │   ├── docker-compose.yml
│   │   ├── fixtures/       # DB 초기화 스크립트
│   │   └── scripts/        # dump, seed 스크립트
│   └── sonamu.config.ts    # Sonamu 설정
│
└── web/                    # 프론트엔드 (React + Vite)
    └── src/
        ├── services/       # API 클라이언트 (자동 생성)
        └── pages/
```

## Let's Start

### 1. 데이터베이스 시작

```bash
cd api
pnpm db:up
```

### 2. API 서버 시작

```bash
cd api
pnpm dev
```

### 3. Web 서버 시작 (새 터미널)

```bash
cd web
pnpm dev
```

### 4. Sonamu UI 열기 (엔티티 관리)

```bash
cd api
pnpm sonamu ui
```

## 포트 구성

| 서비스     | 포트                    | URL                   |
| ---------- | ----------------------- | --------------------- |
| API 서버   | `BASE_PORT` (기본 1028) | http://localhost:1028 |
| Sonamu UI  | `BASE_PORT + 1000`      | http://localhost:2028 |
| Web        | `BASE_PORT + 2000`      | http://localhost:3028 |
| PostgreSQL | 5432                    | -                     |

## 📜 주요 스크립트

### API (`api/`)

| 명령어           | 설명                                   |
| ---------------- | -------------------------------------- |
| `pnpm dev`       | 개발 서버 시작 (HMR)                   |
| `pnpm build`     | 프로덕션 빌드                          |
| `pnpm start`     | 프로덕션 서버 시작                     |
| `pnpm sonamu ui` | Sonamu UI 실행                         |
| `pnpm test`      | 테스트 실행                            |
| `pnpm db:up`     | Docker DB 시작                         |
| `pnpm db:down`   | Docker DB 중지                         |
| `pnpm db:reset`  | Docker DB 초기화 (볼륨 삭제 후 재시작) |
| `pnpm dump`      | 테스트 DB 덤프 생성                    |
| `pnpm seed`      | 덤프를 fixture DB에 적용               |

### Web (`web/`)

| 명령어         | 설명               |
| -------------- | ------------------ |
| `pnpm dev`     | 개발 서버 시작     |
| `pnpm build`   | 프로덕션 빌드      |
| `pnpm preview` | 빌드 결과 미리보기 |

## 🛠️ Development workflow

### Create New Entity

1. `pnpm sonamu ui` 실행
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
