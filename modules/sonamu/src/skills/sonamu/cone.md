---
name: sonamu-cone
description: Cone 메타데이터 생성 및 관리 가이드. Entity의 fixture 생성, 문서화, 검색에 활용되는 메타데이터. LLM 또는 템플릿 기반 생성 지원. Use when creating or managing cone metadata for entities.
---

# Cone 메타데이터 가이드

Cone은 Entity의 각 prop, subset, enum에 대한 메타데이터입니다.
Fixture 생성 시 LLM이 맥락에 맞는 현실적인 데이터를 생성하기 위해 `cone.note`를 참조합니다.

---

## Cone의 역할

| 용도 | 설명 |
|------|------|
| **Fixture 생성** | `cone.note` 기반으로 LLM이 맥락에 맞는 테스트 데이터 생성 |
| **Scaffolding** | cone 정보를 활용하여 model, view 템플릿 생성 |
| **문서화** | Entity 구조와 필드 의미를 설명하는 메타데이터 |

---

## Cone 필드 종류

### Entity cone

| 필드 | 타입 | 설명 |
|------|------|------|
| `note` | string | Entity의 목적, 비즈니스 컨텍스트, fixture 생성 가이드 |
| `tags` | string[] | 분류 태그 |

### Prop cone

| 필드 | 타입 | 설명 |
|------|------|------|
| `note` | string | **최우선.** 필드의 비즈니스 의미, 구체적 예시, 값 범위, 형식 제약. LLM이 읽고 데이터를 생성하는 입력 |
| `fixtureGenerator` | string | **Fallback.** faker.js 표현식. API key 없을 때의 대체 수단 |
| `fixtureDefault` | any | 고정 기본값 |
| `fixtureStrategy` | string | `"sequence"` — DB 시퀀스로 id 자동 생성 시 사용 |
| `dataSource` | object | relation prop의 참조 데이터 조회 전략 |

### Subset cone

| 필드 | 타입 | 설명 |
|------|------|------|
| `note` | string | 서브셋의 용도, 포함 필드, 사용 시점 |

### Enum cone

| 필드 | 타입 | 설명 |
|------|------|------|
| `note` | string | enum의 의미와 사용 맥락 |
| `values` | object | 각 enum 값에 대한 `{ note: string }` |

---

## Fixture 생성 시 우선순위

`--use-llm` 플래그 사용 시:

```
1. override 값 (generate() 호출 시 전달)
2. cone.note + LLM  ← API key 있을 때 최우선
3. fixtureGenerator (faker.js 표현식)  ← LLM 실패 시 fallback
4. fixtureDefault (고정 기본값)
5. 타입별 기본값 (자동 생성)
```

**CRITICAL: `cone.note`가 비어있으면 LLM이 맥락 없이 데이터를 생성하므로 품질이 떨어진다. Fixture 생성 전에 반드시 cone.note 존재 여부를 확인한다.**

---

## CLI 명령어

### 1. cone gen — LLM으로 cone 생성 (권장)

프로젝트의 요구사항(`.claude/skills/project/*.md`)과 Entity 구조를 LLM에게 전달하여 맥락에 맞는 cone을 생성합니다.

**ANTHROPIC_API_KEY 필요** (`.env` 또는 `sonamu.config.ts`의 `secret.anthropic_api_key`)

```bash
# 단일 Entity
pnpm sonamu cone gen Post

# 전체 Entity
pnpm sonamu cone gen --all

# 기존 cone 전체 재생성 (덮어쓰기)
pnpm sonamu cone gen Post --regenerate

# 전체 Entity 재생성
pnpm sonamu cone gen --all --regenerate

# 로케일 지정
pnpm sonamu cone gen Post --locale en
```

#### 옵션

| 옵션 | 설명 |
|------|------|
| `--all` | 모든 Entity의 cone 생성 |
| `--regenerate` | 기존 cone을 덮어씀 (기본: note가 없는 것만 생성) |
| `--locale <ko\|en\|ja>` | 생성 언어 (기본: `sonamu.config.ts`의 `i18n.defaultLocale` 또는 `ko`) |

#### 동작 방식

- **기본 모드**: `onlyEmpty` — cone.note가 비어있는 prop만 새로 생성, 기존 note는 보존
- **`--regenerate` 모드**: 전체 재생성, 기존 cone 덮어쓰기

#### LLM이 참조하는 정보

1. Entity JSON 구조 (props, subsets, enums, relations)
2. 프로젝트 스킬 파일 (`.claude/skills/project/requirements.md`, `business-logic.md` 등)
3. 기존 cone 메타데이터 (보존 모드 시)

### 2. stub entity — Entity 생성 시 자동 cone 생성

```bash
# 기본: 템플릿 cone 자동 생성 (API key 불필요)
pnpm sonamu stub entity Post

# LLM으로 cone 생성
pnpm sonamu stub entity Post --ai

# cone 생성 스킵
pnpm sonamu stub entity Post --no-cones
```

#### 템플릿 cone vs LLM cone

| 항목 | 템플릿 cone | LLM cone |
|------|------------|----------|
| API key | 불필요 | 필수 |
| 품질 | faker-mappings 기반 기본값 | 프로젝트 맥락 반영 |
| 속도 | 즉시 | 수 초 소요 |
| 업그레이드 | `cone gen`으로 LLM 업그레이드 가능 | — |

---

## 주요 cone 패턴

### 일반 필드

```json
{
  "name": "title",
  "type": "string",
  "cone": {
    "note": "게시글 제목. 20~50자 내외의 한국어 제목",
    "fixtureGenerator": "faker.lorem.sentence()"
  }
}
```

### relation 필드 (BelongsToOne)

```json
{
  "name": "author",
  "type": "relation",
  "with": "User",
  "relationType": "BelongsToOne",
  "cone": {
    "note": "글 작성자. 기존 User 데이터를 참조",
    "dataSource": {
      "strategy": "recent",
      "config": { "limit": 5 }
    }
  }
}
```

### 상관 필드 (name + name_en 등)

상관 필드에는 `fixtureGenerator`를 설정하지 않는다. LLM이 row 단위로 한 번에 생성하여 일관성을 보장한다.

```json
{
  "name": "name",
  "cone": { "note": "한국어 이름 (예: 김민수)" }
},
{
  "name": "name_en",
  "cone": { "note": "name의 로마자 표기 (예: Kim Minsu). name과 동일 인물이어야 함" }
}
```

### DB 시퀀스 PK

```json
{
  "name": "id",
  "type": "string",
  "cone": {
    "fixtureStrategy": "sequence",
    "note": "DB 시퀀스가 자동 할당하는 순차 번호 (문자열 저장)"
  }
}
```

### enum 필드

```json
{
  "name": "status",
  "type": "enum",
  "cone": {
    "note": "게시글 상태. draft/published/archived 중 선택"
  }
}
```

---

## dataSource 전략

relation prop에서 참조 데이터 조회 방식을 지정합니다.

| 전략 | 설명 |
|------|------|
| `recent` | 최근 데이터 (created_at 기준) |
| `sample` | 균등 샘플링 |
| `random` | 랜덤 샘플링 |
| `ids` | 특정 ID 지정 |
| `query` | 사용자 정의 쿼리 |
| `file` | 파일에서 로드 |

```json
"dataSource": {
  "strategy": "recent",
  "config": { "limit": 5 }
}
```

---

## 실전 팁

### cone.note 작성 요령

**note는 fixture 데이터 생성의 최우선 입력이다.** LLM은 note를 읽고 맥락에 맞는 데이터를 생성한다. 따라서 구체적이고 도메인에 특화된 내용을 담아야 한다.

- **구체적으로**: "문자열" 보다 "010-XXXX-XXXX 형식의 한국 전화번호"
- **비즈니스 맥락 포함**: "직원의 연봉. 3000만원~1.5억원 범위"
- **구체적 예시 포함**: "예: AI 기반 신약 개발 플랫폼 구축, 친환경 에너지 저장 시스템 개발"
- **값 범위 명시**: "5천만원(50,000)에서 50억원(5,000,000) 사이"
- **상관 필드 명시**: "name_en은 name의 로마자 표기이어야 함"
- **길이/형식 제한**: "20~100자 한국어 자기소개"

### LLM cone 생성 품질 높이기

1. `.claude/skills/project/requirements.md`에 프로젝트 요구사항을 상세히 기록
2. `business-logic.md`에 비즈니스 로직을 기록
3. `cone gen` 실행 — LLM이 이 파일들을 컨텍스트로 사용

### cone 재생성이 필요한 시점

- Entity에 새 prop 추가 후
- 비즈니스 요구사항 변경 후
- fixture 데이터 품질이 떨어질 때
- `--regenerate` 없이 실행하면 기존 note는 보존되고 빈 것만 채워짐

---

## 참고 자료

- **Fixture CLI**: `fixture-cli.md` — fixture gen/fetch/explore 명령어
- **Testing**: `testing.md` — 테스트 작성 및 fixture 활용
- **소스코드**: `modules/sonamu/src/cone/cone-generator.ts`
- **템플릿 cone**: `modules/sonamu/src/entity/entity-template-cone.ts`
