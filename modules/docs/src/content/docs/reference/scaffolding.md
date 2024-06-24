---
title: 스캐폴딩
description: 스캐폴딩 레퍼런스 문서
tableOfContents:
  maxHeadingLevel: 4
---

Sonamu는 엔티티, Enum 정의를 이용하여 모델, 테스트, 뷰 컴포넌트를 생성할 수 있습니다.

### 엔티티 스캐폴딩

엔티티 정의를 사용하여 모델, 모델의 단위테스트, 뷰 컴포넌트를 생성합니다.

#### 모델

> 컨벤션 파일 경로: `/api/src/application/${entityId}/${entityId}.model.ts`

모델의 기본 CRUD 로직을 생성합니다.

- **`findById`**
  - ID를 사용하여 데이터를 조회합니다.
- **`findOne`**
  - `${entityId}ListParams`를 사용하여 데이터를 하나만 조회합니다.
- **`findMany`**
  - `${entityId}ListParams`를 사용하여 데이터를 조회합니다.
  - 페이지네이션의 기본값은 `{ num: 24, page: 1 }` 입니다.
  - 검색의 기본값은 `${entityId}SearchField` 스키마의 첫 번째 값을 사용합니다.
  - 정렬의 기본값은 `${entityId}OrderBy` 스키마의 첫 번째 값을 사용합니다.
- **`save`**
  - `${entityId}SaveParams`를 사용하여 데이터를 저장합니다.
  - Create/Update 로직은 Sonamu의 `UpsertBuilder`를 사용하여 해당 메소드로 한 번에 처리합니다.
- **`del`**
  - 데이터의 ID를 입력받아 삭제를 수행합니다.

#### 테스트

> 컨벤션 파일 경로: `/api/src/application/${entityId}/${entityId}.model.test.ts`

아래의 형식으로 코드를 생성합니다. Sonamu의 테스트 작성 방법에 대한 내용은 [테스트](/guide/test) 문서를 참고해주세요.

```ts
import { describe, test, expect } from "vitest";
import { bootstrap } from "../../testing/bootstrap";

bootstrap([]);
describe.skip("${entityId}ModelTest", () => {
  test("Query", async () => {
    expect(true).toBe(true);
  });
});
```

#### 뷰

일반적으로 뷰 컴포넌트는 백오피스의 클라이언트 코드 작성을 위해 사용합니다. React와 Semantic UI를 사용하여 컴포넌트를 생성합니다.

> 컨벤션 파일 경로
>
> - 페이지: `/web/src/pages/admin/${entityId.plural}/`
> - 컴포넌트: `/web/src/components/${entityId}/`

##### `view_list`

> 컨벤션 파일 경로: `/web/src/pages/admin/${entityId.plural}/index.tsx`

백오피스의 기본이 되는 테이블뷰 페이지를 생성합니다. 해당 엔티티 데이터를 리스트 형태로 확인할 수 있습니다. 검색/정렬을 위한 컴포넌트를 추가로 생성합니다.

- `SearchFieldDropdown`: `${entityId}SearchField`를 기반으로 하는 검색 필터 컴포넌트입니다.
- `OrderBySelect`: `${entityId}OrderBy`를 기반으로 하는 정렬 컴포넌트입니다.
- `SearchInput`: `SearchFieldDropdown`을 기반으로 하는 검색 입력 컴포넌트입니다.

##### `view_search_input`

> 컨벤션 파일 경로: `/web/src/components/${entityId}/${entityId}SearchInput.tsx`

사용자가 입력한 검색어를 사용하여 검색을 수행하는 컴포넌트를 생성합니다. 해당 컴포넌트는 검색 필드를 선택할 수 있는 드롭다운인 `SearchFieldDropdown`과 검색어를 입력할 수 있는 인풋을 제공합니다.

##### `view_form`

> 컨벤션 파일 경로: `/web/src/pages/admin/${entityId.plural}/form.tsx`

엔티티 데이터를 생성/수정할 수 있는 폼 컴포넌트를 생성합니다. 해당 컴포넌트는 `useTypeForm`을 사용하여 폼 데이터를 관리합니다. `useTypeForm`은 Sonamu의 타입을 기반으로 폼 데이터를 생성하고 관리하도록 도와줍니다.

##### `view_id_async_select`

> 컨벤션 파일 경로: `/web/src/components/${entityId}/${entityId}IdAsyncSelect.tsx`

엔티티 ID를 선택할 수 있는 드롭다운 컴포넌트입니다. 해당 컴포넌트는 데이터 목록을 비동기적으로 가져와 드롭다운 옵션으로 표시합니다.

- `subset`을 사용하여 특정 서브셋의 데이터만 조회할 수 있습니다.
- `baseListParams`를 사용하여 추가적인 검색/정렬 옵션을 설정할 수 있습니다.
- `textField`와 `valueField`를 사용하여 표시할 텍스트와 값을 설정할 수 있습니다.

<br/>

---

### Enum 스캐폴딩

Enum 정의를 사용하여 뷰 컴포넌트를 생성합니다.

-> 커스터마이징 가능하도록 해야 함

##### `view_enum_select`

> 컨벤션 파일 경로: `/web/src/components/${entityId}/${enumId}Select.tsx`

Enum 데이터를 선택할 수 있는 드롭다운 컴포넌트를 생성합니다. 해당 컴포넌트는 Enum 데이터를 기반으로 옵션을 생성합니다. `placeholder`와 `textPrefix`를 사용하여 드롭다운의 기본값을 설정할 수 있습니다.

##### `view_enum_dropdown`

> 컨벤션 파일 경로: `/web/src/components/${entityId}/${enumId}Dropdown.tsx`

Enum 데이터를 표시할 수 있는 드롭다운 컴포넌트를 생성합니다. 해당 컴포넌트는 Enum 데이터를 기반으로 옵션을 생성합니다.
