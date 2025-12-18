# Sonamu Entity JSON Template and Rules

## Basic Template

```json
{
  "id": "EntityName",
  "table": "table_name",
  "title": "엔티티 제목",
  "props": [
    { "name": "id", "type": "integer", "desc": "ID", "unsigned": true },
    { "name": "created_at", "type": "timestamp", "desc": "등록일시", "dbDefault": "CURRENT_TIMESTAMP" }
    // Additional property definitions go here
  ],
  "indexes": [],
  "subsets": {
    "A": ["id", "created_at"]
  },
  "enums": {
    "EntityNameOrderBy": { "id-desc": "ID최신순" },
    "EntityNameSearchField": { "id": "ID" }
  }
}
```

## Required Properties

모든 엔티티는 다음 프로퍼티를 **필수**로 포함해야 합니다:

1. **id** - 기본키
   ```json
   { "name": "id", "type": "integer", "desc": "ID", "unsigned": true }
   ```

2. **created_at** - 등록일시
   ```json
   { "name": "created_at", "type": "timestamp", "desc": "등록일시", "dbDefault": "CURRENT_TIMESTAMP" }
   ```

## Required Enums

모든 엔티티는 다음 Enum을 **필수**로 포함해야 합니다:

1. **EntityNameOrderBy** - 정렬 옵션
   ```json
   "EntityNameOrderBy": { "id-desc": "ID최신순", "id-asc": "ID오름차순" }
   ```

2. **EntityNameSearchField** - 검색 필드
   ```json
   "EntityNameSearchField": { "id": "ID" }
   ```

## Property Types and Their Attributes

### 1. Integer
```json
{
  "name": "count",
  "type": "integer",
  "desc": "수량",
  "unsigned": true,     // Optional, 양수만 허용
  "nullable": true,     // Optional, 생략 시 false
  "dbDefault": 0        // Optional
}
```

### 2. Big Integer
```json
{
  "name": "total_amount",
  "type": "bigInteger",
  "desc": "총액",
  "unsigned": true,     // Optional
  "nullable": true,     // Optional
  "dbDefault": 0        // Optional
}
```

### 3. Float (Required: precision, scale)
```json
{
  "name": "rate",
  "type": "float",
  "desc": "비율",
  "precision": 8,       // Required
  "scale": 2,           // Required
  "nullable": true,     // Optional
  "dbDefault": 0.0      // Optional
}
```

### 4. Decimal (Required: precision, scale)
```json
{
  "name": "price",
  "type": "decimal",
  "desc": "가격",
  "precision": 10,      // Required
  "scale": 2,           // Required
  "nullable": true,     // Optional
  "dbDefault": 0.0      // Optional
}
```

### 5. Double (Required: precision, scale)
```json
{
  "name": "latitude",
  "type": "double",
  "desc": "위도",
  "precision": 15,      // Required
  "scale": 10,          // Required
  "unsigned": true,     // Optional
  "nullable": true,     // Optional
  "dbDefault": 0.0      // Optional
}
```

### 6. String (Required: length)
```json
{
  "name": "title",
  "type": "string",
  "desc": "제목",
  "length": 255,        // Required
  "nullable": true,     // Optional
  "dbDefault": "\"\""   // Optional
}
```

### 7. Boolean
```json
{
  "name": "is_active",
  "type": "boolean",
  "desc": "활성여부",
  "nullable": true,     // Optional
  "dbDefault": false    // Optional
}
```

### 8. Date
```json
{
  "name": "birth_date",
  "type": "date",
  "desc": "생년월일",
  "nullable": true,     // Optional
  "dbDefault": "\"1970-01-01\""  // Optional
}
```

### 9. DateTime
```json
{
  "name": "scheduled_at",
  "type": "datetime",
  "desc": "예정일시",
  "nullable": true,     // Optional
  "dbDefault": "\"1970-01-01 00:00:00\""  // Optional
}
```

### 10. Timestamp
```json
{
  "name": "updated_at",
  "type": "timestamp",
  "desc": "수정일시",
  "dbDefault": "CURRENT_TIMESTAMP",  // Optional
  "nullable": true      // Optional
}
```

### 11. Text (Required: textType)
```json
{
  "name": "content",
  "type": "text",
  "textType": "text",   // Required: "text" | "mediumtext" | "longtext"
  "desc": "내용",
  "nullable": true,     // Optional
  "dbDefault": "\"\""   // Optional
}
```

### 12. JSON (Required: id)
```json
{
  "name": "tags",
  "type": "json",
  "id": "StringArray",  // Required: 타입 ID (StringArray, NumberArray, Unknown 등)
  "desc": "태그 목록",
  "nullable": true,     // Optional
  "dbDefault": "[]"     // Optional
}
```

### 13. Enum (Required: id, length)
```json
{
  "name": "status",
  "type": "enum",
  "id": "ProductStatus",  // Required: enums에 정의된 Enum ID
  "desc": "상태",
  "length": 16,           // Required
  "nullable": true,       // Optional
  "dbDefault": "\"active\""  // Optional
}
```
**주의**: `id`로 지정한 Enum은 반드시 `enums` 객체에 정의되어 있어야 합니다.

## Relation Types

모든 relation은 `onUpdate`와 `onDelete`가 **필수**입니다.
(예외: OneToOne에서 `hasJoinColumn: false`인 경우만 불필요)

### 14. BelongsToOne (Required: with, relationType, onUpdate, onDelete)
```json
{
  "name": "author",
  "type": "relation",
  "with": "User",
  "relationType": "BelongsToOne",
  "onUpdate": "CASCADE",   // Required
  "onDelete": "CASCADE",   // Required
  "desc": "작성자",
  "nullable": true         // Optional
}
```

### 15. HasMany (Required: with, relationType, joinColumn, onUpdate, onDelete)
```json
{
  "name": "comments",
  "type": "relation",
  "with": "Comment",
  "relationType": "HasMany",
  "joinColumn": "post_id",   // Required
  "onUpdate": "CASCADE",     // Required
  "onDelete": "CASCADE",     // Required
  "desc": "댓글 목록"
}
```

### 16. ManyToMany (Required: with, relationType, joinTable, onUpdate, onDelete)
```json
{
  "name": "tags",
  "type": "relation",
  "with": "Tag",
  "relationType": "ManyToMany",
  "joinTable": "posts__tags",  // Required: "테이블명__테이블명" 형식
  "onUpdate": "CASCADE",       // Required
  "onDelete": "CASCADE",       // Required
  "desc": "태그 목록"
}
```

### 17. OneToOne

**hasJoinColumn: true인 경우** (FK를 이 엔티티가 소유):
```json
{
  "name": "profile",
  "type": "relation",
  "with": "UserProfile",
  "relationType": "OneToOne",
  "hasJoinColumn": true,
  "onUpdate": "CASCADE",   // Required when hasJoinColumn: true
  "onDelete": "CASCADE",   // Required when hasJoinColumn: true
  "desc": "프로필"
}
```

**hasJoinColumn: false인 경우** (FK를 상대 엔티티가 소유):
```json
{
  "name": "profile",
  "type": "relation",
  "with": "UserProfile",
  "relationType": "OneToOne",
  "hasJoinColumn": false,
  "customJoinClause": "ON users.id = user_profiles.user_id",  // Optional
  "desc": "프로필"
}
```

## Additional Rules

### Entity Rules

1. 모든 엔티티는 `id`, `created_at` 프로퍼티를 필수로 포함해야 합니다.
2. 모든 엔티티는 `EntityNameOrderBy`, `EntityNameSearchField` Enum을 필수로 포함해야 합니다.
3. 엔티티 내에서 사용하는 Enum ID는 엔티티 이름을 접두어로 사용합니다. (예: UserStatus, ProductType)
4. indexes가 지정되지 않으면 빈 배열로 반환합니다.
5. subsets이 지정되지 않으면 `{ "A": ["id"] }`로 반환합니다.
6. relation 필드명은 `_id` 접미어 대신 관련 엔티티를 나타내는 이름을 사용합니다. (예: "user", "author", "category")

### Property Rules

1. `nullable`이 false(기본값)인 경우 생략합니다.
2. `dbDefault`가 필요 없는 경우 생략합니다.
3. `desc`가 엔티티 제목과 중복되는 경우 생략할 수 있습니다.
4. 단수형은 단일 값, 복수형은 배열 값에 사용합니다. (예: tag vs tags)

### Type-specific Required Fields Summary

| Type | Required Fields |
|------|-----------------|
| string | length |
| float, decimal, double | precision, scale |
| text | textType |
| json | id |
| enum | id, length |
| relation (BelongsToOne) | with, relationType, onUpdate, onDelete |
| relation (HasMany) | with, relationType, joinColumn, onUpdate, onDelete |
| relation (ManyToMany) | with, relationType, joinTable, onUpdate, onDelete |
| relation (OneToOne, hasJoinColumn: true) | with, relationType, hasJoinColumn, onUpdate, onDelete |
| relation (OneToOne, hasJoinColumn: false) | with, relationType, hasJoinColumn |

### Subset Rules

1. 현재 엔티티의 프로퍼티는 프로퍼티 `name`을 사용합니다.
2. relation 프로퍼티의 하위 필드는 `${관계명}.${프로퍼티명}` 형식을 사용합니다.
3. subset 항목은 props에 정의된 순서대로 나열합니다.

### Index Rules

인덱스는 `name`, `type`, `columns` 필드가 필수입니다.

**기본 인덱스:**
```json
{ "name": "users_user_id_index", "type": "index", "columns": [{ "name": "user_id" }] }
{ "name": "users_email_unique", "type": "unique", "columns": [{ "name": "email" }] }
{ "name": "users_status_created_at_index", "type": "index", "columns": [{ "name": "status" }, { "name": "created_at" }] }
```

**정렬 순서 및 NULL 순서 지정:**
```json
{ "name": "users_created_at_index", "type": "index", "columns": [{ "name": "created_at", "sortOrder": "DESC", "nullsFirst": true }] }
```

**인덱스 방식 지정 (using):**
```json
{ "name": "users_tags_index", "type": "index", "columns": [{ "name": "tags" }], "using": "gin" }
{ "name": "users_content_index", "type": "index", "columns": [{ "name": "content" }], "using": "pgroonga" }
```
- using 옵션: `btree` (기본값), `hash`, `gin`, `gist`, `pgroonga`

**Unique 인덱스 NULL 처리:**
```json
{ "name": "users_email_unique", "type": "unique", "columns": [{ "name": "email" }], "nullsNotDistinct": true }
```

**벡터 인덱스 (HNSW):** - 권장
```json
{
  "name": "embeddings_hnsw_index",
  "type": "hnsw",
  "columns": [{ "name": "embedding", "vectorOps": "vector_cosine_ops" }],
  "m": 16,
  "efConstruction": 64
}
```
- `vectorOps`: `vector_cosine_ops` (코사인 거리, 권장), `vector_ip_ops` (내적), `vector_l2_ops` (유클리드 거리)
- `m`: 각 노드의 최대 연결 수 (기본값: 16, 범위: 2~100)
- `efConstruction`: 구성 시 탐색 범위 (기본값: 64, 범위: 4~1000)

**벡터 인덱스 (IVFFlat):**
```json
{
  "name": "embeddings_ivfflat_index",
  "type": "ivfflat",
  "columns": [{ "name": "embedding", "vectorOps": "vector_cosine_ops" }],
  "lists": 100
}
```
- `lists`: 클러스터링 리스트 수 (권장값: sqrt(row_count) ~ row_count/1000)

## Complete Example

```json
{
  "id": "Product",
  "table": "products",
  "title": "상품",
  "props": [
    { "name": "id", "type": "integer", "desc": "ID", "unsigned": true },
    { "name": "created_at", "type": "timestamp", "desc": "등록일시", "dbDefault": "CURRENT_TIMESTAMP" },
    { "name": "name", "type": "string", "desc": "상품명", "length": 255 },
    { "name": "price", "type": "decimal", "desc": "가격", "precision": 10, "scale": 2 },
    { "name": "description", "type": "text", "desc": "설명", "textType": "text", "nullable": true },
    { "name": "status", "type": "enum", "id": "ProductStatus", "desc": "상태", "length": 16, "dbDefault": "\"active\"" },
    {
      "name": "category",
      "type": "relation",
      "with": "Category",
      "relationType": "BelongsToOne",
      "onUpdate": "CASCADE",
      "onDelete": "CASCADE",
      "desc": "카테고리"
    },
    {
      "name": "tags",
      "type": "relation",
      "with": "Tag",
      "relationType": "ManyToMany",
      "joinTable": "products__tags",
      "onUpdate": "CASCADE",
      "onDelete": "CASCADE",
      "desc": "태그 목록"
    }
  ],
  "indexes": [
    { "name": "products_category_id_index", "type": "index", "columns": [{ "name": "category_id" }] },
    { "name": "products_status_index", "type": "index", "columns": [{ "name": "status" }] }
  ],
  "subsets": {
    "A": ["id", "name", "price", "status", "category.id", "category.name"],
    "B": ["id", "name", "price"]
  },
  "enums": {
    "ProductStatus": { "active": "판매중", "hidden": "숨김", "soldout": "품절" },
    "ProductOrderBy": { "id-desc": "ID최신순", "id-asc": "ID오름차순", "price-desc": "가격높은순", "price-asc": "가격낮은순" },
    "ProductSearchField": { "id": "ID", "name": "상품명" }
  }
}
```
