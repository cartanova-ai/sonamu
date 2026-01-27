---
name: sonamu-database
description: Sonamu 데이터베이스 설정 및 문제 해결. Docker 포트 충돌, DB 연결 설정. Use when database issues occur.
---

# 데이터베이스 설정

## Docker DB 실행

```bash
cd packages/api
pnpm docker:up
```

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
