---
title: 모델
description: 모델 레퍼런스 문서
tableOfContents:
  maxHeadingLevel: 4
---

Sonamu의 모델은 MVC 패턴의 M(Model)과 C(Controller)를 담당하고, **엔티티와 관련된 모든 로직**을 처리합니다. [`@api`](/reference/api-decorator) 데코레이터가 지정된 모델 메소드는 API로 노출됩니다.

> 컨벤션 파일 경로: `/api/src/application/${entityId}/${entityId}.model.ts`

<br/>

---

#### 모델 기본 구조

기본 생성된 모델 파일은 CRUD 로직을 갖추고 있으며, 다음과 같은 메소드를 제공합니다.

- **`findById`**: ID를 사용하여 데이터를 조회합니다.
- **`findOne`**: `${entityId}ListParams`를 사용하여 데이터를 하나만 조회합니다.
- **`findMany`**: `${entityId}ListParams`를 사용하여 데이터를 조회합니다.
- **`save`**: `${entityId}SaveParams`를 사용하여 데이터를 저장합니다.
- **`del`**: 데이터의 ID를 입력받아 삭제를 수행합니다.

##### ListParams

기본 `ListParams`는 다음과 같습니다.

```ts
type BaseListParams = {
  id?: number | number[];
  num?: number;
  page?: number;
  keyword?: string;
  queryMode?: "list" | "count" | "both";
};
```

###### `id`

`id`는 데이터를 ID로 조회할 때 사용합니다. 사용하기 위해서는 `runSubsetQuery`의 `build` 콜백에서 `id`를 사용하여 데이터를 조회하는 쿼리를 작성해야 합니다.

###### `queryMode`

`queryMode`를 `list`로 설정하면 데이터를 조회하고, `count`로 설정하면 데이터의 개수를 조회합니다. `both`로 설정하면 데이터와 데이터의 개수를 모두 조회합니다. `queryMode`가 설정되지 않을 경우, `id`의 유무에 따라 `list` 혹은 `both`로 설정됩니다.

###### `num`, `page`

`num`과 `page`는 페이지네이션을 위한 파라미터로, `num`은 한 페이지에 보여질 데이터의 개수를, `page`는 조회할 페이지를 의미합니다. `num`을 0으로 설정하면 페이지네이션을 사용하지 않습니다.

###### `keyword`

`keyword`는 검색을 위한 파라미터로, 해당 키워드를 포함하는 데이터를 조회합니다. 사용하기 위해서는 `keyword`를 사용해 조회할 컬럼을 `SearchField` 타입에 추가하고, `runSubsetQuery`의 `build` 콜백에서 `keyword`를 사용하여 데이터를 조회하는 쿼리를 작성해야 합니다.

##### `SaveParams`

기본 `SaveParams`는 엔티티 정의를 기반으로 생성됩니다. `id` 필드가 포함될 경우 해당 데이터를 수정하고, 없을 경우 새로운 데이터를 생성합니다.

```ts
import { ${entityId}BaseSchema } from "../sonamu.generated";

export const ${entityId}SaveParams = ${entityId}BaseSchema.partial({
  id: true
});
```

<br/>

---

#### runSubsetQuery

해당 메소드는 서브셋을 이용하여 쿼리를 실행합니다. 정의한 서브셋으로 해당 모델의 데이터가 쿼리되는 것을 보증하기 위해, 모든 모델의 Read 메소드는 `runSubsetQuery` 메소드를 통해 쿼리를 호출합니다.
`findById`와 `findOne`은 내부적으로 `findMany`를 호출하며, `findMany`는 `runSubsetQuery`를 통해 쿼리를 호출합니다.

`runSubsetQuery` 메소드는 아래와 같은 형태로 구성됩니다.

```ts
type runSubsetQuery<T extends BaseListParams, U extends string> = (params: {
  subset: U;
  params: T;
  subsetQuery: SubsetQuery;
  build: build;
  baseTable?: string;
  debug?: boolean | "list" | "count";
  db?: Knex;
}) => Promise<{
  rows: any[];
  total?: number | undefined;
  subsetQuery: SubsetQuery;
  qb: Knex.QueryBuilder;
}>;
```

##### `subset`

`subset`은 서브셋 이름을 의미합니다. `runSubsetQuery` 내부적으로 `A`로 시작하는 서브셋일 경우 쓰기DB(db config에서 master DB)로 조회하고, 나머지의 경우는 읽기DB(db config에서 slave DB)로 조회합니다. Sonamu에서는 컨벤션으로 어드민에서 사용할 서브셋은 `A`(A - Admin, All)로, 프론트에서 사용할 서브셋은 `P`(P - Public)로 지정합니다.

##### `build`

`runSubsetQuery`는 파라미터에 따라 다른 쿼리를 빌드할 수 있도록 `build` 콜백이 제공되며, 이 안에서 `ListParams`에 따라 다른 데이터를 리턴하도록 쿼리를 빌드하는 방식입니다.

`runSubsetQuery`의 프로퍼티 중 하나인 `build` 콜백은 다음과 같은 형태로 구성됩니다.

```ts
type build = (buildParams: {
  qb: Knex.QueryBuilder;
  db: Knex;
  select: (string | Knex.Raw)[];
  joins: SubsetQuery["joins"];
  virtual: string[];
}) => Knex.QueryBuilder;
```

- `qb`: Knex의 QueryBuilder 객체
- `db`: Knex 객체
- `select`: 서브셋 외에 조회할 컬럼 추가 시 사용
- `joins`: 서브셋을 조회하기 위해 조인할 테이블 배열
- `virtual`: 해당 엔티티의 virtual 컬럼 조회 쿼리 조작 시 사용

##### `baseTable`

서브셋 쿼리를 실행할 기본 테이블입니다. 생략할 경우 현재 메소드가 위치한 모델의 테이블을 기본 테이블로 사용합니다. 거의 사용 안함.

<br/>

---

#### UpsertBuilder

Sonamu는 여러 테이블이 중첩된 데이터를 동시에 등록할 수 있도록 `UpsertBuilder`를 제공합니다. 내부적으로 unique 컬럼을 사용하기 때문에, Sonamu의 모든 테이블은 `uuid` 컬럼을 가지고 있습니다.

예를 들어, 게시글-태그 관계에서는 게시글을 등록할 때 태그 ID가 필요하기 때문에 게시글과 태그를 동시에 등록할 수 없습니다. 이때 `UpsertBuilder`를 사용하면 태그를 먼저 등록하고 게시글을 등록해야 하는 문제를 해결할 수 있습니다.

`UpsertBuilder`는 상위 테이블 → 하위 테이블 순서로 `register` 메소드를 호출하고, 마지막에 `register`한 순서대로 `upsert` 메소드를 호출하여 데이터를 등록합니다.

`register` 메소드는 `UBRef`를 반환하며, 이를 사용하여 상위 테이블의 ID(정확히는 `UBRef.use`)를 하위 테이블에 주입할 수 있습니다.

```ts
type UBRef = {
  /* 상위 테이블의 ID 대신 들어가는 임시값 */
  uuid: string;
  /* 테이블명 */
  of: string;
  /* 치환할 컬럼. default: id */
  use?: string;
};
```

`upsert` 메소드는 실제 생성 혹은 갱신된 데이터의 ID를 반환합니다.

<br/>

---

#### Context

`@api` 데코레이터가 지정된 모든 모델 메소드는 `Context` 객체를 파라미터로 전달 받을 수 있습니다.

`Context` 파라미터의 위치는 상관없으나, 보통 가장 마지막 매개변수로 사용합니다. `Context` 파라미터는 클라이언트 서비스 코드를 생성할 때, 자동으로 매개변수에서 제외됩니다. 이 안에는 세션/인증 처리를 위한 [`@fastify/secure-session`](https://www.npmjs.com/package/@fastify/secure-session) 객체와 [`fastify-passport`](https://www.npmjs.com/package/fastify-passport) 객체가 바인딩되어 있으므로, 별도의 처리가 필요한 경우 활용할 수 있습니다.
