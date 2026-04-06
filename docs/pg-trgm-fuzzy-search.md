# pg_trgm Fuzzy Search

Sonamu에서 pg_trgm 기반 다중 컬럼 fuzzy search를 사용하는 방법을 설명한다.

---

## 개요

generated column으로 다중 컬럼을 하나로 통합하고, GIN 인덱스 하나로 후보를 필터링한 뒤, 개별 컬럼 `word_similarity()`로 가중치 점수를 매기는 패턴이다.

```sql
CREATE INDEX idx ON items USING gin (search_text gin_trgm_ops);

SELECT *,
  word_similarity('query', title_ko) * 5 +
  word_similarity('query', title_en) * 3 AS score
FROM items
WHERE 'query' <% search_text
ORDER BY score DESC;
```

### 전제 조건

- DB locale이 `C`가 아닐 것 (UTF-8 필요)
- PostgreSQL >= 9.3
- `CREATE EXTENSION IF NOT EXISTS pg_trgm` 실행 필요

### 언어별 특성

| 언어                        | 적합성 | 비고                             |
| --------------------------- | ------ | -------------------------------- |
| 영어                        | 우수   | 단어 단위 분리 + word_similarity |
| 키릴 문자 (우크라이나어 등) | 우수   | alphabetic으로 분류됨            |
| 한국어                      | 양호   | 1-2글자 검색 시 성능 저하        |
| 일본어                      | 양호   | 1-2글자 검색 시 성능 저하        |

---

## 인덱스 opclass

entity.json의 인덱스 컬럼에 `opclass` 필드를 지정하면 DDL에 반영된다.

### entity.json

```json
{
  "indexes": [
    {
      "name": "idx_search_text",
      "type": "index",
      "columns": [{ "name": "search_text", "opclass": "gin_trgm_ops" }],
      "using": "gin"
    }
  ]
}
```

### 지원하는 알려진 opclass

| opclass                                    | 용도                     |
| ------------------------------------------ | ------------------------ |
| `gin_trgm_ops`                             | pg_trgm GIN 인덱스       |
| `gist_trgm_ops`                            | pg_trgm GiST 인덱스      |
| `gin_bigm_ops`                             | pg_bigm GIN 인덱스       |
| `vector_cosine_ops`                        | pgvector cosine distance |
| `vector_ip_ops`                            | pgvector inner product   |
| `vector_l2_ops`                            | pgvector L2 distance     |
| `pgroonga_varchar_full_text_search_ops_v2` | PGroonga varchar FTS     |
| `pgroonga_jsonb_full_text_search_ops_v2`   | PGroonga jsonb FTS       |

위 목록에 없는 값도 자유 문자열로 지정할 수 있다.

### DDL 생성

```sql
-- opclass 지정
CREATE INDEX idx_search_text ON items USING gin (search_text gin_trgm_ops);

-- 기존 vectorOps도 하위호환 (opclass 미지정 시 fallback)
CREATE INDEX idx_embedding ON items USING hnsw (embedding vector_cosine_ops);
```

### DB 스키마 리더 복원

DB에서 인덱스를 읽을 때 `pg_get_indexdef()`를 파싱하여 다음을 복원한다:

- 컬럼별 opclass -> `EntityIndexColumn.opclass`
- `USING hnsw`, `USING ivfflat` -> `EntityIndex.type`
- `WITH (m=..., ef_construction=...)` -> `m`, `efConstruction`, `lists`

---

## searchText prop 타입

다중 컬럼을 하나의 generated column으로 통합하는 전용 prop 타입이다.

### entity.json

```json
{
  "props": [
    { "name": "title_ko", "type": "string" },
    { "name": "title_en", "type": "string" },
    { "name": "code", "type": "string" },
    { "name": "tags", "type": "string[]" },
    { "name": "aliases", "type": "json", "id": "ItemAliases" },
    {
      "name": "search_text",
      "type": "searchText",
      "sourceColumns": [
        { "name": "title_ko" },
        { "name": "title_en", "caseInsensitive": true },
        { "name": "code" },
        { "name": "tags" },
        { "name": "aliases" }
      ]
    }
  ]
}
```

### source column 타입별 SQL 표현식

| source 타입                  | caseInsensitive: true                       | caseInsensitive: false                             |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------- |
| `string`                     | `lower(COALESCE(col, ''))`                  | `COALESCE(col, '')`                                |
| `string[]`                   | `COALESCE(sonamu_text_array_agg(col), '')`  | `COALESCE(sonamu_text_array_agg(col, false), '')`  |
| `json` (z.array(z.string())) | `COALESCE(sonamu_jsonb_array_agg(col), '')` | `COALESCE(sonamu_jsonb_array_agg(col, false), '')` |

위 세 타입 외에는 파싱 에러가 발생한다. `json` 타입은 optional/nullable 래퍼를 벗긴 뒤 `z.array(z.string())`이어야 한다.

### 생성되는 DDL

```sql
ALTER TABLE items ADD COLUMN search_text text GENERATED ALWAYS AS (
  trim(
    COALESCE(title_ko, '') || ' ' ||
    lower(COALESCE(title_en, '')) || ' ' ||
    COALESCE(code, '') || ' ' ||
    COALESCE(sonamu_text_array_agg(tags, false), '') || ' ' ||
    COALESCE(sonamu_jsonb_array_agg(aliases, false), '')
  )
) STORED NOT NULL;
```

### 코드 생성 동작

- TypeScript 타입: `string`
- Zod 스키마: `z.string()`
- `SaveParams`에서 자동 제외 (generated column이므로 INSERT/UPDATE 불가)

---

## 헬퍼 함수

`searchText`의 source column 중 `string[]` 또는 `json(string[])` 타입이 있으면 마이그레이션에 헬퍼 함수 DDL이 자동 삽입된다.

```sql
-- string[] 타입용
CREATE OR REPLACE FUNCTION sonamu_text_array_agg(arr text[], ci boolean DEFAULT true)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE RETURNS NULL ON NULL INPUT
AS $$
  SELECT string_agg(
    CASE WHEN ci THEN lower(value) ELSE value END,
    ' '
  )
  FROM unnest(arr) AS value
$$;

-- jsonb array 타입용
CREATE OR REPLACE FUNCTION sonamu_jsonb_array_agg(arr jsonb, ci boolean DEFAULT true)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE RETURNS NULL ON NULL INPUT
AS $$
  SELECT string_agg(
    CASE WHEN ci THEN lower(value) ELSE value END,
    ' '
  )
  FROM jsonb_array_elements_text(arr)
$$;
```

`CREATE OR REPLACE`이므로 멱등하다. 마이그레이션 파일당 한 번만 삽입된다.

---

## Puri API

### whereFuzzy

pg_trgm 연산자로 fuzzy 필터링한다.

```typescript
puri.whereFuzzy("items.search_text", query);
puri.whereFuzzy("items.search_text", query, { operator: "%" });
puri.whereFuzzy("items.search_text", query, { operator: "<<%" });
```

연산자별 SQL (피연산자 순서가 다르다):

| 연산자      | 의미                   | SQL                              |
| ----------- | ---------------------- | -------------------------------- |
| `<%` (기본) | word similarity        | `'query'::text <% column::text`  |
| `%`         | similarity             | `column::text % 'query'::text`   |
| `<<%`       | strict word similarity | `'query'::text <<% column::text` |

### 유사도 함수

점수 계산용 정적 메서드이다. `SqlExpression<"number">`를 반환하므로 select에서 사용한다.

```typescript
Puri.wordSimilarity("items.title_ko", query);
// -> word_similarity('query'::text, items.title_ko::text)

Puri.similarity("items.title_ko", query);
// -> similarity(items.title_ko::text, 'query'::text)

Puri.strictWordSimilarity("items.title_ko", query);
// -> strict_word_similarity('query'::text, items.title_ko::text)
```

### 전체 사용 예시

```typescript
async fuzzySearch(query: string) {
  return this.getPuri("w")
    .table("items")
    .whereFuzzy("items.search_text", query)
    .select({
      title_ko: "items.title_ko",
      title_en: "items.title_en",
      score: Puri.rawNumber(`
        word_similarity('${query}', items.title_ko) * 5 +
        word_similarity('${query}', items.title_en) * 3
      `),
    })
    .orderByRaw("score DESC");
}
```

---

## UI 인덱스 모달

Sonamu UI의 인덱스 편집 모달에서 opclass와 벡터 인덱스 옵션을 설정할 수 있다.

### opclass 설정

- `using`이 `gin` 또는 `gist`일 때 컬럼별 opclass 입력 필드가 나타난다
- 알려진 opclass 드롭다운 + custom opclass 자유 입력을 지원한다
  - gin: `gin_trgm_ops`, `gin_bigm_ops`
  - gist: `gist_trgm_ops`
- type/using 전환 시 호환되지 않는 opclass 값은 submit 시 자동으로 제거된다

### 벡터 인덱스 옵션

- `type === "hnsw"`: M, EF Construction 입력 패널
- `type === "ivfflat"`: Lists 입력 패널
- 벡터 인덱스 선택 시 distance metric 드롭다운 (cosine, IP, L2)

### 제약 조건

- hash 인덱스는 단일 컬럼만 지원한다
- 정렬 옵션(sortOrder, nullsFirst)은 btree/unique에서만 사용할 수 있다
- 인덱스명은 최대 63자이다
- 기존 `vectorOps` 값이 있는 entity.json을 열면 `opclass`로 자동 변환된다
