---
name: sonamu-migration
description: Sonamu 데이터베이스 마이그레이션. CREATE/ALTER TABLE, FK 순서, up/down 함수. Use when modifying database schema.
---

# Migration

## Sonamu UI에서 Migration 생성 (권장)

**사전 준비:**
- `/packages/api`에서 `pnpm dev` 실행 중이어야 함
- 브라우저에서 Sonamu UI 접속: `http://localhost:34900/sonamu-ui` (기본 포트)

**절차:**
1. Sonamu UI의 Migration 메뉴로 이동
2. Entity 변경사항이 자동 감지됨
3. "Create Migration" 버튼 클릭
4. Migration 파일이 `packages/api/src/migrations/` 에 생성됨

**장점:**
- Entity 변경사항을 자동 감지하여 Migration 파일 생성
- UI에서 바로 Migration 샤행 가능
- Rollback 기능 제공

## 기본 구조

```typescript
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 변경 적용
}

export async function down(knex: Knex): Promise<void> {
  // 변경 롤백
}
```

## CREATE TABLE

```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (table) => {
    table.increments().primary();
    table.string("email", 255).notNullable();
    table.string("username", 255).notNullable();
    table.text("role").notNullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.unique(["email"], "users_email_unique");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("users");
}
```

## ALTER TABLE

```typescript
// 컬럼 추가
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.string("phone", 20).nullable();
  });
}

// 컬럼 삭제
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumns("phone");
  });
}
```

## FOREIGN KEY

```typescript
export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    table.foreign("user_id").references("users.id").onUpdate("CASCADE").onDelete("CASCADE");
    table.foreign("department_id").references("departments.id").onUpdate("CASCADE").onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    table.dropForeign(["user_id"]);
    table.dropForeign(["department_id"]);
  });
}
```

## 명령어

**`packages/api`** 디렉토리에서 실행:

```bash
cd packages/api
pnpm sonamu migrate run      # 로컬 DB에 모든 Migration 실행
pnpm sonamu migrate status   # 상태 확인
pnpm sonamu migrate apply    # 특정 DB 설정 대상으로 적용
```

**주의**: `migrate up`, `migrate rollback`은 CLI에서 제공하지 않음. Sonamu UI에서 롤백 가능.

## Entity Type → DB Type

| Entity | DB | Knex |
|--------|-----|------|
| `string` | `varchar(n)` | `table.string(name, length)` |
| `integer` | `integer` | `table.integer(name)` |
| `bigInteger` | `bigint` | `table.bigInteger(name)` |
| `boolean` | `boolean` | `table.boolean(name)` |
| `number` | `numeric(p,s)` | `table.decimal(name, p, s)` |
| `date` | `timestamptz` | `table.timestamp(name, { useTz: true })` |
| `json` | `jsonb` | `table.jsonb(name)` |
| `enum` | `text` | `table.text(name)` |

## 실행 순서 (중요!)

```
1. CREATE TABLE companies       (의존성 없음)
2. CREATE TABLE departments     (company_id 컬럼만)
3. CREATE TABLE users           (의존성 없음)
4. CREATE TABLE employees       (user_id, department_id 컬럼만)
5. FOREIGN KEY departments      (company_id → companies.id)
6. FOREIGN KEY employees        (user_id → users.id, etc.)
```

## Rules

- Migration files are generated from Sonamu UI
- MUST implement rollback logic in `down` function
- Foreign keys MUST be added in separate migration after table creation

## IMPORTANT: Check Before Running sync

### 1. MUST Build dist First

sync 명령은 `dist/sonamu.config.js`를 참조합니다. 없으면 오류 발생.

```bash
cd packages/api
npx swc src/sonamu.config.ts -o dist/sonamu.config.js --config-file .swcrc
```

### 2. DB 연결 확인

```bash
# Docker 컨테이너 확인
docker ps | grep container

# sonamu.config.ts에서 DB 설정 확인
# - host, port, database, user, password
# - PostgreSQL vs MySQL 구분
```

### 3. 순환 참조 시

마이그레이션을 분리하거나, FK를 nullable로 설정 후 나중에 추가.

## 전체 워크플로우

```bash
cd packages/api

# 1. config 빌드
npx swc src/sonamu.config.ts -o dist/sonamu.config.js --config-file .swcrc

# 2. sync 실행
pnpm sonamu sync

# 3. Sonamu UI에서 마이그레이션 생성/실행

# 4. 스캐폴딩 실행

# 5. model orderBy 케이스 확인/추가 (model.md 참조)

# 6. API 빌드
npm run build

# 7. Web form 확인/수정 (frontend.md 참조)

# 8. Web 빌드
cd ../web && npm run build
```
