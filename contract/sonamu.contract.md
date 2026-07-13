# Sonamu Framework Contract

## 개요

Sonamu는 Entity 정의를 Single Source of Truth로 삼아 모델, 타입, API, 마이그레이션 등을 자동 생성하는 풀스택 TypeScript 프레임워크이다.

## 핵심 도메인 모델

### Entity

- JSON 기반 스키마 정의(`entity.json`)가 모든 생성 아티팩트의 원본이다.
- 프로퍼티(컬럼), 관계(FK, 1:N, N:N), Subset(필드 그룹), Enum을 선언한다.
- Cone 메타데이터를 통해 비즈니스 메모와 픽스처 생성 힌트를 포함한다.

### Subset

- Entity 내 명명된 필드 그룹이다. (예: "A" = 관리자 뷰, "P" = 공개 뷰)
- 관계 탐색을 dot notation(`user.department.name`)과 배열 표기(`tags[]`)로 지원한다.
- Subset별로 Zod 스키마와 TypeScript 타입이 생성된다.

### Model

- Entity에 대한 데이터 접근 계층이다.
- 조회(findMany, findById, findOne), 필터링, 페이지네이션, 정렬을 담당한다.
- `@api()` 데코레이터로 HTTP 엔드포인트를 자동 생성한다.

### Frame

- 복수 Model을 조합하는 비즈니스 워크플로우 계층이다.
- 리포트, 대시보드, 복합 연산 등 집계 로직을 담당한다.
- Model과 동일하게 `@api()` 데코레이터로 엔드포인트를 생성한다.

## 코드 생성

- `entity.json` 변경 시 sync를 통해 모델, 타입, Subset 쿼리 빌더 등이 자동 생성된다.
- `sonamu.lock`이 체크섬 기반으로 생성 파일의 무결성을 추적한다.
- 생성된 파일(`*.generated.ts`)은 직접 수정하지 않는다.

## 인증 (better-auth 통합)

- better-auth를 래핑하여 인증/인가를 제공한다.
- 플러그인 방식으로 인증 수단을 선택적으로 활성화한다: username, sso, passkey, phone-number, 2fa, api-key, organization, jwt, admin, anonymous.
- 플러그인 활성화 시 관련 Entity(Account, Session 등)가 자동 등록된다.
- 플러그인 래퍼가 better-auth 필드명을 Sonamu snake_case 컨벤션으로 매핑한다.

### 인증 감사 로그

- 클라이언트 IP는 Fastify가 신뢰 프록시 설정으로 해석한 주소를 기준으로 하며,
  유효한 IPv4 또는 IPv6만 저장한다. 잘못된 IP 입력은 감사 이벤트 적재를
  중단하지 않는다.
- 독립 감사 이벤트는 고유 식별자를 가진다. 동일 식별자를 유지한 재시도만
  중복 제거하고, 같은 시각에 발생한 별도 이벤트는 모두 보존한다.
- 근거: 전달 헤더는 클라이언트가 위조할 수 있고, 시각 기반 중복 키는 동시에
  발생한 독립 인증 시도를 하나로 합칠 수 있다.

## 마이그레이션

- Entity 정의와 현재 DB 스키마를 비교하여 마이그레이션 diff를 생성한다.
- 마이그레이션 파일은 CLI로만 생성하며 직접 작성하지 않는다.
- 마이그레이션 실행은 사용자가 명시적으로 수행한다.

## 스캐폴딩

- Entity로부터 Model, 타입, API 엔드포인트 등을 CLI로 스캐폴딩한다.
- 스캐폴딩된 파일은 최초 생성 후 개발자 소유가 된다(overwrite 플래그로 제어).

## HMR

- 개발 시 코드 변경을 감지하여 서버를 자동 재시작한다.
- 크래시 복구(최대 3회 연속)와 graceful shutdown을 지원한다.

## 테스트

- 픽스처 시스템으로 Entity 정의 기반 테스트 데이터를 선언적으로 생성한다.
- Cone 메타데이터의 Faker.js 힌트를 활용하여 현실적인 테스트 데이터를 만든다.
- 인증 플러그인 활성화 시 관련 Entity의 companion 픽스처가 자동 생성된다.

## 설계 원칙

- Entity 정의가 Single Source of Truth이다.
- Zod + TypeScript 제네릭으로 Subset 수준의 타입 안전성을 보장한다.
- Convention over Configuration: 대부분의 규칙은 스키마로부터 추론된다.
