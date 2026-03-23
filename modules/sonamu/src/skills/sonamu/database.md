---
name: sonamu-database
description: Sonamu 데이터베이스 설정, Seed Data 관리, 문제 해결. Docker 포트 충돌, DB 연결 설정. Use when database issues occur.
---

# 데이터베이스 설정

## Docker DB 실행

```bash
cd packages/api
pnpm docker:up
```

## 3-Tier DB 구조

Sonamu는 3단계 데이터베이스 구조를 사용합니다. 각 DB의 역할과 데이터 흐름을 이해하는 것이 중요합니다.

```
production/development master (실제 DB)
          ↓ (fixture fetch)
     project_fixture (fixture DB)
          ↓ (fixture sync)
       project_test (test DB)
```

### DB별 역할

| DB | 용도 | 데이터 출처 | 명령어 |
|----|------|-----------|--------|
| `project` | 운영/개발 실제 DB | 실제 사용자 데이터 | 직접 생성 |
| `project_fixture` | 테스트용 참조 데이터 저장소 | production에서 fetch 또는 gen으로 생성 | `pnpm sonamu fixture gen/fetch` |
| `project_test` | 테스트 실행 환경 | fixture에서 sync | `pnpm sonamu fixture sync` |

### 데이터 흐름

**1. fixture fetch (실제 데이터 가져오기)**
```bash
pnpm sonamu fixture fetch --include User --limit 10
```
- production/development master → fixture DB
- 실제 운영 데이터를 테스트용으로 복사
- 관련 데이터(FK)도 함께 가져옴

**2. fixture gen (더미 데이터 생성)**
```bash
pnpm sonamu fixture gen --include Department --count 5
```
- fixture DB 내부에서 faker 기반 생성
- 참조 관계(FK) 자동 해결
- 한국어 데이터 생성 지원

**3. fixture sync (테스트 DB 동기화)**
```bash
pnpm sonamu fixture sync
```
- fixture DB → test DB
- 테스트 실행 전 최신 상태로 동기화
- 각 테스트는 트랜잭션으로 격리되어 자동 롤백

### 주의사항

**CRITICAL: sourceDb vs targetDb 혼동 방지**

- `fixture gen`: sourceDb=fixture, targetDb=fixture (fixture 내부에서 생성)
- `fixture fetch`: sourceDb=production, targetDb=fixture (production → fixture)
- 잘못 설정하면 FK 참조 오류 발생

**예시 (올바른 설정)**:
```typescript
// fixture gen: fixture DB 내에서 참조 및 저장
const fixtureDb = createKnexInstance(Sonamu.dbConfig.fixture);
const generator = new FixtureGenerator(fixtureDb, fixtureDb, "fixture", EntityManager);

// fixture fetch: production → fixture DB
const sourceDb = DB.getDB("r"); // production_master
const fixtureDb = createKnexInstance(Sonamu.dbConfig.fixture);
const generator = new FixtureGenerator(sourceDb, fixtureDb, "fixture", EntityManager);
```

**참고**: Fixture CLI 명령어 상세 사용법은 `fixture-cli.md` 참조

---

## Seed Data 관리

테스트를 위한 기본 데이터(seed data)는 dump 파일에 추가하여 관리한다.

### 전체 워크플로우 개요

Seed data 관리는 2단계로 진행된다:

| 단계 | 목적 | 대상 DB |
|------|------|---------|
| **Phase 1** | 개발/테스트용 seed 준비 | `project_test`, `project_fixture` |
| **Phase 2** | 실제 DB에 seed 적용 | `project` (실제 DB) |

---

### Phase 1: 개발/테스트용 Seed 준비

개발 중 테스트를 위한 더미 데이터를 준비하는 단계.

#### 1-1. 초기 dump 생성 (테이블 구조만)

```bash
pnpm dump
```

이 시점에서 생성된 `database/scripts/dump.sql`은:
- CREATE TABLE 구문
- CREATE SEQUENCE 구문
- ALTER TABLE ... PRIMARY KEY
- ALTER TABLE ... FOREIGN KEY
- **INSERT문은 없음** (아직 데이터가 없으므로)

#### 1-2. dump 파일에 INSERT문 추가

`database/scripts/dump.sql` 파일을 열고, **FK CONSTRAINT 전**에 INSERT문을 추가한다.

**중요: FK 의존성 순서를 고려하여 작성**
```sql
-- 독립 테이블부터
INSERT INTO public.institutions (id, created_at, name, code) VALUES
  (1, '2024-01-01 00:00:00+09', '본원', 'HQ');

-- 참조 테이블 (institutions를 참조)
INSERT INTO public.departments (id, created_at, name, code, institution_id) VALUES
  (1, '2024-01-01 00:00:00+09', '연구부', 'RND', 1);

-- 시퀀스 값 설정 (INSERT 후)
SELECT pg_catalog.setval('public.institutions_id_seq', 1, true);
SELECT pg_catalog.setval('public.departments_id_seq', 1, true);
```

#### 1-3. test DB에 적용

```bash
pnpm seed
```

`database/scripts/seed.sh`가 실행되며:
- `SOURCE_DB="${DATABASE_NAME}_test"` → dump.sql을 test DB에 적용

#### 1-4. fixture DB에 동기화

```bash
pnpm sonamu fixture sync
```

test DB의 데이터를 fixture DB로 복사.

---

### Phase 2: 실제 DB에 Seed 적용

**⚠️ CRITICAL WARNING:**
- 이 단계는 실제 DB(`project`)에 데이터를 넣는다
- 기존 데이터가 있다면 덮어쓰여질 수 있다
- **반드시 사용자에게 확인 후 진행해야 한다**

**Claude Code 규칙:**
```
실제 DB에 seed를 적용하기 전에:
1. 사용자에게 "실제 데이터베이스(project)에 seed 데이터를 적용하시겠습니까?" 질문
2. 사용자가 명시적으로 승인할 때만 진행
3. 승인 없이 절대 실행하지 말것
```

#### 2-1. 현재 상태 확인

```bash
# test/fixture DB에 데이터가 들어가 있어야 함
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_test -c "SELECT COUNT(*) FROM users;"
```

#### 2-2. 최종 dump 생성

```bash
# test/fixture의 데이터가 포함된 dump 생성
pnpm dump
```

이번 dump에는 **INSERT문이 포함**되어 있다 (1-2에서 추가한 데이터).

#### 2-3. seed.sh 파일 수정

`database/scripts/seed.sh`를 열고 FIXTURE_DB 변경:

```bash
# 변경 전 (개발/테스트 단계)
FIXTURE_DB="${DATABASE_NAME}_fixture"

# 변경 후 (실제 DB에 seed)
FIXTURE_DB="${DATABASE_NAME}"
```

#### 2-4. 실제 DB에 seed 실행

**⚠️ 사용자 승인 후에만 실행:**

```bash
pnpm seed
```

이제 실제 DB(`project`)에 seed 데이터가 적용된다.

#### 2-5. 확인

```bash
# 실제 DB에서 데이터 확인
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project -c "SELECT * FROM departments LIMIT 5;"
```

#### 2-6. seed.sh 원복 (중요!)

실제 DB seed 완료 후, seed.sh를 원래대로 되돌려야 다음 개발 시 test DB를 사용한다:

```bash
# database/scripts/seed.sh
FIXTURE_DB="${DATABASE_NAME}_fixture"  # 원복
```

---

### 요약: Phase 1 vs Phase 2

| 항목 | Phase 1 (개발/테스트) | Phase 2 (실제 DB) |
|------|---------------------|------------------|
| **시점** | 개발 중 테스트 데이터 준비 | 개발 완료 후 실제 데이터 준비 |
| **dump 횟수** | 1회 (테이블 구조) | 2회 (데이터 포함) |
| **대상 DB** | `project_test` → `project_fixture` | `project` |
| **seed.sh** | `FIXTURE_DB="${DATABASE_NAME}_fixture"` | `FIXTURE_DB="${DATABASE_NAME}"` |
| **사용자 승인** | 불필요 | **반드시 필요** |

---

### 구 워크플로우 (Phase 1 간단 버전)

```bash
# 1. test DB에 기본 데이터 직접 추가 (psql 또는 Sonamu UI 사용)
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_test

# 2. dump 생성
pnpm dump

# 3. fixture DB에 적용
pnpm seed

# 4. (선택) sonamu fixture sync
pnpm sonamu fixture sync
```

### dump 파일에 seed data 추가 시 위치

**pg_dump --inserts 출력 순서 (miomock 기준):**

```sql
-- 1~40: SET statements & Extensions
SET statement_timeout = 0;
CREATE EXTENSION IF NOT EXISTS ...;

-- ~400: CREATE TABLE
CREATE TABLE public.companies (...);
CREATE TABLE public.departments (...);

-- ~450: CREATE SEQUENCE
CREATE SEQUENCE public.companies_id_seq ...;

-- ~470: ALTER SEQUENCE OWNED BY
ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;

-- 480~564: ALTER TABLE ... DEFAULT (Name: xxx id; Type: DEFAULT)
ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval(...);

-- ⭐ 574~1770: INSERT INTO ... ← SEED DATA 추가 위치
INSERT INTO public.companies VALUES (1, '2025-11-25 00:17:02+09', '테크놀로지 주식회사');
INSERT INTO public.departments VALUES (1, '2024-01-01 01:00:00+09', '개발팀', 1, NULL, DEFAULT);
INSERT INTO public.employees VALUES (1, '2024-01-01 01:00:00+09', 1, 3, 'EMP001', 75000.00, ...);

-- 1775~1862: SELECT pg_catalog.setval (Name: xxx_id_seq; Type: SEQUENCE SET)
SELECT pg_catalog.setval('public.companies_id_seq', 308, true);

-- 1878~2006: ALTER TABLE ... PRIMARY KEY
ALTER TABLE ONLY public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

-- 2010~2017: CREATE INDEX
CREATE INDEX projects_name_description_pgroonga_index ON public.projects ...;

-- WRONG 2024~: ALTER TABLE ... FOREIGN KEY (FK constraint - 이 전에 데이터 있어야 함!)
ALTER TABLE ONLY public.departments 
    ADD CONSTRAINT departments_company_id_foreign FOREIGN KEY (company_id) REFERENCES public.companies(id);
```

### CRITICAL: Seed Data 위치 규칙

**seed data는 반드시 FK CONSTRAINT 전에 추가해야 한다.**

| 위치 | 결과 |
|------|------|
| FK CONSTRAINT 전 | OK - 데이터 삽입 후 FK 검사 |
| FK CONSTRAINT 후 | FAIL - 참조 테이블 데이터 없어서 FK 위반 |

### 테이블 간 의존성 순서

seed data INSERT 순서는 **FK 의존성**을 따라야 한다:

```sql
-- 1. 독립 테이블 먼저 (FK 없는 테이블)
INSERT INTO public.institutions (id, name, code) VALUES (1, '본원', 'HQ');

-- 2. 1을 참조하는 테이블
INSERT INTO public.departments (id, name, institution_id) VALUES (1, '연구부', 1);

-- 3. 1, 2를 참조하는 테이블
INSERT INTO public.users (id, name, institution_id, department_id) VALUES (1, '관리자', 1, 1);
```

### 시퀀스 값 설정

seed data 추가 후 시퀀스 현재값도 업데이트해야 한다:

```sql
-- seed data의 최대 id 이후로 시퀀스 설정
SELECT pg_catalog.setval('public.users_id_seq', 10, true);  -- 다음 id는 11부터
SELECT pg_catalog.setval('public.departments_id_seq', 5, true);
```

### 예시: 최소 seed data

```sql
-- institutions (독립)
INSERT INTO public.institutions (id, created_at, name, code) VALUES 
  (1, '2024-01-01 00:00:00+09', '본원', 'HQ');

-- departments (institutions 참조)
INSERT INTO public.departments (id, created_at, name, code, institution_id, is_active) VALUES 
  (1, '2024-01-01 00:00:00+09', '연구부', 'RND', 1, true);

-- 시퀀스 설정
SELECT pg_catalog.setval('public.institutions_id_seq', 1, true);
SELECT pg_catalog.setval('public.departments_id_seq', 1, true);
```

---

## 포트 충돌 해결

`pnpm docker:up` 실행 시 포트가 이미 사용중이라는 오류가 발생하면:

### 1단계: 실행 중인 컨테이너 확인

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

### 2단계: 컨테이너명 비교

**현재 프로젝트의 컨테이너명 확인:**
```bash
# packages/api/.env 파일에서 CONTAINER_NAME 확인
cat packages/api/.env | grep CONTAINER_NAME
```

### 3단계: 상황별 처리

#### 컨테이너명이 동일한 경우

이전에 같은 프로젝트의 컨테이너가 띄워져 있는 것. 내리고 다시 올리기:

```bash
cd packages/api
pnpm docker:down
pnpm docker:up
```

#### 컨테이너명이 다른 경우

다른 프로젝트가 같은 포트를 사용 중. 새 프로젝트의 포트를 변경해야 함.

**수정할 파일 2개:**

1. `packages/api/.env`
```bash
# 변경 전
DB_PORT=5432

# 변경 후 (5433~5439 중 사용하지 않는 포트)
DB_PORT=5433
```

2. `packages/api/database/docker-compose.yml`
```yaml
# 변경 전
ports:
  - "5432:5432"

# 변경 후
ports:
  - "5433:5432"
```

3. `packages/api/src/sonamu.config.ts`
```typescript
// 변경 전
port: 5432,

// 변경 후
port: 5433,
```

**포트 선택 가이드:**
- PostgreSQL 기본 포트: 5432
- 사용 가능한 범위: 5433 ~ 5439
- `docker ps`로 현재 사용 중인 포트 확인 후 중복되지 않는 번호 선택

### 변경 후 재실행

```bash
pnpm docker:up
```

## DB 연결 설정 파일

| 파일 | 용도 |
|------|------|
| `packages/api/.env` | 환경변수 (DB_HOST, DB_PORT, DB_USER 등) |
| `packages/api/database/docker-compose.yml` | Docker 컨테이너 설정 |
| `packages/api/src/sonamu.config.ts` | Sonamu DB 연결 설정 |

## .env 기본 설정

```bash
DB_HOST=0.0.0.0
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=1234
CONTAINER_NAME=[프로젝트명]-container
DATABASE_NAME=[프로젝트명]
```
