---
title: UpsertBuilder
description: UpsertBuilder의 사용법을 설명합니다.
---

Sonamu의 `UpsertBuilder`를 사용하면, 여러 테이블이 중첩된 복잡한 데이터를 한 번에 처리할 수 있습니다.

### UpsertBuilder 사용하기

`UpsertBuilder`는 `register` 메서드와 `upsert` 메서드를 통해 데이터를 생성하거나 수정합니다. 스캐폴딩된 모델 코드의 `save` 메서드는 `UpsertBuilder`를 사용하여 데이터를 저장합니다. 아래는 스캐폴딩된 모델 코드의 `save` 메서드 예시입니다.

```typescript
import { BaseModelClass, api } from "sonamu";
import { UserSaveParams } from "./user.types";

class UserModelClass extends BaseModelClass {
  @api({ httpMethod: "POST", guards: ["admin"] })
  async save(spa: UserSaveParams[]): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    // register
    spa.map((sp) => {
      ub.register("users", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await ub.upsert(trx, "users");

      return ids;
    });
  }
}
```

`register`는 데이터를 등록하고, `upsert`는 등록된 데이터를 저장합니다. 단일 테이블의 데이터만 저장하는 경우에는 장점을 잘 느낄 수 없습니다. 복잡한 데이터를 한 번에 처리하는 예시를 보겠습니다.

### 중첩된 데이터 저장하기

Many-to-Many 관계인 게시글-태그 데이터를 저장하는 예시입니다. 게시글과 태그는 각각 `posts`와 `tags` 테이블에 저장되며, 게시글과 태그의 관계는 `posts__tags` 조인 테이블에 저장됩니다. `posts__tags` 테이블은 게시글 ID와 태그 ID를 외래키로 가집니다.

```typescript
type PostSaveParams = {
  id?: number;
  title: string;
  content: string;
  tags?: string[];
};

@api({ httpMethod: "POST" })
async save(spa: PostSaveParams[]): Promise<number[]> {
  const wdb = this.getDB("w");
  const ub = this.getUpsertBuilder();

  // register
  spa.map(({ tags, ...sp }) => {
    const post_id = ub.register("posts", sp);

    // 입력된 태그 저장
    tags?.map((name) => {
      const tag_id = ub.register("tags", { name });
      ub.register("posts__tags", {
        post_id,
        tag_id,
      });
    });
  });

  // transaction
  return wdb.transaction(async (trx) => {
    const ids = await ub.upsert(trx, "posts");
    await ub.upsert(trx, "tags");
    await ub.upsert(trx, "posts__tags");

    return ids;
  });
}
```

이렇게 코드를 작성하면 게시글과 태그를 분리하여 처리할 필요 없이, `UpsertBuilder`를 사용하여 한 번에 처리할 수 있습니다. `register`는 상위 테이블 → 하위 테이블 순서로 호출해야 합니다. 그리고 `register`한 순서대로 `upsert` 메서드를 호출하여 데이터를 등록합니다.

`register`의 두 번째 인자에 unique 인덱스로 지정된 데이터가 없으면, `upsert` 메서드는 데이터를 생성하고, unique 인덱스가 있을 경우 해당 값을 가지는 데이터를 조회하여 존재하는 경우 해당 데이터를 갱신합니다. `upsert` 메서드는 실제 생성 혹은 갱신된 데이터의 ID를 반환합니다.

위 예시의 경우, `tag`의 `name`에 unique 제약이 걸려있다면 `tags` 테이블에 중복된 태그가 저장되지 않습니다.

게시글과 태그의 관계는 `posts__tags` 테이블에 저장되며, 기본적으로 `post_id`와 `tag_id`에 unique 제약이 걸려있지 않기 때문에 중복된 관계가 저장될 수 있습니다. 이 경우, `posts__tags` 테이블에 unique 제약을 걸어 중복된 관계가 저장되지 않도록 할 수 있습니다.

이 경우, Sonamu UI를 이용하여 `posts__tags` 테이블에 unique 제약을 걸 수 없기 때문에, **직접 엔티티 정의를 수정**합니다.

```json
  "indexes": [
    {
      "type": "unique",
      "columns": ["posts__tags.post_id", "posts__tags.tag_id"]
    }
  ],
```

수정된 내용을 Sonamu UI에서 확인하기 위해 UI 서버를 재시작합니다.

![Many to Many Unique](./image/upsert-builder/many-to-many-unique.png)

`posts__tags` 테이블에 unique 제약이 걸려있는 것을 확인할 수 있습니다. 이제 `posts__tags` 테이블에 중복된 관계가 저장되지 않습니다.

:::caution
위 예시에서 태그의 `name`에 unique 제약이 설정되지 않은 경우, 동일한 태그가 계속 새로 생성되고, 그에 따라서 `posts__tags.tag_id`가 변경되기 때문에 관계 데이터도 계속 새로 생성됩니다. 따라서, `name`에 unique 제약을 걸어 동일한 태그가 중복 생성되지 않도록 해야 합니다.
:::

### `upsert` 결과 이용하여 추가 작업 수행하기

`upsert` 메서드는 실제 생성 혹은 갱신된 데이터의 ID를 반환합니다. 이를 이용하여 추가 작업을 수행할 수 있습니다. 위의 게시글-태그 관계에서 `upsert`된 태그 외의 태그는 삭제하는 작업을 추가하겠습니다.

```typescript
@api({ httpMethod: "POST" })
async save(spa: PostSaveParams[]): Promise<number[]> {
  ...

  // transaction
  return wdb.transaction(async (trx) => {
    const ids = await ub.upsert(trx, "posts");
    await ub.upsert(trx, "tags");
    const savedTagIds = await ub.upsert(trx, "posts__tags");
    if (savedTagIds.length > 0) {
      await trx("posts__tags")
        .whereIn("post_id", ids)
        .whereNotIn("id", savedTagIds)
        .delete();
    }

    return ids;
  });
}
```

`upsert`된 태그의 ID를 `savedTagIds`에 저장하고, `post_id`가 `ids`에 속하면서 `id`가 `savedTagIds`에 속하지 않는 데이터를 삭제합니다.

### updateBatch로 데이터 갱신하기

`UpsertBuilder`의 `register`와 `updateBatch`를 이용하면 케이스별로 다른 값을 가지는 데이터를 한 번에 갱신할 수 있습니다. Sonamu 내부적으로 `CASE WHEN`을 이용하는 SQL을 이용합니다.

아래 예시는 게시글의 작성자를 변경하는 작업입니다.

```typescript
const data = [
  {
    post_ids: [1, 2, 3],
    author_id: 1,
  },
  {
    post_ids: [4, 5, 6],
    author_id: 2,
  },
];

const wdb = this.getDB("w");
const ub = this.getUpsertBuilder();

data.map(({ post_ids, author_id }) => {
  post_ids.map((id) => {
    ub.register("posts", {
      id,
      author_id,
    });
  });
});

await ub.updateBatch(wdb, "posts");
```
