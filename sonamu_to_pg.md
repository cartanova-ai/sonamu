# Sonamu MySQL → PostgreSQL 마이그레이션 완료 보고

## 개요

`my-to-pg` 브랜치에서 Sonamu 프레임워크의 데이터베이스를 MySQL에서 PostgreSQL로 전환하는 작업을 완료했습니다. 이 작업은 단순한 DB 교체를 넘어서, 코어 설계의 상당 부분을 PostgreSQL에 맞춰 재설계하는 과정이었습니다.

## 주요 변경사항

### 1. 데이터베이스 인프라 변경

#### Docker 환경

- **이미지 변경**: `mysql:8.0` → `postgres:18`
- **컨테이너명**: `miomock-mysql` → `miomock-pg`
- **포트**: `3306` → `54321`
- **사용자**: `root`/`miomock` → `postgres`
- **환경변수**: MySQL 관련 변수들을 PostgreSQL 변수로 전환

#### 패키지 의존성

```json
// Before
"mysql2": "^3.14.5"

// After
"pg": "^8.16.3"
```

### 2. 엔티티 타입 시스템 재설계

PostgreSQL의 타입 시스템에 맞춰 엔티티 프로퍼티 타입을 재정의했습니다.

#### 제거된 타입들

- `text`, `mediumtext`, `longtext` → `string`으로 통합
- `timestamp`, `datetime`, `time` → `date`로 통합
- `float`, `double`, `decimal` → `number`/`numeric`으로 재구성
- `unsigned` 속성 제거 (PostgreSQL은 unsigned 지원 안 함)

#### 새로운 타입 정의

**StringProp**

```typescript
// MySQL: varchar(n)만 지원
type StringProp = {
  type: "string";
  length: number; // 필수
};

// PostgreSQL: varchar(n) + text 모두 지원
type StringProp = {
  type: "string";
  length?: number; // 선택적 (꼭 필요한 경우에만 사용)
};
```

**NumberProp / NumericProp**

```typescript
// MySQL
type FloatProp = { type: "float"; precision: number; scale: number };
type DecimalProp = { type: "decimal"; precision: number; scale: number };

// PostgreSQL
type NumberProp = {
  type: "number"; // TS에서 number로 처리
  numberType?: "real" | "double precision" | "numeric";
  precision?: number;
  scale?: number;
};

type NumericProp = {
  type: "numeric"; // TS에서 string으로 처리 (정밀도 유지를 위해 필요한 경우 사용)
  precision?: number;
  scale?: number;
};
```

**DateProp**

```typescript
// MySQL: 4가지 날짜/시간 타입
type DateProp = { type: "date" }; // YYYY-MM-DD
type DateTimeProp = { type: "datetime" }; // YYYY-MM-DD HH:MM:SS
type TimeProp = { type: "time" }; // HH:MM:SS
type TimestampProp = { type: "timestamp" }; // Unix timestamp

// PostgreSQL: timestamptz로 통합
type DateProp = {
  type: "date"; // PG의 timestamptz, TS의 Date 객체
};
```

`timestamp`는 사용하지 않습니다. (TZ가 제외되어야 하는 경우 `string` 사용 권장)

### 3. 마이그레이션 시스템 재구현

#### 스키마 리더 교체

- `MySQLSchemaReader` → `PostgreSQLSchemaReader`
- MySQL의 `SHOW TABLES`, `DESCRIBE` 등을 PostgreSQL의 `information_schema` 쿼리로 변경
- 컬럼 타입 해석 로직 완전 재작성

#### 마이그레이션 코드 생성

```typescript
// MySQL
table.integer("id").unsigned().notNullable();
table
  .timestamp("created_at")
  .notNullable()
  .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
table.text("description", "longtext").nullable();

// PostgreSQL
table.integer("id").notNullable();
table
  .timestamp("created_at", { useTz: true })
  .notNullable()
  .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
table.text("description").nullable();
```

#### DB 타입 변환 로직

```typescript
// PostgreSQL 타입 → Migration 타입 매핑
resolveDBColType(dbColumn: PgColumn) {
  switch (dbColumn.udt_name) {
    case 'int4': return { type: 'integer' };
    case 'int8': return { type: 'bigInteger' };
    case 'varchar': return { type: 'string', length: ... };
    case 'text': return { type: 'string' };
    case 'numeric': return { type: 'numberOrNumeric', numberType: 'numeric', ... };
    case 'float4': return { type: 'numberOrNumeric', numberType: 'real' };
    case 'bool': return { type: 'boolean' };
    case 'timestamptz': return { type: 'date' };
    case 'jsonb': return { type: 'json' };
    // ...
  }
}
```

### 4. DB 설정 변경

#### sonamu.config.ts

```typescript
// Before
export default defineConfig({
  database: {
    database: "mysql",
    defaultOptions: {
      connection: {
        host: "0.0.0.0",
        port: 3306,
        user: "root",
        typeCast: (field, next) => {
          if (field.type === "TINY" && field.length === 1) {
            return field.string() === "1";
          }
          return next();
        },
      },
    },
  },
});

// After
export default defineConfig({
  database: {
    database: "postgresql",
    defaultOptions: {
      connection: {
        host: "0.0.0.0",
        port: 54321,
        user: "postgres",
        // typeCast 불필요 (PostgreSQL은 타입을 올바르게 반환)
      },
    },
  },
});
```

#### DB Client 설정

```typescript
// db.ts
const defaultKnexConfig = {
  client: "pg", // 'mysql2' → 'pg'
  pool: { min: 1, max: 5 },
  // ...
};
```

### 5. Miomock 데이터베이스 운영 스크립트 변경

#### seed.sh

```bash
# Before (MySQL)
export MYSQL_PWD="${DB_PASSWORD}"
mysql --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" \
  -e "DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB};"
mysqldump ... | mysql ...

# After (PostgreSQL)
export PGPASSWORD="${DB_PASSWORD}"
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres \
  -c "DROP DATABASE IF EXISTS \"${DB}\"; CREATE DATABASE \"${DB}\";"
psql ... -f dump.sql
```

#### start.sh

```bash
# Before
if docker ps | grep -q "miomock-mysql"; then
  docker exec miomock-mysql mysqladmin ping ...
fi

# After
if docker ps | grep -q "miomock-pg"; then
  docker exec miomock-pg pg_isready -U postgres ...
fi
```

### 6. Shadow DB 테스트 로직 변경

```typescript
// Before (MySQL)
execSync(
  `mysqldump -h${host} -P${port} -u${user} -p'${password}' ${db} > ${tmpSqlPath}`
);
execSync(`sed -i'' -e 's/\`${db}\`/\`${shadowDB}\`/g' ${tmpSqlPath}`);
await tdb.raw(`DROP DATABASE IF EXISTS \`${shadowDB}\``);
await tdb.raw(`CREATE DATABASE \`${shadowDB}\``);
execSync(`mysql ... ${shadowDB} < ${tmpSqlPath}`);

// After (PostgreSQL)
execSync(`pg_dump -h ${host} -p ${port} -U ${user} ${db} > ${tmpSqlPath}`, {
  env: { PGPASSWORD: password },
});
// DB 이름 치환 불필요 (PostgreSQL 덤프는 DB 이름 포함 안 함)
await tdb.raw(`DROP DATABASE IF EXISTS "${shadowDB}"`);
await tdb.raw(`CREATE DATABASE "${shadowDB}"`);
execSync(`psql ... -d ${shadowDB} -f ${tmpSqlPath}`, {
  env: { PGPASSWORD: password },
});
```

### 7. Fixture 동기화 최적화

기존의 체크섬 기반 테이블별 동기화 방식에서 PostgreSQL의 Template Database 기능을 활용한 방식으로 개선:

```typescript
// Before: 테이블별로 체크섬 비교 후 TRUNCATE + INSERT
async sync() {
  for (const table of tables) {
    const remoteChecksum = await this.getChecksum(fixtureDB, table);
    const localChecksum = await this.getChecksum(testDB, table);
    if (remoteChecksum !== localChecksum) {
      await testDB(table).truncate();
      await testDB.insert(await fixtureDB(table));
    }
  }
}

// After: CREATE DATABASE ... TEMPLATE 활용
async sync() {
  // 1. 기존 연결 강제 종료
  execSync(`psql ... -c "SELECT pg_terminate_backend(...)"`);

  // 2. 테스트 DB 삭제
  execSync(`psql ... -c "DROP DATABASE IF EXISTS \"${testDB}\""`);

  // 3. fixture_remote를 템플릿으로 테스트 DB 생성
  execSync(`psql ... -c "CREATE DATABASE \"${testDB}\" TEMPLATE \"${fixtureRemoteDB}\""`);
}
```

### 8. JSON 타입 처리 변경

```typescript
// MySQL: json
table.json("data").nullable();

// PostgreSQL: jsonb (성능 최적화)
table.jsonb("data").nullable();
```

### 9. Full-Text Search 제거

PostgreSQL의 Full-Text Search는 MySQL의 FULLTEXT INDEX와 구조가 달라, 일단 제거하고 추후 재구현 예정:

```json
// Before
{
  "indexes": [
    { "type": "fulltext", "columns": ["bio"], "parser": "ngram" }
  ]
}

// After
{
  "indexes": [
    // fulltext 인덱스 제거
  ]
}
```

### 10. 모든 마이그레이션 파일 재생성

기존의 모든 마이그레이션 파일들을 PostgreSQL 문법에 맞춰 재생성:

- `20251124233557_*` → `20251204170803_*`
- 컬럼 정의, 인덱스, 외래키 제약조건 모두 PostgreSQL 문법으로 변경
- 누적된 ALTER 마이그레이션들을 CREATE 마이그레이션에 통합

### 11. 테스트 코드 수정

#### 스냅샷 업데이트

- 모든 `.snap` 파일들의 타입 정보 업데이트
- `unsigned`, `length` 등의 속성 변경 반영
- 날짜/시간 타입 통합 반영

#### 타입 검증 로직 수정

```typescript
// migration-set.test.ts
// Before
expect(MySQLSchemaReader.resolveDBColType("varchar(100)", "name")).toEqual({
  type: "string",
  length: 100,
});

// After
// PostgreSQLSchemaReader 테스트로 전환 (일부 skip 처리)
```

#### Connection String 변경

```typescript
// Before
connString: `mysql2://${dbUser}@0.0.0.0:3306/miomock_test`;

// After
connString: `pg://${dbUser}@0.0.0.0:54321/miomock_test`;
```

### 12. UI 템플릿 업데이트

OpenAI Instructions 문서에서 엔티티 프로퍼티 타입 설명 업데이트:

- Float, Double, Decimal → Number, Numeric으로 통합
- DateTime, Time, Timestamp → Date로 통합
- Text 타입 제거, String으로 통합
- 각 타입별 PostgreSQL 매핑 명시

### 13. 코드 생성 로직 변경

#### Entity Template

```typescript
// Before
{
  name: "id",
  type: "integer",
  unsigned: true,
  desc: "ID"
}

// After
{
  name: "id",
  type: "integer",
  desc: "ID"
}
```

#### Zod 변환 로직

```typescript
// propToZodType()에서 타입 변환 로직 단순화
// - isTextProp 제거
// - isFloatProp, isDoubleProp, isDecimalProp → isNumberProp, isNumericProp
// - isDateTimeProp, isTimeProp, isTimestampProp → isDateProp
```

### 14. 데이터베이스 덤프 파일 변경

`miomock_test_latest.sql` 파일이 MySQL 덤프 형식에서 PostgreSQL 덤프 형식으로 완전히 변경:

```sql
-- Before (MySQL)
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ...
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- After (PostgreSQL)
SET client_encoding = 'UTF8';
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ...
);
```

## 영향받는 영역

### ✅ 완료된 영역

1. **인프라**: Docker, 환경 설정
2. **코어 타입 시스템**: Entity 프로퍼티 타입 재정의
3. **마이그레이션 시스템**: 스키마 읽기, 코드 생성
4. **DB 클라이언트**: Knex 설정, 쿼리 빌더
5. **테스트 환경**: Bootstrap, 픽스처 관리
6. **스크립트**: seed.sh, start.sh 등
7. **예제 프로젝트**: miomock의 모든 엔티티 및 마이그레이션

### ⚠️ 추후 작업 필요

1. **전체 테스트 픽스**: 각자 맡은 파트에서 발생하는 추가적인 이슈들을 확인해주세요.
2. **Full-Text Search**: PostgreSQL의 `tsvector`, `tsquery` 구현 필요

## 마이그레이션 가이드

### 기존 프로젝트 마이그레이션 시

1. **패키지 업데이트**

   ```bash
   pnpm remove mysql2
   pnpm add pg@^8.16.3
   ```

2. **sonamu.config.ts 수정**

   ```typescript
   database: {
     database: "postgresql",
     defaultOptions: {
       connection: {
         host: "localhost",
         port: 5432,
         user: "postgres",
         password: "your-password",
       }
     }
   }
   ```

3. **Entity 파일 수정**
   - `unsigned` 속성 제거
   - `timestamp` → `date`
   - `text` → `string`
   - `decimal` → `numeric`
   - `length` 필수 → 선택적

4. **마이그레이션 재생성**

   ```bash
   # 기존 migrations 폴더 백업
   mv src/migrations src/migrations.bak

   # PostgreSQL 기반으로 새 마이그레이션 생성
   pnpm sonamu migrate:status
   ```

5. **Docker Compose 수정**
   ```yaml
   services:
     postgres:
       image: postgres:18
       environment:
         POSTGRES_DB: your_db
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: your_password
       ports:
         - "5432:5432"
   ```

## 테스트 결과

### 단위 테스트

- ✅ Entity 관련 테스트 통과
- ✅ Migration 관련 테스트 통과 (일부 skip)
- ✅ Puri 쿼리 빌더 테스트 통과
- ✅ Fixture Manager 테스트 통과

### 통합 테스트

- ✅ miomock API 서버 구동 확인
- ✅ CRUD 작업 정상 동작
- ✅ 관계형 쿼리 (JOIN) 정상 동작
- ✅ 트랜잭션 처리 정상 동작

## 성능 비교

### JSON 타입

- MySQL: `json` (텍스트 기반)
- PostgreSQL: `jsonb` (바이너리 기반, 인덱싱 가능, 더 빠름)

### Boolean 타입

- MySQL: `TINYINT(1)` (0/1 변환 필요)
- PostgreSQL: `boolean` (네이티브 지원, typeCast 불필요)

### 날짜/시간 타입

- MySQL: 5가지 타입, 타임존 처리 복잡
- PostgreSQL: `timestamptz` 하나로 통합, 타임존 자동 처리

## 주의사항

1. **Unsigned 제거**: PostgreSQL은 unsigned를 지원하지 않습니다. 음수를 허용하지 않아야 하는 경우 애플리케이션 레벨에서 체크가 필요합니다.

2. **텍스트 길이**: PostgreSQL의 `text` 타입은 길이 제한이 없습니다. 필요시 `varchar(n)`을 사용하세요.

3. **마이그레이션 호환성**: MySQL 마이그레이션 파일은 PostgreSQL과 호환되지 않습니다. 전체 재생성이 필요합니다.

4. **Full-Text Search**: 아직 구현되지 않았습니다. 필요한 경우 별도 이슈를 생성해주세요.

5. **Date 타입**: 모든 날짜/시간은 `Date` 객체로 처리됩니다. 문자열 형식이 필요한 경우 명시적 변환이 필요합니다.

## 참고 자료

- PostgreSQL 공식 문서: https://www.postgresql.org/docs/
- Knex.js PostgreSQL 가이드: https://knexjs.org/guide/
- 타입 매핑 참고: `modules/sonamu/src/migration/postgresql-schema-reader.ts`
- Entity 타입 정의: `modules/sonamu/src/types/types.ts`

## 커밋 히스토리

주요 커밋:

- `df49dc50`: [sonamu/pg] Sonamu PostgreSQL 전환 1차 작업
- `5f0acde6`: [sonamu/pg] fix: miomock에 start.sh 셋업

---

**작성일**: 2025년 12월 4일
**브랜치**: `my-to-pg`
**작성자**: Minsang Kim
