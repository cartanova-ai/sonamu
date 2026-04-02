---
name: sonamu-cdd
description: AC + Claim 기반 개발 가이드. *.contract.md(도메인 규칙), Rules, AC(테스트명), Claim(작업 지시서). 기능 구현 전 반드시 읽을 것. Use when planning or implementing features.
---

# AC + Claim 기반 개발

Spec 문서 없이 **3종의 영구 문서 + 일회성 Claim**으로 개발한다.

**Ground truth는 코드다.** `*.contract.md`는 코드 결정의 근거를 기록하는 문서이지 선행 정의서가 아니다.

## 두 가지 개발 경로

| 경로 | 순서 | 적용 상황 |
|------|------|----------|
| **신규 개발** | contract 작성 → Claim → `(AC → implement) × N` | 새 기능, 새 도메인 |
| **코드 변경** | code 수정 → Claim 등록 → contract 확인/갱신 | 기존 기능 수정, 버그 픽스 |

**Claim은 유닛 단위다.** Claim 안에서 AC 작성과 구현은 교차 반복된다.

```
Claim C-001
  ├─ AC: "이메일 중복 시 409를 반환한다"  → 구현
  ├─ AC: "비밀번호가 8자 미만이면 400을 반환한다" → 구현
  └─ AC: "성공 시 생성된 user_id를 반환한다" → 구현
```

AC 하나를 작성하는 행위는 그 자체로 설계 행위다 — 어떤 입력/출력을 기대하는지 명확히 함으로써 구현 방향을 먼저 확정한다. AC가 작고 구체적일수록 구현이 명확해진다.

코드 변경 경로에서 `*.contract.md`를 갱신할 때는 변경 이유(근거)를 함께 기록한다.

---

## 영구 문서 (3종)

| 문서 | 위치 | 내용 | 갱신 시점 |
|------|------|------|----------|
| 비즈니스 로직 | `contract/**/*.contract.md` | 도메인 규칙 + 결정 근거 | 정책 변경 시 |
| Rules | `contract/rules/*.rules.json` | 코드 컨벤션, UI/API 규칙 | 컨벤션 변경 시 |
| AC | `*.test.ts` describe/test 이름 | 수락 기준 — 코드에 직접 존재 | 기능 추가/변경 시 |

### 비즈니스 로직 (`*.contract.md`)

비즈니스 로직은 코드에 전부 존재한다. 하지만 코드에서는 여러 파일에 분산되어 있고 구현 디테일과 섞여 있어서 도메인 규칙만 골라 읽기 어렵다. `*.contract.md`의 역할은:

> 비즈니스 로직을 도메인 수준에서 응집된 형태로 기술하고, 코드만으로는 파악하기 어려운 결정 근거를 함께 기록한다.

**들어가야 하는 것:**
- 도메인 규칙과 제약 ("환불은 결제 후 7일 이내만 가능")
- 결정 근거 ("PG사 정책 때문")
- 여러 모듈에 걸친 도메인 워크플로우 ("주문 상태: 대기 → 확인 → 배송 → 완료")
- 우선순위/순서 규칙 ("할인: 멤버십 등급 > 쿠폰 > 프로모션")
- 도메인 용어 정의, 역할 구분
- Edge case와 의도된 처리 방식

**들어가지 않는 것:**
- 구현 디테일 (파일 경로, 함수명, 클래스 구조)
- API 엔드포인트나 데이터 스키마
- UI 레이아웃이나 컴포넌트 구조
- 코드 컨벤션 (이건 `*.rules.json`에)

처음부터 완벽할 필요 없다. 사용자와 대화하면서 점진적으로 정리한다.

```markdown
# {도메인} 비즈니스 로직

## 규칙

- 환불은 결제 후 7일 이내만 가능 [근거: PG사 정책]
- 주문 상태 전환: 대기 → 확인 → 배송 → 완료
- 할인 적용 순서: 멤버십 등급 > 쿠폰 > 프로모션

## 워크플로우

1. ...
2. ...
```

### Contract 유지 정책

플래닝 중 구현 계획이 기존 contract와 충돌하거나 새로운 도메인 규칙이 드러나면, **구현을 시작하기 전에** 사용자에게 contract 수정을 먼저 제안한다. 오케스트레이터는 contract 업데이트가 필요한 상황을 조용히 넘기지 않는다.

### AC = 테스트 이름

AC를 별도 문서로 관리하지 않는다. 테스트 파일의 describe/test 이름이 AC 그 자체다.

**AC 작성 원칙:**
- **작고 구체적으로**: 하나의 AC = 하나의 행동/결과. 모호한 AC는 구현 범위를 불명확하게 만든다.
- **입력과 기대 결과를 이름에 담는다**: `"이메일 중복 시 409를 반환한다"` > `"에러를 반환한다"`
- **AC 작성이 곧 설계**: AC를 먼저 작성하면 구현 전에 인터페이스와 경계 조건이 확정된다.

```typescript
describe('회원가입', () => {
  // 좋은 AC: 조건과 결과가 명확
  test('이메일 중복 시 409를 반환한다', () => { /* TODO */ });
  test('비밀번호가 8자 미만이면 400을 반환한다', () => { /* TODO */ });
  test('성공 시 생성된 user_id를 반환한다', () => { /* TODO */ });

  // 나쁜 AC: 범위가 너무 넓음
  // test('회원가입이 동작한다', () => { ... });
});
```

CLI로 관리:

```bash
# AC 추가 (빈 테스트 스켈레톤 생성)
pnpm cdd ac add <파일> [--describe <그룹>] <테스트명>

# AC 목록 조회
pnpm cdd ac list [파일]
```

### Rules 파일

```json
{
  "description": "Rule-set의 범위와 목적 설명",
  "rules": [
    {
      "id": "readonly-money-display-uses-numf",
      "when": "금액을 읽기 전용 텍스트나 테이블 셀로 표시할 때",
      "instruction": "numF()를 적용합니다.",
      "examples": ["numF(row.totalAmount)", "numF(summary.budget)"]
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `description` | rule-set의 범위와 의도 |
| `rules[].id` | 안정적인 식별자 |
| `rules[].when` | 규칙의 적용 조건 |
| `rules[].instruction` | 따라야 할 구체적 지침 |
| `rules[].examples` | 선택적 코드/사용 예시 |

`contract/rules/`에는 `*.known-issues.json`도 선택적으로 둘 수 있다. 알려진 버그, 프레임워크 제약, 임시 우회법 등 "지금 당장은 고칠 수 없지만 알고 있어야 하는 것"을 기록한다. Claim 실행 시 `rules` 필드에 포함하면 서브에이전트가 같은 실수를 반복하지 않는다.

```json
{
  "description": "알려진 이슈 및 우회법",
  "issues": [
    {
      "id": "upload-multipart-form-required",
      "symptom": "@upload 메서드 호출 시 Content-Type: application/json으로 보내면 파일이 누락됨",
      "workaround": "multipart/form-data로 전송해야 함. api.md @upload 패턴 참조"
    }
  ]
}
```

---

## 플래닝 아티팩트 (일회성)

플래너가 생성하는 일회성 산출물. Claim을 만들기 전 단계다.

| 아티팩트 | 역할 | 생성자 | 소비자 |
|---------|------|--------|--------|
| `plan_document` | contract + 코드 기반 단계별 계획, 검증 매트릭스, 리스크 노트 | 플래너 | 오케스트레이터 + 사용자 |
| `claim_blueprint` | Claim YAML의 기계 가독형 전구체 (scope/의존성 메타데이터 포함) | 플래너 | 오케스트레이터 |
| `execution_graph` | 실행 순서 및 리뷰 흐름 | 플래너 | 오케스트레이터 |

**플래너 규칙:**
- 코드나 테스트를 직접 편집하지 않는다
- `tmp/claims/*.yaml`을 직접 생성하지 않는다 — blueprint만 반환한다
- contract와 코드를 비교해 contract 업데이트가 필요하면 `plan_document`에 명시한다

**실행 그래프 기본 형태:**

```
surface → surface_review → test + implement(병렬) → 각 stage_review → integration_review → ac_verification
```

---

## 일회성 문서: Claim

서브에이전트에 전달하는 작업 지시서. `tmp/claims/`에 YAML로 생성, 완료 후 폐기.

```yaml
id: "C-001"
type: "surface|test|implement"
objective: "한 줄 목표"
context: |
  objective만으로 부족한 배경.
  *.contract.md에서 발췌하거나 플래닝에서 생성.
scope:
  read: ["참고할 파일 경로"]
  write: ["수정/생성할 파일 경로"]
ac_targets:
  - "파일경로::describe그룹::테스트명"
rules:
  - "contract/rules/api.rules.json"
required_skills:
  - "modules/sonamu/src/skills/sonamu/migration.md"
required_cli_commands:
  - "pnpm sonamu sync"
  - "pnpm sonamu scaffold model User"
expected_generated_targets:
  - "src/application/user/user.model.ts"
depends_on: []
findings: []
```

| 필드 | 역할 |
|------|------|
| `id` | 추적용 식별자 |
| `type` | 서브에이전트 종류 결정 |
| `objective` | 스코프 앵커 — 서브에이전트가 벗어나지 않는 기준 |
| `context` | 배경 정보. *.contract.md에서 발췌하거나 플래닝에서 생성 |
| `scope.read` | 컨텍스트 로딩 범위 |
| `scope.write` | 소유권 경계 — 이 밖의 파일 수정 금지 |
| `ac_targets` | 만족시킬 AC (`파일::describe::테스트명` 형식) |
| `rules` | 적용할 규칙 파일 경로 |
| `required_skills` | Claim 수행에 필요한 canonical skill 파일 경로. 워커가 작업 전에 반드시 읽는다 |
| `required_cli_commands` | 마이그레이션/scaffolding/sync 등 필수 CLI 명령어 |
| `expected_generated_targets` | 이 Claim이 완료된 후 downstream에 준비되어야 할 파일/모듈 |
| `depends_on` | 선행 Claim ID |
| `findings` | 리뷰 실패 시 재시도 컨텍스트 |

### type별 역할

| type | 역할 | 편집 범위 | 금지 |
|------|------|----------|------|
| `surface` | 공유 타입/인터페이스/마이그레이션 등 선행 작업 | 공유 타입, 마이그레이션 | 비즈니스 로직, 테스트 |
| `test` | AC별 테스트 구현 | 테스트 파일, 테스트 지원 파일 | 프로덕션 코드 |
| `implement` | AC 작성과 프로덕션 코드를 교차 반복 구현 | 테스트 파일 + 프로덕션 코드 | — |

`implement` Claim은 TDD 사이클을 따른다: AC 하나 작성 → 구현 → 테스트 통과 확인 → 다음 AC. AC와 구현이 함께 있는 것이 기본이다. `test` Claim은 구현 없이 테스트 스켈레톤만 필요할 때(선행 설계, 스펙 확정)에만 사용한다.

---

## 개발 프로세스 (7단계)

### 1. 플래닝 (플래너에게 위임)

플래너가 `contract/**/*.contract.md` + **실제 코드** + 사용자 요청을 바탕으로 계획 초안 작성.
코드와 *.contract.md가 충돌하면 코드를 우선한다 (ground truth).

플래너 반환물: `plan_document`, `claim_blueprint`, `execution_graph`

플랜이 contract와 충돌하거나 새 도메인 규칙이 드러나면, 구현 전에 사용자에게 **contract 업데이트를 먼저 제안**한다. 조용히 넘기지 않는다.

### 2. AC 구체화

사용자와 논의하며 `pnpm cdd ac add`로 테스트 스켈레톤 생성.
`pnpm cdd ac list`로 확정된 AC 목록 확인.

**AC는 작은 단위로 쪼갠다.** Claim 하나에 5~10개의 구체적 AC가 전체를 포괄하는 2~3개보다 낫다. AC 목록이 곧 구현 체크리스트가 된다.

일부 기능(DB 마이그레이션, UI-only 작업 등)은 의도적으로 AC 없이 진행할 수 있다.

### 3. 계획 픽스 (Claim 구성)

사용자 확인 후 오케스트레이터가 `claim_blueprint`를 `tmp/claims/*.yaml`로 변환.
`surface` → `(test + implement 병렬)` 순으로 분해하고 `depends_on`으로 선후관계 명시.

`surface` Claim이 반드시 먼저 나온다: 공유 타입, 마이그레이션, sync, scaffolding 등 downstream 선행 조건 전체.

### 4. 실행

**서브에이전트 모드**: `Agent` tool로 워커 온디맨드 스폰.
- 불확실하면 이 모드가 기본값.

**에이전트팀 모드** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 환경변수 설정 시): `TeamCreate`로 팀 생성. 워커는 세션 내내 유지되고 재사용됨.
- 적합: test-writer와 implementer가 공유 인터페이스를 자주 참조할 때.

| 워커 | 역할 |
|------|------|
| `cdd-planner` | 플래닝 아티팩트 생성 |
| `cdd-surface-scaffolder` | 타입/마이그레이션/scaffolding 선행작업 |
| `cdd-test-writer` | 테스트 구현 (skeleton-only 시) |
| `cdd-implementer` | AC + 프로덕션 코드 교차 구현 (TDD) |
| `cdd-reviewer` | 단계별/통합 리뷰 |

### 5. 단계별 리뷰

**순서는 고정이다:**
1. surface 완료 → surface 리뷰
2. surface 리뷰 통과 후 → test + implement 병렬 실행
3. 각 stage 완료 → 해당 stage 리뷰 (컨텍스트 격리)
4. 모든 stage 리뷰 통과 → 통합 리뷰 (전체 변경 파일 대상)

`findings`가 있으면 해당 Claim 워커에 전달 → 수정 → 해당 stage부터 재리뷰.

**fast-path**: 30줄 이하, docs/formatting/config만 변경, 모든 게이트 통과 → 리뷰어 스폰 생략.

### 6. AC 검증

테스트 실행 → 전체 통과 시 완료.
실패 시 해당 워커에 실패 로그 전달 → 수정 → 5번부터 반복.
동일 실패 3회 반복 시 사용자에게 보고.

### 7. 사용자 핸드오프

아래 조건이 모두 충족되면 전달:
1. 단위 리뷰 종료
2. 통합 리뷰 종료
3. 미해결 항목 0건

---

## CDD CLI (`@sonamu-kit/cdd`)

```bash
pnpm cdd <command>
```

| 커맨드 | 설명 |
|--------|------|
| `cdd init [dir]` | CDD 프로젝트 초기화 (`contract/`, `*.contract.md` 템플릿 생성) |
| `cdd ac add <파일> <테스트명>` | 테스트 파일에 빈 테스트 스켈레톤 추가. `--describe <그룹>` 옵션으로 describe 블록 지정 |
| `cdd ac list [파일]` | 테스트 파일의 describe/test 트리 출력. `test()`, `it()`, `testAs()` 패턴 모두 파싱 |
| `cdd validate` | 스키마/경로/참조 무결성 검증 |
| `cdd rules validate` | `contract/rules/*.rules.json` 포맷 검증 |

### 공통 옵션

- `--cwd <dir>`: 작업 디렉토리 지정 (기본값: 현재 디렉토리)
- `--raw` / `--json`: JSON 출력 강제 (CI 환경에서 자동 활성화)
- `-h, --help`: 도움말 표시
