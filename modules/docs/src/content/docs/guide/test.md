---
title: 테스트
description: 테스트 가이드 문서
---

Sonamu는 모델별로 단위 테스트를 수행하는 것을 권장합니다. 테스트는 `vitest`를 사용하여 작성합니다.

## 테스트 환경 구성

테스트 환경 구성을 위해 `bootstrap` 함수를 작성합니다. `bootstrap` 함수는 테스트 시작 전에 데이터베이스 연결을 초기화합니다. `beforeAll`에서는 Sonamu 설정과 데이터베이스 연결을 초기화하고, `beforeEach`에서는 테스트 데이터를 초기화합니다.

```typescript
// bootstrap.ts
require("dotenv").config();
import { FixtureManager, Sonamu } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

export function bootstrap(tableNames?: string[]) {
  beforeAll(async () => {
    await Sonamu.init(true);
    FixtureManager.init();
  });
  beforeEach(async () => {
    await FixtureManager.cleanAndSeed(tableNames);
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });
}
```

테스트 종료 후 모든 데이터베이스 연결을 종료하기 위해 `teardown`에서 `FixtureManager.destory`를 호출합니다.

```typescript
// global.ts
import { FixtureManager } from "sonamu";

export async function setup() {
  return async function teardown() {
    await FixtureManager.destory();
  };
}
```

## Fixture

### Fixture 입력

테스트에서 사용할 데이터인 `Fixture`를 `fixture_remote` 데이터베이스에 입력합니다. 입력한 데이터는 `yarn sonamu fixture sync` 명령어를 이용하여 `fixture_local` 데이터베이스로 동기화합니다. `fixture_local` 데이터베이스는 각 테스트 시작 전에 `test` 데이터베이스를 초기화할 때 사용합니다.

### Fixture 작성

입력한 `Fixture`를 사용하기 위해서는 `fixture.ts` 파일의 `fixtureLoader`에 등록합니다.

```typescript
const fixtureLoader = {
  test: () => TestModel.findById("A", 1),
};

export async function loadFixtures<K extends keyof typeof fixtureLoader>(
  names: K[]
): Promise<{
  [P in K]: Awaited<ReturnType<(typeof fixtureLoader)[P]>>;
}> {
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => {
        return [name, await fixtureLoader[name]()];
      })
    )
  );
}
```

Context에서 인증 관련 정보를 사용하려면 아래 코드를 `fixture.ts`에 추가합니다.

```typescript
// fixture.ts
const fixtureLoader = {
  ctxUser: () => loginContext(1),
};

export async function loadFixtures<K extends keyof typeof fixtureLoader>(
  names: K[]
): Promise<{
  [P in K]: Awaited<ReturnType<(typeof fixtureLoader)[P]>>;
}> {
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => {
        return [name, await fixtureLoader[name]()];
      })
    )
  );
}

export async function loginContext(userId: number): Promise<Context> {
  const { UserModel } = await import(
    "../application/user/user.model?ver=2" as string
  );

  return {
    passport: {
      login: vi.fn().mockImplementation((_user: UserSubsetSS) => {}),
      logout: vi.fn().mockImplementation(() => {}),
    },
    user: await UserModel.findById("SS", userId),
  } as unknown as Context;
}
```

## 테스트 작성

다음과 같은 게시글 작성 API가 있다고 가정합니다. 해당 API를 위한 테스트를 작성해봅시다.

```typescript
@api({ httpMethod: "POST" })
async saveMine(smp: PostSaveMineParams, { user }: Context): Promise<number> {
  if (!user) {
    throw new UnauthorizedException("로그인이 필요합니다.");
  }

  const sp: PostSaveParams = {
    ...smp,
    author_id: user.id,
  };

  const [id] = await this.save([sp]);

  return id;
}
```

테스트에서 픽스쳐를 사용하기 위해서는 `bootstrap` 함수에 테이블명을 전달해야 합니다. 위에서 미리 입력한 유저 픽스쳐를 사용하기 위해 `users`를 인자로 전달합니다. 테스트 코드는 다음과 같습니다.

```typescript
// post.model.test.ts
import { describe, expect, test } from "vitest";
import { bootstrap } from "../../testing/bootstrap";
import { PostSaveMineParams } from "./post.types";
import { PostModel } from "./post.model";
import { loadFixtures } from "../../testing/fixture";

bootstrap(["users"]);
describe("PostModelTest", () => {
  test("게시글 작성", async () => {
    // setup: 게시글 작성 파라미터
    const { ctxUser } = await loadFixtures(["ctxUser"]);
    const sp: PostSaveMineParams = {
      title: "제목",
      content: "내용",
    };

    // 게시글 작성
    const id = await PostModel.saveMine(sp, ctxUser);

    // check: 게시글이 생성되었는지 확인
    const post = await PostModel.findById("A", id);
    expect(post.title).toBe(sp.title);
    expect(post.content).toBe(sp.content);
    expect(ctxUser.user).not.toBeNull();
    expect(post.author_id).toBe(ctxUser.user!.id);
  });
});
```

`yarn test` 명령어를 실행하여 테스트가 성공적으로 수행되는지 확인합니다.
