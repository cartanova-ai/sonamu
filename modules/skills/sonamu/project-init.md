---
name: sonamu-project-init
description: Sonamu 프로젝트 생성 및 초기화. Entity 설계 요청 시 프로젝트 존재 여부 먼저 확인. Use before entity design.
---

# 프로젝트 초기화

## Entity 설계 요청 시 질문 순서

**한 번에 하나씩, 순서대로 진행:**

```
1. 프로젝트 생성 확인 ← 첫 번째
2. (프로젝트 없으면) 생성 여부 확인
3. (생성 원하면) 프로젝트명 확인
4. (생성 원하면) 기본값 사용 vs 옵션 설정
5. → entity-basic.md로 이동
```

---

## 예시 대화

### DO - Correct Example

```
사용자: "설문조사 시스템을 만들려고 해. Entity 설계해줘."

Claude: "Sonamu 프로젝트가 이미 생성되어 있나요?"

사용자: "아니"

Claude: "pnpm create sonamu로 프로젝트를 생성할까요?"

사용자: "응"

Claude: "프로젝트명을 알려주세요. (예: survey_system)"

사용자: "survey_system"

Claude: "기본값으로 빠르게 생성할까요, 아니면 DB 설정 등을 직접 하시겠어요?
1. 기본값으로 생성 (--yes)
2. 옵션 직접 설정"

사용자: "1"

Claude: "다음 명령어로 생성합니다:
pnpm create sonamu survey_system --yes"
```

### DO NOT - Incorrect Example

```
사용자: "설문조사 시스템을 만들려고 해. Entity 설계해줘."

Claude: "설문조사 시스템 Entity를 설계하기 전에 확인할게요.

1. Sonamu 프로젝트가 이미 생성되어 있나요?
   - 생성되어 있다면 프로젝트 경로를 알려주세요.
   - 아직 없다면 pnpm create sonamu로 먼저 생성할까요?
2. 프로젝트명은 무엇으로 할까요?
3. 어느 경로에 생성할까요?"
```

---

## 프로젝트 생성

CLI 옵션 및 생성 후 구조는 `create-sonamu.md` 참조.

---

## 기존 프로젝트 확인

사용자가 "프로젝트 있어"라고 답하면 경로를 물어보세요:

```
Claude: "프로젝트 경로를 알려주세요."
```

경로를 받은 후 `packages/api/src/application/` 존재 여부로 확인 가능합니다.
