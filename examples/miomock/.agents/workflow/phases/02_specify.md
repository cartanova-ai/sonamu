# Phase 2: Specify

Spec 명세를 세분화한다. draft → specifying → implementing 전이를 위한 모든 필드를 완성한다.

## 선행 읽기 (필수)

- `../../api/contract/cdd.md`
- `../00_cdd_contract.md`

## 입력

```yaml
spec_path: "{spec 파일 경로}"
contract_paths: ["{참조 contract 경로}"]
schema_path: "{schema 파일 경로}"
findings: [] # 재스폰 시 이전 검증 실패 사항
```

## 작업 순서

### Step 1: draft → specifying 전이

현재 상태가 `draft`인 경우에만 수행한다.

1. Spec의 `contracts` 필드가 유효한 Contract를 참조하는지 확인한다.
2. 오케스트레이터에 `cdd advance` 실행을 요청한다 (서브에이전트는 직접 전이하지 않음).

### Step 2: Contract 분석

1. 참조 Contract를 읽는다.
2. Schema 파일을 읽어 어떤 custom field가 필요한지 파악한다.
3. Contract의 `features`, `businessRules`, `edgeCases`에서 이 Spec이 커버해야 할 범위를 식별한다.

### Step 3: Schema 필드 채우기

Schema의 `fields` 배열을 순회하며 각 필드를 채운다:

- `Record<string, string>` 타입: key-value 쌍으로 모듈/인터페이스/에러 등을 정의
- `string[]` 타입: 순서가 있는 항목 목록 (흐름, 제약 등)

각 필드의 내용은:
- Contract의 범위 내에서 작성한다.
- Spec의 `summary`/`description`과 일관되어야 한다.
- 필드 간 상호 참조가 일관적이어야 한다.

### Step 4: AC 정의

1. Contract의 `businessRules`, `edgeCases`에서 검증 가능한 조건을 도출한다.
2. Schema 필드의 에러 처리, 제약 조건에서 추가 조건을 도출한다.
3. 각 AC를 작성한다:
   ```bash
   cdd ac add {spec} --condition "조건문" --target "" --pattern ""
   ```
   - `condition`: pass/fail 판정 가능한 구체적 조건. "잘 동작한다" 같은 모호한 표현 금지.
   - `testRef`는 이 단계에서 비워둔다 (implementing 단계에서 채움).

### Step 5: sources 계획

구현 예정 파일 경로를 `sources`에 추가한다 (프로젝트 루트 기준 상대 경로).

### Step 6: findings 수정 (재스폰 시)

`findings`가 전달된 경우:
1. 각 finding의 `field`와 `message`를 확인한다.
2. 해당 필드를 수정한다.
3. `severity: error`인 항목을 우선 수정한다.

## 산출물

```yaml
spec_path: "{spec 파일 경로}"
fields_completed: ["{채운 필드 목록}"]
ac_count: "{정의한 AC 수}"
sources_planned: ["{계획한 소스 파일 목록}"]
```

## 금지 사항

- 코드를 작성하지 않는다.
- Contract를 수정하지 않는다. 수정이 필요하면 오케스트레이터에 보고한다.
- `cdd advance --commit`을 직접 실행하지 않는다.
