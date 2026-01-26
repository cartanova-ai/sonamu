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

## 흔한 오류

| 오류 | 원인 | 해결 |
|------|------|------|
| "존재하지 않는 모듈 패스 요청 {Type}" | types.ts 미생성 또는 미컴파일 | 대기/수동생성 → build → dev 재시작 |
| exhaustive() 타입 에러 | OrderBy 첫 번째 값만 자동 처리 | Model에서 나머지 case 추가 |
| i18n 키 없음 (relation) | `author_id` vs `author` | `entity.{E}.{relation}` 사용 (`_id` 제외) |

## 상세 설명

### "존재하지 않는 모듈 패스 요청" 오류

Scaffolding은 `dist/application/{entity}/{entity}.types.js`에서 export된 타입을 읽어 모듈 경로를 등록합니다.

```
entity.ts:779-787
const typesFilePath = path.join(
  Sonamu.apiRootPath,
  runtimePath(`dist/application/${typesModulePath}.js`),
);
if (await exists(typesFilePath)) {
  // 타입 등록
}
```

### types.ts 자동 생성 메커니즘

Entity 생성 시 syncer의 `handleEntityChange`가 자동으로 `init_types` 템플릿을 실행합니다:

```typescript
// syncer.ts L306-320
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
