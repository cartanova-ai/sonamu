---
title: Node 환경과 데이터베이스 프리셋 정리
type: feat
status: draft
date: 2026-05-15
---

# Node 환경과 데이터베이스 프리셋 정리

## Overview

Sonamu의 런타임 환경을 `NODE_ENV` 하나로 결정하도록 바꾼다. 허용 값은 `test`, `development`, `staging`, `production` 네 가지이며, 값이 없으면 `development`로 본다. 그 외 값은 설정 로딩 단계에서 에러로 처리한다.

현재 구조는 `NODE_ENV`와 별도로 `LR=remote` 같은 변수를 함께 써야 원격/프로덕션 성격의 분기가 완성된다. 이 작업에서는 환경 선택과 데이터베이스 연결 선택을 `NODE_ENV`로 통일하고, `LR` 기반 환경 판정은 제거한다.

데이터베이스 프리셋 이름도 새 환경 이름에 맞춘다. 기존 `development_master`, `development_slave`, `production_master`, `production_slave`는 하위 호환 없이 제거하고, 새 프리셋은 `test`, `fixture`, `development`, `development_readonly`, `staging`, `staging_readonly`, `production`, `production_readonly`로 정리한다. `fixture`는 `test` 환경에서만 쓰는 보조 데이터베이스로 취급한다.

## Decisions

| 항목 | 결정 |
|---|---|
| 환경 선택 변수 | `NODE_ENV`만 사용 |
| 허용 환경 | `test`, `development`, `staging`, `production` |
| 기본 환경 | `development` |
| dotenv 로딩 | `.env` -> `.env.${NODE_ENV}` -> `.env.local` |
| 개발 도구 dotenv 로딩 | Sonamu UI, migration UI, 환경 진단 등은 모든 `.env.*` snapshot을 읽음 |
| `.env.local` | 모든 환경 snapshot에 마지막 override로 적용 |
| DB env prefix | `SONAMU_DB_*` |
| readonly fallback | readonly env가 없으면 같은 환경의 main DB 설정 사용 |
| fixture 범위 | `test` 환경에서만 사용 |
| breaking change | 기존 env 이름과 DB preset 이름 하위 호환 없음 |

## Environment variables

일반 DB 연결 변수는 모든 환경에서 같은 이름을 쓴다.

```dotenv
SONAMU_DB_HOST=localhost
SONAMU_DB_PORT=5432
SONAMU_DB_USER=postgres
SONAMU_DB_PASSWORD=password
SONAMU_DB_NAME=my_project_development
```

읽기 전용 DB가 따로 있으면 다음 변수를 쓴다. 없으면 main DB 값으로 대체한다.

```dotenv
SONAMU_DB_READONLY_HOST=localhost
SONAMU_DB_READONLY_PORT=5432
SONAMU_DB_READONLY_USER=postgres
SONAMU_DB_READONLY_PASSWORD=password
SONAMU_DB_READONLY_NAME=my_project_development_readonly
```

Fixture DB 변수는 `NODE_ENV=test`에서만 의미가 있다.

```dotenv
SONAMU_DB_FIXTURE_HOST=localhost
SONAMU_DB_FIXTURE_PORT=5432
SONAMU_DB_FIXTURE_USER=postgres
SONAMU_DB_FIXTURE_PASSWORD=password
SONAMU_DB_FIXTURE_NAME=my_project_fixture
```

DB 이름 결정 순서는 다음과 같다.

1. 현재 환경 snapshot에 `SONAMU_DB_NAME`이 있으면 그 값을 쓴다.
2. 없으면 `projectName`을 slug화한 base name을 만든다.
3. 환경별 기본 이름은 `${base}_${environment}`를 쓴다.
4. Fixture 기본 이름은 `${base}_fixture`를 쓴다.

예시는 다음과 같다.

| projectName | environment | 기본 DB 이름 |
|---|---|---|
| `Miomock` | `development` | `miomock_development` |
| `Miomock` | `test` | `miomock_test` |
| `Miomock` | `fixture` | `miomock_fixture` |
| `MedPath` | `staging` | `medpath_staging` |
| `NovaID` | `production` | `novaid_production` |

`projectName` slug 규칙은 구현에서 한 번만 정의한다. 영문/숫자는 소문자화하고, 공백이나 구분 문자는 `_`로 합친다. 앞뒤 `_`는 제거한다.

## Scope

### In scope

- `NODE_ENV` 검증과 기본값 처리 추가
- `.env`, `.env.${NODE_ENV}`, `.env.local` 순서의 runtime dotenv loader 추가
- 개발 도구용 전체 환경 snapshot loader 추가
- `SonamuConfig["database"]` 모델과 `SonamuDBConfig` 프리셋 이름 변경
- DB 선택 로직을 `NODE_ENV` 기반으로 변경
- readonly DB fallback 구현
- test/fixture DB 정책 정리
- CLI `migrate run` 기본 대상을 현재 `NODE_ENV` 환경으로 제한
- Sonamu UI migration 화면에서 환경 선택을 유지하거나 새 snapshot 모델에 맞게 수정
- `sonamu.config.ts` 템플릿과 miomock 설정 갱신
- 문서와 skill 문서의 env 이름, preset 이름, fixture 설명 갱신

### Out of scope

- 기존 `MIOMOCK_DB_*`, `DATABASE_NAME`, `DB_HOST`, `development_master`, `_slave` 이름의 호환 계층
- `NODE_ENV=production` 실행에 추가 승인 환경 변수 요구
- 로컬 `development`가 원격 host를 보는 경우를 프레임워크가 차단하는 정책
- fixture를 `staging` 또는 `production`에서 사용하는 정책

## Current code points

변경 전 확인한 주요 지점은 다음과 같다.

| 영역 | 현재 위치 | 현재 역할 |
|---|---|---|
| config type/load | `modules/sonamu/src/api/config.ts` | `SonamuConfig`, `loadConfig`, `defineConfig` |
| DB preset 생성/선택 | `modules/sonamu/src/database/db.ts` | `development_master`, `production_master`, `test`, `fixture` 생성 및 선택 |
| local/remote 판정 | `modules/sonamu/src/utils/controller.ts` | `LR`, `NODE_TYPE`, `NODE_ENV` 조합 판정 |
| dev/start/test CLI | `modules/sonamu/src/bin/cli.ts`, `modules/sonamu/src/bin/test-command.ts` | dev server, production start, DevRunner test 호출 |
| fixture 관리 | `modules/sonamu/src/testing/fixture-manager.ts`, `modules/sonamu/src/bin/fixture.ts` | fixture DB -> test DB sync, fixture gen/fetch/import |
| test 병렬 DB | `modules/sonamu/src/testing/vitest-helpers.ts`, `modules/sonamu/src/testing/global-setup.ts` | worker별 `${testDb}_${workerId}` 생성 |
| miomock config | `examples/miomock/api/src/sonamu.config.ts` | `MIOMOCK_DB_*` 기반 연결 |
| project template | `modules/create-sonamu/template/src/packages/api/src/sonamu.config.ts` | `DB_*`, `DATABASE_NAME` 기반 연결 |

## Proposed design

### 1. Environment utilities

새 환경 유틸을 만든다.

```ts
type SonamuEnvironment = "test" | "development" | "staging" | "production";
```

유틸의 책임은 다음으로 제한한다.

- `process.env.NODE_ENV` 값을 읽는다.
- 값이 없으면 `development`를 반환한다.
- 허용되지 않은 값이면 에러를 낸다.
- `isTest`, `isDevelopment`, `isStaging`, `isProduction`은 이 값을 기준으로 판단한다.
- `isLocal`, `isRemote`, `isInDocker` 같은 `LR` 기반 환경 판정은 제거하거나 용도를 재정의한다.

`NODE_TYPE=daemon`은 worker 실행 여부 판단에만 남긴다. 환경 선택에는 쓰지 않는다.

### 2. Dotenv loader

일반 런타임용 loader를 추가한다.

입력:

- api root path
- optional environment override

동작:

1. `.env`를 읽는다.
2. `.env.${environment}`를 읽어 override한다.
3. `.env.local`을 읽어 override한다.
4. 없는 파일은 건너뛴다.
5. `process.env`에는 현재 런타임 환경의 결과만 반영한다.

개발 도구용 snapshot loader도 추가한다.

동작:

1. `test`, `development`, `staging`, `production` 각각에 대해 `.env` + `.env.${environment}` + `.env.local`을 합성한다.
2. 각 snapshot을 `process.env`에 전역 반영하지 않는다.
3. DB config 생성, migration status, Sonamu UI 환경 선택은 이 snapshot을 명시적으로 받아 처리한다.

### 3. Database config model

`SonamuConfig["database"]`는 환경별 연결값을 직접 열거하는 모델 대신, `SONAMU_DB_*` env와 projectName 기반 기본값을 중심으로 재정의한다.

초기 구현은 다음 구조가 적당하다.

```ts
database: {
  database?: "pg" | "pgnative";
  defaultOptions?: DatabaseConfig;
}
```

`name`은 기존처럼 config에 필수로 두지 않는다. 이름은 env 또는 projectName에서 계산한다. 단, projectName이 없으면 DB 이름 기본값을 만들 수 없으므로 명확한 에러를 낸다.

DB config 생성 함수는 environment snapshot을 입력으로 받아 다음 프리셋을 만든다.

- `test`
- `test_readonly`
- `fixture`
- `development`
- `development_readonly`
- `staging`
- `staging_readonly`
- `production`
- `production_readonly`

`fixture`는 test snapshot에서만 만든다. 일반 서버가 `NODE_ENV=development|staging|production`으로 뜰 때는 active DB 후보가 아니다. 개발 도구 snapshot에는 표시할 수 있지만 test 보조 DB로 라벨링한다.

### 4. Runtime DB selection

`DB.getDB("w")`는 현재 `NODE_ENV`의 main preset을 반환한다.

`DB.getDB("r")`는 현재 `NODE_ENV`의 readonly preset을 반환한다. readonly env가 없으면 main preset과 같은 설정이다.

`NODE_ENV=test`에서는 기존 테스트 트랜잭션과 worker DB 정책을 유지한다.

- 단일 테스트: `test` preset
- 병렬 테스트: `${testDbName}_${VITEST_POOL_ID}`
- fixture sync: `fixture` -> `test`

### 5. CLI behavior

`sonamu dev`는 `NODE_ENV`가 없으면 `development`로 실행한다. 사용자가 `NODE_ENV=test pnpm sonamu dev`처럼 실행하면 test DB를 보는 dev server가 뜬다.

`sonamu start`는 `NODE_ENV`를 강제로 바꾸지 않는다. 배포 환경이 `NODE_ENV=production`을 제공해야 production DB를 본다.

`sonamu test`는 DevRunner HTTP endpoint를 호출한다. DevRunner의 Vitest 실행 환경은 `NODE_ENV=test`가 되어야 한다. dev server 자체도 사용자가 `NODE_ENV=test`로 띄울 수 있으므로, DevRunner는 test dotenv를 읽는 경로를 명시적으로 가져야 한다.

`sonamu migrate run`은 현재 `NODE_ENV` 환경의 main DB만 대상으로 한다. `sonamu migrate apply`처럼 명시 타겟을 받는 명령은 새 preset 이름을 사용한다.

Sonamu UI migration 화면은 모든 환경 snapshot을 읽고, 사용자가 환경을 선택해서 status/apply를 실행할 수 있어야 한다.

### 6. Fixture behavior

Fixture는 test 환경의 보조 DB다.

- `fixture gen --save-to db`: fixture DB에 저장
- `fixture fetch`: 현재 source 환경에서 읽어 fixture DB에 저장
- `fixture sync`: fixture DB를 test DB로 복사
- 테스트 실행: test DB 또는 worker별 test DB에서 fixture 데이터를 읽음

`fixture fetch`의 source DB는 명시가 필요하다. 기본값은 현재 `NODE_ENV`의 readonly DB로 둔다. 운영 데이터에서 fixture를 가져와야 하는 경우에는 `NODE_ENV=production pnpm sonamu fixture fetch ...`처럼 명시 실행한다.

## Implementation phases

### Phase 1: Environment and dotenv foundation

- `SonamuEnvironment` 타입과 parser 추가
- `NODE_ENV` 검증 및 기본값 처리 추가
- 일반 runtime dotenv loader 추가
- 전체 환경 snapshot loader 추가
- 기존 `dotenv.config()` 직접 호출 지점 정리

검증:

- `NODE_ENV` 미설정 시 `development`
- 네 허용 값은 통과
- 다른 값은 에러
- `.env.local`이 마지막 override로 적용
- 일반 runtime이 현재 환경 외 `.env.*`를 읽지 않음

### Phase 2: Database preset model

- `SonamuDBConfig` preset 이름 변경
- env snapshot 기반 DB config 생성 함수 작성
- projectName slug 기반 DB 이름 기본값 구현
- readonly fallback 구현
- `DB.getDBConfig`, `DB.getDB` 선택 로직 변경

검증:

- `Miomock` 기본 이름이 `miomock_development`, `miomock_test`, `miomock_fixture`로 계산됨
- `SONAMU_DB_NAME`이 있으면 기본 이름보다 우선
- readonly 값이 없으면 main DB와 같은 설정
- `NODE_ENV=staging`에서 write/read가 staging preset을 사용

### Phase 3: CLI and server runtime

- `sonamu dev`, `sonamu start`, `sonamu test` env 처리 정리
- DevRunner Vitest 실행을 `NODE_ENV=test`로 고정
- `migrate run` 기본 대상을 현재 환경으로 변경
- `migrate apply` 선택지를 새 preset 이름으로 갱신
- startup summary의 DB preset 표시 갱신

검증:

- `NODE_ENV=development pnpm sonamu dev`가 development DB를 표시
- `NODE_ENV=test pnpm sonamu dev`가 test DB를 표시
- `pnpm sonamu test -s`가 DevRunner 상태를 읽음
- `migrate run`이 현재 환경만 대상으로 삼음

### Phase 4: Fixture flow

- `FixtureManager`의 preset 이름 갱신
- fixture sync를 `fixture` -> `test` 정책으로 정리
- 병렬 테스트 worker DB 생성 로직을 새 test DB 이름 정책에 맞춤
- fixture fetch source 정책 문서화 및 구현 확인

검증:

- `pnpm seed` 또는 대체 seed 흐름이 fixture DB를 채움
- `pnpm sonamu fixture sync`가 fixture DB를 test DB로 복사
- 병렬 테스트에서 worker DB가 `${testDbName}_1..N`으로 생성됨
- fixture loader 테스트가 test DB에서 데이터를 조회

### Phase 5: Sonamu UI and docs

- Sonamu UI DB/migration 화면을 snapshot 기반으로 갱신
- project template의 `.env.example`과 `sonamu.config.ts` 갱신
- miomock의 env와 DB compose/init/seed 설정 갱신
- docs와 skill 문서에서 기존 env/preset 이름 제거

검증:

- `rg "development_master|production_master|_slave|MIOMOCK_DB_|DATABASE_NAME|DB_HOST"` 결과를 검토하고 남은 항목을 의도적으로 분류
- 문서 예제가 `SONAMU_DB_*` 이름만 사용
- Sonamu UI에서 각 환경 migration status를 선택 조회 가능

## Migration notes

이 변경은 breaking change다. 기존 프로젝트는 다음 작업이 필요하다.

1. `.env` 파일을 `.env`, `.env.test`, `.env.development`, `.env.staging`, `.env.production`, `.env.local` 구조로 재배치한다.
2. 기존 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DATABASE_NAME`을 `SONAMU_DB_*`로 바꾼다.
3. readonly DB가 있으면 `SONAMU_DB_READONLY_*`를 추가한다.
4. test 환경에서 fixture DB가 별도 host/name을 쓰면 `SONAMU_DB_FIXTURE_*`를 추가한다.
5. `sonamu.config.ts`에서 `database.name`과 `environments` 기반 preset 정의를 제거하거나 새 모델로 바꾼다.
6. migration CLI, fixture CLI, 배포 스크립트에서 `development_master`, `production_master`, `_slave` 이름을 새 preset 이름으로 바꾼다.

## Risks

| 위험 | 대응 |
|---|---|
| DevRunner가 development server와 test env를 한 프로세스에서 섞음 | DevRunner Vitest 실행 경로에 test dotenv snapshot을 명시적으로 전달 |
| Sonamu UI가 모든 env를 읽으면서 `process.env`를 오염시킴 | snapshot 객체를 만들고 전역 env에는 반영하지 않음 |
| fixture가 test 외 환경에서 잘못 실행됨 | fixture DB 생성과 사용 경로를 test 보조 DB로 제한 |
| readonly fallback이 실제 read replica 사용 여부를 숨김 | startup summary와 UI에서 fallback 여부를 표시 |
| 문서와 템플릿에 오래된 env 이름이 남음 | 마지막 단계에서 targeted `rg`로 확인 |

## Verification checklist

- `pnpm --filter sonamu build`
- `pnpm --filter sonamu test:type`
- `pnpm --filter sonamu test:unit`
- `pnpm --filter miomock-api build`
- `pnpm --filter miomock-api test`
- `pnpm check`
- `NODE_ENV=development pnpm --filter miomock-api sonamu migrate status`
- `NODE_ENV=test pnpm --filter miomock-api sonamu fixture sync`
- `NODE_ENV=test pnpm --filter miomock-api sonamu test -s`

초기 phase가 타입이나 문서만 건드리는 경우에는 검증 명령을 좁힐 수 있다. 최종 handoff 전에는 Sonamu core와 miomock 통합 검증을 포함한다.
