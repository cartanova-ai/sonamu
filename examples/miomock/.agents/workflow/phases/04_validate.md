# Phase 4: Validate

구현된 코드가 Spec의 AC를 충족하는지 검증한다.

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

### Step 1: 검증 대상 수집

1. Spec 파일을 읽는다.
2. Schema 파일을 읽는다.
3. `sources`의 모든 파일을 읽는다.
4. AC의 `testRef.target` 파일을 모두 읽는다.

### Step 2: CLI 검증 실행

```bash
cd examples/miomock/api
cdd ac check {spec}    # AC testRef 무결성 검증
cdd check              # Spec-Code 일관성 검증
```

실패 항목이 있으면 기록한다.

### Step 3: AC-테스트 매칭 검증

각 AC에 대해:

1. `testRef.target` 파일 내에서 `testRef.pattern`에 매칭되는 테스트가 있는지 확인한다.
2. 해당 테스트가 `condition`의 의미를 실제로 검증하는지 확인한다.
   - 빈 테스트(vacuous test)가 아닌지
   - 조건의 핵심 동작을 assert하는지
3. 매칭되지 않거나 의미가 불일치하면 finding으로 기록한다.

### Step 4: Spec-코드 일관성 검증

Schema의 각 required 필드에 대해:

1. 필드에 기술된 내용이 `sources` 코드에 반영되었는지 확인한다.
2. Contract의 범위를 벗어나는 구현이 없는지 확인한다.
3. 불일치가 있으면 finding으로 기록한다.

### Step 5: 테스트 실행

```bash
pnpm sonamu test  # 또는 pnpm test
```

실패하는 테스트가 있으면 finding으로 기록한다.

### Step 6: findings 수정 (재스폰 시)

`findings`가 전달된 경우, 해당 코드/테스트를 수정한다.
- 코드가 Spec에 부합하지 않으면 코드를 수정한다.
- 테스트가 AC condition에 부합하지 않으면 테스트를 수정한다.
- Spec 수정이 필요한 경우 오케스트레이터에 보고한다.

## 산출물

```yaml
spec_path: "{spec 파일 경로}"
cli_check_result: "pass|fail"
ac_validation:
  - ac_id: "{AC id}"
    pattern_matched: true|false
    semantically_valid: true|false
    message: "{불일치 시 사유}"
spec_code_consistency:
  - field: "{schema 필드명}"
    consistent: true|false
    message: "{불일치 시 사유}"
test_result: "pass|fail"
overall: "pass|fail"
findings: [{ field, severity, message }]
```

## 금지 사항

- Spec을 수정하지 않는다 (수정이 필요하면 오케스트레이터에 보고).
- `cdd advance --commit`을 직접 실행하지 않는다.
