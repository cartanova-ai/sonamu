---
name: sonamu-entity-validation-checklist
description: Entity 생성 후 필수 검증 체크리스트. entity.json 검증(인덱스 type, Subset FieldExpr, 중복 컨럼, Boolean dbDefault), 필수 파일 생성, sync, migration, scaffolding 단계별 검증. Use when entity.json validation fails or verifying entity creation steps.
---

# Entity 생성 후 검증 체크리스트

Entity를 생성한 후 반드시 다음 단계를 순서대로 수행하세요. 각 단계를 건너뛰면 scaffolding 오류가 발생합니다.

## 전체 워크플로우

```
1. stub 생성
2. entity.json 작성
3. ✅ 자동 검증 실행 (이 체크리스트)
4. model.ts, types.ts 생성
5. sync 실행
6. migration 생성
7. migration apply
8. scaffolding 실행
```

## PHASE 1: entity.json 검증 (sync 전)

Entity.json 파일을 작성한 직후, **sync 실행 전에** 다음을 검증하세요.

### 1.1 Index 검증

**모든 index에 `type` 필드가 있는가?**

```json
// DO NOT - Incorrect
"indexes": [
  { "name": "ix_user_email", "columns": [{ "name": "email" }] }
]

// DO - Correct
"indexes": [
  { "name": "ix_user_email", "type": "index", "columns": [{ "name": "email" }] }
]
```

**검증 방법:**
```bash
# 모든 entity.json에서 type 없는 index 찾기
grep -r '"indexes"' packages/api/src/application/*/\*.entity.json | \
  xargs -I {} sh -c 'grep -L "\"type\":" {}'
```

### 1.2 Subset 검증

**Foreign key를 직접 참조하지 않았는가?**

```json
// DO NOT - Incorrect: foreign key 직접 참조
"subsets": {
  "A": ["id", "user_id", "task_id"]
}

// DO - Correct: relation을 통한 참조 (Sonamu가 .id만 참조 시 자동 최적화)
"subsets": {
  "A": ["id", "user.id", "task.id"]
}
```

**규칙:**
- `{relation_name}_id` → `{relation_name}.id`
- BelongsToOne relation이 있으면 반드시 `relation.id` 형식 사용
- Sonamu가 `.id`만 참조하는 경우 FK 컬럼을 직접 읽어 JOIN을 생략하는 최적화 수행

**검증 방법:**
```bash
# entity.json에서 _id로 끝나는 subset 필드 찾기
grep -A 20 '"subsets"' your-entity.entity.json | grep '_id"'
```

**실제 동작 코드 참고:**
- `sonamu/examples/miomock/api/src/application/project/project.entity.json`
- `sonamu/examples/miomock/api/src/application/employee/employee.entity.json`

### 1.3 Subset A 완전성 검증

**Subset A에 모든 필드가 포함되어 있는가?**

```json
// DO - Correct: 모든 props 포함
{
  "props": [
    { "name": "id" },
    { "name": "created_at" },
    { "name": "title" },
    { "type": "relation", "name": "user" }
  ],
  "subsets": {
    "A": [
      "id",
      "created_at",
      "title",
      "user.id",
      "user.name"
    ]
  }
}
```

**검증 항목:**
- [ ] 모든 일반 필드 포함
- [ ] 모든 relation은 최소한 `.id` 포함
- [ ] nullable이 아닌 relation은 필수 필드들도 포함

### 1.4 중복 컬럼 검증

**BelongsToOne relation과 foreign key를 중복 정의하지 않았는가?**

```json
// DO NOT - Incorrect: 중복 정의
{
  "props": [
    { "name": "user_id", "type": "integer" },  // 삭제해야 함
    {
      "type": "relation",
      "name": "user",
      "with": "User",
      "relationType": "BelongsToOne"
    }
  ]
}

// DO - Correct: relation만 정의
{
  "props": [
    {
      "type": "relation",
      "name": "user",
      "with": "User",
      "relationType": "BelongsToOne"
    }
  ]
}
```

**검증 방법:**
```bash
# BelongsToOne relation이 있는데 _id 필드도 있는지 확인
grep -A 5 '"relationType": "BelongsToOne"' your-entity.entity.json
grep '"name": ".*_id"' your-entity.entity.json
```

### 1.5 Boolean dbDefault 검증

**Boolean 타입의 dbDefault가 문자열 "true"/"false"인가?**

```json
// DO NOT - Incorrect
{ "name": "is_active", "type": "boolean", "dbDefault": "1" }
{ "name": "is_deleted", "type": "boolean", "dbDefault": "0" }

// DO - Correct
{ "name": "is_active", "type": "boolean", "dbDefault": "true" }
{ "name": "is_deleted", "type": "boolean", "dbDefault": "false" }
```

### 1.6 OrderBy Enum 검증

**OrderBy enum에 `id-desc`만 있는가?**

```json
// DO NOT - Incorrect: scaffolding 오류 발생!
"enums": {
  "ProductOrderBy": {
    "id-desc": "ID최신순",
    "name-asc": "이름순",
    "created_at-desc": "등록일순"
  }
}

// DO - Correct
"enums": {
  "ProductOrderBy": { "id-desc": "ID최신순" }
}
```

**이유:** Scaffolding이 생성하는 model 코드는 `id-desc`만 처리합니다.

### 1.7 Enum dbDefault 검증

**Enum 타입의 dbDefault가 이스케이프된 큰따옴표로 감싸져 있는가?**

```json
// DO NOT - Incorrect
{ "name": "status", "type": "enum", "id": "Status", "dbDefault": "pending" }
{ "name": "status", "type": "enum", "id": "Status", "dbDefault": "'pending'" }

// DO - Correct
{ "name": "status", "type": "enum", "id": "Status", "dbDefault": "\"pending\"" }
```

## PHASE 2: 필수 파일 생성 검증

### 2.1 model.ts 파일 생성

**entity 폴더에 `{entity}.model.ts` 파일이 있는가?**

```bash
# 확인
ls packages/api/src/application/your-entity/your-entity.model.ts
```

**없으면 수동 생성 필요** (다른 entity의 model.ts 참고)

필수 메서드:
- `findById`
- `findOne`
- `findMany`
- `save`
- `del`

### 2.2 types.ts 파일 생성

**entity 폴더에 `{entity}.types.ts` 파일이 있는가?**

```bash
# 확인
ls packages/api/src/application/your-entity/your-entity.types.ts
```

**필수 내용:**
```typescript
import { z } from "zod";
import {
  YourEntityBaseListParams,
  YourEntityBaseSchema,
} from "../sonamu.generated";

export const YourEntityListParams = YourEntityBaseListParams;
export type YourEntityListParams = z.infer<typeof YourEntityListParams>;

// 기본 패턴 (relation 없음)
export const YourEntitySaveParams = YourEntityBaseSchema.partial({
  id: true,
  created_at: true,
});
export type YourEntitySaveParams = z.infer<typeof YourEntitySaveParams>;
```

**ManyToMany relation이 있는 경우:**
```typescript
// ManyToMany 관계: {relation_name}_ids 배열 추가
export const YourEntitySaveParams = YourEntityBaseSchema.partial({
  id: true,
  created_at: true,
})
  .extend({
    relation_name_ids: z.array(z.number().int().positive()),
  });
export type YourEntitySaveParams = z.infer<typeof YourEntitySaveParams>;
```

**실제 동작 코드 참고:**
- `sonamu/examples/miomock/api/src/application/project/project.types.ts` - ManyToMany 예시
- `sonamu/examples/miomock/api/src/application/employee/employee.types.ts` - 기본 패턴

## PHASE 3: Sync 실행 및 검증

### 3.1 Sync 실행

```bash
cd packages/api
pnpm sonamu sync
```

### 3.2 Sync 결과 검증

**sonamu.lock에 3개 파일이 모두 등록되었는가?**

```bash
# 확인
grep "your-entity" packages/api/sonamu.lock
```

**기대 결과:**
```json
[
  {
    "path": "src/application/your-entity/your-entity.entity.json",
    "checksum": "..."
  },
  {
    "path": "src/application/your-entity/your-entity.model.ts",
    "checksum": "..."
  },
  {
    "path": "src/application/your-entity/your-entity.types.ts",
    "checksum": "..."
  }
]
```

### 3.3 Web 패키지 동기화 검증

**web 패키지에 필요한 파일들이 생성되었는가?**

```bash
# Service 생성 확인
grep "YourEntityService" packages/web/src/services/services.generated.ts

# Component 생성 확인
ls packages/web/src/components/your-entity/

# Route 생성 확인
ls packages/web/src/routes/admin/your-entities/
```

### 3.4 i18n 키 생성 검증

**Foreign key 필드의 라벨이 생성되었는가?**

```bash
# 확인
grep "entity.YourEntity" packages/web/src/i18n/sd.generated.ts
```

## PHASE 4: Migration 검증

### 4.1 Migration 파일 생성

```bash
cd packages/api
pnpm sonamu migration:create
```

### 4.2 Migration 파일 검증

**생성된 migration 파일 확인:**

```bash
ls packages/api/src/migrations/*_create__your_entities.ts
```

**검증 항목:**
- [ ] 테이블명이 올바른가? (복수형, snake_case)
- [ ] 모든 컬럼이 정의되었는가?
- [ ] Foreign key 제약조건이 있는가?
- [ ] Index가 생성되는가?
- [ ] Boolean 컬럼의 default가 올바른가? (true/false)

### 4.3 Migration Dry-run

```bash
# Migration 적용 전 SQL 확인
cd packages/api
pnpm sonamu migration:latest --dry-run
```

**확인 사항:**
- SQL 문법 오류 없음
- 중복 컬럼 정의 없음
- Boolean default 타입 오류 없음

## PHASE 5: Scaffolding 검증

### 5.1 Scaffolding 실행 전 체크

**모든 이전 단계가 완료되었는가?**

- [ ] entity.json 검증 완료
- [ ] model.ts, types.ts 생성 완료
- [ ] sync 실행 완료
- [ ] migration 생성 및 apply 완료

### 5.2 Scaffolding 실행

```bash
cd packages/api
pnpm sonamu scaffold your-entity
```

### 5.3 Build 검증

```bash
# API 빌드
cd packages/api
pnpm build

# Web 빌드
cd packages/web
pnpm build
```

**빌드 오류가 없어야 합니다!**

## 자동 검증 스크립트 (선택사항)

다음 스크립트를 `packages/api/scripts/validate-entity.sh`로 저장:

```bash
#!/bin/bash

ENTITY=$1
ENTITY_DIR="src/application/$ENTITY"

echo "[VALIDATION] Validating entity: $ENTITY"

# 1. Check files exist
echo "[CHECK] Checking required files..."
if [ ! -f "$ENTITY_DIR/$ENTITY.entity.json" ]; then
  echo "[ERROR] Missing: $ENTITY.entity.json"
  exit 1
fi
if [ ! -f "$ENTITY_DIR/$ENTITY.model.ts" ]; then
  echo "[ERROR] Missing: $ENTITY.model.ts"
  exit 1
fi
if [ ! -f "$ENTITY_DIR/$ENTITY.types.ts" ]; then
  echo "[ERROR] Missing: $ENTITY.types.ts"
  exit 1
fi
echo "[PASS] All required files exist"

# 2. Check indexes have type
echo "[CHECK] Checking index types..."
if grep -q '"indexes"' "$ENTITY_DIR/$ENTITY.entity.json"; then
  if ! grep -A 10 '"indexes"' "$ENTITY_DIR/$ENTITY.entity.json" | grep -q '"type":'; then
    echo "[ERROR] Some indexes are missing 'type' field"
    exit 1
  fi
fi
echo "[PASS] All indexes have type"

# 3. Check for _id in subsets
echo "[CHECK] Checking subset field expressions..."
if grep -A 20 '"subsets"' "$ENTITY_DIR/$ENTITY.entity.json" | grep -q '_id"'; then
  echo "[WARNING] Found '_id' in subsets. Should use 'relation.id' instead"
fi

# 4. Check OrderBy enum
echo "[CHECK] Checking OrderBy enum..."
if grep -A 5 'OrderBy"' "$ENTITY_DIR/$ENTITY.entity.json" | grep -v 'id-desc' | grep -q ':'; then
  echo "[WARNING] OrderBy has values other than 'id-desc'"
fi

echo "[COMPLETE] Entity validation complete!"
```

**사용법:**
```bash
chmod +x packages/api/scripts/validate-entity.sh
./packages/api/scripts/validate-entity.sh your-entity
```

## 체크리스트 요약

Entity 생성 시 **반드시** 다음 순서로 진행:

1. STEP 1: `pnpm sonamu stub entity YourEntity`
2. STEP 2: `your-entity.entity.json` 작성
3. STEP 3: **이 체크리스트로 검증** (CRITICAL - 반드시 수행)
4. STEP 4: `your-entity.model.ts` 생성
5. STEP 5: `your-entity.types.ts` 생성
6. STEP 6: `pnpm sonamu sync`
7. STEP 7: Sync 결과 검증 (sonamu.lock, web 파일들)
8. STEP 8: `pnpm sonamu migration:create`
9. STEP 9: Migration 파일 검증
10. STEP 10: `pnpm sonamu migration:latest` (apply)
11. STEP 11: `pnpm sonamu scaffold your-entity`
12. STEP 12: Build 테스트

**각 단계를 건너뛰지 마세요!** 순서가 중요합니다.
