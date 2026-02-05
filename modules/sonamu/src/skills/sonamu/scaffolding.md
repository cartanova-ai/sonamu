---
name: sonamu-scaffolding
description: Sonamu UI Scaffolding 사용 시 참조. 흔한 오류와 해결 방법. Use when scaffolding models or views.
---

# Scaffolding 트러블슈팅

## Scaffolding 전 체크리스트

**`packages/api`** 디렉토리에서 실행:

1. **Entity 변경 감지 대기**: Entity 생성 후 syncer가 `types.ts` 자동 생성할 때까지 대기 (2-3초)
2. **types.ts 파일 확인**: 자동 생성되지 않았다면 수동 생성
3. **Migration 생성 및 실행**: Sonamu UI에서 Migration 생성 → `pnpm sonamu migrate run`
4. **TypeScript 빌드 완료**: `pnpm build`로 `dist/` 폴더에 `.js` 파일 생성
5. **개발 서버 재시작**: `pnpm dev` (빌드 후 재시작 필요)

## Scaffolding 후 필수 체크리스트

**CRITICAL: Scaffolding 완료 후 반드시 다음 작업을 수행하세요.**

### 1. Build 테스트
```bash
cd packages/api
pnpm build

cd packages/web
pnpm build
```
- [ ] API 빌드 성공
- [ ] Web 빌드 성공

### 2. Dev 서버 재시작
```bash
cd packages/api
pnpm dev
```
- [ ] 서버 정상 작동

### 3. Relation이 있는 경우 (i18n 키 추가)

**필수**: Entity에 BelongsToOne 또는 relation이 있으면 반드시 수행

```typescript
// packages/api/src/i18n/ko.ts
export default {
  // ... 기존 키들
  
  // Relation 있는 Entity마다 추가
  "entity.Post.author_id": "작성자",
  "entity.Question.collection_id": "소속 모음집",
  "entity.Question.parent_id": "상위 질문",
  "entity.Employee.department_id": "부서",
  "entity.Task.principal_investigator_id": "연구책임자",
  
  // ...
} as const;
```

**패턴**: `entity.{EntityId}.{relation}_id`
- relation 이름에 `_id` 접미사 추가
- 예: `author` relation → `author_id` 키

- [ ] Relation 있는 모든 Entity의 i18n 키 추가 완료

### 4. OrderBy 케이스 추가 (id-desc 외 사용 시)

**선택**: entity.json의 OrderBy enum에 `id-desc` 외 값이 있으면 수행

```typescript
// packages/api/src/application/{entity}/{entity}.model.ts

// 생성된 코드
if (params.orderBy === "id-desc") {
  qb.orderBy("posts.id", "desc");
} else {
  exhaustive(params.orderBy);  // 타입 에러 발생!
}

// 수정: 나머지 case 추가
if (params.orderBy === "id-desc") {
  qb.orderBy("posts.id", "desc");
} else if (params.orderBy === "created_at-desc") {
  qb.orderBy("posts.created_at", "desc");
} else if (params.orderBy === "name-asc") {
  qb.orderBy("posts.name", "asc");
} else {
  exhaustive(params.orderBy);  // 이제 타입 에러 없음
}
```

- [ ] OrderBy 케이스 추가 완료

### 5. types.ts nullable 필드 처리 (테스트 전 필수!)

**필수**: 모든 Entity의 types.ts에서 nullable 필드 처리

```typescript
// packages/api/src/application/{entity}/{entity}.types.ts

// 생성된 코드
export const PostSaveParams = PostBaseSchema.partial({
  id: true,
  created_at: true,
});

// 수정: nullable 필드 추가
export const PostSaveParams = PostBaseSchema
  .partial({
    id: true,
    created_at: true,
    updated_at: true,      // nullable 필드
    category: true,        // nullable 필드
    description: true,     // nullable 필드
  })
  .extend({
    updated_at: z.date().nullish(),
    category: z.string().nullish(),
    description: z.string().nullish(),
  });
```

**상세 가이드**: `testing.md`의 "엔티티 생성 후 즉시 해야 할 작업" 참조

- [ ] 모든 Entity의 types.ts nullable 필드 처리 완료

### 완료 확인

```
✅ Scaffolding 후 필수 체크리스트 완료
→ 다음 단계: 테스트 작성 (testing.md)

⚠️ types.ts nullable 필드 처리를 하지 않으면
   테스트 작성 시 타입 에러가 발생합니다!
```

---

## 흔한 오류

| 오류 | 원인 | 해결 |
|------|------|------|
| "존재하지 않는 모듈 패스 요청 {Type}" | types.ts 미생성 또는 미컴파일 | 대기/수동생성 → build → dev 재시작 |
| exhaustive() 타입 에러 | OrderBy 첫 번째 값만 자동 처리 | 위 "4. OrderBy 케이스 추가" 참조 |
| i18n 키 없음 (relation) | `author_id` vs `author` | 위 "3. Relation이 있는 경우" 참조 |
| IdAsyncSelect API 불일치 | 구버전 scaffolding 템플릿 사용 | 아래 "IdAsyncSelect API 마이그레이션" 참조 |

## 상세 설명

### "존재하지 않는 모듈 패스 요청" 오류

Scaffolding은 `dist/application/{entity}/{entity}.types.js`에서 export된 타입을 읽어 모듈 경로를 등록합니다.

```typescript
// modules/sonamu/src/entity/entity.ts
const typesFilePath = path.join(
  Sonamu.apiRootPath,
  runtimePath(`dist/application/${typesModulePath}.js`),
);
if (await exists(typesFilePath)) {
  // 타입 등록
}
```

### types.ts 자동 생성 메커니즘

Entity 생성 시 syncer의 `handleTruthSourceChanges`가 자동으로 `init_types` 템플릿을 실행합니다:

```typescript
// modules/sonamu/src/syncer/syncer.ts - handleTruthSourceChanges 함수
if (entityId) {
  const entity = EntityManager.get(entityId);
  const typeFilePath = path.join(...);
  if (entity.parentId === undefined && !(await exists(typeFilePath))) {
    await generateTemplate("init_types", { entityId });
  }
}
```

**자동 생성 조건**:
- `parentId`가 없는 경우 (최상위 Entity)
- `types.ts` 파일이 아직 존재하지 않는 경우

**오류 발생 원인**:
- Entity 생성 직후 syncer가 아직 실행되지 않은 상태에서 scaffolding 시도
- types.ts는 생성되었으나 빌드가 완료되지 않아 `.js` 파일이 없는 상태

**해결 순서** (`packages/api`에서 실행):
1. Entity 생성 후 syncer가 types.ts 생성할 때까지 잠시 대기 (2-3초)
2. types.ts가 없으면 수동 생성 (아래 템플릿 참고)
3. Migration 생성 (Sonamu UI) 및 실행 (`pnpm sonamu migrate run`)
4. `pnpm build`로 TypeScript 컴파일
5. `pnpm dev` 재시작
6. Scaffolding 재시도

### types.ts 수동 생성 (필요시)

syncer 타이밍 문제로 자동 생성되지 않은 경우:

```typescript
// {entity}.types.ts
import type { z } from "zod";
import { {Entity}BaseListParams, {Entity}BaseSchema } from "../sonamu.generated";

// {Entity} - ListParams
export const {Entity}ListParams = {Entity}BaseListParams;
export type {Entity}ListParams = z.infer<typeof {Entity}ListParams>;

// {Entity} - SaveParams
export const {Entity}SaveParams = {Entity}BaseSchema.partial({ id: true, created_at: true });
export type {Entity}SaveParams = z.infer<typeof {Entity}SaveParams>;
```

**IMPORTANT: Entity with `updated_at` field**:

Entity에 `updated_at` 필드가 정의되어 있으면 SaveParams의 partial에도 포함해야 합니다.
Form에서 `updated_at`을 직접 입력받지 않으므로 optional로 설정해야 타입 오류가 발생하지 않습니다.

```typescript
// updated_at이 있는 Entity의 경우
export const {Entity}SaveParams = {Entity}BaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true  // ← 추가
});
```

### exhaustive() 타입 에러

Scaffolding 템플릿은 `OrderBy` enum의 **첫 번째 값만** 자동 처리합니다.

```typescript
// 생성된 코드
if (params.orderBy === "id-desc") {
  qb.orderBy("posts.id", "desc");
} else {
  exhaustive(params.orderBy);  // 나머지 case 미처리 → 타입 에러
}
```

**해결**: 모든 OrderBy case를 직접 추가

```typescript
if (params.orderBy === "id-desc") {
  qb.orderBy("posts.id", "desc");
} else if (params.orderBy === "created_at-desc") {
  qb.orderBy("posts.created_at", "desc");
} else {
  exhaustive(params.orderBy);
}
```

### i18n 키 오류 (relation prop)

Entity의 relation prop은 `author`로 정의되고, `sd.generated.ts`의 i18n label은 `entity.Post.author`로 생성됩니다.
**하지만** 스캐폴딩된 form.tsx 템플릿은 FK 컬럼명인 `author_id`를 사용합니다.

```typescript
// 스캐폴딩된 form.tsx (실제 생성되는 코드)
{SD("entity.Post.author_id")}  // ← _id 접미사 사용

// sd.generated.ts (자동 생성되는 키)
"entity.Post.author": "작성자"  // ← _id 없음
```

**해결 방법 (둘 중 하나 선택)**:

1. **ko.ts에 `_id` 키 수동 추가** (권장):
```typescript
// packages/api/src/i18n/ko.ts
export default {
  // ... 기존 키들
  "entity.Post.author_id": "작성자",
  "entity.Question.collection_id": "소속 모음집",
  "entity.Question.parent_id": "상위 질문",
  // ...
} as const;
```

2. **form.tsx에서 `_id` 제거** (수동 수정 필요):
```typescript
// 스캐폴딩 후 수동 수정
{SD("entity.Post.author")}  // _id 제거
```

**권장**: 첫 번째 방법 - ko.ts에 `_id` 키 추가. sync 시 유지되며 여러 form에서 재사용 가능.

### IdAsyncSelect API 마이그레이션

#### 발생 배경

Sonamu의 `@sonamu-kit/react-components` 패키지가 업데이트되면서 IdAsyncSelect API가 변경되었으나, scaffolding 생성 코드(`scaffolding/react-components.ts`)는 구 API 기준으로 코드를 생성합니다.

따라서 `pnpm sonamu scaffold` 실행 시 구 API 기반 래퍼 컴포넌트가 생성되며, 최신 패키지를 사용하는 프로젝트에서는 빌드 오류가 발생합니다.

#### 구체적인 API 변경 사항

**구 API (scaffolding이 생성하는 코드):**
```typescript
export function UserIdAsyncSelect<T extends UserSubsetKey>({
  subset,
  value,
  onValueChange,
  listParams,      // ← 구 API
  textField = "name",  // ← 구 API
  pageField,       // ← 구 API
  ...
}: UserIdAsyncSelectProps<T>) {
  // 수동 상태 관리
  const [searchText, setSearchText] = useState("");

  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  return (
    <AsyncSelect  // ← 구 컴포넌트
      config={UserAsyncIdConfig}
      subset={subset}
      listParams={{ ...listParams, [textField]: searchText }}
      textField={textField}
      pageField={pageField}
      onSearch={handleSearch}
      ...
    />
  );
}
```

**신 API (실제 패키지 API):**
```typescript
export function UserIdAsyncSelect<T extends UserSubsetKey>({
  subset,
  value,
  onValueChange,
  baseListParams,    // ← 신 API
  displayField = "name",  // ← 신 API
  // pageField 없음  // ← 제거됨
  ...
}: UserIdAsyncSelectProps<T>) {
  // 상태 관리 없음 (내부에서 처리)

  return (
    <IdAsyncSelect<number>  // ← 신 컴포넌트 + 제네릭
      config={UserAsyncIdConfig}
      subset={subset}
      baseListParams={baseListParams}
      displayField={displayField}
      // 내부에서 검색 처리
      ...
    />
  );
}
```

#### 주요 변경점

1. **컴포넌트명**: `AsyncSelect` → `IdAsyncSelect<T>` (제네릭 추가)
2. **Props 이름**:
   - `listParams` → `baseListParams`
   - `textField` → `displayField`
   - `pageField` 삭제
3. **검색 로직**: 외부 상태관리 → 내부 처리 (useState, useCallback, onSearch 불필요)
4. **제네릭 타입**: PK 타입 명시 필요 (`<number>` 또는 `<string>`)

#### 수정이 필요한 파일들

```
src/components/
  ├── user/UserIdAsyncSelect.tsx
  ├── account/AccountIdAsyncSelect.tsx
  ├── announcement/AnnouncementIdAsyncSelect.tsx
  └── ... (모든 *IdAsyncSelect.tsx 파일)
```

#### 마이그레이션 체크리스트

- [ ] 컴포넌트 import 변경: `AsyncSelect` → `IdAsyncSelect`
- [ ] 제네릭 타입 파라미터 추가: `<number>` 또는 `<string>` (PK 타입에 따라)
- [ ] Props 타입 정의 업데이트:
  - [ ] `listParams` → `baseListParams`
  - [ ] `textField` → `displayField`
  - [ ] `pageField` 제거
- [ ] 수동 상태 관리 제거:
  - [ ] `useState`, `useCallback` 제거
  - [ ] `onSearch` 핸들러 제거
- [ ] JSX 내 props 이름 변경:
  - [ ] `listParams={...}` → `baseListParams={...}`
  - [ ] `textField={...}` → `displayField={...}`
  - [ ] `pageField` 제거
  - [ ] `onSearch` 제거

#### 왜 이런 일이 발생하나?

Sonamu의 scaffolding 생성 코드가 최신 패키지 API를 반영하지 못한 상태에서, 사용자가 로컬의 Sonamu 소스를 수정하면서 패키지는 업데이트되었지만 scaffolding 템플릿은 그대로인 상황에서 발생합니다.

**해결책**: 생성된 컴포넌트를 위 체크리스트에 따라 수동으로 수정하거나, Sonamu 코어의 scaffolding 템플릿을 최신 API로 업데이트해야 합니다.
