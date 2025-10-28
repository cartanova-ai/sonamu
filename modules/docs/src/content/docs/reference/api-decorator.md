---
title: API 데코레이터
description: API 데코레이터 레퍼런스 문서
tableOfContents:
  maxHeadingLevel: 4
---

Sonamu는 모델 메서드에 사용할 수 있는 여러 데코레이터를 제공합니다. 이 문서에서는 주요 데코레이터들의 사용법을 설명합니다.

---

## @api 데코레이터

모델 메서드에 `@api` 데코레이터를 지정할 수 있습니다. `@api` 데코레이터가 지정된 메서드는 **API 엔드포인트**로 생성되고, 아래의 추가 작업이 실행됩니다.

- 프론트엔드 서비스 코드 생성
  - `{모델명}.service.ts`
- REST Client HTTP 요청 코드 생성
  - `sonamu.generated.http`

### 데코레이터 옵션

```ts
type ApiDecoratorOptions = {
  httpMethod?: HTTPMethods;
  contentType?:
    | "text/plain"
    | "text/html"
    | "text/xml"
    | "application/json"
    | "application/octet-stream";
  clients?: ServiceClient[];
  path?: string;
  resourceName?: string;
  guards?: string[];
  description?: string;
};
type ServiceClient =
  | "axios"
  | "axios-multipart"
  | "swr"
  | "window-fetch";
```

##### `httpMethod`

해당 API가 사용할 HTTP Method를 지정합니다. Sonamu에서는 `GET` 또는 `POST`만 인식합니다.
- 서버에서 요청 데이터를 파싱할 때 사용(`GET`이면 querystring, `POST`면 body)
- 프론트엔드 서비스 코드 혹은 REST Client HTTP 요청 코드 스캐폴딩 시 사용

##### `contentType`

응답 데이터 형식을 지정합니다.

- 기본값은 `application/json`입니다.

##### `clients`

서비스 코드를 생성해야 하는 클라이언트의 종류를 지정합니다.

- `axios`: Axios로 구현된 일반적인 HTTP Fetching 클라이언트 코드가 생성됩니다.
- `axios-multipart`: Axios로 구현된 파일 업로드 클라이언트 코드가 생성됩니다.
- `swr`: SWR로 구현된 React Hooks 클라이언트 코드가 생성됩니다.

##### `path`

API 엔드포인트를 임의로 지정할 수 있습니다.

- 기본값은 Sonamu 설정 파일의 `route.prefix` + `/${modelName}/${methodName}`입니다.

##### `resourceName`

프론트엔드 서비스 코드 생성 시 기본 네이밍 규칙 대신 해당 값을 사용합니다.

| 클라이언트        | 동작                                 | 네이밍                                       |
| ----------------- | ------------------------------------ | -------------------------------------------- |
| `axios`           | `GET`이 아닌 경우 모두 `POST`로 생성 | `methodName` 혹은 `get${resourceName}`       |
| `axios-multipart` | `POST`로 고정                        | `methodName`으로 고정                        |
| `swr`             |                                      | `use${resourceName}` 혹은 `use${methodName}` |
| `window-fetch`    |                                      | `methodName`으로 고정                        |

- e.g.) `resourceName`이 `Product`로 지정된 경우 아래와 같은 메서드명이 생성됩니다.
  - axios: `getProduct`
  - swr: `useProduct`

##### `guards`

접근 제어가 필요한 경우 가드를 사용할 수 있습니다.

- `Sonamu.withFastify`의 `guardHandler`를 통해 해당 옵션으로 지정된 가드에 대한 접근제어를 수행할 수 있습니다.
- `guardHandler`는 나열된 가드별로 수행되기 때문에, 모든 가드를 충족하는 경우에만 요청을 수행할 수 있습니다.
  - `guards: ["admin", "normal"]`으로 지정하는 경우, 두 권한 모두 충족해야 요청 수행 가능

##### `description`

해당 API에 대한 설명으로, 문서화 작업 시 사용됩니다.

### 사용 예시

:::caution
Sonamu는 TypeScript의 소스파일을 분석하여 얻은 **AST**(Abstract Syntax Tree)를 사용하여 메서드의 파라미터와 반환값의 타입을 획득합니다. 따라서, 메서드의 **파라미터와 반환값의 타입을 정확하게 작성**해야 합니다. 또한, 메서드 파라미터에 기본값이 있는 경우, AST 분석에 실패하여 오류를 출력할 수 있습니다.
:::

```typescript
import { api, BaseModelClass } from "sonamu";
import { UserSaveParams } from "./user.types";

class UserModelClass extends BaseModelClass {
  
  @api({ httpMethod: "GET" })
  async test(): Promise<string> {
    return "test";
  }
}
```

<br/>

---

## @transactional 데코레이터

`@transactional` 데코레이터는 메서드 실행을 자동으로 데이터베이스 트랜잭션으로 감싸는 기능을 제공합니다. 이를 통해 명시적인 트랜잭션 관리 코드를 줄이고, 코드의 가독성을 높일 수 있습니다.

### 데코레이터 옵션

```ts
type TransactionalOptions = {
  isolation?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  dbPreset?: 'w' | 'r';
};
```

##### `isolation`

트랜잭션 격리 수준(Isolation Level)을 지정합니다.

- `READ_UNCOMMITTED`: 커밋되지 않은 데이터를 읽을 수 있음
- `READ_COMMITTED`: 커밋된 데이터만 읽을 수 있음
- `REPEATABLE_READ`: 트랜잭션 내에서 같은 쿼리는 항상 같은 결과를 반환 (MySQL 기본값)
- `SERIALIZABLE`: 가장 엄격한 격리 수준, 완전히 직렬화된 실행

##### `dbPreset`

사용할 데이터베이스 프리셋을 지정합니다.

- `w`: 쓰기 데이터베이스(master) - 기본값
- `r`: 읽기 데이터베이스(slave)

### 사용 예시

```typescript
import { api, transactional, BaseModelClass } from "sonamu";
import { UserSaveParams } from "./user.types";

class UserModelClass extends BaseModelClass {

  @api({ httpMethod: "POST", guards: ["admin"] })
  @transactional()
  async save(spa: UserSaveParams[]): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    spa.map((sp) => {
      ub.register("users", sp);
    });

    // 트랜잭션 내에서 실행됨
    const ids = await ub.upsert(wdb, "users");
    return ids;
  }

  @transactional({ isolation: 'SERIALIZABLE' })
  async criticalOperation(): Promise<void> {
    // 높은 격리 수준이 필요한 중요한 작업
  }
}
```

### 동작 방식

`@transactional` 데코레이터는 다음과 같이 동작합니다:

1. **기존 트랜잭션 확인**: AsyncLocalStorage를 통해 현재 실행 컨텍스트에 이미 트랜잭션이 있는지 확인합니다.
2. **트랜잭션 재사용**: 같은 `dbPreset`의 트랜잭션이 이미 존재하면 재사용합니다.
3. **새 트랜잭션 생성**: 트랜잭션이 없거나 다른 `dbPreset`이면 새로운 트랜잭션을 시작합니다.
4. **컨텍스트 전파**: 트랜잭션 컨텍스트가 하위 메서드 호출에도 전파됩니다.
5. **자동 정리**: 메서드 실행 후 트랜잭션 컨텍스트를 자동으로 정리합니다.

### 중첩 트랜잭션

`@transactional` 데코레이터는 중첩된 트랜잭션을 지능적으로 처리합니다:

```typescript
class OrderModelClass extends BaseModelClass {
  @transactional()
  async createOrder(orderData: OrderData): Promise<number> {
    // 외부 트랜잭션 시작
    const orderId = await this.insertOrder(orderData);

    // 내부 메서드 호출 시 트랜잭션 재사용
    await this.createOrderItems(orderId, orderData.items);

    return orderId;
  }

  @transactional()
  async createOrderItems(orderId: number, items: ItemData[]): Promise<void> {
    // createOrder에서 호출될 때는 기존 트랜잭션 재사용
    // 단독으로 호출될 때는 새 트랜잭션 생성
    const wdb = this.getDB("w");
    // ...
  }
}
```

:::tip
`@transactional`을 사용하면 `wdb.transaction()` 같은 명시적인 트랜잭션 코드를 작성할 필요가 없어집니다. 특히 여러 메서드가 서로를 호출하는 복잡한 시나리오에서 유용합니다.
:::

<br/>

---

## @stream 데코레이터

`@stream` 데코레이터는 Server-Sent Events(SSE)를 사용하여 실시간 데이터 스트리밍을 제공하는 API를 생성합니다.

### 사용 예시

```typescript
import { api, stream } from "sonamu";
import { z } from "zod";

class NotificationModelClass extends BaseModelClass {
  @stream({
    event: z.object({
      type: z.enum(['info', 'warning', 'error']),
      message: z.string(),
      timestamp: z.number(),
    }),
  })
  async subscribeNotifications(userId: number): AsyncGenerator<NotificationEvent> {
    // 실시간 알림을 스트리밍
    while (true) {
      const notification = await this.getNextNotification(userId);
      yield notification;

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
```

:::note
`@stream` 데코레이터는 SSE 엔드포인트를 생성하며, 클라이언트는 EventSource API를 통해 연결할 수 있습니다. Zod 스키마를 사용하여 이벤트 타입을 정의하면, 프론트엔드 코드 생성 시 타입 안전성을 보장합니다.
:::
