---
title: 시작하기
description: Sonamu를 사용하기 위한 기본 설정과 실행 방법을 설명합니다.
---

Sonamu의 컨셉과 기본적인 사용법을 익히기 위한 튜토리얼입니다. 아직 [소개](/intro)를 읽지 않았다면, 해당 문서를 통해 Sonamu의 기본 개념과 목적을 확인해보세요.

이 튜토리얼에서는 간단한 게시글 CRUD 로직을 작성하면서 엔티티 관리, 마이그레이션, 스캐폴딩, 모델 코드 작성 등 Sonamu의 기본적인 기능을 체험할 수 있습니다.

### 사전 설치

Sonamu를 이용하기 위해서는 Node.js, Yarn, Docker Desktop, MySQL 클라이언트가 필요합니다. [사전 설치](/explanation/intro#사전-설치) 문서를 확인하세요.

### 첫 Sonamu 프로젝트

```shell
yarn create sonamu@latest
```

Sonamu 기본 디렉터리 구조를 따르는 프로젝트를 설치합니다.

추가적으로 yarn berry 설정, DB 설정이 가능합니다. 데이터베이스 설정은 도커를 이용합니다. 혹은 직접 데이터베이스를 설정하고 `db.ts`에서 연결하세요.

<br/>

---

### 디렉터리 구조

Sonamu의 디렉터리 구조는 다음과 같습니다.

```
root
├── api
│   ├── package.json
│   ├── sonamu.config.json
│   ├── src
│   │   ├── application
│   │   │   └── <ModelName>
│   │   │       ├── <ModelName>.entity.json
│   │   │       ├── <ModelName>.model.ts
│   │   │       └── <ModelName>.types.ts
│   │   ├── configs
│   │   ├── migrations
│   │   └── testing
│   └── yarn.lock
└── web
    └── src
        └── services
```

- `sonamu.config.json`: Sonamu 설정파일
- `<ModelName>.entity.json`: 엔티티 정의 파일
- `testing`: 각 모델별 단위테스트

---

### DB 설정

Sonamu UI의 기능을 사용하려면 Fixture 및 Test 데이터베이스 설정이 필요합니다. Fixture에 대한 자세한 내용은 [Fixture](/reference/fixture) 문서를 참고하세요.

Fixture 및 Test 데이터베이스 설정을 위해 api 디렉터리 내에서 다음 명령어를 실행하세요.

```shell
yarn sonamu fixture init
```

위 명령어는 db.ts의 `fixture_local`, `fixture_remote`, `test` 연결 정보에 접속하여 각각 아래의 데이터베이스를 생성합니다.

- `<db>_fixture_local`: 로컬 환경에서 사용하는 `Fixture` 데이터베이스
- `<db>_fixture_remote`: 원격 환경에서 사용하는 `Fixture` 데이터베이스
- `<db>_test`: 테스트 환경에서 사용하는 데이터베이스

각 데이터베이스는 기본 데이터베이스(`<db>`)의 정보를 기반으로 테이블 정보를 복사합니다. knex migration 관련 테이블은 정의뿐만 아니라 데이터도 복사됩니다.

명령어가 정상적으로 실행되면 아래와 같은 메시지가 출력됩니다.

```shell
DUMP...
SYNC to (REMOTE) Fixture DB...
SYNC to (LOCAL) Fixture DB...
SYNC to (LOCAL) Testing DB...
```

---

### 실행

#### 서버

**서버**를 실행하려면 api 디렉터리 내에서 다음 명령어를 실행하세요.

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

#### Sonamu UI

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
