---
name: sonamu-migration
description: Sonamu 데이터베이스 마이그레이션. CREATE/ALTER TABLE, FK 순서, up/down 함수. Use when modifying database schema.
---

# Migration

## CRITICAL: Migration은 Sonamu UI 또는 CLI로 생성한다

**Migration 파일을 직접 작성하거나 SQL을 직접 실행하지 않는다.** Sonamu가 entity.json 변경사항을 감지하여 정확한 migration 파일을 생성해준다.

**사전 준비:**
- `/packages/api`에서 `pnpm dev` 실행 중이어야 함

**방법 1: Sonamu UI (사용자에게 확인 후 선택)**
1. 브라우저에서 Sonamu UI 접속: `http://localhost:34900/sonamu-ui`
2. Migration 메뉴에서 prepared 리스트 확인
3. "Generate" 버튼으로 migration 파일 생성
4. "Apply" 버튼으로 실제 DB에 적용

**방법 2: CLI**
```bash
cd packages/api
pnpm sonamu migrate generate   # migration 파일 생성
pnpm sonamu migrate run         # 실제 DB에 적용
```

**CRITICAL: 사용자에게 UI와 CLI 중 어떤 방식으로 진행할지 물어본 후 진행한다.**

**DO NOT:**
- Migration 파일을 수동으로 작성
- `CREATE TABLE`, `ALTER TABLE` 등 SQL을 직접 실행

**예외:** PK 타입 변경 등 Sonamu가 자동 처리할 수 없는 특수 케이스만 raw SQL 허용 (아래 "PK 타입 변경" 섹션 참조)

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

## PK 타입 변경

### 상황
기존 테이블의 PK 타입을 변경해야 하는 경우 (예: integer -> text, bigint -> uuid 등). 해당 PK를 참조하는 FK들이 여러 테이블에 존재하는 상황.

### 필수 순서

참조 무결성이 있는 컬럼(FK가 참조하는 PK)의 타입을 변경할 때는 반드시 다음 순서를 따라야 함:

```typescript
export async function up(knex: Knex): Promise<void> {
  // 1단계: 해당 PK를 참조하는 모든 FK constraint DROP
  await knex.raw('ALTER TABLE "child_table_1" DROP CONSTRAINT "child_table_1_parent_id_foreign"');
  await knex.raw('ALTER TABLE "child_table_2" DROP CONSTRAINT "child_table_2_parent_id_foreign"');

  // 2단계: PK constraint DROP
  await knex.raw('ALTER TABLE "parent_table" DROP CONSTRAINT "parent_table_pkey"');

  // 3단계: PK 컬럼과 모든 FK 컬럼의 타입을 동시에 변경
  await knex.raw('ALTER TABLE "parent_table" ALTER COLUMN "id" TYPE new_type USING "id"::new_type');
  await knex.raw('ALTER TABLE "child_table_1" ALTER COLUMN "parent_id" TYPE new_type USING "parent_id"::new_type');
  await knex.raw('ALTER TABLE "child_table_2" ALTER COLUMN "parent_id" TYPE new_type USING "parent_id"::new_type');

  // 4단계: PK constraint ADD
  await knex.raw('ALTER TABLE "parent_table" ADD CONSTRAINT "parent_table_pkey" PRIMARY KEY ("id")');

  // 5단계: 모든 FK constraint ADD
  await knex.raw('ALTER TABLE "child_table_1" ADD CONSTRAINT "child_table_1_parent_id_foreign" FOREIGN KEY ("parent_id") REFERENCES "parent_table"("id") ON UPDATE RESTRICT ON DELETE CASCADE');
  await knex.raw('ALTER TABLE "child_table_2" ADD CONSTRAINT "child_table_2_parent_id_foreign" FOREIGN KEY ("parent_id") REFERENCES "parent_table"("id") ON UPDATE RESTRICT ON DELETE RESTRICT');
}
```

### 핵심 원칙

1. **FK constraint가 존재하는 상태에서는 참조 컬럼 타입 변경 불가**: PostgreSQL은 FK와 참조되는 PK의 타입이 일치하지 않으면 에러 발생. 반드시 constraint를 먼저 제거해야 함.

2. **하나의 migration에서 모든 변경 처리**: 여러 migration으로 나누면 중간 상태에서 constraint 위반. PK와 모든 FK의 타입 변경을 한 번에 수행.

3. **knex schema builder 대신 raw SQL 사용 권장**: 명확한 실행 순서 보장, constraint 이름 명시 가능, 복잡한 타입 변환(USING) 지원.

### 실제 예시: users.id integer -> text

```typescript
export async function up(knex: Knex): Promise<void> {
  // 1. FK 제약조건 제거
  await knex.raw('ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_foreign"');
  await knex.raw('ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_foreign"');

  // 2. PK 제약조건 제거
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT "users_pkey"');

  // 3. 타입 변경 (USING 절로 변환 명시)
  await knex.raw('ALTER TABLE "users" ALTER COLUMN "id" TYPE text USING "id"::text');
  await knex.raw('ALTER TABLE "accounts" ALTER COLUMN "user_id" TYPE text USING "user_id"::text');
  await knex.raw('ALTER TABLE "sessions" ALTER COLUMN "user_id" TYPE text USING "user_id"::text');

  // 4. PK 제약조건 복구
  await knex.raw('ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id")');

  // 5. FK 제약조건 복구
  await knex.raw('ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE CASCADE');
  await knex.raw('ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE CASCADE');
}
```

### FK 참조 테이블 찾기

```bash
# Entity에서 특정 엔티티를 참조하는 relation 찾기
grep -r "with.*User" --include="*.entity.json"
```

### 흔한 실수

1. **여러 migration으로 분리**: Migration 1에서 PK 변경, Migration 2에서 FK 변경 시도 → FK constraint 위반

2. **constraint 제거 없이 타입 변경**: `cannot alter type of a column used by a foreign key` 에러 발생

3. **USING 절 누락**: `column "id" cannot be cast automatically to type text` 에러 발생. integer -> text는 `USING "id"::text` 필수.

4. **constraint 이름 불일치**: `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'accounts'`로 정확한 constraint 이름 확인 필요.

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
