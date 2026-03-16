# Phase 5: Close (Done)

validating → done 전이를 위한 최종 검증을 수행한다.

## 선행 읽기 (필수)

- `../../api/contract/cdd.md`
- `../00_cdd_contract.md`

## 입력

```yaml
spec_path: "{spec 파일 경로}"
contract_paths: ["{참조 contract 경로}"]
schema_path: "{schema 파일 경로}"
layer1_pattern_match_results: {} # CLI Layer 1에서 수집한 pattern 매칭 결과
findings: [] # 재스폰 시 이전 검증 실패 사항
```

## 작업 순서

### Step 1: 빌드 + 테스트 확인

```bash
cd examples/miomock/api
pnpm build
pnpm sonamu test  # 또는 pnpm test
```

둘 다 통과해야 한다.

### Step 2: AC 최종 검증

Layer 1에서 이미 확인한 항목:
- 모든 AC `testRef.target` 파일 존재
- 모든 AC `testRef.pattern` 비어있지 않음
- 각 pattern이 테스트 파일 내에서 매칭됨

이 단계에서 추가로 확인할 항목:
1. 각 테스트가 AC `condition`을 **정확히** 검증하는지 의미적 확인
2. 테스트가 vacuous하지 않은지 (의미 있는 assertion이 있는지)

### Step 3: 제약 조건 반영 확인

Schema의 제약 관련 필드가 코드에 반영되었는지 확인한다.
- 해당 필드를 읽고, 각 항목이 코드에 반영되었는지 `sources` 파일에서 확인한다.

### Step 4: 에러 처리 커버리지 확인

Schema의 에러 처리 관련 필드에 정의된 시나리오가 테스트되었는지 확인한다.
- 각 에러 시나리오에 대응하는 테스트가 존재하는지 확인한다.

### Step 5: findings 수정 (재스폰 시)

`findings`가 전달된 경우, 해당 코드/테스트를 수정한다.

## 산출물

```yaml
spec_path: "{spec 파일 경로}"
build_status: "pass|fail"
test_status: "pass|fail"
ac_semantic_check: "pass|fail"
constraints_reflected: true|false
error_handling_covered: true|false
overall: "pass|fail"
findings: [{ field, severity, message }]
```

## 금지 사항

- `cdd advance --commit`을 직접 실행하지 않는다.
- Spec을 수정하지 않는다 (수정이 필요하면 오케스트레이터에 보고).
