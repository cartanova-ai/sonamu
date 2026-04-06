# Vector Search 통합

> **상위 카드**: pgvector 적용 및 테스트
> **상태**: 진행 중
> **목표**: pgvector 기반 벡터 검색을 Documents Entity로 정식 통합 + Puri 쿼리빌더 지원

---

## 배경

기존 `sync_fixtures` 테이블에서 임시로 진행하던 벡터 검색 테스트를 `documents`라는 전용 Entity로 분리하여 체계적으로 관리한다.

### 완료된 작업 (pgvector 적용 및 테스트)

- [x] pgvector 환경 설정 (Docker, extension)
- [x] Sonamu 타입 시스템 (VectorProp, VectorArrayProp)
- [x] Embedding/VectorSearch 서비스 구현 (sonamu 모듈)
- [x] 테스트 데이터 및 seed 환경 구성 (sync_fixtures 기준)
- [x] Embedding Model 비교 (Voyage AI vs OpenAI)
- [x] PostgreSQL 18 적용 가이드
- [x] `miomock_test_latest.sql`에 sync_fixtures용 pgvector 설정 추가
  - pgvector extension 생성
  - content_embedding (1024차원), content_embedding_openai (1536차원) 컬럼
  - content_tsv (FTS용 tsvector)
  - HNSW 인덱스들
  - 1000건 테스트 데이터

---

## Sub-issues

### 1. Documents Entity 설계 및 생성

**목표**: 벡터 검색 테스트를 위한 전용 Entity 구성

#### Entity 구조

| prop                     | type                 | 비고                         |
| ------------------------ | -------------------- | ---------------------------- |
| id                       | integer              |                              |
| created_at               | date                 | dbDefault: CURRENT_TIMESTAMP |
| title                    | string(255)          |                              |
| content                  | string               | nullable, length 미지정      |
| status                   | enum(DocumentStatus) | draft, published, archived   |
| is_published             | boolean              | dbDefault: false             |
| content_embedding        | vector(1024)         | nullable, Voyage AI용        |
| content_embedding_openai | vector(1536)         | nullable, OpenAI용           |

#### seed 파일에서 추가할 것

- `content_tsv` GENERATED 컬럼 (하이브리드 검색용 FTS)
- HNSW 인덱스들
- 테스트 데이터

#### 체크리스트

- [ ] Sonamu UI에서 Entity 생성
- [ ] 마이그레이션 실행
- [ ] `miomock_test_latest.sql`에 documents 테이블용 pgvector 설정 추가
  - vector 컬럼 (content_embedding, content_embedding_openai)
  - content_tsv GENERATED 컬럼
  - HNSW 인덱스들
  - 테스트 데이터 (기술 문서, 가이드 등 100건)
- [ ] `document.vector.ts` 작성 (sync-fixture.vector.ts 기반)
- [ ] 기존 sync_fixtures 벡터 코드 정리/제거

> **참고**: `miomock_test_latest.sql`에는 이미 sync_fixtures용 pgvector 설정이 있음.
> Documents Entity용으로 별도 추가 필요.

---

### 2. Vector Search E2E 테스트

**목표**: Documents 기반 벡터 검색 전체 프로세스 테스트

#### 테스트 레벨

| 레벨        | 위치                                          | 목적                                       |
| ----------- | --------------------------------------------- | ------------------------------------------ |
| Unit        | `sonamu/src/vector/__tests__/`                | Embedding, VectorSearch 클래스 자체 테스트 |
| Integration | `miomock/src/testing/document.vector.test.ts` | Documents 기반 실제 DB 연동 테스트         |

#### 테스트 케이스

```typescript
describe("Document Vector Search", () => {
  // 1. 임베딩 저장
  describe("saveEmbedding", () => {
    it("단일 문서 임베딩 저장");
    it("배치 임베딩 저장 (100건)");
    it("이미 임베딩이 있는 문서 업데이트");
  });

  // 2. 벡터 검색
  describe("search", () => {
    it("기본 검색 - 유사도 순 정렬");
    it("threshold 필터링");
    it("WHERE 조건과 함께 검색");
    it("limit 적용");
  });

  // 3. 하이브리드 검색
  describe("hybridSearch", () => {
    it("Vector + FTS 결합 검색");
    it("가중치 조절 (vector 0.8, fts 0.2)");
  });

  // 4. Provider 비교
  describe("provider comparison", () => {
    it("Voyage vs OpenAI 동일 쿼리 결과 비교");
  });

  // 5. 에러 케이스
  describe("error handling", () => {
    it("API key 없을 때 에러");
    it("빈 텍스트 임베딩 시도");
  });
});
```

#### 테스트 환경

- DB: `miomock_fixture_remote` (fixture sync용 DB)
- 초기화: `pnpm seed`로 스키마 + 테스트 데이터 적용

#### 체크리스트

- [ ] 테스트 파일 구조 설계
- [ ] 테스트 케이스 작성
- [ ] CI/CD 통합 고려

---

### 3. Sonamu UI 벡터 타입 지원 개선

**목표**: Entity 편집 UI에서 vector 타입 기본 지원 (옵션 A - 최소 지원)

#### 작업 내용

```
┌─────────────────────────────────────┐
│ Property: content_embedding         │
├─────────────────────────────────────┤
│ Type: [vector ▼]                    │
│ Dimensions: [1024    ]              │
│ Nullable: [✓]                       │
└─────────────────────────────────────┘
```

#### 체크리스트

- [ ] Sonamu UI PropEditor에서 vector 타입 선택 가능하게
- [ ] dimensions 입력 필드 추가
- [ ] 마이그레이션 미리보기에서 vector 컬럼 올바르게 표시

---

### 4. 운영 가이드 문서화

**목표**: pgvector-final-guide.md를 Documents 기준으로 업데이트

#### 업데이트 내용

- [ ] sync_fixtures 예제를 documents로 교체
- [ ] 테스트 실행 섹션 추가
- [ ] Sonamu UI 사용법 추가
- [ ] FAQ/트러블슈팅 보강

---

## 작업 순서

```
1. Documents Entity 설계 및 생성 ──┬──→ 3. Sonamu UI 개선
                                   │
2. Vector Search E2E 테스트 ───────┤
                                   │
5. Puri 벡터 검색 통합 ────────────┴──→ 4. 운영 가이드 문서화
```

- 1번, 2번, 5번 병렬 진행 가능 (5번은 기존 VectorSearch 기반으로 먼저 구현 가능)
- UI 개선은 Entity 완성 후 테스트하면서 진행
- 문서화는 마지막에 전체 정리

---

### 5. Puri 벡터 검색 통합

**목표**: Puri 쿼리빌더에서 벡터 검색을 타입 안전하게 사용할 수 있도록 지원

#### 현재 상황

현재 `VectorSearch` 클래스는 독립적으로 동작하며, Puri와 통합되어 있지 않음:

```typescript
// 현재 방식: VectorSearch 클래스 직접 사용
const vectorSearch = new VectorSearch<SyncFixtureSubsetA>(DB.getDB("w"), "sync_fixtures");
const results = await vectorSearch.search(query, "voyage", { limit: 10 });
```

#### 제안: Puri 확장 방식 3가지

##### 옵션 A: Static 메서드 확장 (추천)

```typescript
// Puri에 벡터 연산자 static 메서드 추가
class Puri {
  // 코사인 유사도 (1 - 거리)
  static cosineSimilarity(column: string, embedding: number[]): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `1 - (${column} <=> '[${embedding.join(",")}]'::vector)`,
    };
  }

  // 벡터 거리 연산자들
  static vectorDistance(column: string, embedding: number[], op: "<->" | "<=>" | "<#>"): SqlExpression<"number"> { ... }
}

// 사용 예시
const embedding = await Embedding.embedOne(query, "voyage", "query");
const results = await new Puri(db, "documents")
  .select({
    id: "documents.id",
    title: "documents.title",
    similarity: Puri.cosineSimilarity("documents.content_embedding", embedding),
  })
  .whereNotNull("documents.content_embedding")
  .orderBy("similarity", "desc")
  .limit(10);
```

##### 옵션 B: 전용 VectorPuri 클래스

```typescript
// VectorSearch를 Puri 스타일로 래핑
class VectorPuri<TSchema, TTables> extends Puri<TSchema, TTables, any> {
  private embeddingColumn: string;
  private queryEmbedding: number[];

  vectorSearch(column: string, query: string, provider: EmbeddingProvider): this { ... }
  hybridSearch(vectorCol: string, ftsCol: string, query: string): this { ... }
  withSimilarity(): this { ... }
}

// 사용 예시
const results = await new VectorPuri(db, "documents")
  .vectorSearch("content_embedding", "검색어", "voyage")
  .where("documents.status", "published")
  .withSimilarity()
  .limit(10);
```

##### 옵션 C: Puri 인스턴스 메서드 확장

```typescript
// Puri 클래스에 벡터 검색 메서드 추가
class Puri {
  // 벡터 검색 조건 추가
  orderByVector(
    column: AvailableColumns<TTables>,
    embedding: number[],
    direction: "nearest" | "farthest" = "nearest"
  ): this {
    const op = direction === "nearest" ? "<=>" : "<->";
    this.knexQuery.orderByRaw(`${column} ${op} '[${embedding.join(",")}]'::vector`);
    return this;
  }

  // 유사도 threshold 필터링
  whereVectorSimilarity(
    column: AvailableColumns<TTables>,
    embedding: number[],
    threshold: number
  ): this { ... }
}
```

#### 추천 구현 순서

1. **Phase 1**: 옵션 A (Static 메서드) 구현 - 기존 Puri와 호환, 최소 변경
2. **Phase 2**: 사용 패턴 검증 후 필요시 옵션 C (인스턴스 메서드) 추가
3. **Phase 3**: 복잡한 벡터 검색이 필요하면 옵션 B (VectorPuri) 고려

#### 체크리스트

- [ ] Puri.cosineSimilarity() static 메서드 구현
- [ ] Puri.vectorDistance() static 메서드 구현
- [ ] puri.types.ts에 vector 타입 지원 추가
- [ ] 사용 예제 및 테스트 작성
- [ ] (선택) orderByVector(), whereVectorSimilarity() 인스턴스 메서드

---

## 테스트 데이터 개선 제안

> **현재 상태**: 10,000건 생성 완료 (`scripts/documents-insert.sql`)

### 현재 데이터의 한계

현재 생성 스크립트(`scripts/generate-documents-sql.ts`)는 동일한 템플릿 구조를 사용:

```
# 제목
개요 문장 (4가지 중 랜덤)
## 개요
기능 문장 (4가지 중 랜덤) x2
## 주요 활용 사례
...
```

**문제점:**

1. 모든 문서가 비슷한 벡터가 될 가능성 높음 (검색 변별력 부족)
2. recall/precision 측정을 위한 ground truth 없음
3. status 하나만으로는 다양한 필터링 시나리오 테스트 어려움

### 개선 방안

#### 1. 스키마 확장

```sql
ALTER TABLE documents ADD COLUMN category VARCHAR(50);        -- 프로그래밍 언어, 프레임워크, DB 등
ALTER TABLE documents ADD COLUMN keywords VARCHAR(255)[];     -- 태그 배열 (다중 필터링)
ALTER TABLE documents ADD COLUMN difficulty VARCHAR(20);      -- beginner, intermediate, advanced
ALTER TABLE documents ADD COLUMN content_tsv TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('korean', coalesce(title, '') || ' ' || coalesce(content, ''))) STORED;
```

#### 2. 컨텐츠 다양화

| 문서 유형    | 템플릿 특징                  | 예시                                                 |
| ------------ | ---------------------------- | ---------------------------------------------------- | ----- | --- | ------- | --- |
| 튜토리얼     | 단계별 설명, 코드 예제 포함  | "Step 1: 환경 설정..."                               |
| API 레퍼런스 | 함수 시그니처, 파라미터 설명 | "function fetchData(url: string): Promise<Response>" |
| 트러블슈팅   | 에러 메시지, 해결 방법       | "Error: ECONNREFUSED..."                             |
| 코드 스니펫  | 순수 코드 위주               | "```typescript\nconst result = await..."             |
| 비교 분석    | 표 형식, 장단점              | "                                                    | React | Vue | Angular | "   |

#### 3. 테스트 쿼리 세트

별도 파일 `scripts/test-queries.json`:

```json
[
  {
    "query": "React에서 상태 관리하는 방법",
    "expected_document_ids": [42, 156, 289],
    "relevance_scores": [1.0, 0.8, 0.6],
    "category": "프레임워크"
  },
  {
    "query": "PostgreSQL 인덱스 최적화",
    "expected_document_ids": [501, 1023],
    "relevance_scores": [1.0, 0.9],
    "category": "데이터베이스"
  }
]
```

#### 4. 의도적 유사 문서 그룹

벡터 검색의 미세한 차이를 테스트하기 위한 유사 문서 세트:

```
그룹 A: React 상태 관리
- "React useState로 상태 관리하기"
- "React useReducer로 복잡한 상태 관리"
- "React Context API 상태 공유"
- "Redux로 전역 상태 관리"

그룹 B: Vue 상태 관리 (유사하지만 다른 프레임워크)
- "Vue ref와 reactive로 상태 관리"
- "Vuex로 전역 상태 관리"
- "Pinia 상태 관리 가이드"
```

### 구현 체크리스트

- [ ] 스키마 마이그레이션 (category, keywords, difficulty, content_tsv)
- [ ] 생성 스크립트 템플릿 다양화
- [ ] 문서 길이 다양화 (100자 ~ 5000자)
- [ ] 테스트 쿼리 세트 생성
- [ ] 의도적 유사 문서 그룹 설계
- [ ] recall@k, precision@k 측정 스크립트

---

## 향후 고려 사항

아직 결정이 필요한 부분 (필요시 별도 카드로 분리):

| 항목          | 질문                                 | 옵션                                     |
| ------------- | ------------------------------------ | ---------------------------------------- |
| 임베딩 트리거 | 언제 임베딩을 생성할까?              | 수동 배치 / 저장 시 자동 / 백그라운드 큐 |
| 멀티 테넌트   | 여러 테이블에서 벡터 검색을 쓸 건가? | documents만 / 범용 지원                  |
| 비용 관리     | API 호출 비용 추적이 필요한가?       | 로깅만 / 쿼터 관리                       |

---

## 관련 파일

- `docs/pgvector-final-guide.md` - 기존 가이드 문서
- `database/dumps/miomock_test_latest.sql` - seed 파일
- `src/application/sync-fixture/sync-fixture.vector.ts` - 기존 벡터 래퍼 (이전 대상)
- `src/testing/vector-script.ts` - CLI 스크립트

---

## DB 환경

| DB 이름                  | 용도                               |
| ------------------------ | ---------------------------------- |
| `miomock`                | 개발/운영 DB                       |
| `miomock_test`           | 덤프 원본 DB                       |
| `miomock_fixture_remote` | fixture sync용 DB, E2E 테스트 대상 |
