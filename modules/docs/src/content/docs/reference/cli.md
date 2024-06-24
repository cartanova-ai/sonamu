---
title: CLI
description: CLI 레퍼런스 문서
tableOfContents:
  maxHeadingLevel: 5
---

Sonamu CLI는 Sonamu 프로젝트를 관리하기 위한 명령어를 제공합니다. 아래의 명령어를 사용하여 프로젝트를 관리할 수 있습니다.

<br/>

---

#### Fixture

##### `fixture init`

`Fixture` 및 테스트를 위한 데이터베이스를 초기화합니다. `SonamuDBConfig` 형식의 DB 연결 설정 중 `development_master`의 설정을 사용하여 `fixture_remote`, `fixture_local`, `test` 데이터베이스를 생성합니다.

##### `fixture import #entityId #recordIds`

`development` 데이터베이스에서 `#entityId`에 해당하는 테이블의 `#recordIds`에 해당하는 레코드를 `fixture_remote` 데이터베이스로 복사하고, `FixtureManager.sync()`를 실행하여 `fixture_local` 데이터베이스로 데이터를 복사합니다.

-> UI에서 `#entityId`와 `#recordIds`를 선택하여 실행할 수 있도록 추가(릴레이션 전부 뒤져서 연관된 거 가져오는 걸로)

##### `fixture sync`

`FixtureManager.sync()`를 실행하여 `fixture_remote` 데이터베이스에서 `fixture_local` 데이터베이스로 데이터를 복사합니다.

<br/>

---

##### `ui`

Sonamu UI를 실행합니다.

-> UI 레퍼런스 추가 생성
