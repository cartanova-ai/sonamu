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

## Seed Data 관리

테스트를 위한 기본 데이터(seed data)는 dump 파일에 추가하여 관리한다.

### 워크플로우

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

-- ❌ 2024~: ALTER TABLE ... FOREIGN KEY (FK constraint - 이 전에 데이터 있어야 함!)
ALTER TABLE ONLY public.departments 
    ADD CONSTRAINT departments_company_id_foreign FOREIGN KEY (company_id) REFERENCES public.companies(id);
```

### CRITICAL: Seed Data 위치 규칙

**seed data는 반드시 FK CONSTRAINT 전에 추가해야 한다.**

| 위치 | 결과 |
|------|------|
| FK CONSTRAINT 전 | ✅ 정상 - 데이터 삽입 후 FK 검사 |
| FK CONSTRAINT 후 | ❌ 실패 - 참조 테이블 데이터 없어서 FK 위반 |

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
