---
title: 서버 설정
description: Sonamu 서버 설정
---

## 시작 전

### tsconfig

```json
{
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### sonamu.config.json

프로젝트 루트에 `sonamu.config.json` 파일이 있어야 합니다.

- `sync.targets`: 타입, 함수 등 코드를 동기화할 프로젝트를 명시합니다.
  - 명시된 프로젝트의 구조는 [디렉터리 구조](/guides/)를 참고
- `route.prefix`: API 엔드포인트에 프리픽스로 추가됩니다.

```json
{
  "api": {
    "dir": "api"
  },
  "sync": {
    "targets": ["web"]
  },
  "route": {
    "prefix": "/api"
  }
}
```

### DB 연결

`/src/configs/db.ts` 위치의 파일을 읽어서 처리합니다. 해당 파일은 `SonamuDBConfig` 타입의 객체를 default 모듈로 가지고 있습니다. `SonamuDBConfig`는 크게 4가지 DB 설정이 필요합니다. 각 설정은 knex의 설정파일 형식을 따릅니다.

- `production`: 프로덕션 DB 연결을 설정합니다.
  - `master`와 `slave`(읽기전용)으로 구분할 수 있습니다.
- `development`: 개발용 DB 연결을 설정합니다.
  - `master`와 `slave`(읽기전용)으로 구분할 수 있습니다.
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

### Fastify 플러그인 등록

Sonamu는 필요에 따라 [Fastify 플러그인](https://fastify.dev/docs/latest/Reference/Plugins/)을 자유롭게 등록할 수 있습니다.

```ts
import fastify from "fastify";

const server = fastify();

server.register(plugin, [options]);
```

###
