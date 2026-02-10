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
```bash
pnpm create sonamu [프로젝트명] --yes
```

### 2. Sonamu 링크 설정 (선택)
**Skills 원본 동기화가 필요한 경우만** `pnpm-workspace.yaml`에 추가:
```yaml
overrides:
  sonamu: link:../../sonamu/modules/sonamu
```
> 이유: Skills sync, 로컬 Sonamu 변경사항 즉시 반영

### 3. 의존성 설치 및 빌드
프로젝트 루트에서:
```bash
pnpm install
pnpm -r build
```

### 4. Docker 실행
```bash
cd packages/api
pnpm docker:up
```

### 5. 개발 서버 실행
```bash
pnpm dev
```

### 6. Auth 엔티티 생성 (별도 터미널)
**dev 실행 중**에:
```bash
pnpm sonamu auth generate
```
> dev 모드에서 실행해야 types도 자동 생성됨

### 7. Subset 확인
Sonamu UI Entity 메뉴에서 subset 체크

### 8. Migration
```bash
pnpm sonamu migrate run
```

### 9. Scaffolding
Sonamu UI에서 Model/View Scaffolding 실행

### 10. API 단위테스트
```bash
pnpm test:watch
```

### 11. 프론트엔드 개발

**상세 내용:** `project-init.md` 참조

---

## Skills 목록

| Skill | 파일 | 용도 |
|-------|------|------|
| **전체 워크플로우** | `workflow.md` | **엔티티 설계 → 테스트 완료 5단계 가이드** |
| 프로젝트 생성 | `create-sonamu.md` | create-sonamu CLI 옵션 |
| 프로젝트 초기화 | `project-init.md` | 프로젝트 생성 여부 확인, 대화 흐름 |
| 프로젝트 설정 | `config.md` | .env, sonamu.config.ts 설정 |
| 데이터베이스 | `database.md` | DB 설정, 포트 충돌 해결, 3-Tier 구조 |
| Entity 검증 | `entity-validation-checklist.md` | Entity 생성 단계별 체크리스트 |
| Entity 기본 | `entity-basic.md` | Entity JSON 구조, 필드 타입 |
| Entity 관계 | `entity-relations.md` | BelongsToOne, HasMany, ManyToMany, FK 코드 패턴 |
| Subset | `subset.md` | 조회 필드 범위 정의 |
| Model | `model.md` | BaseModelClass, CRUD 패턴 |
| API | `api.md` | @api 데코레이터 |
| Puri | `puri.md` | SQL 쿼리 빌더 |
| i18n | `i18n.md` | 다국어 지원, SD 함수 |
| Upsert | `upsert.md` | 관계 데이터 저장 |
| Testing | `testing.md` | Vitest 테스트 (test/testAs), Fixture 생성 팁 |
| **Fixture CLI** | `fixture-cli.md` | **fixture gen/fetch/explore 명령어, 3-Tier DB 활용** |
| Migration | `migration.md` | DB 스키마 마이그레이션, PK 타입 변경 |
| Auth Migration | `auth-migration.md` | better-auth 등 외부 인증 통합 시 User.id 타입 변경 |
| Frontend | `frontend.md` | Service, TanStack Query |
| Scaffolding | `scaffolding.md` | UI Scaffolding 오류 해결 |

## 작업별 Skill 선택

**CRITICAL: 새로운 시스템이나 기능을 처음부터 개발할 때는 `workflow.md`부터 시작하세요!**

| 작업 | 참고 Skill |
|------|-----------|
| **처음부터 전체 시스템 개발** | **workflow.md (5단계 마스터 가이드)** |
| 프로젝트 생성 | create-sonamu, project-init |
| 프로젝트 설정 | config |
| Sonamu 로컬 개발 설정 | config |
| DB 설정/포트 충돌 | database, config |
| **3-Tier DB 구조 이해** | **database, fixture-cli** |
| Entity/속성 정의 | entity-basic |
| 관계 설정 | entity-relations |
| **BelongsToOne FK 코드 사용** | **entity-relations** |
| API 응답 필드 구성 | subset |
| 데이터 조회/저장 로직 | model, puri |
| API 엔드포인트 | api |
| 관계 데이터 배치 저장 | upsert |
| 테스트 작성 | testing |
| **Fixture 데이터 생성/관리** | **fixture-cli** |
| **테스트 데이터 생성 팁** | **testing (Fixture 데이터 생성 팁), fixture-cli (실전 팁)** |
| DB 스키마 변경 | migration |
| PK 타입 변경 (better-auth 등) | auth-migration |
| 프론트엔드 개발 | frontend |
| 다국어/번역 | i18n |
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
