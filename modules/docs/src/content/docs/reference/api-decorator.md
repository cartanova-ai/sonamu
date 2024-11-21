---
title: API 데코레이터
description: API 데코레이터 레퍼런스 문서
tableOfContents:
  maxHeadingLevel: 4
---

- [] api 메서드 매개변수명 설명

모델 내의 메소드에 `@api` 데코레이터를 지정할 수 있습니다. `@api` 데코레이터가 지정된 메소드는 **API 엔드포인트**로 생성되고, 아래의 추가 작업이 실행됩니다.

- 프론트엔드 서비스 코드 생성
- REST Client HTTP 요청 코드 생성

#### 데코레이터 옵션

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
  | "socketio"
  | "window-fetch";
```

##### `httpMethod`

해당 API가 사용할 HTTP Method를 지정합니다.

- `GET`, `POST`, `PUT`, `DELETE` 등 axios에서 지정 가능한 모든 HTTP Method를 지정할 수 있습니다.
- Sonamu에서는 `GET` 또는 `POST`만 인식합니다.
  - 서버에서 요청 데이터를 파싱할 때 사용(`GET`이면 querystring, `POST`면 body)
  - 서비스 코드 혹은 REST Client HTTP 요청 코드 생성 시 사용

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
- 기본값 사용을 컨벤션으로 합니다.

##### `resourceName`

프론트엔드 서비스 코드 생성 시 기본 네이밍 규칙 대신 해당 값을 사용합니다.

| 클라이언트        | 동작                                 | 네이밍                                       |
| ----------------- | ------------------------------------ | -------------------------------------------- |
| `axios`           | `GET`이 아닌 경우 모두 `POST`로 생성 | `methodName` 혹은 `get${resourceName}`       |
| `axios-multipart` | `POST`로 고정                        | `methodName`으로 고정                        |
| `swr`             |                                      | `use${resourceName}` 혹은 `use${methodName}` |
| `window-fetch`    |                                      | `methodName`으로 고정                        |

- e.g.) `resourceName`이 `Product`로 지정된 경우 아래와 같은 메소드명이 생성됩니다.
  - axios: `getProduct`
  - swr: `useProduct`

##### `guards`

접근 제어가 필요한 경우 가드를 사용할 수 있습니다.

- `Sonamu.withFastify`의 `guardHandler`를 통해 해당 옵션으로 지정된 가드에 대한 접근제어를 수행할 수 있습니다.
- `guardHandler`는 나열된 가드별로 수행되기 때문에, 모든 가드를 충족하는 경우에만 요청을 수행할 수 있습니다.
- `description`: 해당 API에 대한 설명으로, 문서화 작업 시 사용됩니다.

#### 동작

Sonamu는 TypeScript의 sourcefile을 분석하여 얻은 **AST**(Abstract Syntax Tree)를 사용하여 메서드의 파라미터와 반환값의 타입을 획득합니다. 따라서, 메서드의 **파라미터와 반환값의 타입을 정확하게 작성**해야 합니다. 또한, 메서드 파라미터에 기본값이 있는 경우, AST 분석에 실패하여 오류를 출력할 수 있습니다.

:::caution
메서드의 파라미터와 반환값의 타입이 정확하지 않으면, Sonamu는 AST 분석에 실패하여 오류를 출력합니다. 따라서, 메서드의 파라미터와 반환값의 타입을 정확하게 작성해야 합니다.
:::
