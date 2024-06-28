---
title: 스캐폴딩
description: 작성한 유저 엔티티를 기반으로 모델 코드를 스캐폴딩하는 방법을 설명합니다.
---

작성한 유저 엔티티를 기반으로 모델 코드를 스캐폴딩하는 방법을 설명합니다. Sonamu에서 모델이란, 엔티티 정의를 기반으로 CRUD 로직과 비즈니스 로직을 포함하는 클래스를 말합니다.

## 모델 코드 스캐폴딩

Sonamu UI의 `Scaffolding` 탭으로 이동하여 `Entities`는 `User`를 선택하고, `Template`은 `model`을 선택합니다.

![Scaffolding](./image/scaffolding/user-model.png)

보라색 `Preview` 버튼을 클릭하면 생성할 코드를 확인할 수 있습니다.

`Generate` 버튼을 클릭하면 테이블에 표시되는 모든 파일이 생성됩니다. Sonamu UI 터미널에서 다음과 같은 로그를 확인할 수 있습니다.

```shell
GENERATED  api/src/application/user/user.model.ts
[
  [
    [
      '/sonamu-tutorial/api/src/application/user/user.model.ts'
    ]
  ]
]
```

생성되고 나면 `IsExists` 컬럼에 `</>` 버튼이 활성화됩니다. 해당 버튼을 클릭하면 VSCode에서 해당 파일을 열 수 있습니다.

:::caution
**ERROR: `code: command not found`** 오류가 발생하면, `code` 명령어를 사용할 수 있도록 설정해야 합니다. [VSCode - Launching from the command line](https://code.visualstudio.com/docs/setup/mac#_launching-from-the-command-line) 페이지를 참고하세요.
:::

생성된 파일은 기본 CRUD 로직을 포함하고 있습니다. 이후, 필요에 따라 로직을 추가하거나 수정할 수 있습니다.

```typescript
// user.model.ts
class UserModelClass extends BaseModelClass {
  modelName = "User";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "User" })
  async findById<T extends UserSubsetKey>(
    subset: T,
    id: number
  ): Promise<UserSubsetMapping[T]> {
    // ...
  }

  async findOne<T extends UserSubsetKey>(
    subset: T,
    listParams: UserListParams
  ): Promise<UserSubsetMapping[T] | null> {
    // ...
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Users" })
  async findMany<T extends UserSubsetKey>(
    subset: T,
    params: UserListParams = {}
  ): Promise<ListResult<UserSubsetMapping[T]>> {
    // ...
  }

  @api({ httpMethod: "POST" })
  async save(spa: UserSaveParams[]): Promise<number[]> {
    // ...
  }

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    // ...
  }
}

export const UserModel = new UserModelClass();
```

모델 파일이 생성되면 해당 모델에 등록된 API를 호출하기 위한 service 파일과 HTTP 파일도 함께 생성됩니다.

```shell
DB Config Loaded!
autoload /tutorial/api/src/application/**/*.entity.json
Changed Files:  [ '/dist/application/user/user.model.js' ]
// 액션: 서비스 생성
GENERATED  web/src/services/user/user.service.ts
// 액션: HTTP파일 생성
GENERATED  api/src/application/sonamu.generated.http
checksum saved /tutorial/api/.so-checksum
Sonamu.init: 136.793ms
```
