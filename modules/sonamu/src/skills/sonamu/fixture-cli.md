---
name: sonamu-fixture-cli
description: Sonamu Fixture CLI 사용 가이드. fixture gen/fetch/explore 명령어로 테스트 데이터 생성 및 관리. Use when creating or managing fixture data.
---

# Fixture CLI 사용 가이드

Sonamu는 테스트용 fixture 데이터를 생성하고 관리하기 위한 CLI 명령어를 제공합니다.

**참고**: Fixture 생성 팁은 `testing.md`의 "Fixture 데이터 생성 팁" 섹션 참조

---

## 3-Tier DB 구조 이해 (필수)

Sonamu는 3단계 데이터베이스 구조를 사용합니다. **이 구조를 이해하지 못하면 fixture 명령어 사용 시 혼란이 발생합니다.**

```
production/development master (실제 DB)
          ↓ (fixture fetch)
     project_fixture (fixture DB)
          ↓ (fixture sync)
       project_test (test DB)
```

### DB별 역할

| DB | 용도 | 데이터 출처 |
|----|------|-----------|
| `project` | 운영/개발 실제 DB | 실제 사용자 데이터 |
| `project_fixture` | 테스트용 참조 데이터 저장소 | fetch로 가져오거나 gen으로 생성 |
| `project_test` | 테스트 실행 환경 | fixture에서 sync |

### 명령어별 DB 사용

| 명령어 | sourceDb | targetDb | 설명 |
|--------|----------|----------|------|
| `fixture gen` | fixture DB | fixture DB | fixture DB 내부에서 참조 관계 해결 및 생성 |
| `fixture fetch` | production master | fixture DB | 실제 DB → fixture DB로 import |
| `fixture sync` | fixture DB | test DB | fixture DB → test DB로 동기화 (기존) |

**CRITICAL**: sourceDb와 targetDb를 잘못 설정하면 FK 참조 오류가 발생합니다.

---

## CLI 명령어

### 1. fixture gen - 새로운 fixture 생성

faker 기반으로 새로운 테스트 데이터를 생성합니다.

#### 기본 사용법

```bash
# 대화형 모드 (권장)
pnpm sonamu fixture gen

# Entity 지정
pnpm sonamu fixture gen --include User --count 10

# 여러 Entity 지정
pnpm sonamu fixture gen --include User,Post,Comment --count 5

# 전체 Entity
pnpm sonamu fixture gen --all --count 3

# 전체에서 일부 제외
pnpm sonamu fixture gen --all --exclude Admin,Log --count 3
```

#### 저장 옵션

```bash
# DB 저장 (기본값)
pnpm sonamu fixture gen --include User --count 10 --save-to db

# 파일로 저장 (테이블명.json)
pnpm sonamu fixture gen --include User --count 10 --save-to file
# → test/fixtures/users.json

# 파일명 지정
pnpm sonamu fixture gen --include User --count 10 --save-to file:my-users.json
# → test/fixtures/my-users.json

# 출력만 (저장 안 함)
pnpm sonamu fixture gen --include User --count 10 --save-to none
```

#### 옵션

- `--include <entities>`: 생성할 Entity 목록 (쉼표 구분)
- `--all`: 모든 Entity
- `--exclude <entities>`: --all과 함께 사용, 제외할 Entity
- `--count <number>`: 각 Entity별 생성 개수 (기본값: 5)
- `--save-to <target>`: 저장 방식 - `db` | `file` | `file:name.json` | `none`
- `--use-llm`: cone.note 기반 LLM 생성 활성화 (ANTHROPIC_API_KEY 필요)
- `--no-cache`: LLM 캐시 비활성화 (기본값: 캐시 ON)

---

### 2. fixture fetch - 실제 DB에서 import

실제 운영/개발 DB에서 데이터를 가져와 fixture DB에 저장합니다.

#### 기본 사용법

```bash
# 대화형 모드
pnpm sonamu fixture fetch

# 최근 데이터 가져오기
pnpm sonamu fixture fetch --include User --strategy recent --limit 10

# 여러 Entity
pnpm sonamu fixture fetch --include User,Post --strategy sample --limit 5

# 전체 Entity
pnpm sonamu fixture fetch --all --strategy recent --limit 3
```

#### 전략 (Strategy)

| 전략 | 설명 | 예시 |
|------|------|------|
| `recent` | 최근 데이터 (created_at 기준) | `--strategy recent --limit 10` |
| `sample` | 균등 샘플링 | `--strategy sample --limit 10` |
| `random` | 랜덤 샘플링 | `--strategy random --limit 10` |

**CRITICAL**: fetch는 관련 데이터를 **재귀적으로 가져옵니다** (maxDepth: 2)
- User를 fetch하면 → User의 department, institution도 함께 import
- Post를 fetch하면 → Post의 author(User)도 함께 import

#### 옵션

- `--include <entities>`: import할 Entity 목록
- `--all`: 모든 Entity
- `--exclude <entities>`: --all과 함께 사용, 제외할 Entity
- `--strategy <strategy>`: 조회 전략 - `recent` | `sample` | `random` (기본값: recent)
- `--limit <number>`: 각 Entity별 조회 개수 (기본값: 10)

---

### 3. fixture explore - 데이터 조회 (저장 안 함)

실제 DB의 데이터를 조회하여 콘솔에 출력합니다. **저장하지 않고 조회만** 합니다.

#### 기본 사용법

```bash
# 대화형 모드
pnpm sonamu fixture explore

# 최근 User 조회
pnpm sonamu fixture explore --include User --strategy recent --limit 10

# 샘플링
pnpm sonamu fixture explore --include Department --strategy sample --limit 5
```

#### 언제 사용하나?

- 실제 DB에 어떤 데이터가 있는지 빠르게 확인
- fixture fetch 전에 미리 확인
- 데이터 분포 파악

---

## 실전 사용 시나리오

### 시나리오 1: 빈 DB에서 시작

```bash
# 1. 기본 fixture 생성
pnpm sonamu fixture gen --all --exclude Admin,Log --count 5

# 2. fixture → test DB 동기화
pnpm sonamu fixture sync

# 3. 테스트 실행
pnpm test
```

### 시나리오 2: 실제 데이터 기반 테스트

```bash
# 1. 실제 DB에서 최근 데이터 가져오기
pnpm sonamu fixture fetch --include User,Department --strategy recent --limit 20

# 2. 부족한 데이터 추가 생성
pnpm sonamu fixture gen --include Post,Comment --count 50

# 3. fixture → test DB 동기화
pnpm sonamu fixture sync

# 4. 테스트 실행
pnpm test
```

### 시나리오 3: 특정 시나리오 테스트 준비

```bash
# 1. 특정 Entity만 생성
pnpm sonamu fixture gen --include User --count 3

# 2. 대화형으로 추가 생성
pnpm sonamu fixture gen
# ? Fixture를 생성할 Entity를 선택하세요: Post, Comment 선택
# ? 각 Entity별 생성 개수: 10

# 3. 파일로 저장 (버전 관리)
pnpm sonamu fixture gen --include User --count 10 --save-to file
# → test/fixtures/users.json 생성

# 4. fixture sync
pnpm sonamu fixture sync
```

---

## 실전 팁

### 1. 한국어 데이터 자동 생성

FixtureGenerator는 특정 필드명에 대해 한국어 데이터를 자동으로 생성합니다:

**자동 한국어 생성 필드**:
- `name`, `username`: 한국 사람 이름 (`fakerKO.person.fullName()`)
- Entity가 `Department`이고 prop이 `name`: 한국 부서명

**예시 결과**:
```typescript
// User
{ name: "김민준", username: "이서연" }

// Department
{ name: "개발팀 1팀", name: "글로벌 마케팅팀" }
```

**커스터마이징**:
```typescript
// fixture-generator.ts에서 수정
if (entity?.id === "Department" && prop.name === "name") {
  const departments = ["개발팀", "기획팀", "마케팅팀", "영업팀"];
  // ...
}
```

### 2. Unique Constraint 처리

unique constraint가 있는 필드는 중복 방지 전략이 필요합니다.

**문제 상황**:
```sql
-- departments 테이블
UNIQUE (company_id, name)
```

**해결: 자동 변형**
```typescript
// 같은 company_id에 "개발팀"이 여러 번 생성되지 않도록
// 70% 확률로 prefix/suffix 자동 추가

// 결과:
"개발팀"           // 30%
"개발팀 1팀"       // 20%
"개발팀 본부"      // 20%
"글로벌 개발팀"    // 30%
```

**구현 위치**: `fixture-generator.ts`의 `generateDefaultValue()`

### 3. BelongsToOne FK 설정

BelongsToOne 관계는 `{name}_id` 컬럼을 자동 생성하므로, 코드에서도 `_id` 접미사를 사용해야 합니다.

**Entity 정의**:
```json
{
  "type": "relation",
  "name": "company",
  "with": "Company",
  "relationType": "BelongsToOne"
}
```

**FixtureGenerator 내부**:
```typescript
// ✓ CORRECT
fixture[`${prop.name}_id`] = relationValue;  // company_id

// ✗ WRONG
fixture[prop.name] = relationValue;  // company (FK가 NULL로 저장됨!)
```

**실수하기 쉬운 이유**:
- Entity JSON에서는 `name: "company"`로 정의
- DB 컬럼은 `company_id`로 자동 생성
- 코드에서는 `company_id` 사용해야 함

### 4. 순서 문제 해결

fixture gen은 **자동으로 의존성 순서를 정렬**합니다 (FixtureManager의 RelationGraph 사용).

**예시**:
```bash
# Department는 Company를 참조하지만 순서 걱정 불필요
pnpm sonamu fixture gen --include Department,Company --count 5

# 내부적으로:
# 1. Company 먼저 생성 (FK 없음)
# 2. Department 생성 (company_id 참조)
```

**주의**: 순환 참조는 경고 발생

### 5. DB 시퀀스 리셋

fixture 생성 후 ID 시퀀스가 맞지 않을 수 있습니다.

**확인**:
```bash
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_fixture -c "
SELECT sequencename, last_value
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;
"
```

**리셋**:
```sql
-- 각 테이블마다
SELECT setval('departments_id_seq', (SELECT MAX(id) FROM departments), true);
SELECT setval('companies_id_seq', (SELECT MAX(id) FROM companies), true);
```

**자동화**:
```bash
# 모든 시퀀스 리셋 스크립트
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_fixture -c "
SELECT 'SELECT setval(''' || sequencename || ''', (SELECT COALESCE(MAX(id), 1) FROM ' ||
  replace(sequencename, '_id_seq', '') || '), true);'
FROM pg_sequences
WHERE schemaname = 'public' AND sequencename LIKE '%_id_seq';
" | grep SELECT | PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_fixture
```

### 6. 파일 저장 활용

파일로 저장하면 **버전 관리**가 가능합니다.

```bash
# 1. 파일로 저장
pnpm sonamu fixture gen --include User --count 10 --save-to file
# → test/fixtures/users.json

# 2. git에 커밋
git add test/fixtures/users.json
git commit -m "Add user fixtures for testing"

# 3. 다른 개발자도 동일한 데이터로 테스트 가능
```

**언제 사용?**
- CI/CD 환경에서 일관된 테스트 데이터 필요
- 특정 시나리오 재현
- 팀원 간 테스트 데이터 공유

---

## 고급: cone 메타데이터 (선택사항)

Entity JSON에 `cone` 메타데이터를 추가하면 fixture 생성을 더욱 세밀하게 제어할 수 있습니다.

### dataSource - 참조 전략 지정

```json
{
  "name": "Post",
  "props": [
    {
      "name": "author",
      "type": "relation",
      "with": "User",
      "relationType": "BelongsToOne",
      "cone": {
        "dataSource": {
          "strategy": "recent",
          "config": { "limit": 5 }
        }
      }
    }
  ]
}
```

**지원 전략**:
- `sample`: 균등 샘플링
- `recent`: 최근 데이터 (created_at 기준)
- `random`: 랜덤 샘플링
- `ids`: 특정 ID 지정
- `query`: 사용자 정의 쿼리
- `file`: 파일에서 로드

### fixtureGenerator - 커스텀 생성 로직

```json
{
  "name": "email",
  "type": "string",
  "cone": {
    "fixtureGenerator": "faker.internet.email()"
  }
}
```

**보안 주의**: eval 사용으로 인한 보안 위험 (신뢰할 수 있는 표현식만 사용)

### fixtureDefault - 기본값 지정

```json
{
  "name": "status",
  "type": "string",
  "cone": {
    "fixtureDefault": "active"
  }
}
```

### note - 설명 및 LLM 연동 트리거

```json
{
  "name": "phone",
  "type": "string",
  "cone": {
    "note": "010-XXXX-XXXX 형식의 한국 전화번호"
  }
}
```

**동작 방식**:
- `--use-llm` 없을 때: 개발자/LLM 참고용 설명 역할만 함 (cone-generator가 읽어 메타데이터 생성 시 활용)
- `--use-llm` 있을 때: fixture gen이 Claude API를 호출하여 note 내용 기반의 실제 값 생성

**용도**:
- 단순 faker.js로 표현하기 어려운 맥락있는 텍스트 (자기소개, 설명문 등)
- 개발자에게 필드의 의미와 생성 패턴 설명
- 길이 제한 없음 (짧은 패턴 또는 긴 설명 모두 가능)

---

### LLM 기반 데이터 생성

`--use-llm` 플래그를 사용하면 `cone.note`가 Claude API 호출 트리거로 작동합니다.

#### 우선순위 체인

```
1. override 값 (generate() 호출 시 전달)
2. fixtureGenerator (faker.js 표현식)
3. cone.note + LLM  ← --use-llm 플래그 시 활성화
4. fixtureDefault (고정 기본값)
5. 타입별 기본값 (자동 생성)
```

#### CLI 사용법

```bash
# LLM 활성화
pnpm sonamu fixture gen --include User --count 10 --use-llm

# 캐시 비활성화
pnpm sonamu fixture gen --include User --count 10 --use-llm --no-cache
```

#### API 키 설정

```bash
# 방법 1: 환경변수
export ANTHROPIC_API_KEY=sk-ant-...

# 방법 2: sonamu.config.ts
export default defineConfig({
  secret: { anthropic_api_key: "sk-ant-..." }
});
```

#### 캐싱 동작

- `useLLM=true` 시 하나의 row에서 LLM 대상 필드 전체를 **단일 LLM 호출**로 생성 (필드별 개별 호출 아님)
- 단일 호출 덕분에 `name`, `name_en`, `name_cn`, `email` 등 연관 필드 간 일관성이 자동으로 보장됨
- 생성된 결과는 `rowKey:fieldName` 키로 인메모리 캐시에 저장되어, 같은 row 내 다음 필드 처리 시 즉시 반환
- 캐시는 같은 FixtureGenerator 인스턴스 내에서만 유효
- `--no-cache`로 캐시 비활성화 가능 (단, row 단위 생성 방식 자체는 유지됨)

#### Fallback 동작

- API 키 없음 → fixtureDefault 또는 타입 기본값으로 fallback (에러 없음)
- LLM 호출 실패 → 동일하게 fallback (콘솔 경고만 출력)

#### note vs fixtureGenerator 선택 기준

| 상황 | 추천 |
|------|------|
| 이메일, 이름, 숫자 등 단순한 값 | `fixtureGenerator` (faker.js) |
| 자기소개, 설명문 등 맥락있는 텍스트 | `cone.note` + `--use-llm` (LLM) |
| 특정 값 목록에서 선택 | `fixtureGenerator` (arrayElement) |

---

## 문제 해결

### 문제 1: "Cannot generate non-nullable relation without dataSource"

**원인**: BelongsToOne relation이 nullable이 아닌데 참조할 데이터가 없음

**해결**:
```bash
# 참조 Entity를 먼저 생성
pnpm sonamu fixture gen --include Company --count 5

# 그 다음 Department 생성
pnpm sonamu fixture gen --include Department --count 10
```

또는:
```bash
# 함께 생성 (자동 순서 정렬)
pnpm sonamu fixture gen --include Company,Department --count 5
```

### 문제 2: "duplicate key value violates unique constraint"

**원인**: unique constraint가 있는 필드에 중복 값 생성

**해결**:
1. `fixture-generator.ts`에서 해당 Entity의 필드별 생성 로직 수정
2. prefix/suffix 추가 또는 UUID 사용
3. count 줄이기

### 문제 3: FK 참조 오류 "violates foreign key constraint"

**원인**: sourceDb와 targetDb 설정 문제

**확인**:
```typescript
// fixture.ts 확인
const fixtureDb = createKnexInstance(Sonamu.dbConfig.fixture);
const generator = new FixtureGenerator(fixtureDb, fixtureDb, "fixture", EntityManager);
```

**올바른 설정**:
- `fixture gen`: sourceDb = fixtureDb, targetDb = fixtureDb
- `fixture fetch`: sourceDb = production, targetDb = fixtureDb

---

## 참고 자료

- **3-Tier DB 구조**: `database.md` "3-Tier DB 구조" 섹션
- **Fixture 생성 팁**: `testing.md` "Fixture 데이터 생성 팁" 섹션
- **BelongsToOne FK**: `entity-relations.md` "코드에서 FK 사용하기" 섹션
- **실제 구현**: `modules/sonamu/src/bin/fixture.ts`
- **생성 로직**: `modules/sonamu/src/testing/fixture-generator.ts`
