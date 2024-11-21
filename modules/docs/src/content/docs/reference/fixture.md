---
title: Fixture
description: Fixture 레퍼런스 문서
---

Sonamu는 [vitest](https://vitest.dev/guide/)를 사용하여 테스트를 수행합니다.

Sonamu는 `Fixture`라는 테스트 데이터를 사용한 단위 테스트를 지원합니다. `Fixture`는 Sonamu CLI를 통해 생성할 수 있고, `FixtureManager`를 통해 데이터베이스 간의 동기화를 수행할 수 있습니다.

Sonamu는 테스트를 위해 총 3개의 데이터베이스를 사용합니다.

- `fixture_remote`: 테스트 데이터를 입력하는 데이터베이스
- `fixture_local`: 실제 테스트 실행 시 데이터를 가져오는 데이터베이스
  - `fixture_remote`에서 `test`로 데이터를 복사하여 테스트를 수행하는 경우 발생하는 딜레이를 줄이기 위해 사용
- `test`: 테스트를 수행하는 데이터베이스

`Fixture`는 `/src/testing/fixture.ts` 파일에 정의되어 있으며, `test` 데이터베이스에서 필요한 데이터를 가져오는 방식으로 동작합니다.

<br/>

---

### FixtureManager

`Fixture`는 `FixtureManager`를 통해 관리됩니다.

#### `FixtureManager.sync()`

`FixtureManager.sync()`는 `fixture_remote`와 `fixture_local` 데이터베이스 간의 데이터 동기화를 수행합니다. 이 과정에서 MySQL의 [`CHECKSUM TABLE`](https://dev.mysql.com/doc/refman/8.3/en/checksum-table.html) 구문을 사용하여 `fixture_remote`와 `fixture_local` 데이터베이스의 테이블 체크섬을 비교합니다. 체크섬이 일치하지 않는 경우 `fixture_local` 데이터베이스의 테이블을 비우고 `fixture_remote` 데이터베이스의 데이터를 복사합니다.

#### `FixtureManager.cleanAndSeed()`

`FixtureManager.cleanAndSeed()`는 `fixture_local` 데이터베이스의 데이터를 `test` 데이터베이스로 복사합니다. 인자로 테이블 이름을 받아 해당 테이블만 복사할 수 있습니다. `FixtureManager.sync()`와 마찬가지로 MySQL의 `CHECKSUM TABLE` 구문을 사용하여 체크섬을 비교합니다. 체크섬이 일치하지 않는 경우 `test` 데이터베이스의 테이블을 비우고 `fixture_local` 데이터베이스의 데이터를 복사합니다.

---

### 환경별 DB 선택

Sonamu는 `NODE_ENV` 환경변수에 따라서 자동으로 적절한 DB를 선택합니다.

```ts
// NODE_ENV=development
const writeDB = BaseModel.getDB("w"); // development 설정 사용
const readDB = BaseModel.getDB("r"); // development_slave 설정 사용 (없으면 development)

// NODE_ENV=production
const writeDB = BaseModel.getDB("w"); // production 설정 사용
const readDB = BaseModel.getDB("r"); // production_slave 설정 사용 (없으면 production)

// NODE_ENV=test
const db = BaseModel.getDB("w"); // test DB 설정 사용

// 실제 사용 예시
class UserModelClass extends BaseModel {
  async getUser(id: number) {
    const db = this.getDB("r"); // 읽기 전용 DB 사용
    return db("users").where({ id }).first();
  }
}
```
