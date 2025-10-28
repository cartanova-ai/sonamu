---
title: CLI
description: CLI 레퍼런스 문서
tableOfContents:
  maxHeadingLevel: 5
---

Sonamu CLI는 Sonamu 프로젝트를 관리하기 위한 명령어를 제공합니다. 아래의 명령어를 사용하여 프로젝트를 관리할 수 있습니다.

<br/>

---

## Fixture 명령어

### `fixture init`

테스트를 위한 데이터베이스를 초기화합니다. `SonamuDBConfig` 형식의 DB 연결 설정 중 `development_master`의 설정을 이용하여 `fixture_remote`, `fixture_local`, `test` 데이터베이스를 생성합니다.

```bash
yarn sonamu fixture init
```

### `fixture import <entityId> <recordIds>`

`development` 데이터베이스에서 `<entityId>`에 해당하는 테이블의 `<recordIds>`에 해당하는 레코드를 `fixture_remote` 데이터베이스로 복사합니다. 관련된 의존성 레코드도 함께 가져오며, `FixtureManager.sync()`를 실행하여 `fixture_local` 데이터베이스로 데이터를 복사합니다.

```bash
yarn sonamu fixture import User 1,2,3
```

이 명령어는 다음과 같이 동작합니다:

- 지정된 레코드와 모든 관계된 레코드를 재귀적으로 조회
- 순환 참조와 의존성을 자동으로 해결
- `fixture_remote` 데이터베이스에 INSERT IGNORE 방식으로 저장
- `fixture_local`로 자동 동기화

### `fixture sync`

`FixtureManager.sync()`를 실행하여 `fixture_remote` 데이터베이스에서 `fixture_local` 데이터베이스로 데이터를 복사합니다.

```bash
yarn sonamu fixture sync
```

<br/>

---

## 개발 명령어

### `dev:serve`

개발 모드로 서버를 실행합니다. nodemon을 사용하여 파일 변경 시 자동으로 재시작됩니다.

```bash
yarn sonamu dev:serve
```

### `build`

프로젝트를 빌드합니다. `dist` 디렉토리에 코드를 생성합니다.

```bash
yarn sonamu build
```

### `serve`

빌드된 프로젝트를 실행합니다. `dist` 디렉토리의 코드를 실행합니다.

```bash
yarn sonamu serve
```

:::note
`serve` 명령어를 실행하기 전에 `yarn build`로 프로젝트를 빌드해야 합니다.
:::

<br/>

---

## UI 명령어

### `ui`

Sonamu UI를 실행합니다. 엔티티 정의, 서브셋, Enum 등을 GUI로 관리할 수 있습니다.

```bash
yarn sonamu ui
```

기본 포트는 `sonamu.config.json`의 `ui.port` 설정을 따르며, 설정이 없으면 기본값을 사용합니다.
