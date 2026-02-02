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

## 전체 프로세스 상세

### A. Sonamu 개발자용 (로컬 링크)

> **로컬 링크를 사용하는 이유:**
> - Skills 원본에서 직접 동기화
> - 로컬 Sonamu 변경사항 즉시 반영
> - 프레임워크 개발 시 필수

#### 1. 프로젝트 생성
```bash
pnpm create sonamu [프로젝트명] --yes
```

CLI 옵션은 `create-sonamu.md` 참조.

#### 2. Sonamu 링크 설정

`pnpm-workspace.yaml`의 `overrides` 섹션에 추가:

```yaml
overrides:
  sonamu: link:../../sonamu/modules/sonamu
```

> **경로 예시:**
> - Sonamu가 `~/Development/sonamu`에 있는 경우
> - 프로젝트가 `~/Development/my_project`에 있는 경우
> - → `link:../../sonamu/modules/sonamu`

#### 3. 의존성 설치 및 빌드

프로젝트 루트에서:
```bash
pnpm install
pnpm -r build
```

#### 4. DB 실행
```bash
cd packages/api
pnpm docker:up
```

> 포트 충돌 오류 발생 시 → `database.md` 참조

#### 5. 개발 서버 실행
```bash
pnpm dev
```

> Sonamu UI: http://localhost:34900/sonamu-ui

#### 6. Auth 엔티티 생성 (별도 터미널)

**dev 서버 실행 중**에 다른 터미널에서:

```bash
cd packages/api
pnpm sonamu auth generate
```

> **주의:** dev 모드에서 실행해야 types 파일도 자동 생성됨

#### 7. Subset 확인

Sonamu UI (`http://localhost:34900/sonamu-ui`)의 Entity 메뉴에서:
- User, Account, Session, Verification 엔티티의 subset 체크

#### 8. DB Migration

Sonamu UI에서 마이그레이션 실행

#### 9. Scaffolding

```bash
pnpm sonamu scaffold model User
pnpm sonamu scaffold model Account
pnpm sonamu scaffold model Session
pnpm sonamu scaffold model Verification
```

#### 10. Skills 동기화 (선택)

Skills 원본 동기화가 필요한 경우:

```bash
cd packages/api
pnpm sonamu skills sync
```

프로젝트 루트에 `.claude/skills/sonamu/` 생성됨.

---

### B. Sonamu 사용자용 (npm 버전)

> **npm 버전 사용 시:**
> - Skills는 npm 패키지에 포함됨
> - 로컬 링크 불필요
> - 일반 사용자용

#### 1-3. 프로젝트 생성 및 설정
```bash
pnpm create sonamu [프로젝트명] --yes
cd [프로젝트명]
pnpm install
pnpm -r build
```

#### 4-9. A의 4-9 단계 동일

(단, Skills 동기화는 불필요)

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
SESSION_SECRET={자동생성}
SESSION_SALT={자동생성}
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
Claude: "설정이 완료되었습니다. 다음 단계로 진행할까요?

1. cd survey_system/packages/api
2. pnpm docker:up
3. pnpm dev
4. (별도 터미널) pnpm sonamu auth generate"
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
