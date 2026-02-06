---
name: sonamu-project-init
description: Sonamu 프로젝트 생성 및 초기화. Entity 설계 요청 시 프로젝트 존재 여부 먼저 확인. Use before entity design.
---

# 프로젝트 초기화

## Entity 설계 요청 시 질문 순서

**한 번에 하나씩, 순서대로 진행:**

```
0. 작업 경로 확인 ← 최우선
1. 프로젝트 생성 확인
2. (프로젝트 없으면) 생성 여부 확인
3. (생성 원하면) 프로젝트명 확인
4. (생성 원하면) 기본값 사용 vs 옵션 설정
5. 프로젝트 생성 실행
6. (요구사항 제공 시) 요구사항 문서화 ← 중요!
7. 설정 확인/커스터마이징 (config.md 참조)
8. → entity-basic.md로 이동
```

---

## 요구사항 문서화

**사용자가 프로젝트 생성과 함께 요구사항을 제공한 경우, 반드시 문서화합니다.**

### 프로세스

1. **프로젝트 생성 완료 확인**
   - `pnpm create sonamu` 완료
   - `pnpm install` 완료
   - `.claude/skills/project/` 디렉토리 자동 생성 확인

2. **요구사항 작성**
   ```bash
   # .claude/skills/project/requirements.md 파일에 작성
   ```

3. **작성 내용**
   - 프로젝트 개요
   - 핵심 기능 목록
   - 사용자 역할 정의
   - 주요 엔티티 목록
   - 비즈니스 규칙
   - 기술 스택
   - 추가 요구사항

4. **지속적 참조**
   - 이후 모든 개발 과정에서 이 문서를 참조
   - Entity 설계, API 개발, 비즈니스 로직 구현 시 일관성 유지

### 예시 시나리오

```
사용자: "연구과제 관리 시스템을 만들려고 해.
        공고, 과제, 평가 관리가 필요하고,
        관리자/평가위원/신청자 역할이 있어."

Claude:
1. 프로젝트 경로 확인
2. "pnpm create sonamu research_system --yes" 실행
3. 프로젝트 생성 완료
4. .claude/skills/project/requirements.md에 다음 내용 작성:

---
# 연구과제 관리 시스템

## 프로젝트 개요
연구과제 공모, 지원, 평가를 관리하는 시스템

## 핵심 기능
- 공고 관리 (생성, 수정, 발행, 마감)
- 과제 지원 및 관리
- 평가 프로세스 (평가위원 배정, 평가표 작성, 점수 산정)
- 사용자 권한 관리

## 사용자 역할
- 관리자: 전체 시스템 관리, 공고 생성, 평가위원 배정
- 평가위원: 평가표 작성, 점수 부여
- 신청자: 과제 지원, 진행 상황 확인

## 주요 엔티티
- Announcement (공고)
- Project (과제)
- Evaluation (평가)
- User (사용자)
- ...
---

5. 이후 Entity 설계 시 이 문서 참조하여 일관되게 진행
```

### 중요 사항

**반드시 문서화해야 하는 경우:**
- 사용자가 프로젝트 생성과 함께 요구사항/기능 명세를 제공한 경우
- 비즈니스 규칙이나 특별한 제약사항이 있는 경우

**문서화 시점:**
- 프로젝트 생성 직후
- Entity 설계 시작 전

**문서 활용:**
- Entity 설계 시 참조
- API 비즈니스 로직 구현 시 참조
- 테스트 케이스 작성 시 참조
- 프론트엔드 UI 설계 시 참조

---

## 0. 작업 경로 확인

**프로젝트 생성 전 반드시 확인:**

개발자들은 종종 프로젝트 유형에 따라 작업 디렉토리를 분리합니다:
- 회사/프레임워크 프로젝트: `~/Development/`
- 개인 프로젝트: `~/dev/programming/`
- 클라이언트 작업: `~/Projects/clients/`

### 확인 프로세스

1. **현재 작업 디렉토리 파악**
   ```bash
   pwd  # 현재 디렉토리 확인
   ```

2. **사용자에게 확인 질문**
   ```
   "현재 {현재_디렉토리}에서 요청하셨는데, 여기에 프로젝트를 생성할까요?
   다른 경로에서 작업하신다면 프로젝트를 생성할 디렉토리를 말씀해 주세요.

   1. 현재 디렉토리에 생성
   2. 다른 디렉토리 지정"
   ```

3. **선택에 따른 처리**

   **1번 선택 시:**
   - 현재 디렉토리에서 바로 진행
   - 다음 단계(프로젝트 생성 확인)로 이동

   **2번 선택 시:**
   - "프로젝트를 생성할 디렉토리 경로를 알려주세요."
   - 경로 받은 후: `cd {지정_경로}`
   - 디렉토리 존재 여부 확인
   - 디렉토리 없으면: `mkdir -p {지정_경로} && cd {지정_경로}`
   - 다음 단계로 이동

### 예시 대화

```
사용자: "설문조사 시스템을 만들려고 해. Entity 설계해줘."

Claude: "현재 /Users/noa/Documents에서 요청하셨는데, 여기에 프로젝트를 생성할까요?
다른 경로에서 작업하신다면 프로젝트를 생성할 디렉토리를 말씀해 주세요.

1. 현재 디렉토리에 생성
2. 다른 디렉토리 지정"

사용자: "2"

Claude: "프로젝트를 생성할 디렉토리 경로를 알려주세요."

사용자: "/Users/noa/Development"

Claude: "/Users/noa/Development로 이동합니다.

Sonamu 프로젝트가 이미 생성되어 있나요?"
```

### 주의사항

- **상대 경로도 허용**: `~/Development`, `../projects` 등
- **틸드(~) 확장**: 홈 디렉토리 자동 확장
- **경로 검증**: 존재하지 않는 경로는 생성 여부 확인
- **Working directory 변경**: 경로 이동 후 모든 명령어는 새 경로 기준

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

Claude: "현재 /Users/noa/Documents에서 요청하셨는데, 여기에 프로젝트를 생성할까요?
다른 경로에서 작업하신다면 프로젝트를 생성할 디렉토리를 말씀해 주세요.

1. 현재 디렉토리에 생성
2. 다른 디렉토리 지정"

사용자: "1"

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

1. 어느 경로에 프로젝트를 생성할까요?
2. Sonamu 프로젝트가 이미 생성되어 있나요?
3. 프로젝트명은 무엇으로 할까요?
4. 기본값으로 생성할까요, 옵션을 직접 설정할까요?"
```

**잘못된 이유:**
- 여러 질문을 한 번에 던짐 (한 번에 하나씩 질문해야 함)
- 질문 순서가 명확하지 않음

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
