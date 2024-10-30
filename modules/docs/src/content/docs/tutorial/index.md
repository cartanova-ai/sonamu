---
title: 시작하기
description: Sonamu를 사용하기 위한 기본 설정과 실행 방법을 설명합니다.
---

Sonamu의 컨셉과 기본적인 사용법을 익히기 위한 튜토리얼입니다. 아직 [소개](/intro)를 읽지 않았다면, 해당 문서를 통해 Sonamu의 기본 개념과 목적을 확인해보세요.

이 튜토리얼에서는 간단한 CRUD 로직을 작성하면서 엔티티 관리, 마이그레이션, 스캐폴딩, 모델 코드 작성 등 Sonamu의 기본적인 기능을 사용해보겠습니다.

## 사전 설치

Sonamu를 이용하기 위해서는 Node.js, Yarn, Docker Desktop, MySQL 클라이언트가 필요합니다. [사전 설치](/explanation/dependency#사전-설치) 문서를 확인하세요.

## 첫 Sonamu 프로젝트

```shell
yarn create sonamu@latest
```

위 명령어를 실행하면 간단한 Sonamu 프로젝트를 생성할 수 있습니다. 프로젝트 이름을 입력하면 `project-name` 디렉터리가 생성되며, yarn berry 설정, DB 설정이 이루어집니다.

기본적으로 데이터베이스 설정은 도커를 이용합니다. 직접 데이터베이스를 설정하고 싶다면 `db.ts` 파일을 수정하세요.

Sonamu의 디렉터리 구조는 다음과 같습니다.

```

root
├── api
│   ├── package.json
│   ├── sonamu.config.json
│   ├── src
│   │   ├── index.ts
│   │   ├── application
│   │   │   └── <Model>
│   │   │   ├── <Model>.entity.json
│   │   │   ├── <Model>.model.ts
│   │   │   └── <Model>.types.ts
│   │   ├── configs
│   │   ├── migrations
│   │   └── testing
│   └── yarn.lock
└── web
    ├── src
    └── services

```

아래는 각 파일에 대한 설명입니다.

- `sonamu.config.json`: Sonamu 설정파일로, 서버의 루트 디렉터리, 서비스 코드 생성 대상 디렉터리, api 프리픽스를 설정할 수 있습니다.
- `index.ts`: 서버 진입점 파일로, Sonamu 서버를 초기화하고 실행합니다.
- `<Model>.entity.json`: 엔티티 정의 파일로, 컬럼, 인덱스, 서브셋 등을 정의합니다.
- `<Model>.model.ts`: 모델 코드 파일로, 엔티티 정의 파일을 기반으로 코드를 작성하고 API를 정의합니다.
- `<Model>.types.ts`: 모델 타입 파일로, 모델 코드에서 사용할 타입을 정의합니다.

---

## 설정

### tsconfig.json

소나무 프레임워크를 사용하기 위해 필요한 필수 TypeScript 설정입니다.

```json
{
  "compilerOptions": {
    // 소스 코드의 루트 디렉터리 - 소나무의 코드 생성 기능을 위해 필요
    "rootDir": "./src",
    // 컴파일된 결과물이 생성될 디렉터리 - 소나무의 코드 생성 기능을 위해 필요
    "outDir": "./dist",
    // CommonJS/ES Modules 간 상호 운용성을 위해 필요
    "esModuleInterop": true,
    // 데코레이터 문법 지원을 위해 필요 (소나무 API 정의에 사용)
    "experimentalDecorators": true,
    // 데코레이터 메타데이터 생성 지원을 위해 필요
    "emitDecoratorMetadata": true
  }
}
```

### sonamu.config.json

프로젝트 루트에 위치해야 하는 소나무 설정 파일입니다.

```json
{
  "api": {
    "dir": "api" // 서버 소스코드의 루트 디렉터리
  },
  "sync": {
    "targets": ["web"] // 클라이언트 코드를 생성할 대상 디렉터리들
  },
  "route": {
    "prefix": "/api" // API 엔드포인트에 추가될 프리픽스 (예: /api/users)
  }
}
```

- `api.dir`: 서버 소스코드가 위치하는 루트 디렉터리를 지정합니다.
- `sync.targets`: API가 정의되었을 때 해당 API를 호출하는 클라이언트 코드나, 모델이 정의되었을 때 관련 컴포넌트를 자동 생성할 대상 디렉터리들을 지정합니다.
- `route.prefix`: 모든 API 엔드포인트에 자동으로 추가될 경로 프리픽스입니다.

---

## DB 설정

### 연결 설정

Sonamu는 `configs/db.ts` 파일을 통해 데이터베이스 설정을 관리합니다. 이 파일은 `SonamuDBBaseConfig` 타입을 정의하고, `defaultOptions`와 `environments`를 통해 데이터베이스 설정을 관리합니다.

```typescript db.ts
import { SonamuDBBaseConfig } from "sonamu";

const baseconfig: SonamuDBBaseConfig = {
  database: "my_database",
  defaultOptions: {
    connection: {
      host: "localhost",
      user: "root",
      password: "password",
    },
  },
};

export default baseconfig;
```

위 코드는 `SonamuDBBaseConfig`를 정의하고 `defaultOptions`에 기본 연결 정보를 설정한 예시입니다. `defaultOptions`는 `Knex`의 `knex.Config`전와 동일한 구조로, 모든 데이터베이스 연결에 적용됩니다.

`SonamuDBBaseConfig`는 아래와 같은 주요 설정들을 포함할 수 있습니다.

```ts
type SonamuDBBaseConfig = {
  database: string; // 기본 데이터베이스 이름
  defaultOptions: {
    connection?: {
      host?: string; // 호스트
      port?: number; // 포트
      user?: string; // 사용자
      password?: string; // 비밀번호
      timezone?: string; // 타임존
      charset?: string; // 문자셋
      dateStrings?: boolean; // 날짜를 문자열로 반환
      ssl?: boolean | object; // SSL 설정
    };
    pool?: {
      min?: number; // 최소 커넥션 수(기본값: 1)
      max?: number; // 최대 커넥션 수(기본값: 5)
      idleTimeoutMillis?: number; // 유휴 타임아웃
      acquireTimeoutMillis?: number; // 획득 타임아웃
    };
    migrations?: {
      directory?: string; // 마이그레이션 디렉토리(기본값: "./dist/migrations")
      extension?: string; // 파일 확장자(기본값: "js")
    };
    debug?: boolean; // SQL 디버그 모드
  };
```

`environments`에서 환경별 설정을 오버라이드할 수 있습니다. `environments`는 `defaultOptions`와 동일한 구조로, 해당 환경에만 적용될 설정을 정의합니다. 각 환경의 읽기 전용 데이터베이스는 기본적으로 해당 환경의 설정을 사용하며, 필요한 경우 별도로 설정할 수 있습니다.

```typescript db.ts
import { SonamuDBBaseConfig } from "sonamu";

const baseconfig: SonamuDBBaseConfig = {
  database: "my_database",
  defaultOptions: {
    useNullAsDefault: true,
    connection: {
      host: "localhost",
      user: "root",
      password: "password",
    },
  },
  environments: {
    development: {
      connection: {
        host: "dev-db.example.com",
      },
    },
    development_slave: {
      connection: {
        host: "dev-read.example.com",
      },
    },
    production: {
      connection: {
        host: "prod-db.example.com",
      },
      pool: { min: 5, max: 50 },
    },
    production_slave: {
      connection: {
        host: "prod-read.example.com",
      },
      pool: { min: 5, max: 30 },
    },
  },
};

export default baseconfig;
```

Sonamu는 위 설정을 기반으로 아래 데이터베이스들에 대한 연결을 설정합니다.

- 기본 설정 이용: `<database>_test`, `<database>_fixture_local`
- 개발환경 설정 이용: `<database>_development`, `<database>_development_slave`, `<database>_fixture_remote`
- 운영환경 설정 이용: `<database>_production`, `<database>_production_slave`

### Fixture 및 Test 데이터베이스 구성

Sonamu는 테스트와 개발을 위해 다음과 같은 데이터베이스 구성을 사용합니다.

1. **Fixture Remote DB** (`<db>_fixture_remote`)

   - 팀 간에 공유되는 테스트 데이터를 관리
   - 여러 개발자가 공통으로 사용할 테스트 데이터 저장
   - 예: `my_db_fixture_remote`

2. **Fixture Local DB** (`<db>_fixture_local`)

   - 개발자의 로컬 환경에서 관리되는 테스트 데이터
   - 개별 개발자가 필요한 테스트 데이터를 독립적으로 관리
   - 예: `my_db_fixture_local`

3. **Test DB** (`<db>_test`)

   - 실제 테스트가 실행되는 데이터베이스
   - 테스트 실행 시마다 Fixture Local DB의 데이터로 초기화됨
   - 예: 프로덕션 DB가 `my_db`인 경우 `my_db_test`로 생성

데이터베이스 초기 설정을 위해 다음 명령어를 실행하세요.

```shell
yarn sonamu fixture init
```

이 명령어는 다음과 같은 작업을 수행합니다.

- 필요한 데이터베이스들을 자동으로 생성
- 스키마 구조 생성
- 마이그레이션 데이터 복원

성공적으로 실행되면 다음과 같은 출력을 확인할 수 있습니다.

```shell
DUMP...
SYNC to (REMOTE) Fixture DB...
SYNC to (LOCAL) Fixture DB...
SYNC to (LOCAL) Testing DB...
```

이미 데이터베이스가 존재하는 경우 아래 메시지가 출력됩니다.

```shell
(DATABASE): Database "db_name" Already exists
```

자세한 Fixture 관리 방법과 테스트 데이터 활용 방법은 [Fixture](/reference/fixture) 문서를 참고하세요.

---

## 실행

### 서버

서버를 실행하려면 api 디렉터리 내에서 다음 명령어를 실행하세요.

```shell
yarn dev
```

아래와 같은 메시지가 출력되면 서버가 정상적으로 실행된 것입니다.

```shell
DB Config Loaded!
autoload /api/src/application/**/*.entity.json
Every files are synced!
Sonamu.init: 5.74ms
```

<br/>

### Sonamu UI

**Sonamu UI**를 실행하려면 api 디렉터리 내에서 다음 명령어를 실행하세요.

```shell
yarn sonamu ui
```

아래와 같은 메시지가 출력되면 Sonamu UI가 정상적으로 실행된 것입니다. `localhost:57000`으로 접속하여 Sonamu UI를 확인하세요.

```shell
sonamu-ui WEB-static Server is listening on 0.0.0.0:57000
sonamu-ui API Server is listening on 0.0.0.0:57001
```

<br/>

---
