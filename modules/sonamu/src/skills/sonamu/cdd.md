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

도메인 규칙을 응집된 형태로 기술하고, 코드만으로는 파악하기 어려운 결정 근거를 함께 기록한다.
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

## 개발 프로세스 (6단계)

### 1. 플래닝

`contract/{domain}/*.contract.md`와 **실제 코드**를 함께 참고하여 구현 계획 초안 작성.
코드와 *.contract.md가 충돌하면 코드를 우선한다 (ground truth). *.contract.md가 오래된 것일 수 있음.
사용자가 특정 *.contract.md를 지정하면 해당 파일만, 아니면 `contract/**/*.contract.md` 전체를 읽는다.

### 2. AC 구체화

사용자와 논의하며 `pnpm cdd ac add`로 테스트 스켈레톤 생성.
`pnpm cdd ac list`로 확정된 AC 목록 확인.

**AC는 작은 단위로 쪼갠다.** Claim 하나에 5~10개의 구체적 AC가 전체를 포괄하는 2~3개보다 낫다. AC 목록이 곧 구현 체크리스트가 된다.

### 3. 계획 픽스 (Claim 구성)

사용자 확인 후 Claim을 `tmp/claims/`에 YAML로 작성.
`surface` → `implement` 순으로 분해하고 `depends_on`으로 선후관계 명시.

각 `implement` Claim은 독립적으로 완결되어야 한다: AC 작성 + 구현 + 테스트 통과까지.

### 4. 실행

**서브에이전트 모드 (기본)**: `Agent` tool로 워커 스폰.
- 적합: Claim이 독립적이거나 순차적 작업. 불확실하면 이 모드가 기본값.

**에이전트팀 모드**: `TeamCreate`로 팀 구성, 워커 간 `SendMessage`로 직접 통신.
- 적합: test-writer와 implementer가 밀결합된 코드를 다룰 때, 워커가 서로의 중간 결과물을 자주 참조할 때.

### 5. 리뷰

모든 implement Claim 완료 후 리뷰어 스폰.
`findings`가 있으면 해당 Claim의 서브에이전트에 전달하여 재스폰.

### 6. AC 검증

테스트 실행 → 전체 통과 시 완료.
실패 시 implementer에 실패 로그 전달 → 수정 → 5번부터 반복.
동일 실패 3회 반복 시 사용자에게 보고.

---

## CDD CLI (`@sonamu-kit/cdd`)

```bash
pnpm cdd <command>
```

| 커맨드 | 설명 |
|--------|------|
| `cdd init [dir]` | CDD 프로젝트 초기화 (`contract/`, `*.contract.md` 템플릿 생성) |
| `cdd ac add <파일> <테스트명>` | 테스트 파일에 빈 테스트 스켈레톤 추가. `--describe <그룹>` 옵션으로 describe 블록 지정 |
| `cdd ac list [파일]` | 테스트 파일의 describe/test 트리 출력 |
| `cdd validate` | 스키마/경로/참조 무결성 검증 |
| `cdd rules validate` | `contract/rules/*.rules.json` 포맷 검증 |

### 공통 옵션

- `--cwd <dir>`: 작업 디렉토리 지정 (기본값: 현재 디렉토리)
- `--raw` / `--json`: JSON 출력 강제 (CI 환경에서 자동 활성화)
- `-h, --help`: 도움말 표시
