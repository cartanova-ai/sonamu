---
name: sonamu
description: Sonamu TypeScript 풀스택 프레임워크 개발 가이드. Entity, Model, API, 테스트, 프론트엔드 연동. Use when developing with Sonamu framework.
---

# Sonamu Framework Skills

Sonamu 프레임워크로 프로젝트를 개발하기 위한 Claude Code skill입니다.

## CRITICAL: 질문은 하나씩

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

## 개발 흐름

### 1. 프로젝트 생성

**사용자에게 먼저 질문 (순서대로, 하나씩):**
1. "Sonamu 프로젝트가 이미 생성되어 있나요?"
2. (없다면) "프로젝트를 생성할까요?"
3. (생성한다면) "프로젝트명을 알려주세요."

**참조 Skill:**
- `project-init.md` - 대화 흐름, 예시
- `create-sonamu.md` - CLI 옵션

**명령어:**
```bash
pnpm create sonamu [프로젝트명] --yes
```

### 2. Docker 실행

```bash
cd [프로젝트명]/packages/api
pnpm docker:up
```

포트 충돌 오류 발생 시 → `database.md` 참조

### 3. 빌드 확인

```bash
cd packages/api
pnpm build
```

오류 발생 시 해결 후 다음 단계로.

### 4. 서버 실행

```bash
pnpm dev
```

Sonamu UI 접속: http://localhost:1028/sonamu-ui

### 5. 엔티티 설계

**사용자에게 먼저 질문 (순서대로, 하나씩):**
1. 누락된 Entity 확인 → 응답 대기
2. Entity 간 관계 확인 → 응답 대기
3. 특수 필드 확인 → 응답 대기

**참조 Skill:**
- `entity-basic.md` - Entity JSON 구조, 필드 타입
- `entity-relations.md` - BelongsToOne, HasMany, ManyToMany

**주의:**
- 파일 시스템을 자동으로 확인하지 마세요
- 현재 디렉토리가 다른 프로젝트일 수 있습니다
- 항상 사용자에게 명시적으로 확인받으세요

### 6. Migration

**참조 Skill:** `migration.md`

```bash
pnpm sonamu migrate run
```

### 7. Scaffolding

**참조 Skill:** `scaffolding.md`

Sonamu UI에서 Model/View Scaffolding 실행.

> **중요**: Scaffolding 전 반드시 `pnpm build` 완료 필요

### 8. 프론트엔드 개발

**참조 Skill:** `frontend.md`

생성된 Service와 TanStack Query 사용.

---

## Skills 목록

| Skill | 파일 | 용도 |
|-------|------|------|
| 프로젝트 생성 | `create-sonamu.md` | create-sonamu CLI 옵션 |
| 프로젝트 초기화 | `project-init.md` | 프로젝트 생성 여부 확인, 대화 흐름 |
| 데이터베이스 | `database.md` | DB 설정, 포트 충돌 해결 |
| Entity 기본 | `entity-basic.md` | Entity JSON 구조, 필드 타입 |
| Entity 관계 | `entity-relations.md` | BelongsToOne, HasMany, ManyToMany |
| Subset | `subset.md` | 조회 필드 범위 정의 |
| Model | `model.md` | BaseModelClass, CRUD 패턴 |
| API | `api.md` | @api 데코레이터 |
| Puri | `puri.md` | SQL 쿼리 빌더 |
| Upsert | `upsert.md` | 관계 데이터 저장 |
| Testing | `testing.md` | Vitest 테스트 (test/testAs) |
| Migration | `migration.md` | DB 스키마 마이그레이션 |
| Frontend | `frontend.md` | Service, TanStack Query |
| Scaffolding | `scaffolding.md` | UI Scaffolding 오류 해결 |

## 작업별 Skill 선택

| 작업 | 참고 Skill |
|------|-----------|
| 프로젝트 생성 | create-sonamu, project-init |
| DB 설정/포트 충돌 | database |
| Entity/속성 정의 | entity-basic |
| 관계 설정 | entity-relations |
| API 응답 필드 구성 | subset |
| 데이터 조회/저장 로직 | model, puri |
| API 엔드포인트 | api |
| 관계 데이터 배치 저장 | upsert |
| 테스트 작성 | testing |
| DB 스키마 변경 | migration |
| 프론트엔드 개발 | frontend |
| Scaffolding 오류 | scaffolding |

## 명령어 실행 경로

모든 `pnpm` 명령어는 **`packages/api`** 디렉토리에서 실행합니다.

```bash
cd packages/api
pnpm build
pnpm dev
pnpm sonamu migrate run
```

## 소스코드 참조

- Sonamu 프레임워크: `sonamu/modules/sonamu/`
- 예제 프로젝트: `sonamu/examples/miomock/`
- 공식 문서: `sonamu/modules/docs/`
- create-sonamu: `sonamu/modules/create-sonamu/`
