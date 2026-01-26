---
name: sonamu-subset
description: Sonamu Subset으로 API 응답 필드 범위 정의. dot notation으로 관계 필드 포함. Use when defining which fields to return in API responses.
---

# Subset 정의

## 기본 구조

```json
{
  "subsets": {
    "A": ["id", "created_at", "username", "email", "role"],
    "P": ["id", "username", "employee.department.name"],
    "SS": ["id", "username"]
  }
}
```

## 네이밍 규칙

**⚠️ Subset 이름은 A, P, SS만 사용합니다. S, D, L 등 임의의 이름은 사용하지 마세요.**

| Subset | 용도 |
|--------|------|
| `A` | All - 전체 필드 (상세, 관리자). **필수** |
| `P` | Partial/Profile - 부분 필드, 관계 포함 (목록 조회용) |
| `SS` | Super Simple/Summary - 최소 필드, ID+이름 정도 (드롭다운, 선택용) |
| `P2`, `P3` | 추가 프로파일 (특수한 경우에만) |

### IMPORTANT: Subset A는 모든 필드 포함 필수

**Subset A는 Entity의 모든 일반 필드와 주요 relation 필드를 포함해야 합니다.**

**DO:**
```json
{
  "props": [
    { "name": "id", "type": "integer" },
    { "name": "created_at", "type": "date" },
    { "name": "title", "type": "string" },
    { "name": "status", "type": "enum", "id": "Status" },
    { "type": "relation", "name": "author", "with": "User", "relationType": "BelongsToOne" }
  ],
  "subsets": {
    "A": ["id", "created_at", "title", "status", "author.id", "author.name"]
  }
}
```

**DO NOT:**
```json
{
  "subsets": {
    "A": ["id", "title"]  // created_at, status, author 누락 - 잘못됨
  }
}
```

**규칙:**
- 모든 일반 필드(id, created_at, 비즈니스 필드 등)를 포함
- BelongsToOne relation은 최소한 `.id`와 표시용 필드(`.name`, `.title` 등) 포함
- HasMany relation은 선택적 (필요한 경우만 포함)

### 단일 Subset만 필요한 경우

```json
// DO - Correct: A만 생성
{ "subsets": { "A": ["id", "name", "created_at"] } }
```

### DO NOT - Incorrect Subset Names

```json
// Incorrect: S, D, L 등 사용 금지
{
  "subsets": {
    "A": [...],
    "S": [...],  // NEVER - SS를 사용할 것
    "D": [...],  // NEVER - 사용하지 말 것
    "L": [...]   // NEVER - P를 사용할 것
  }
}
```

## Relation 필드 (Dot Notation)

```json
{
  "subsets": {
    "P": [
      "id",
      "username",
      "employee.salary",
      "employee.department.name"
    ]
  }
}
```

- BelongsToOne/OneToOne: 자동 LEFT JOIN
- HasMany/ManyToMany: DataLoader로 자동 최적화

## ID만 참조 최적화

```json
{ "SS": ["id", "title", "user.id"] }
```

- `user.id`만 참조하면 JOIN 없이 `user_id` 컬럼 사용

## Internal 필드

```json
{
  "subsets": {
    "A": ["id", "username", { "field": "password_hash", "internal": true }]
  }
}
```

- 쿼리에 포함되지만 API 응답 타입에서 제외

## Model에서 사용

```typescript
// findById
const user = await UserModel.findById("P", 1);

// findMany
const { rows } = await UserModel.findMany("P", { num: 20, page: 1 });

// getPuri + Subset
const users = await UserModel.getPuri("r", ["P"])
  .where("employee__department.name", "Engineering")
  .many();
```

## 주의사항

- 기본 Subset `A`는 필수
- 중첩 depth 3단계 이하 권장
- 목록용 Subset은 불필요한 관계 제외
- **FK 컬럼 직접 사용 불가**: BelongsToOne 관계의 FK 컬럼(예: `user_id`)은 Subset에서 직접 사용할 수 없음. 반드시 `user.id` 형태로 접근해야 함

```json
// DO NOT - Incorrect: FK 컬럼 직접 사용
{ "A": ["id", "user_id", "title"] }

// DO - Correct: relation.field 형식 사용
{ "A": ["id", "user.id", "title"] }
```
