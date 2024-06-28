---
title: 데이터베이스 설정
description: 데이터베이스 설정에 대한 가이드
---

Sonamu는 [mysql2](https://www.npmjs.com/package/mysql2) 패키지를 사용하여 MySQL 데이터베이스에 연결합니다. 데이터베이스 연결을 위한 설정은 `/src/configs/db.ts` 파일에 정의합니다. 해당 파일은 `SonamuDBConfig` 타입의 객체를 default 모듈로 가지고 있습니다.

## SonamuDBConfig

`SonamuDBConfig`는 크게 4가지 DB 설정으로 구분됩니다. 각 설정은 knex의 설정파일 형식을 따릅니다.

- `production`: 프로덕션 DB 연결을 설정합니다.
  - `master`(읽기/쓰기)와 `slave`(읽기전용)으로 구분할 수 있습니다.
- `development`: 개발용 DB 연결을 설정합니다.
  - `master`(읽기/쓰기)와 `slave`(읽기전용)으로 구분할 수 있습니다.
- `test`: 로컬에서 테스트 시 사용합니다.
- `fixture`: 테스트 시 사용합니다.
  - `local`과 `remote`로 구분할 수 있습니다.

```ts
type SonamuDBConfig = {
  production_master: Knex.Config;
  production_slave: Knex.Config;
  development_master: Knex.Config;
  development_slave: Knex.Config;
  test: Knex.Config;
  fixture_local: Knex.Config;
  fixture_remote: Knex.Config;
};
```

프로덕션 환경과 원격 개발 환경이 따로 존재한다는 가정 하에, `test`와 `fixture_local`은 로컬에서 테스트를 수행하기 위한 데이터베이스이며, `fixture_remote`는 원격 환경에서 테스트 데이터 및 테이블 정의를 관리하기 위한 데이터베이스입니다.

`NODE_ENV` 환경변수의 값에 따라 연결되는 데이터베이스가 달라집니다. `NODE_ENV` 환경변수의 값이 `production`일 경우 `production_master`와 `production_slave`가 연결되며, `development`일 경우 `development_master`와 `development_slave`가 연결됩니다.

## 데이터베이스 연결 예시

`db.ts` 파일은 `src/configs` 디렉토리에 위치해야 하며, 다음과 같이 구성됩니다.

```typescript
// db.ts
import { SonamuDBConfig } from "sonamu";

const conf = {
  database: process.env.MYSQL_DATABASE,
  default: {
    client: "mysql2",
    pool: {},
    migrations: {
      extension: "js",
      directory: "./dist/migrations",
    },
    connection: {
      dateStrings: true,
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      typeCast: function (field: any, next: any) {
        if (field.type == "TINY" && field.length == 1) {
          const value = field.string();
          return value ? value === "1" : null;
        }
        return next();
      },
    },
  },
  remote: {
    master: {},
    slave: {},
  },
  local: {},
};

export const dbConfig: SonamuDBConfig = {
  development_master: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: conf.database,
    },
  },
  development_slave: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.slave,
      database: conf.database,
    },
  },
  test: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.local,
      database: `${conf.database}_test`,
    },
  },
  fixture_local: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: `${conf.database}_fixture_local`,
    },
  },
  fixture_remote: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: `${conf.database}_fixture_remote`,
    },
  },
  production_master: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: conf.database,
    },
  },
  production_slave: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: conf.database,
    },
  },
};

export default dbConfig;
```

## 데이터베이스 연결 사용

모델 코드 내에서 데이터베이스 연결을 가져오려면 데이터베이스 연결을 제공하는 `getDB` 메서드를 사용합니다. 이 메서드는 `r` 또는 `w`를 인자로 받아 읽기전용 또는 읽기/쓰기 데이터베이스 연결을 반환합니다.

```typescript
// user.model.ts
class UserModelClass extends BaseModelClass {
  async findById(): void {
    const rdb = this.getDB("r"); // 읽기전용 데이터베이스 연결
  }
}
```
