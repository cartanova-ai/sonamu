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

```
PHASE 0: 프로젝트 생성 및 초기 설정  (프로젝트 생성 → 도메인 식별 → auth generate → Users 시퀀스 설정)
PHASE 1: 도메인 Logic 문서화        (도메인별 contract/{domain}/*.contract.md 작성 → 사용자 확인 완료)
PHASE 2: 엔티티 설계                (사용자와 함께 설계 확인)
PHASE 3: 엔티티 생성 및 마이그레이션  (entity.json + migration + cone + scaffolding)
PHASE 4: 테스트 및 API 구현          (contract→Claim→AC→implement 반복)
PHASE 5: Fixture 생성               (사용자 승인 후 LLM으로 생성)
PHASE 6: Frontend 개발              (batch별 진행, 사용자 확인)
```

**상세 내용:** `workflow.md` 참조

### 시작 지점 판단

**사용자의 지시에 따라 적절한 PHASE부터 시작한다.** 무조건 PHASE 0부터 시작하지 않는다.

| 사용자 지시 | 시작 PHASE | 전제 조건 확인 |
|------------|------------|----------------|
| "새 프로젝트 만들어줘" | PHASE 0 | — |
| "contract 작성해줘" / "도메인 분석해줘" | PHASE 1 | 도메인 목록 식별 완료 |
| "엔티티 추가해줘" / "엔티티 생성해줘" | PHASE 2 | 프로젝트 존재, dev 서버 실행 중, contract/**/*.contract.md 읽기, PHASE 1 완료 |
| "테스트 작성해줘" / "API 구현해줘" | PHASE 4 | entity.json 존재, migration 완료, scaffolding 완료 |
| "fixture 생성해줘" | PHASE 5 | 테스트 통과, cone.note 존재 확인 |
| "프론트엔드 개발해줘" | PHASE 6 | API 구현 완료, contract/**/*.contract.md 확인 |

**중간 진입 시 규칙:**
1. `contract/**/*.contract.md` 및 `skills/project/architecture.md`가 있으면 반드시 먼저 읽는다
2. 해당 PHASE의 전제 조건이 충족되었는지 확인한다
3. 충족되지 않으면 사용자에게 알리고 필요한 단계부터 진행한다
4. 해당 PHASE 내에서는 `workflow.md`의 넘버링된 Step을 순서대로 진행한다. 어떤 Step도 건너뛰지 않고, 자체 판단으로 병합하지 않는다

---

## 프로젝트 문서 체계

### CRITICAL: 작업 시작 전 필수 확인

**프로젝트 작업을 시작하기 전에 반드시 다음 문서를 읽으세요.**

```
contract/
└── {domain}/
    └── {domain}.contract.md  # PHASE 1: 도메인 규칙 + 결정 근거 (영구 문서, 코드 변경 시 함께 갱신)

.claude/skills/project/
└── architecture.md      # 엔티티 설계 + 시스템 아키텍처

tmp/claims/              # 진행 중 Claim YAML (완료 후 폐기)
```

**Ground truth는 코드다.** `*.contract.md`는 코드 결정의 근거 기록이지 선행 정의서가 아니다. 코드와 `*.contract.md`가 충돌하면 코드를 우선한다.

### 도메인 `*.contract.md`

도메인 규칙을 응집된 형태로 기술하고, 코드만으로는 파악하기 어려운 결정 근거를 함께 기록한다.

```markdown
# {도메인} 비즈니스 로직

## 규칙
- 환불은 결제 후 7일 이내만 가능 [근거: PG사 정책]
- 주문 상태 전환: 대기 → 확인 → 배송 → 완료

## 워크플로우
1. ...
```

**두 가지 개발 경로:**
- **신규**: `*.contract.md` 작성 → Claim → AC(테스트명) → implement (TDD 방식)
- **변경**: 코드 수정 → Claim 등록 → `*.contract.md` 확인/갱신 (변경 근거 기록)

**갱신 규칙:**
- 코드 변경 시 영향받는 도메인 규칙을 확인하고 `*.contract.md`도 함께 업데이트
- 변경 이유와 결정 근거를 함께 기록 — 이것이 `*.contract.md`를 살아있게 유지

### architecture.md

**언제:** 엔티티를 설계하거나 시스템 아키텍처를 논의할 때
**내용:** Entity 구조 및 관계 설계, 데이터베이스 스키마, 시스템 컴포넌트 구조

### Compacting 후에도 안전

문서가 파일로 영속화되어 있어서 대화가 압축(compacting)되어도 프로젝트 맥락이 유지된다.

---

## Skills 목록

| Skill | 파일 | 용도 |
|-------|------|------|
| **전체 워크플로우** | `workflow.md` | **엔티티 설계 → Frontend 개발 7단계 가이드** |
| **CDD (AC+Claim 기반 개발)** | `cdd.md` | **`*.contract.md`(도메인 규칙), AC(테스트 이름), Claim(작업 지시서) 3종 체계** |
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
| **DevRunner** | `testing-devrunner.md` | **sonamu test 실행, HMR 연동, 병렬 테스트, sonamu.config.ts 테스트 설정** |
| **Naite** | `naite.md` | **Naite.t()/get() 추적 시스템, 체이닝 필터, trace CLI 출력** |
| **Cone** | `cone.md` | **Cone 메타데이터 생성 및 관리 (LLM/템플릿)** |
| **Fixture CLI** | `fixture-cli.md` | **fixture gen/fetch/explore 명령어, 3-Tier DB 활용** |
| Migration | `migration.md` | DB 스키마 마이그레이션, PK 타입 변경 |
| Auth | `auth.md` | better-auth 인증 시스템 (엔티티 자동 생성, Guards, Context) |
| Auth Migration | `auth-migration.md` | better-auth 등 외부 인증 통합 시 User.id 타입 변경 |
| **Auth Plugins** | `auth-plugins.md` | **better-auth 플러그인 래퍼 (admin, organization, 2fa, passkey 등 10종), snake_case 매핑** |
| **벡터 검색** | `vector.md` | **pgvector 임베딩 (Voyage AI/OpenAI), 청킹, 하이브리드 검색** |
| Puri 쿼리 빌더 | `puri.md` | SELECT, WHERE, JOIN, FTS, pg_trgm fuzzy search, pgvector |
| **AI Agents** | `ai-agents.md` | **BaseAgentClass, @tools 데코레이터, ToolLoopAgent, AsyncLocalStorage 상태** |
| **Tasks** | `tasks.md` | **백그라운드 워크플로우, cron 스케줄링, durable step, 재시도 정책** |
| **스킬 기여** | `skill-contribution.md` | **트러블슈팅 해결 → 스킬 반영 워크플로우 (매칭, 판정, 포맷, 승인)** |
| **Framework 변경 판단** | `framework-change.md` | **프레임워크 수정 vs. 프로젝트 우회 판단 기준. @upload 파라미터 패턴** |
| Frontend | `frontend.md` | Service, TanStack Query |
| Scaffolding | `scaffolding.md` | UI Scaffolding 오류 해결 |

## 작업별 Skill 선택

**CRITICAL: 새로운 시스템이나 기능을 처음부터 개발할 때는 `workflow.md`부터 시작하세요!**

| 작업 | 참고 Skill |
|------|-----------|
| **처음부터 전체 시스템 개발** | **workflow.md (7단계 마스터 가이드)** |
| **도메인 Logic 문서화 / AC+Claim 기반 개발** | **cdd.md** |
| 프로젝트 생성 | create-sonamu, project-init |
| 프로젝트 설정 | config |
| Sonamu 로컬 개발 설정 | config |
| DB 설정/포트 충돌 | database, config |
| **3-Tier DB 구조 이해** | **database, fixture-cli** |
| **Cone 메타데이터 생성/관리** | **cone** |
| Entity/속성 정의 | entity-basic |
| 관계 설정 | entity-relations |
| **BelongsToOne FK 코드 사용** | **entity-relations** |
| API 응답 필드 구성 | subset |
| 데이터 조회/저장 로직 | model, puri |
| API 엔드포인트 | api |
| 관계 데이터 배치 저장 | upsert |
| 테스트 작성 | testing |
| **테스트 실행 (sonamu test)** | **testing-devrunner** |
| **Naite 추적/디버깅** | **naite** |
| **Fixture 데이터 생성/관리** | **fixture-cli** |
| **테스트 데이터 생성 팁** | **testing (Fixture 데이터 생성 팁), fixture-cli (실전 팁)** |
| DB 스키마 변경 | migration |
| **인증 설정 (auth generate, Guards, Context)** | **auth** |
| PK 타입 변경 (better-auth 등) | auth-migration |
| **인증 플러그인 추가** | **auth-plugins** |
| 프론트엔드 개발 | frontend |
| 다국어/번역 | i18n |
| Scaffolding 오류 | scaffolding |
| **벡터 검색/임베딩** | **vector** |
| **pg_trgm Fuzzy Search** | **puri, entity-basic** |
| **AI Agent 개발** | **ai-agents** |
| **백그라운드 작업/스케줄링** | **tasks** |
| **트러블슈팅 → 스킬 반영** | **skill-contribution** |
| **프레임워크 버그/제약 발견 시 대응** | **framework-change** |

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
