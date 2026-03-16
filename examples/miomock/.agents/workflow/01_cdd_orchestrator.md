# CDD Orchestrator Protocol

메인 에이전트가 CDD 오케스트레이터 역할을 수행할 때 따르는 프로토콜.

## 선행 조건

1. `00_cdd_contract.md`를 읽는다.
2. `../../api/contract/cdd.md`를 읽는다.
3. 대상 spec과 현재 상태를 확인한다: `cdd status <spec>`

## 오케스트레이션 흐름

```
1. 대상 식별
   ├── 사용자가 spec을 지정한 경우 → 해당 spec 사용
   └── 사용자가 기능을 설명한 경우 → cdd spec list / cdd tree로 대상 탐색
       ├── 기존 spec 존재 → 해당 spec 사용
       └── 기존 spec 없음 → Phase 1(draft)부터 시작

2. 현재 상태 확인: cdd status <spec>

3. 현재 상태에 해당하는 Phase 실행
   ├── draft        → Phase 1 (서브에이전트: phases/01_draft.md)
   ├── specifying   → Phase 2 (서브에이전트: phases/02_specify.md)
   ├── implementing → Phase 3 (서브에이전트: phases/03_implement.md)
   ├── validating   → Phase 4 (서브에이전트: phases/04_validate.md)
   └── done         → 완료. 사용자에게 보고.

4. Phase 완료 후 → Gate 검증 루프 (아래 참조)

5. Gate 통과 → 다음 Phase로 진행 (3번으로 돌아감)

6. 모든 Phase 완료 → 사용자에게 최종 보고
```

## Gate 검증 루프

각 Phase 완료 후 상태 전이를 위한 검증 루프를 실행한다.

```
Loop:
  1. cdd advance <spec> 실행 (--commit 없이)
  2. exit 1 (Layer 1 실패)?
     → 실패 사유 분석
     → 서브에이전트 재스폰하여 수정
     → Loop 처음으로
  3. exit 0 + delegate 모드 출력?
     → references의 파일들을 읽고 checks 항목에 따라 Layer 2 검증 수행
     → findings에 error 존재?
       → 서브에이전트 재스폰하여 수정 (findings 전달)
       → Loop 처음으로
     → pass?
       → cdd advance <spec> --commit 실행
       → 전이 완료
  4. exit 0 + Layer 2 결과 직접 출력? (독립 실행 모드)
     → 결과의 pass/findings 확인
     → 위와 동일한 분기
```

## 서브에이전트 스폰 규칙

### 스폰 시 전달할 정보

모든 서브에이전트 스폰 시 아래를 포함한다:

```yaml
global_objective: "CDD 워크플로우에 따라 {spec명} 기능을 개발한다"
phase_objective: "{현재 Phase의 목표}"
spec_path: "{spec 파일 경로}"
contract_paths: ["{참조 contract 경로들}"]
schema_path: "{schema 파일 경로}"
cdd_policy: "../../api/contract/cdd.md를 반드시 읽을 것"
shared_contract: "../workflow/00_cdd_contract.md를 반드시 읽을 것"
phase_prompt: "{해당 Phase 프롬프트 경로}"
```

### 수정 재스폰 시 추가 정보

Gate 검증 실패로 서브에이전트를 재스폰할 때는 위에 더해:

```yaml
findings: [{ field, severity, message }]
previous_attempt: "이전 시도에서 아래 문제가 발견되었다. 수정하라."
```

### Phase별 서브에이전트 매핑

| Phase | 프롬프트 | 역할 | 모델 |
|---|---|---|---|
| 1. draft | phases/01_draft.md | implementation-primary | opus |
| 2. specifying | phases/02_specify.md | implementation-primary | opus |
| 3. implementing | phases/03_implement.md | implementation-primary | opus |
| 4. validating | phases/04_validate.md | reviewer | sonnet |
| 5. done | phases/05_close.md | reviewer | sonnet |

## Layer 2 검증 수행 방법

오케스트레이터가 delegate 출력을 받으면 직접 Layer 2를 수행한다:

1. `references`의 모든 경로 파일을 읽는다.
2. `checks`의 각 항목에 따라 의미적 검증을 수행한다.
3. 결과를 `{ pass: boolean, findings: [...] }` 형식으로 판단한다.
4. `pass: true`이면 `cdd advance <spec> --commit`을 실행한다.
5. `pass: false`이면 findings를 서브에이전트에 전달하여 수정을 요청한다.

## 중단 조건

- 같은 Phase에서 수정 루프가 3회 이상 반복되면 사용자에게 보고하고 판단을 요청한다.
- Contract 수정이 필요한 경우 사용자에게 보고하고 대기한다.
- 빌드/테스트 실패가 반복되면 사용자에게 보고한다.

## 완료 보고

모든 Phase가 완료되면 사용자에게 아래를 보고한다:

```yaml
spec: "{spec 경로}"
final_status: "done"
phases_completed: ["draft", "specifying", "implementing", "validating", "done"]
commits: ["{커밋 해시 목록}"]
files_changed: ["{변경 파일 목록}"]
tests_passed: true|false
known_risks: ["{잔여 리스크}"]
```
