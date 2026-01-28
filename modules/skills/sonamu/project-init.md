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
5. 프로젝트 생성 실행
6. 설정 확인/커스터마이징 (config.md 참조)
7. → entity-basic.md로 이동
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
pnpm create sonamu survey_system --yes

생성 완료 후 추가 설정이 필요하면 알려주세요."
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

## 프로젝트 생성 후 설정

프로젝트 생성 후 사용자에게 확인할 사항:

### 1. .env 확인

```
Claude: "packages/api/.env 파일이 생성되었습니다. 기본 설정을 확인해볼까요?"
```

기본 생성된 .env:
```env
DB_HOST=0.0.0.0
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=1234
CONTAINER_NAME={프로젝트명}-container
DATABASE_NAME={프로젝트명}
PROJECT_NAME={프로젝트명}
```

### 2. 추가 설정 필요 여부 확인

```
Claude: "추가로 설정할 항목이 있나요?
- 세션 보안 설정 (프로덕션용)
- S3 파일 업로드
- 서버 포트 변경
- 없음 (바로 진행)"
```

각 항목별 설정은 `config.md` 참조.

### 3. 설정 완료 후 진행

```
Claude: "설정이 완료되었습니다. Docker를 실행하고 서버를 시작해볼까요?

1. cd survey_system/packages/api
2. pnpm docker:up
3. pnpm build
4. pnpm dev"
```

---

## 기존 프로젝트 확인

사용자가 "프로젝트 있어"라고 답하면 경로를 물어보세요:

```
Claude: "프로젝트 경로를 알려주세요."
```

경로를 받은 후 `packages/api/src/application/` 존재 여부로 확인 가능합니다.

---

## 설정 관련 질문 처리

사용자가 설정 관련 질문을 하면 `config.md`를 참조하여 답변:

| 질문 | 참조 |
|------|------|
| ".env 어떻게 설정해?" | config.md - .env 파일 |
| "S3 연결하려면?" | config.md - server.storage |
| "세션 설정 바꾸려면?" | config.md - server.plugins.session |
| "포트 바꾸려면?" | config.md - server.listen |
| "캐시 설정?" | config.md - server.cache |
