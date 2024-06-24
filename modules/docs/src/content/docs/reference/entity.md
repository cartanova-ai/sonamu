---
title: 엔티티
description: 엔티티 레퍼런스 문서
tableOfContents:
  minHeadingLevel: 3
  maxHeadingLevel: 4
---

엔티티는 **모델의 구성요소**를 정의합니다. 관계형 데이터베이스의 테이블과 매칭되는 개념으로, ORM의 엔티티 정의와 유사하지만 Sonamu의 고유한 기능 제공을 위해 추가된 부분이 존재합니다.

> 컨벤션 파일 경로: `/api/src/application/${entityId}/${entityId}.entity.json`

:::note
Sonamu에서는 `id`와 `uuid` 컬럼이 엔티티마다 필수로 생성됩니다. `uuid` 컬럼은 엔티티 파일에 표시되지 않으며, 해당 컬럼을 사용하는 이유는 [모델 - UpsertBuilder](/reference/model#upsertbuilder) 문서를 참고하세요.
:::

<br/>

---

### 파일 구조

| 필드       | 설명                                                    |
| ---------- | ------------------------------------------------------- |
| `id`       | 엔티티 고유 아이디                                      |
| `parentId` | 대상 엔티티에 완전히 종속되는 경우 지정                 |
| `title`    | 엔티티 이름으로, 스캐폴딩 시 사용                       |
| `table`    | 데이터베이스 테이블명                                   |
| `props`    | 컬럼 정의                                               |
| `indexes`  | 인덱스 정의                                             |
| `subsets`  | 서브셋 쿼리 동작 시 해당 정의를 참조하여 기본 쿼리 빌딩 |
| `enums`    | `Zod enum(string uninon)`으로, 스캐폴딩 시 사용         |

<br/>

---

### parentId

해당 엔티티가 다른 엔티티에 완전히 종속되는 경우 지정합니다.

`parentId`가 지정된 경우 일반 엔티티와 다르게 엔티티ID로 된 디렉터리가 생성되지 않고, `parentId`로 지정된 엔티티의 디렉터리 내에 생성됩니다.

> 컨벤션 파일 경로: `/api/src/application/${parentEntityId}/${entityId}.entity.json`

부모 엔티티에 종속된 엔티티는 `BelongsToOne` 관계로 설정된 `relation` 컬럼이 자동으로 생성되고, 기본 `subsets`, `indexes`, `enums`는 생성되지 않습니다.

### props

각 필드를 정의하는 방법은 [엔티티 - 필드 정의](/guide/entity#필드-정의) 문서를 참고하세요.

#### virtual

실제 DB 테이블의 컬럼으로 생성하지 않고, 쿼리 결과로 조회만 하고 싶은 경우에 사용합니다. 서버의 타입에만 적용되므로, 서브셋 쿼리 결과에 포함시키는 작업을 추가로 수행해야 합니다.

#### enum

`enum` 컬럼을 생성하려면 `Enum ID`를 명시해야 합니다. `Enum ID`는 전체 `.types.ts` 파일 기준으로 현재 생성되어 있는 Enum의 키값을 나타냅니다. 필요한 Enum이 없을 경우, Sonamu UI를 사용하여 필요한 Enum을 추가하여 사용합니다.

:::note
Sonamu의 enums는 DB 혹은 TypeScript의 네이티브 enum을 사용하지 않습니다. 대신, `Zod.enum`을 사용하여 Enum을 정의하고, TypeScript에서 사용할 수 있도록 타입을 생성합니다.
:::

#### json

`json` 컬럼을 생성하려면 `CustomType ID`를 명시해야 합니다. `CustomType ID`는 전체 `.types.ts` 파일 기준으로 현재 생성되어 있는 타입의 이름을 나타냅니다. 필요한 타입이 없을 경우에는 타입 파일 내에 필요한 타입 정의를 직접 추가하여 사용합니다.

#### relation

`relation` 컬럼의 Name은 쿼리에서 alias로 사용됩니다. `relation` 컬럼을 생성하려면 `Relation Type`을 명시해야 합니다. Sonamu는 다음과 같은 `Relation Type`을 지원합니다.

- `OneToOne`
- `BelongsToOne`
- `HasMany`
- `ManyToMany`

Sonamu는 `Relation Type`을 사용하여 다른 엔티티와의 관계를 정의하고, 관계의 종류에 따라 속성을 추가로 설정할 수 있습니다. 해당 엔티티의 서브셋에 relation 컬럼이 포함되어 있는 경우, `relation` 컬럼의 설정에 따라 자동으로 조인을 수행합니다.

##### OneToOne

현재 엔티티가 다른 엔티티와 1:1 관계를 가질 때 사용합니다. 조인컬럼이 없거나 nullable인 경우 outer 조인, 아니면 inner 조인을 수행합니다.

- **`With`**: 관계 대상 엔티티 ID
- **`HasJoinColumn`**: 해당 엔티티에 조인컬럼 생성 여부
  - `true`: 외래키 제약 조건을 가지는 `${withEntityId}_id` 컬럼이 생성되고, `OnUpdate/OnDelete` 옵션 설정이 가능합니다.
    - `OnUpdate/OnDelete`: 외래키 갱신/삭제 시 동작
  - `false`: 컬럼을 생성하지 않고 서브셋으로 조회하기 위해 설정합니다. 대신, 관계 대상 엔티티에 `${entityId}_id` 컬럼이 존재해야 합니다.

##### BelongsToOne

현재 엔티티가 다른 엔티티에 속할 때 사용합니다. `${withEntityId}_id` 컬럼이 생성되며, 외래키 제약 조건을 가집니다. nullable인 경우 outer 조인, 아니면 inner 조인을 수행합니다.

- **`With`**: 관계 대상 엔티티 ID
- **`OnUpdate/OnDelete`**: 외래키 갱신/삭제 시 동작
- **`Custom JoinClause`**(optional): 사용자 정의 조인 절
  - 생략할 경우, `${withEntityId}_id`와 대상 엔티티의 `id` 컬럼을 사용하여 조인합니다.
  - raw SQL을 사용하여 조인 절을 직접 작성할 수 있습니다.
  - 조인 테이블의 이름은 Name에 기재한 값(alias)으로 사용하고, 현재 테이블은 기존 테이블명을 사용합니다.

##### HasMany

현재 엔티티가 다른 엔티티와 1:N 관계를 가질 때 사용합니다. 대상 엔티티에 `BelongsToOne`으로 설정된 `relation` 컬럼이 있어야 합니다. (혹은 조인컬럼이 존재해야 합니다.)

- **`With`**: 관계 대상 엔티티 ID
- **`JoinColumn`**: 관계 대상 엔티티의 조인컬럼
- **`FromColumn`**(optional): 현재 엔티티의 조인컬럼
  - 생략할 경우, `id` 컬럼을 사용합니다.

DataLoader 패턴을 적용하여 N+1 문제를 해결합니다. `HasMany` 관계 호출 시 다음과 같이 쿼리가 생성됩니다.

```sql
select * from `withTable` where `withTable`.`JoinColumn` in (FromColumn);
```

##### ManyToMany

두 엔티티가 N:M 관계를 가질 때 사용합니다. `ManyToMany`는 중간 테이블을 생성합니다.

- **`With`**: 관계 대상 엔티티 ID
- **`JoinTable`**: 관계 대상 엔티티의 조인 테이블
  - 두 테이블의 이름을 `__`로 연결합니다.
  - `${tableName}__${withTableName}`으로 생성합니다.
  - 생성된 테이블에는 `id`, `${entityId}_id`, `${withEntityId}_id` 컬럼이 생성됩니다.
    - 각각의 컬럼은 외래키 제약 조건을 가집니다.
- **`OnUpdate/OnDelete`**: 외래키 갱신/삭제 시 동작

`ManyToMany` 관계에서도 DataLoader 패턴을 적용하여 N+1 문제를 해결합니다. `ManyToMany` 관계 호출 시 다음과 같이 쿼리가 생성됩니다.

```sql
select * from `withTable` where `withTable`.`JoinColumn` in (select `JoinColumn` from `JoinTable` where `entityId` = FromColumn);
```

<br/>

---

### subsets

서브셋은 특정 모델의 데이터 중 실제로 사용할 필드들의 모음입니다. Sonamu UI를 통해 필요한 필드만 선택하여 서브셋을 구성할 수 있습니다.

:::note
GraphQL에서는 프론트엔드에서 `서브셋을 쿼리`하는 개념이지만, Sonamu는 서브셋을 백엔드에서 사전에 `선언`하여 백엔드/프론트엔드 양쪽에서 사용하는 개념입니다.
:::

서브셋 구성 시 다음과 같은 규칙이 적용됩니다.

- `virtual` 컬럼
  - 해당 테이블의 `virtual` 컬럼만 조회할 수 있습니다.
  - 하위 객체(조인 테이블)의 `virtual` 컬럼은 조회할 수 없습니다.
- `relation` 컬럼
  - 서브셋에서 하위 객체의 id만 선택하는 경우 `<하위객체이름>_id`로 포함됩니다.
    - 하위 객체와의 관계가 `OneToOne` 또는 `BelongsToOne`인 경우만 해당합니다.
  - 하위 객체의 id 외에 다른 필드를 추가하는 경우, `relation` 컬럼명의 객체로 포함됩니다.
- 서브셋 이름에 따른 DB 사용
  - 서브셋 조회 쿼리는 기본적으로 읽기 전용 DB(slave)에서 실행되지만, 서브셋 이름이 `A`로 시작할 경우 쓰기 전용 DB(master)에서 조회합니다.
  - [모델 - runSubsetQuery](/reference/model#runsubsetquery) 문서를 참고하세요.

<br/>

---

### enums

Sonamu 프레임워크 내에서 사용하는 열거형 타입들의 정의가 위치합니다. 여기서 정의된 Enum은 프론트엔드와 백엔드 양쪽에서 사용할 수 있습니다.

아래의 두 가지 Enum은 엔티티 생성 시 자동으로 생성됩니다.

- `${entityId}OrderBy`: 쿼리 결과 정렬 시 기준이 되는 값
- `${entityId}SearchField`: 쿼리 LIKE 검색 시 기준이 되는 값
