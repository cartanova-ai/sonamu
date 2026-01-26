---
name: sonamu
description: Sonamu TypeScript 풀스택 프레임워크 개발 가이드. Entity, Model, API, 테스트, 프론트엔드 연동. Use when developing with Sonamu framework.
---

# Sonamu Framework Skills

Sonamu 프레임워크로 프로젝트를 개발하기 위한 Claude Code skill입니다.

## Skills 목록

| Skill | 파일 | 용도 |
|-------|------|------|
| 프로젝트 초기화 | `project-init.md` | 프로젝트 생성 여부 확인, create-sonamu |
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
| Entity/속성 정의 | project-init, entity-basic |
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

## 개발 흐름

```
1. Entity 정의 (Sonamu UI)
     ↓
2. types.ts 자동 생성 대기 (syncer 감지)
     ↓
3. Migration 생성 및 실행
     ↓
4. pnpm build (TypeScript 컴파일)
     ↓
5. Scaffolding (Model/View)
     ↓
6. Frontend Service 사용
```

### 단계별 상세

| 단계 | 작업 | 명령어/도구 |
|------|------|-------------|
| 1 | Entity JSON 정의 | Sonamu UI |
| 2 | types.ts 자동 생성 | syncer 자동 감지 (2-3초 대기) |
| 3 | Migration 생성 | Sonamu UI |
| 3 | Migration 실행 | `pnpm sonamu migrate run` |
| 4 | TypeScript 빌드 | `pnpm build` |
| 5 | Model/View Scaffolding | Sonamu UI |
| 6 | 프론트엔드 개발 | Service, TanStack Query |

> **중요**: Scaffolding 전 반드시 `pnpm build` 완료 필요 (dist/*.js 파일 생성)

## 소스코드 참조

- Sonamu 프레임워크: `sonamu/modules/sonamu/`
- 예제 프로젝트: `sonamu/examples/miomock/`
- 공식 문서: `sonamu/modules/docs/`
- create-sonamu: `sonamu/modules/create-sonamu/`
