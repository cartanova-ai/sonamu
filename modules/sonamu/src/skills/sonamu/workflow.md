---
name: sonamu-workflow
description: Sonamu 전체 개발 워크플로우. 프로젝트 생성부터 Frontend 개발까지 단계별 가이드. dev 서버 상시 실행 전제, pnpm sonamu test 기본 사용. Use when starting a new feature or system from scratch.
---

# Sonamu 전체 개발 워크플로우

사용자가 시스템 구축을 요청하면 다음 워크플로우에 따라 진행한다.

**CRITICAL: 각 PHASE 내의 Step은 반드시 순서대로 진행한다. Step을 건너뛰거나 순서를 바꾸지 않는다.** 단, 사용자가 특정 작업부터 지시하면 해당 PHASE부터 시작한다 (SKILL.md "시작 지점 판단" 참조).

**CRITICAL: dev 서버(`pnpm dev`)는 항상 실행 중이어야 한다.** 실행 중이 아니면 확인 후 올린 뒤 작업을 진행한다.

**CRITICAL: 테스트는 `pnpm sonamu test`를 사용한다.** `pnpm test`는 CI 또는 dev 서버 없이 실행해야 할 때만 사용한다.

**CRITICAL: 모든 단계는 사용자에게 결과를 보고하고 확인을 받은 후 다음 단계로 넘어간다.** 자체 판단으로 사용자 확인 없이 여러 단계를 연속 진행하지 않는다.

**CRITICAL: 요구사항이 이미 제공된 경우에도 설계 및 비즈니스 로직은 반드시 사용자와 함께 확인한다.**
요구사항 명세는 출발점일 뿐이다. Entity 구조, 관계, 필드, 상태 전이, 권한 규칙 등은 항상 사용자에게 질문하고 승인을 받아야 한다. 추측하지 말고 확인한다.

---

## PHASE 0: 프로젝트 생성 및 초기 설정

**참조 스킬:** project-init.md, create-sonamu.md, auth.md, auth-plugins.md

### 1. 요구사항 수집 및 프로젝트 생성

1. 사용자가 요구사항 prompt를 입력
2. Sonamu skills를 읽고 `pnpm create sonamu [프로젝트명] --yes`로 프로젝트 생성
3. `pnpm install` 실행

### 2. 요구사항 기록 및 비즈니스 로직 파악

**CRITICAL: 이 단계(Step 4~6)를 완료하기 전에 auth generate나 인프라 기동으로 넘어가지 않는다.**

4. 사용자가 입력한 prompt를 프로젝트 루트의 `.claude/skills/project/requirements.md`에 기록
5. 비즈니스 로직 파악 후 **작은 단위로** 사용자에게 확인받기
   - 한 번에 전체를 확인하지 말고 도메인별로 나누어 확인
   - "이 부분이 맞나요?" 식으로 구체적으로 질문
6. 비즈니스 로직 최종 승인 완료 시 `.claude/skills/project/business-logic.md`에 기록

### 3. 설정 확인

**CRITICAL: 설정 확인 결과를 사용자에게 보고하고 승인을 받은 후 다음 단계로 넘어간다. 자체 판단으로 건너뛰지 않는다.**

7. `sonamu.config.ts`에서 `test.devRunner.enabled: true`인지 확인. 아니면 true로 설정
8. `.env` 파일 확인:
   - DB 연결 설정 확인
   - `ANTHROPIC_API_KEY` 설정 여부 확인 → 없으면 사용자에게 직접 저장하도록 안내 (Claude Code가 직접 키를 입력하지 않음)
9. 확인 결과를 사용자에게 보고하고 승인 대기

### 4. 인프라 기동

10. Docker 띄우기 (`pnpm docker:up` 등)
11. 빌드 시도 — 최초에는 빌드가 안 될 수도 있는데, 바로 모든 것을 수정하려 하지 말고 dev 서버 먼저 띄워보기
12. dev 서버 띄우기 (`pnpm dev`)

### 5. Auth 엔티티 생성

**플러그인이 필요한 경우 `auth-plugins.md`를 참조하여 `--plugins` 옵션을 사용한다.**

13. `pnpm sonamu auth generate`로 better-auth 관련 엔티티 생성
14. User 엔티티의 prop 중 `id`의 cone에 `"fixtureStrategy": "sequence"` 추가
    - **이 설정은 이후에도 변경되어서는 안 됨**
15. auth generate로 생성된 엔티티(User, Session, Account, Verification) 확인 후 Sonamu UI에서 사용자에게 확인 요청
16. 사용자 확인 후 migration 진행
17. Docker로 띄운 DB에서 테이블이 생성되었는지 확인

### 6. Users 테이블 시퀀스 설정

**CRITICAL: Auth 엔티티 migration 완료 직후 반드시 실행한다. 이 단계를 건너뛰면 이후 테스트와 fixture 생성이 실패한다.**

18. `CREATE SEQUENCE users_id_seq;` 실행
19. `ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq')::text;` 실행

**완료 기준:**

- [ ] 프로젝트 생성 완료
- [ ] requirements.md, business-logic.md 기록 완료
- [ ] sonamu.config.ts, .env 설정 확인 및 사용자 승인 완료
- [ ] Docker, dev 서버 실행 중
- [ ] Auth 엔티티 생성 및 migration 완료
- [ ] Users 테이블 시퀀스 설정 완료

---

## PHASE 0.5: Contract 및 Spec 작성

**참조 스킬:** cdd.md

**CRITICAL: 이 PHASE가 완료되기 전에 엔티티 설계(PHASE 1)를 시작하지 않는다.**

### 7. main.contract.json 작성

20. `packages/api/contract/main.contract.json` 생성
    - `requirements.md`, `business-logic.md` 기반으로 작성
    - 전체 프로젝트 Overview, 하위 도메인 목록, Domain Glossary, User Roles, Business Rules, Edge Cases 포함
    - `content`는 Markdown 한 줄씩 `string[]`로 작성
21. 사용자에게 보고 후 승인 대기

### 8. 도메인별 contract 작성

22. `business-logic.md`에서 도메인을 식별하고 도메인 목록을 사용자에게 확인받기
23. 도메인별로 `packages/api/contract/{domain}/main.contract.json` 작성
    - 도메인 폴더명은 영문 소문자 (예: `auth`, `organization`, `research`)
    - 각 도메인 contract 작성 후 사용자 확인받기 (도메인별로 하나씩)
    - Features/Capabilities 섹션을 상세하게 작성한다 (이후 spec의 1:1 기반이 됨)

### 9. Spec 작성

**CRITICAL: 1 Feature = 1 Spec 파일. 도메인 contract의 Features/Capabilities에 정의된 기능 하나당 spec 파일 하나.**

24. 각 도메인의 Features/Capabilities를 기반으로 spec 파일 목록 작성 후 사용자 확인
25. 도메인별로 spec 파일 작성
    - spec 파일은 해당 도메인 폴더에 위치
    - 파일명은 feature key (예: `signin.spec.json`)
    - `status: "draft"`로 시작
26. 전체 spec 작성 완료 후 사용자에게 검토 요청
    - 사용자 검토 및 수정 반영
    - 모든 spec 검토 완료 후에만 다음 PHASE로 진행

**완료 기준:**

- [ ] `packages/api/contract/main.contract.json` 작성 및 사용자 승인
- [ ] 모든 도메인 contract 작성 및 사용자 승인
- [ ] 모든 domain spec 파일 작성 완료
- [ ] 사용자 spec 검토 완료

---

## PHASE 1: 엔티티 설계

**참조 스킬:** entity-basic.md, entity-relations.md

**전제 조건:** PHASE 0.5 완료 (모든 spec 사용자 검토 완료)

### 10. 엔티티 설계

20. 사용자 요구사항에 맞는 엔티티 설계
    - 설계하면서 사용자에게 비즈니스 로직에 맞는지 **지속적으로 디테일하게** 확인받을 것
    - 관계 유형(BelongsToOne, HasMany, ManyToMany) 결정 시 반드시 사용자 확인
    - 필드 구성, enum 값, nullable 여부 등 세부 사항도 확인
21. 최종 완료된 설계안을 `.claude/skills/project/architecture.md`에 기록

**완료 기준:**

- [ ] 모든 엔티티 설계 완료 및 사용자 승인
- [ ] architecture.md 기록 완료

---

## PHASE 2: 엔티티 생성 및 마이그레이션

**참조 스킬:** entity-basic.md, entity-validation-checklist.md, migration.md

### 8. 엔티티 생성

22. 설계에 따라 **batch로** entity.json 생성
23. biome check, type check
24. 문제 없이 빌드되는지 확인

### 9. 마이그레이션

25. 사용자에게 Sonamu UI와 CLI 중 어떤 방식으로 migration을 진행할지 확인 후 실행
26. 실제 테이블이 생성되었는지 확인

### 10. Cone 및 Scaffolding

**참조 스킬:** cone.md

**CRITICAL: Scaffolding 전에 반드시 Cone 생성을 먼저 실행한다. Cone이 없으면 fixture 생성이 실패한다.**

27. Cone 생성 (`pnpm sonamu cone gen --all`)
    - LLM으로 생성한다. 요구사항 기반으로 컨텍스트에 맞는 cone을 생성하기 위해 LLM이 필요하다.
    - `.env`에 `ANTHROPIC_API_KEY`가 설정되어 있는지 확인. 없으면 사용자에게 안내한다.
    - 생성된 cone을 사용자에게 확인받는다.
    - 상세 사용법은 cone.md 참조
28. Scaffolding 실행 — 다음 **모든 항목을 scaffolding** 해야 함:
    - model
    - model_test
    - view_list
    - view_search_input
    - view_form
    - Sonamu UI에서 사용자가 실행하거나 Claude Code가 CLI로 실행
29. 오류 없이 생성되는지 확인
30. biome check, type check
31. 오류 없이 빌드되는지 확인
32. `pnpm dump`으로 DB 덤프 파일 생성

**완료 기준:**

- [ ] 모든 엔티티 entity.json 생성 완료
- [ ] migration 완료, DB 테이블 확인
- [ ] cone 생성 완료
- [ ] scaffolding 완료 (model, model_test, view_list, view_search_input, view_form 전부)
- [ ] biome check, type check, build 모두 통과
- [ ] `pnpm dump` 실행 완료

---

## PHASE 3: 테스트 및 API 구현

**참조 스킬:** testing.md, testing-devrunner.md, naite.md

### 11. 테스트 계획

33. 테스트 계획을 batch로 세우기 — **항상 User 관련 테스트가 우선**
34. `.claude/skills/project/test-plan.md`에 기록
35. `architecture.md`에 test-plan.md 링크 추가

### 12. Batch별 테스트 및 API 구현 (반복)

각 batch마다 다음을 반복:

36. **하나의 batch 비즈니스 로직에 맞는 테스트 코드 작성**
37. biome check, type check
38. **model의 API 구현**
39. **`pnpm sonamu test`로 테스트 돌려보기**
    - dev 서버가 올라가있지 않으면 올린 뒤 실행

### 13. 전체 검증

40. 모든 batch 완료 후 전체 biome check, type check 및 빌드 확인
41. **`pnpm sonamu test`로 전체 테스트 실행**

**완료 기준:**

- [ ] test-plan.md 기록 완료
- [ ] 모든 batch의 테스트 통과
- [ ] 모든 batch의 API 구현 완료
- [ ] 전체 biome check, type check, build 통과
- [ ] 전체 테스트 통과

---

## PHASE 4: Fixture 생성

### 14. Fixture 생성

42. 사용자에게 fixture 생성할지 확인
43. 모든 엔티티의 prop에 `cone.note`가 존재하는지 체크
    - cone.note가 비어있는 prop이 있으면 사용자에게 보고하고 `pnpm sonamu cone generate --use-llm`으로 cone을 재생성할지 확인
    - cone.note가 있어야 LLM이 맥락에 맞는 fixture 데이터를 생성할 수 있다
44. 생성할 데이터의 최소 row 수 확인 (최소 10 ~ 최대 100)
45. **better-auth 엔티티 먼저 생성** (의존성 순서 필수):
    - User → Account → Session 순으로 생성
    - `pnpm sonamu fixture gen --include User,Account,Session --count 10 --use-llm`
    - **CRITICAL**: User.id string PK를 위한 `users_id_seq`가 생성되어 있어야 함 (PHASE 0 Step 18-19에서 설정)
    - 상세 내용은 `auth-migration.md` "Better-auth 엔티티 Fixture 생성" 섹션 참조
46. 승인하면 테스트에서 batch로 나눈 대로 fixture 생성 (LLM 사용 필수)
    - `--use-llm` 옵션은 반드시 사용 (cone.note 기반 도메인 맥락 반영 필수)
47. 실제 DB에 생성되었는지 사용자에게 확인 요청
48. **`pnpm sonamu test`로 전체 테스트 재실행**
49. `pnpm dump`으로 DB 덤프 파일 생성

**완료 기준:**

- [ ] cone.note 존재 여부 체크 완료
- [ ] better-auth 엔티티 (User, Account, Session) fixture 먼저 생성 완료
- [ ] fixture 데이터 생성 완료 (사용자 승인 시, `--use-llm` 사용)
- [ ] DB에 데이터 존재 확인
- [ ] 전체 테스트 통과
- [ ] `pnpm dump` 실행 완료

---

## PHASE 5: Frontend 개발

**참조 스킬:** frontend.md

### 15. Frontend 계획

49. Frontend 개발 진행할지 사용자에게 확인
50. 승인 후 테스트에서 나눈 batch로 Frontend 개발 계획 세우기
51. `.claude/skills/project/frontend-plan.md`에 기록
52. `architecture.md`에 frontend-plan.md 링크 추가

### 16. Batch별 Frontend 개발 (반복)

53. batch 대로 조금씩 진행하며 **사용자에게 확인 요청**
54. 사용자가 브라우저에서 확인 후 Claude Code에게 피드백
    - "확인했다"
    - "로직대로 된다"
    - "이 부분이 잘 안 된다"
    - 등등

**완료 기준:**

- [ ] frontend-plan.md 기록 완료
- [ ] 모든 batch의 Frontend 구현 완료
- [ ] 사용자 확인 및 피드백 반영 완료

---

## 프로젝트 문서 구조

워크플로우 진행 중 다음 문서들이 프로젝트 루트의 `.claude/skills/project/`에 생성된다:

```
.claude/skills/project/
├── requirements.md      # PHASE 0: 사용자 요구사항 원문
├── business-logic.md    # PHASE 0: 파악한 비즈니스 로직 (사용자 승인)
├── architecture.md      # PHASE 1: 엔티티 설계안 + test-plan, frontend-plan 링크
├── test-plan.md         # PHASE 3: batch별 테스트 계획
└── frontend-plan.md     # PHASE 5: batch별 Frontend 개발 계획
```

---

## 핵심 원칙

1. **dev 서버는 항상 실행 중** — 꺼져있으면 올린 뒤 작업
2. **테스트는 `pnpm sonamu test`** — `pnpm test`는 CI용
3. **순서를 지킬 것** — 단계를 건너뛰지 않음
4. **사용자에게 자주 확인** — 추측하지 말고 질문
5. **batch 단위로 작업** — 한 번에 모든 것을 하지 않음
6. **User 관련이 항상 우선** — 테스트, API, Frontend 모두
7. **문서를 기록** — requirements, business-logic, architecture, test-plan, frontend-plan
