# Contract-Driven Development (CDD)

## Core Principles

- Authority: **Contract > Spec > Code**. 충돌 시 상위가 우선.
- **1 Contract Feature = 1 Spec File**. Contract `features` key = Spec 파일명 (1:1).
- Contract는 사용자 소유. AI는 사용자 요청 없이 수정하지 않는다.
- 구현 중 더 나은 구조가 보여도 코드를 먼저 변경하지 않는다. Spec을 먼저 수정한다.

## Project Structure

```text
contract/
  schemas/
    *.schema.json             # Custom field schema
  main.contract.json          # 프로젝트 루트 contract
  {domain}/
    main.contract.json        # 도메인 대표 contract
    {feature-key}.spec.json   # 1 feature = 1 spec
  shared/
    {shared}.spec.json        # 공유 인프라
```

## Schema System

Schema는 Contract/Spec의 커스텀 필드 구조를 정의한다. 위치: `contract/schemas/`

```json
{
  "id": "default-spec",
  "type": "spec",
  "fields": [
    { "name": "modules", "type": "Record<string, string>", "required": true },
    { "name": "dataFlow", "type": "string[]", "required": true }
  ]
}
```

타입: `string`, `string[]`, `Record<string, string>`, `Record<string, object>`

## Document Model

### Contract (`.contract.json`)

고정 필드:
- `schema` (string): Schema ID
- `lastModified` (string, YYYY-MM-DD)
- `features` (Record<string, string>): feature key -> 설명

커스텀 필드: schema 참조.

### Spec (`.spec.json`)

고정 필드:
- `schema` (string): Schema ID
- `summary` (string): 한 줄 요약
- `description` (string[]): 상세 설명
- `acceptanceCriteria` (AcceptanceCriterion[]): 구조화된 완료 조건
- `lastModified` (string, YYYY-MM-DD)
- `status`: `"draft"` | `"specifying"` | `"implementing"` | `"validating"` | `"done"`
- `sources` (string[]): 구현/테스트 파일 (프로젝트 루트 기준)
- `contracts` (string[]): 참조 Contract (Spec 파일 기준 상대 경로)
- `dependsOnSpecs` (string[], optional): 의존 Spec (Spec 파일 기준 상대 경로)

커스텀 필드: schema 참조.

### AcceptanceCriterion

```json
{
  "id": "ac-login-jwt",
  "condition": "유효한 이메일/비밀번호 로그인 시 JWT 토큰을 반환한다",
  "testRef": {
    "target": "src/auth/login.test.ts",
    "pattern": "returns.*JWT"
  }
}
```

- `condition`: pass/fail 판정 가능한 구체적 조건. 모호한 표현 금지.
- `testRef`는 specifying 단계에서 비워둘 수 있으나, done 전이 전 반드시 채워야 한다.

## Status Workflow

```
draft → specifying → implementing → validating → done
```

인접 전이만 허용. `cdd advance <spec>` 명령으로 전이하며, 각 전이에 Layer 1(기계적) + Layer 2(의미적) gate가 적용된다.

| 전이 | Layer 1 (CLI) | Layer 2 (AI) |
|---|---|---|
| draft → specifying | contracts가 유효한 Contract 참조 | 없음 |
| specifying → implementing | summary/description 비어있지 않음, schema required 필드 비어있지 않음, AC >= 1개 | schema 필드-Contract 정합성, AC 검증 가능성, 전체 일관성 |
| implementing → validating | sources 파일 존재, AC testRef.target 지정 및 파일 존재 | sources가 schema 명세 구현, testRef가 AC condition 검증 |
| validating → done | testRef.pattern 매칭, 빌드/테스트 통과 | AC-테스트 의미적 매칭, 제약 조건 반영, 에러 시나리오 커버리지 |

`--commit` 플래그: Layer 2를 생략하고 즉시 전이 (Layer 2를 이미 통과했다는 호출자 선언).

## CLI

```bash
cdd advance <spec> [--commit]   # 다음 상태로 전진 (gate 검증 + delegate)
cdd status [file]               # 상태 대시보드 / 개별 파일 상태
cdd spec create <name>          # Spec 생성 (--schema, --domain, --contract)
```

자동화 워크플로우 프롬프트: `.agents/workflow/` 참조.
