# Phase 3: Implement

확정된 Spec에 따라 코드를 구현하고 테스트를 작성한다.

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

### Step 1: Spec 확인

1. Spec 파일을 읽고 현재 상태가 `implementing`인지 확인한다.
2. Schema 파일을 읽고 custom field 구조를 파악한다.
3. 모든 schema 필드와 AC를 숙지한다. 이것이 구현의 기준이다.

### Step 2: 테스트 작성 (테스트 우선)

1. AC 목록을 순회하며 각 AC에 대한 테스트를 작성한다.
2. 테스트 파일 경로를 AC의 `testRef.target`에 설정한다:
   ```bash
   cdd spec set {spec} --field acceptanceCriteria
   ```
   또는 Spec 파일을 직접 편집하여 `testRef.target`과 `testRef.pattern`을 채운다.
3. 테스트는 AC의 `condition`을 정확히 검증해야 한다.
4. `testRef.pattern`은 테스트 케이스의 describe/it/test 이름과 매칭되는 정규식이다.

### Step 3: 코드 구현

1. Spec의 schema 필드에 정의된 구조에 따라 구현한다.
   - 모듈 구조, 인터페이스, 데이터 흐름 등 schema 필드가 정의한 설계를 따른다.
2. 구현 중 더 나은 구조가 보이더라도 코드를 먼저 변경하지 않는다.
   - Spec 수정이 필요하면 오케스트레이터에 보고한다.
3. 새 파일이 추가되면 Spec의 `sources`를 업데이트한다.

### Step 4: 테스트 실행

```bash
cd examples/miomock/api
pnpm sonamu test -s  # 준비 상태 확인
pnpm sonamu test {테스트파일경로}  # 또는 pnpm test
```

실패 시 코드를 수정한다. Spec에 정의된 동작이 기준이다.

### Step 5: 빌드 확인

```bash
pnpm build
pnpm check  # Biome lint/format
```

### Step 6: 커밋

Spec 변경과 코드 변경을 분리하여 커밋한다:
- `[miomock-api] feat: {feature명} Spec testRef 설정` (Spec 변경)
- `[miomock-api] feat: {feature명} 구현` (코드 변경)

### Step 7: findings 수정 (재스폰 시)

`findings`가 전달된 경우:
1. 각 finding을 확인하고 해당 코드/테스트/Spec을 수정한다.
2. `severity: error`인 항목을 우선 수정한다.
3. 테스트를 재실행하여 통과를 확인한다.

## 산출물

```yaml
spec_path: "{spec 파일 경로}"
files_changed: ["{변경 파일 목록}"]
tests_added: ["{추가된 테스트 파일}"]
ac_testref_filled: ["{testRef가 채워진 AC id 목록}"]
commits: ["{커밋 해시}"]
build_status: "pass|fail"
test_status: "pass|fail"
```

## 금지 사항

- Spec에 없는 기능을 구현하지 않는다.
- Contract를 수정하지 않는다.
- `cdd advance --commit`을 직접 실행하지 않는다.
- Spec과 코드가 충돌하면 코드를 수정한다. Spec을 코드에 맞추지 않는다.
- `as any`, `as unknown as T` 사용 금지.
