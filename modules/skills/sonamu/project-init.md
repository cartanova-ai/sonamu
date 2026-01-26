---
name: sonamu-project-init
description: Sonamu 프로젝트 생성 및 초기화. Entity 설계 요청 시 프로젝트 존재 여부 먼저 확인. Use before entity design.
---

# 프로젝트 초기화

## CRITICAL: Ask One Question at a Time

**MUST ask questions one at a time. NEVER overwhelm users with multiple questions.**

### MUST DO
- 질문 하나 → 사용자 응답 대기 → 다음 질문
- 간결하게 질문
- 선택지가 있으면 명확하게 제시

### NEVER DO
- 여러 질문을 한꺼번에 나열
- 긴 설명과 함께 질문
- 확인사항 목록을 주루룩 출력

---

## Entity 설계 요청 시 질문 순서

**한 번에 하나씩, 순서대로 진행:**

```
1. 프로젝트 생성 확인 ← 첫 번째
2. (프로젝트 없으면) 생성 여부 확인
3. (생성 원하면) 프로젝트명 확인
4. (생성 원하면) 생성 경로 확인
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

Claude: "프로젝트명을 알려주세요. (예: survey-system)"

사용자: "survey-system"

Claude: "어느 경로에 생성할까요? (예: ~/Development/)"
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

### 명령어

```bash
pnpm create sonamu <project-name>
```

### 생성 후 구조

```
<project-name>/
├── packages/
│   ├── api/          # 백엔드
│   │   └── src/
│   │       └── application/  # Entity, Model, API
│   └── web/          # 프론트엔드
├── pnpm-workspace.yaml
└── package.json
```

### 생성 후 다음 단계

1. 의존성 설치: `cd <project-name> && pnpm install`
2. DB 설정: `packages/api/.env` 파일 수정
3. Entity 설계 진행 → entity-basic.md 참조

---

## 기존 프로젝트 확인 방법

프로젝트 경로를 받으면 다음을 확인:

1. `packages/api/src/application/` 디렉토리 존재 여부
2. `sonamu.config.json` 또는 `sonamu.config.ts` 존재 여부

이 파일들이 있으면 Sonamu 프로젝트가 이미 생성된 것입니다.
