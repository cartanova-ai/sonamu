# Sonamu Entity JSON Template and Rules

## Basic Template

```json
{
  "id": "EntityName",
  "table": "table_name",
  "title": "엔티티 제목",
  "props": [
    { "name": "id", "type": "integer", "desc": "ID" },
    { "name": "created_at", "type": "date", "desc": "등록일시", "dbDefault": "CURRENT_TIMESTAMP" }
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
   { "name": "id", "type": "integer", "desc": "ID" }
   ```

2. **created_at** - 등록일시
   ```json
   { "name": "created_at", "type": "date", "desc": "등록일시", "dbDefault": "CURRENT_TIMESTAMP" }
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

### 공통 필드 (Common Fields)

모든 프로퍼티 타입에서 사용할 수 있는 공통 필드입니다:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| name | string | ✓ | 프로퍼티 이름 |
| desc | string | | 설명 |
| nullable | boolean | | null 허용 여부 (기본값: false) |
| toFilter | boolean | | 필터 조건으로 사용 여부 |
| dbDefault | string \| number \| boolean | | DB 기본값 |
| generated | object | | Generated Column 설정 |

**Generated Column 설정:**
```json
{
  "generated": {
    "type": "STORED",       // "STORED" | "VIRTUAL"
    "expression": "lower(name)"
  }
}
```
- `STORED`: 값이 디스크에 저장됨
- `VIRTUAL`: 조회 시 계산됨 (json, vector, 배열 타입 사용 불가)

---

### 1. Integer / Integer[]
```json
{ "name": "count", "type": "integer", "desc": "수량" }
{ "name": "scores", "type": "integer[]", "desc": "점수 목록" }
```

### 2. BigInteger / BigInteger[]
```json
{ "name": "total_amount", "type": "bigInteger", "desc": "총액" }
{ "name": "big_numbers", "type": "bigInteger[]", "desc": "큰 숫자 목록" }
```

### 3. String / String[]
```json
{ "name": "title", "type": "string", "desc": "제목", "length": 255 }
{ "name": "tags", "type": "string[]", "desc": "태그 목록" }
```
- `length`: 최대 길이 (Optional, 생략 시 text)

### 4. Boolean / Boolean[]
```json
{ "name": "is_active", "type": "boolean", "desc": "활성여부", "dbDefault": false }
{ "name": "flags", "type": "boolean[]", "desc": "플래그 목록" }
```

### 5. Date / Date[]
```json
{ "name": "created_at", "type": "date", "desc": "등록일시", "dbDefault": "CURRENT_TIMESTAMP" }
{ "name": "holidays", "type": "date[]", "desc": "휴일 목록" }
```
- PostgreSQL의 `timestamptz` 타입으로 매핑됨

### 6. Number / Number[]
```json
{
  "name": "price",
  "type": "number",
  "desc": "가격",
  "precision": 10,
  "scale": 2,
  "numberType": "numeric"
}
{ "name": "rates", "type": "number[]", "desc": "비율 목록" }
```
- `precision`: 전체 자릿수 (Optional)
- `scale`: 소수점 이하 자릿수 (Optional)
- `numberType`: `"real"` | `"double precision"` | `"numeric"` (Optional, 기본값: numeric)

### 7. Numeric / Numeric[]
```json
{ "name": "exact_value", "type": "numeric", "desc": "정밀값", "precision": 20, "scale": 8 }
{ "name": "exact_values", "type": "numeric[]", "desc": "정밀값 목록" }
```
- `precision`: 전체 자릿수 (Optional)
- `scale`: 소수점 이하 자릿수 (Optional)
- TypeScript에서 `string`으로 매핑됨 (정밀도 유지)

### 8. UUID / UUID[]
```json
{ "name": "external_id", "type": "uuid", "desc": "외부 ID" }
{ "name": "reference_ids", "type": "uuid[]", "desc": "참조 ID 목록" }
```

### 9. Enum / Enum[] (Required: id)
```json
{
  "name": "status",
  "type": "enum",
  "id": "ProductStatus",
  "desc": "상태",
  "length": 16,
  "dbDefault": "\"active\""
}
{ "name": "categories", "type": "enum[]", "id": "ProductCategory", "desc": "카테고리 목록" }
```
- `id`: enums에 정의된 Enum ID (Required)
- `length`: 최대 길이 (Optional, enum 타입만)

**주의**: `id`로 지정한 Enum은 반드시 `enums` 객체에 정의되어 있어야 합니다.

### 10. JSON (Required: id)
```json
{
  "name": "metadata",
  "type": "json",
  "id": "ProductMetadata",
  "desc": "메타데이터",
  "dbDefault": "{}"
}
```
- `id`: 타입 ID (Required) - 별도 타입 정의 필요

### 11. Virtual (Required: id)
```json
{
  "name": "full_name",
  "type": "virtual",
  "id": "string",
  "desc": "전체 이름"
}
```
- `id`: 타입 ID (Required)
- DB에 컬럼이 생성되지 않음, TypeScript 타입만 생성

### 12. Vector / Vector[] (Required: dimensions)
```json
{
  "name": "embedding",
  "type": "vector",
  "dimensions": 1536,
  "desc": "임베딩 벡터"
}
{ "name": "embeddings", "type": "vector[]", "dimensions": 768, "desc": "임베딩 목록" }
```
- `dimensions`: 벡터 차원 수 (Required)
- pgvector 확장 필요

### 13. TsVector
```json
{
  "name": "search_vector",
  "type": "tsvector",
  "desc": "검색 벡터",
  "generated": {
    "type": "STORED",
    "expression": "to_tsvector('korean', coalesce(title, '') || ' ' || coalesce(content, ''))"
  }
}
```
- PostgreSQL 전문 검색용 타입

## Relation Types

### 14. BelongsToOne (Required: with, relationType)
```json
{
  "name": "author",
  "type": "relation",
  "with": "User",
  "relationType": "BelongsToOne",
  "desc": "작성자",
  "nullable": true,              // Optional
  "customJoinClause": "...",     // Optional
  "useConstraint": true,         // Optional (기본값: true)
  "onUpdate": "CASCADE",         // Optional (기본값: RESTRICT)
  "onDelete": "CASCADE"          // Optional (기본값: RESTRICT)
}
```

### 15. HasMany (Required: with, relationType, joinColumn)
```json
{
  "name": "comments",
  "type": "relation",
  "with": "Comment",
  "relationType": "HasMany",
  "joinColumn": "post_id",       // Required: 상대 엔티티의 FK 컬럼명
  "fromColumn": "id",            // Optional: 이 엔티티의 참조 컬럼 (기본값: id)
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
  "joinTable": "posts__tags",    // Required: "테이블명__테이블명" 형식
  "onUpdate": "CASCADE",         // Required
  "onDelete": "CASCADE",         // Required
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
  "customJoinClause": "...",     // Optional
  "useConstraint": true,         // Optional (기본값: true)
  "onUpdate": "CASCADE",         // Optional (기본값: RESTRICT)
  "onDelete": "CASCADE",         // Optional (기본값: RESTRICT)
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
| integer, integer[], bigInteger, bigInteger[] | - |
| string, string[] | - (length는 optional) |
| boolean, boolean[] | - |
| date, date[] | - |
| number, number[] | - (precision, scale, numberType는 optional) |
| numeric, numeric[] | - (precision, scale는 optional) |
| uuid, uuid[] | - |
| enum | id |
| enum[] | id |
| json | id |
| virtual | id |
| vector, vector[] | dimensions |
| tsvector | - |
| relation (BelongsToOne) | with, relationType |
| relation (HasMany) | with, relationType, joinColumn |
| relation (ManyToMany) | with, relationType, joinTable, onUpdate, onDelete |
| relation (OneToOne, hasJoinColumn: true) | with, relationType, hasJoinColumn |
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
    { "name": "id", "type": "integer", "desc": "ID" },
    { "name": "created_at", "type": "date", "desc": "등록일시", "dbDefault": "CURRENT_TIMESTAMP" },
    { "name": "name", "type": "string", "desc": "상품명", "length": 255 },
    { "name": "price", "type": "number", "desc": "가격", "precision": 10, "scale": 2 },
    { "name": "description", "type": "string", "desc": "설명", "nullable": true },
    { "name": "status", "type": "enum", "id": "ProductStatus", "desc": "상태", "dbDefault": "\"active\"" },
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
