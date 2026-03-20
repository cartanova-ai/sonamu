---
name: sonamu-skill-contribution
description: 트러블슈팅 해결 후 스킬 반영 워크플로우. 기존 스킬 매칭, 중복 판정, 포맷 표준, 사용자 승인 게이트. Use when a troubleshooting session concludes and the resolution should be captured as reusable knowledge.
---

# 트러블슈팅 → 스킬 반영 워크플로우

트러블슈팅을 해결한 뒤, 그 지식을 스킬에 반영하는 프로세스.

---

## 트리거

| 트리거 | 주체 | 예시 |
|--------|------|------|
| **명시적 요청** | 사용자 | "이거 스킬로 정리해줘", "이 해결법 기록해줘" |
| **에이전트 제안** | 에이전트 | 아래 감지 패턴에 해당하면 "이 내용을 스킬에 반영할까요?" 제안 |

### 에이전트 감지 패턴

다음 흐름이 대화에서 관찰되면 제안한다:

1. **에러/실패 → 조사 → 수정 → 성공** 패턴이 완료됨
2. 해결 과정에서 **프레임워크 내부 동작**이나 **문서화되지 않은 제약**이 밝혀짐
3. 동일 문제를 **다른 사용자/프로젝트에서도 겪을 가능성**이 있음

다음의 경우에는 제안하지 않는다:
- 단순 오타, import 누락 등 코딩 실수
- 프로젝트 고유 비즈니스 로직 버그
- 일회성 환경 문제 (특정 머신의 포트 충돌 등)

---

## 단계

```
[1] 추출 — 문제/원인/해결/소스 정리
[2] 매칭 — 기존 스킬과 대조
[3] 판정 — 어디에 넣을지 결정
[4] 드래프트 — 내용 작성
[5] 승인 — 사용자 확인
[6] 반영 — 파일 수정/생성
```

---

## [1] 추출

대화에서 다음 구조로 정리한다:

```yaml
symptom: "증상 한 줄 (에러 메시지 또는 현상)"
cause: "원인 설명"
solution: "해결 방법 (구체적 명령어/코드 포함)"
source_paths:         # 관련 소스코드 경로
  - "src/testing/dev-vitest-manager.ts"
tags:                 # 매칭에 사용할 키워드
  - "testing"
  - "devrunner"
scope: "sonamu"       # "sonamu" (공식) 또는 "local" (프로젝트 고유)
```

### scope 판정 기준

| 조건 | scope |
|------|-------|
| Sonamu 프레임워크 자체의 동작/제약 | `sonamu` |
| Sonamu CLI, config, migration 등 공통 도구 관련 | `sonamu` |
| 특정 프로젝트의 비즈니스 로직/설정 | `local` |
| 판단 어려움 | 사용자에게 물어본다 |

---

## [2] 매칭 — 기존 스킬 대조

**반드시 기존 스킬을 먼저 읽고 중복 여부를 확인한다.** 새 파일 생성은 최후의 수단.

### 매칭 우선순위

| 순위 | 방법 | 설명 |
|------|------|------|
| 1 | **소스 경로** | `source_paths`가 기존 스킬의 "소스코드" 참조와 겹치는지 확인 |
| 2 | **태그/키워드** | 각 스킬의 YAML `description`과 tags 대조 |
| 3 | **SKILL.md 작업별 테이블** | 문제 도메인이 어떤 작업 행에 해당하는지 역참조 |

### 소스 경로 → 스킬 매핑 (주요)

| 소스 경로 패턴 | 대응 스킬 |
|---------------|----------|
| `src/testing/*` | testing.md, testing-devrunner.md, naite.md, fixture-cli.md |
| `src/database/puri*` | puri.md |
| `src/database/migrator*` | migration.md |
| `src/auth/*` | auth.md, auth-plugins.md, auth-migration.md |
| `src/entity/*`, `src/syncer/*` | entity-basic.md, entity-relations.md |
| `src/vector/*` | vector.md |
| `src/ai/agents/*` | ai-agents.md |
| `src/naite/*` | naite.md |
| `src/cone/*` | cone.md |
| `src/api/*` | api.md |
| `src/template/*` | framework-change.md |
| `src/model/*` | model.md |
| `src/ssr/*` | (스킬 없음 — 새 파일 후보) |
| `sonamu.config.ts` 관련 | config.md |

이 테이블에 없는 경로면 태그/키워드 매칭으로 넘어간다.

### 매칭 실행

1. `SKILL.md`의 Skills 목록 테이블을 읽는다
2. 후보 스킬 파일(1~3개)을 읽는다
3. 해당 스킬 내에 **동일하거나 유사한 내용이 이미 있는지** 확인한다

---

## [3] 판정

| 매칭 결과 | 판정 | 설명 |
|----------|------|------|
| 기존 스킬에 **동일 내용 있음** | **SKIP** | "이미 {skill}.md에 문서화되어 있습니다" 보고 |
| 매칭 + 해당 스킬에 **트러블슈팅 섹션 있음** | **APPEND** | 기존 섹션에 항목 추가 |
| 매칭 + 해당 스킬에 **트러블슈팅 섹션 없음** | **ADD_SECTION** | 해당 스킬 끝에 트러블슈팅 섹션 신설 |
| 매칭 없음 + scope=`sonamu` | **NEW_FILE** | 새 스킬 파일 생성 (드묾) |
| 매칭 없음 + scope=`local` | **LOCAL** | `.claude/skills/local/`에 생성 |

**CRITICAL: APPEND와 ADD_SECTION이 전체의 대부분을 차지해야 한다.** NEW_FILE은 정말로 기존 스킬 어디에도 맞지 않을 때만.

---

## [4] 드래프트 — 포맷 표준

### 트러블슈팅 섹션 포맷

기존 `testing-devrunner.md`의 패턴을 표준으로 한다:

```markdown
## 트러블슈팅

### "에러 메시지 또는 증상 한 줄"
→ 원인 설명
→ 해결: 구체적 해결 방법 (명령어/코드/설정 포함)
```

여러 항목이 있으면 ### 단위로 나열한다.

### 예시 — APPEND

cone.md에 추가하는 경우:

```markdown
### "pnpm sonamu cone gen --all 실행 시 'ANTHROPIC_API_KEY is not set' 에러"
→ .env에 키가 없거나 packages/api/.env가 아닌 루트 .env에만 설정한 경우
→ 해결: `packages/api/.env`에 `ANTHROPIC_API_KEY=sk-ant-...` 추가
```

### 예시 — ADD_SECTION

puri.md 끝에 새 섹션을 추가하는 경우:

```markdown
---

## 트러블슈팅

### "leftJoin 후 nullable 필드 타입이 non-null로 추론됨"
→ Puri의 타입 추론은 join 방향을 반영하지 않음. leftJoin 결과는 런타임에 null일 수 있지만 타입에는 반영 안 됨
→ 해결: subset에서 해당 필드를 optional로 명시하거나, 사용 시 null 체크 추가
```

### 예시 — LOCAL

`.claude/skills/local/kopri-deployment.md`:

```markdown
---
name: kopri-deployment
description: KOPRI 프로젝트 배포 시 주의사항. Use when deploying KOPRI project.
---

# KOPRI 배포 트러블슈팅

## 트러블슈팅

### "Docker build 시 sharp 패키지 설치 실패"
→ Alpine 이미지에서 sharp의 native dependency가 빠짐
→ 해결: Dockerfile에 `RUN apk add --no-cache vips-dev` 추가
```

---

## [5] 승인 — 사용자 확인 게이트

에이전트가 사용자에게 보여줄 내용:

1. **판정 결과**: 어디에 넣을지 + 이유 한 줄
2. **내용 미리보기**: 추가/수정될 마크다운
3. **승인 요청**

```
판정: cone.md에 트러블슈팅 항목 추가 (APPEND)
이유: source_paths가 src/cone/에 해당, cone.md에 트러블슈팅 섹션이 이미 존재

추가 내용:
### "cone gen 시 'No entity found' 에러"
→ ...

반영할까요?
```

**승인 없이 반영하지 않는다.**

---

## [6] 반영

| 판정 | 액션 |
|------|------|
| SKIP | 없음 |
| APPEND | 해당 스킬의 트러블슈팅 섹션에 ### 항목 추가 |
| ADD_SECTION | 해당 스킬 파일 끝 (`## 참고` 바로 위 또는 파일 끝)에 `## 트러블슈팅` 섹션 + 항목 추가 |
| NEW_FILE | 새 .md 파일 생성 + **SKILL.md 두 테이블에 등록** |
| LOCAL | `.claude/skills/local/{name}.md` 생성 |

### ADD_SECTION 삽입 위치

- `## 참고` 섹션이 있으면 그 **바로 위**
- 없으면 파일 **맨 끝**

### NEW_FILE 시 필수 작업

1. `skills/sonamu/` 에 파일 생성
2. YAML frontmatter (name, description) 포함
3. `SKILL.md` "Skills 목록" 테이블에 행 추가
4. `SKILL.md` "작업별 Skill 선택" 테이블에 행 추가
5. `workflow.md`에서 관련 PHASE가 있으면 참조 스킬에 추가

---

## 참고

- **스킬 목록 및 구조**: `SKILL.md`
- **에이전트 규칙**: `AGENTS.md`
- **프로젝트별 로컬 스킬**: `.claude/skills/local/`
