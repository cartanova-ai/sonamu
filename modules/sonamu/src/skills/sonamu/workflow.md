---
name: sonamu-workflow
description: Sonamu 전체 개발 워크플로우. 엔티티 설계부터 Frontend 개발까지 7단계(PHASE 1~7) 가이드. Use when starting a new feature or system from scratch.
---

# Sonamu 전체 개발 워크플로우

사용자가 시스템 구축을 요청하면 다음 7단계로 진행한다.

## 사용자 요청 → 완성까지 7단계

### PHASE 1: 엔티티 설계

**목표:** 시스템에 필요한 모든 Entity 식별 및 관계 정의

**참조 스킬:** entity-basic.md, entity-relations.md

**절차:**

1. **비즈니스 플로우 작성**
   - 업무 프로세스를 단계별로 작성
   - 각 단계의 입력/출력 데이터 명시
   - 데이터 흐름 다이어그램 작성 (선택)
   - 예: "공고 발행 → 과제 신청 → 평가 생성 → 평가위원 배정 → 평가표 작성 → 확정"

2. **Entity 식별 및 역할 정의**
   - 비즈니스 플로우 기반으로 필요한 모든 Entity 나열
   - 각 Entity의 역할 명확히 정의
   - "사용자(User) Entity가 필요한가요?"
   - "추가로 필요한 Entity가 있나요?"
   - **중요**: 매핑 테이블(N:M 관계)도 Entity로 식별

3. **Entity 간 관계 정의**
   - ERD 작성 (시각화 권장)
   - 관계 유형 결정 (BelongsToOne, HasMany, ManyToMany)
   - FK 관계 명시
   - "챕터는 강좌의 자식으로 함께 관리할까요?"
   - "강좌와 수강생은 어떤 관계인가요?"
   - **중요**: N:M 관계는 중간 매핑 Entity 필요

4. **필드 목록 상세화**
   - 각 Entity별로 필요한 필드 전부 나열
   - 필드명, 타입, nullable 여부 결정
   - 시간 추적 필드 확인 (created_at, updated_at, started_at 등)
   - 상태 관리 필드 확인 (status, confirmed_date 등)
   - **체크리스트**: "이 Entity에 누락된 필드는 없는가?"

5. **parentId 사용 여부 결정**
   - 계층 구조가 필요한 Entity 확인
   - parentId 또는 별도 관계 테이블 선택

6. **사용자 최종 확인**
   - 전체 설계 리뷰
   - 누락 사항 확인
   - 승인

**완료 기준:**
- [ ] 비즈니스 플로우 문서 작성 완료
- [ ] 모든 필수 Entity 식별 완료
- [ ] 각 Entity의 역할 정의 완료
- [ ] Entity 간 관계 정의 완료 (ERD 포함)
- [ ] **각 Entity별 필드 목록 작성 완료**
- [ ] parentId 사용 여부 결정
- [ ] 사용자 승인

**CRITICAL - API 개발 전 필수 단계:**

Entity 설계 후 API 개발로 넘어가기 전에 **반드시** 다음을 수행하세요:

**"추측하지 말고, 확인하라"**

- DON'T: 필드명 추측 금지 → Entity JSON 확인 필수
- DON'T: 관계 타입 추측 금지 → BelongsToOne은 자동으로 _id FK 생성
- DON'T: Subset 접근 추측 금지 → nested 접근 방식 확인 (예: committee.id, evaluator.id)

**API 개발 시작 전 체크리스트:**
```
□ 1. 모든 Entity JSON 파일 읽기 완료
   - 필드명 정확히 파악
   - 타입 확인
   - nullable 여부 확인

□ 2. 관계 확인
   - BelongsToOne → _id FK 자동 생성 확인
   - HasMany 방향 확인
   - ManyToMany 매핑 테이블 확인

□ 3. Subset 구조 확인
   - Subset A에서 관계 필드 접근 방식 확인
   - nested object로 접근 (예: sheet.committee.id)
   - FK 직접 접근 불가 (예: sheet.committee_id ❌)

□ 4. 기존 필드 활용 확인
   - 시작/종료 시점: start_date, end_date 있는지 확인
   - 상태 관리: status enum으로 충분한지 확인
   - 불필요한 필드 추가 방지
```

**다음 단계:** PHASE 2 엔티티 생성

---

### PHASE 2: 엔티티 생성

**목표:** Entity JSON 작성 및 필수 파일 생성

**참조 스킬:** entity-basic.md, entity-validation-checklist.md

**사전 준비: CRITICAL!**

**반드시 `/packages/api`에서 `pnpm dev`를 먼저 실행하세요!**

```bash
cd packages/api
pnpm dev  # 이 상태로 유지하면서 작업
```

> 이유: dev 모드에서 syncer가 entity.json 변경을 감지하여 types.ts를 자동 생성합니다.

**절차:**

1. **stub 생성** (각 Entity마다)
   ```bash
   pnpm sonamu stub entity {EntityId}
   ```
   **중요:** EntityId는 대문자로 시작 (예: User, Course)
   
   **자세한 내용:** entity-basic.md "Entity 생성 워크플로우" 참조

2. **entity.json 작성**
   - props, relations, subsets, enums 정의
   - entity-basic.md 참조

3. **entity.json 검증** (entity-validation-checklist.md PHASE 1)
   - [ ] 모든 인덱스에 type 필드 있는가?
   - [ ] Subset에서 FK 직접 참조 금지 (user.id 사용)
   - [ ] Boolean dbDefault가 "true"/"false" 문자열인가?
   - [ ] OrderBy enum은 id-desc만 있는가?
   - [ ] Enum dbDefault가 이스케이프된 큰따옴표로 감싸져 있는가?

4. **model.ts 수동 생성**
   - 다른 entity의 model.ts 참고
   - 필수 메서드: findById, findOne, findMany, save, del

5. **types.ts 확인**
   - **pnpm dev 실행 중이면** syncer가 2-3초 내 자동 생성
   - 확인: `ls packages/api/src/application/{entity}/{entity}.types.ts`
   - 생성 안 되면 수동 생성 (entity-validation-checklist.md 참조)

6. **sync 실행**
   ```bash
   pnpm sonamu sync
   ```

7. **Sync 결과 검증** (entity-validation-checklist.md PHASE 3)
   - sonamu.lock 확인
   - web 패키지 동기화 확인

**완료 기준:**
- [ ] 모든 Entity의 entity.json 검증 통과
- [ ] 모든 Entity의 model.ts 존재
- [ ] 모든 Entity의 types.ts 존재 (자동 생성 또는 수동)
- [ ] sync 성공

**다음 단계:** PHASE 3 마이그레이션

---

### PHASE 3: 마이그레이션

**목표:** DB 스키마 생성

**참조 스킬:** migration.md, entity-validation-checklist.md

**사전 확인:**
- `/packages/api`에서 `pnpm dev`가 실행 중인지 확인
- 브라우저에서 Sonamu UI 접속 가능: `http://localhost:3000/__sonamu` (기본 포트)

**절차:**

1. **Migration 생성**
   
   **방법 1 (권장): Sonamu UI에서 생성**
   - 브라우저에서 `http://localhost:3000/__sonamu` 접속
   - Migration 메뉴로 이동
   - 자동 감지된 Entity 변경사항 확인
   - "Create Migration" 버튼 클릭
   
   **방법 2: CLI**
   ```bash
   pnpm sonamu migration:create
   ```

2. **Migration 파일 검증** (entity-validation-checklist.md PHASE 4)
   - [ ] 테이블명이 올바른가? (복수형, snake_case)
   - [ ] 모든 컬럼이 정의되었는가?
   - [ ] Foreign key 제약조건이 있는가?
   - [ ] Index가 생성되는가?
   - [ ] Boolean 컬럼의 default가 올바른가? (true/false)

3. **Dry-run 확인**
   ```bash
   pnpm sonamu migration:latest --dry-run
   ```

4. **Migration 실행**
   ```bash
   pnpm sonamu migration:latest
   ```

**완료 기준:**
- [ ] Migration 오류 없이 완료
- [ ] DB에 테이블 생성 확인 (psql 또는 DB UI)

**다음 단계:** PHASE 4 스캐폴딩

---

### PHASE 4: 스캐폴딩

**목표:** Model, API, Frontend 코드 자동 생성

**참조 스킬:** scaffolding.md

**절차:**

1. **빌드 및 서버 재시작**
   ```bash
   cd packages/api
   pnpm build
   pnpm dev  # 재시작
   ```

2. **Sonamu UI에서 각 Entity scaffolding**
   - 브라우저에서 Sonamu UI 접속
   - 각 Entity별로 scaffold 실행

3. **Scaffolding 후 필수 작업**
   - [ ] **Relation이 있는 경우**: ko.ts에 `{relation}_id` 키 추가
     ```typescript
     // packages/api/src/i18n/ko.ts
     "entity.Post.author_id": "작성자",
     "entity.Question.collection_id": "소속 모음집",
     ```
   - [ ] **OrderBy 케이스 추가** (id-desc 외 사용 시)
     ```typescript
     // model.ts - orderBy 분기문
     if (params.orderBy === "id-desc") {
       qb.orderBy("posts.id", "desc");
     } else if (params.orderBy === "created_at-desc") {
       qb.orderBy("posts.created_at", "desc");
     } else {
       exhaustive(params.orderBy);
     }
     ```
   - [ ] **types.ts nullable 필드 처리 (테스트 전 필수!)**
     - 모든 Entity의 types.ts에서 nullable 필드 처리
     - testing.md "엔티티 생성 후 즉시 해야 할 작업" 참조

4. **빌드 확인**
   ```bash
   # API 빌드
   cd packages/api
   pnpm build
   
   # Web 빌드
   cd packages/web
   pnpm build
   ```

**완료 기준:**
- [ ] Build 성공 (API, Web 모두)
- [ ] Dev 서버 정상 작동
- [ ] Relation이 있는 경우 ko.ts 키 추가 완료
- [ ] types.ts nullable 필드 처리 완료

**다음 단계:** PHASE 5 테스트 작성

---

### PHASE 5: 테스트 작성

**목표:** 업무 프로세스 기반 모듈 테스트 작성

**참조 스킬:** testing.md

**사전 준비: Seed 데이터 준비 (CRITICAL!)**

테스트 실행을 위해서는 FK 제약 조건을 만족하는 기본 데이터가 필요합니다.

1. **현재 test DB 상태를 dump로 저장**
   ```bash
   cd packages/api
   pnpm dump
   ```
   
2. **생성된 dump 파일 확인 및 편집**
   
   Dump 파일 위치: `database/dumps/fixture.sql`
   
   파일을 열어서 **적절한 위치에 INSERT문 추가**:
   
   ```sql
   -- User 테이블 테스트 데이터
   INSERT INTO users (id, email, username, password, role, created_at) 
   VALUES (1, 'admin@test.com', 'admin', 'hashed_password', 'admin', NOW());
   
   -- Organization 테이블 테스트 데이터
   INSERT INTO organizations (id, name, code) 
   VALUES (1, '본사', 'HQ');
   ```
   
   **주의:**
   - FK 관계를 고려하여 부모 테이블부터 INSERT
   - 테스트에서 사용할 최소한의 데이터만 추가
   - ID는 명시적으로 지정 (테스트 코드에서 참조하기 위함)

3. **fixture DB에 dump 적용**
   ```bash
   pnpm seed
   pnpm sonamu fixture sync  # test DB에 동기화
   ```

**완료 확인:**
- [ ] dump 파일에 필요한 INSERT문 추가 완료
- [ ] fixture DB에 seed 데이터 적용 완료
- [ ] test DB에 동기화 완료

**절차:**

1. **types.ts nullable 필드 처리 확인**
   - 모든 Entity에서 완료되었는지 재확인
   - 누락 시 테스트 타입 에러 발생

2. **엔티티 설계 프롬프트 재확인**
   - PHASE 1에서 정의한 업무 프로세스 흐름
   - Entity 간 관계
   - 데이터 생성 순서

3. **업무 프로세스별 그룹핑**
   - testing.md "테스트 작성 계획 수립" 참조
   - 업무 흐름 단위로 Entity 묶기
   - 예: 그룹 1 (기반 인프라), 그룹 2 (피해유형), 그룹 3 (상담 프로세스)

4. **그룹별로 반복:**
   
   a. **test-helpers.ts 확장**
   - 그룹 내 Entity들의 헬퍼 함수 작성
   - 의존성 체인 고려 (`createTestXXXWithDeps`)
   
   b. **테스트 파일 작성**
   - `bootstrap(vi)` 필수
   - describe + test 패턴 사용
   - A. Create, B. Read, C. Update, D. Delete
   
   c. **Business Logic 테스트 작성 (핵심!)**
   - E. Business Logic 섹션
   - 실제 업무 시나리오 구현
   - Entity 간 상호작용 테스트
   - 데이터 흐름 검증
   
   d. **테스트 통과 확인**
   ```bash
   pnpm test
   ```
   
   e. **Git commit**
   ```bash
   git add .
   git commit -m "[테스트] 그룹 N 완료: EntityA, EntityB, EntityC"
   ```

5. **다음 그룹**

**완료 기준:**
- [ ] 모든 Entity 테스트 통과
- [ ] **Business Logic 테스트 포함** (실제 업무 시나리오)
- [ ] 업무 시나리오 검증 완료
- [ ] 모든 그룹 커밋 완료

**다음 단계:** PHASE 6 API 개발

---

### PHASE 6: API 개발

**목표:** 요구사항에 따른 비즈니스 로직 API 구현

**참조 스킬:** api.md, model.md, upsert.md

**절차:**

1. **요구사항 분석**
   - PHASE 1의 엔티티 설계 프롬프트 재확인
   - PHASE 5의 Business Logic 테스트에서 구현한 시나리오 분석
   - 추가 필요한 API 엔드포인트 식별

2. **기본 CRUD API 확인**
   - scaffolding으로 자동 생성된 API 확인 (findById, findMany, save, del)
   - 이미 @api 데코레이터 적용됨

3. **커스텀 API 메서드 추가**
   - @api 데코레이터로 HTTP 엔드포인트 생성
   - 비즈니스 로직 구현 (트랜잭션, 복잡한 쿼리 등)
   - **상세 가이드:** api.md "@api 데코레이터" 참조

4. **검증 로직 구현**
   - 비즈니스 규칙 검증 (중복 체크, 정원 확인 등)
   - 적절한 에러 메시지 반환
   - **상세 가이드:** model.md "검증 패턴" 참조

5. **권한 가드 적용**
   - guards: ["user"], ["admin"] 설정
   - Context에서 현재 사용자 정보 활용
   - **상세 가이드:** api.md "권한 가드" 참조

6. **API 테스트 확장**
   - PHASE 5의 Business Logic 테스트에 커스텀 API 호출 추가
   - 각 API의 정상 동작 및 에러 케이스 검증

7. **빌드 및 테스트 통과 확인**
   ```bash
   cd packages/api
   pnpm build
   pnpm test
   ```

**완료 기준:**
- [ ] 요구사항에 따른 모든 API 구현 완료
- [ ] 각 API에 적절한 @api 데코레이터 적용
- [ ] 권한 가드 적용 (guards)
- [ ] 검증 로직 구현
- [ ] API 테스트 통과
- [ ] Build 성공

**다음 단계:** PHASE 7 Frontend 개발

---

### PHASE 7: Frontend 개발

**목표:** 화면에서 실제 동작 확인

**참조 스킬:** frontend.md

**절차:**

1. **화면 설계**
   - PHASE 1의 엔티티 설계 프롬프트 기반 화면 구조 결정
   - 주요 화면 목록 작성
     - 목록 페이지 (List)
     - 상세/편집 페이지 (Form)
     - 대시보드 (Dashboard)

2. **자동 생성된 Service 확인**
   - `packages/web/src/services/services.generated.ts`
   - 각 Entity별 Service 클래스
   - TanStack Query hooks (useQuery, useMutation)

3. **목록 페이지 구현**
   - Service.useXXX hooks로 데이터 조회
   - 로딩/에러 상태 처리
   - 페이지네이션 구현
   - **상세 가이드:** frontend.md "목록 페이지" 참조

4. **편집 페이지 구현**
   - useTypeForm으로 폼 관리
   - Zod 기반 유효성 검증
   - useMutation으로 데이터 저장
   - **상세 가이드:** frontend.md "폼 페이지" 참조

5. **커스텀 API 호출**
   - Service 클래스에서 커스텀 메서드 호출
   - queryClient.invalidateQueries로 캐시 무효화
   - **상세 가이드:** frontend.md "커스텀 API" 참조

6. **실제 동작 확인**
   
   ```bash
   cd packages/web
   pnpm dev
   ```
   
   브라우저에서 확인할 항목:
   - [ ] 목록 조회 정상 동작
   - [ ] 페이지네이션 정상 동작
   - [ ] 등록/수정 정상 동작
   - [ ] 삭제 정상 동작
   - [ ] 유효성 검증 (Zod) 정상 동작
   - [ ] 로딩 상태 표시
   - [ ] 에러 핸들링
   - [ ] **비즈니스 로직 정상 동작** (예: 상태 변경, 정원 체크 등)

7. **통합 테스트**
   - 사용자 등록부터 로그인까지
   - 데이터 생성부터 조회까지
   - 전체 업무 프로세스 실행

8. **버그 수정 및 재테스트**
   - API 오류 → PHASE 6로 돌아가서 수정
   - 타입 오류 → types.ts 또는 entity.json 수정
   - UI 문제 → Frontend 컴포넌트 수정

**완료 기준:**
- [ ] 모든 주요 화면 구현 완료
- [ ] 실제 동작 확인 완료
- [ ] **비즈니스 로직 정상 동작 확인**
- [ ] 에러 핸들링 확인
- [ ] 사용자 시나리오 테스트 완료
- [ ] 버그 수정 완료

**결과:** 전체 워크플로우 완료

---

## 빠른 참조 테이블

| 단계 | 예상 시간 | 핵심 명령어 | 핵심 스킬 |
|------|-----------|-------------|----------|
| 1. 설계 | 5-10분 | (대화) | entity-basic.md |
| 2. 생성 | 10-15분 | `stub entity`, `sync` | entity-basic.md |
| 3. 마이그레이션 | 5분 | `migration:latest` | migration.md |
| 4. 스캐폴딩 | 5-10분 | `scaffold`, `build` | scaffolding.md |
| 5. 테스트 | 30-60분 | `test`, `test:watch` | testing.md |
| **6. API 개발** | **1-3시간** | **@api 데코레이터** | **api.md, model.md** |
| **7. Frontend** | **2-5시간** | **Service, useTypeForm** | **frontend.md** |


---

## 각 단계의 완료 확인

### PHASE 1 완료 시
```
엔티티 설계 완료
→ 다음: PHASE 2 엔티티 생성 (entity-basic.md)
```

### PHASE 2 완료 시
```
엔티티 생성 완료
→ 다음: PHASE 3 마이그레이션 (migration.md)
```

### PHASE 3 완료 시
```
마이그레이션 완료
→ 다음: PHASE 4 스캐폴딩 (scaffolding.md)
```

### PHASE 4 완료 시
```
스캐폴딩 완료
→ 다음: PHASE 5 테스트 작성 (testing.md)
```

### PHASE 5 완료 시
```
테스트 작성 완료
→ 다음: PHASE 6 API 개발 (api.md)
```

### PHASE 6 완료 시
```
API 개발 완료
→ 다음: PHASE 7 Frontend 개발 (frontend.md)
```

### PHASE 7 완료 시
```
Frontend 개발 완료
전체 워크플로우 완료
```

---

## 트러블슈팅

각 단계에서 문제가 발생하면 해당 스킬 문서의 트러블슈팅 섹션 참조:

- PHASE 2: entity-validation-checklist.md "Entity 스키마 검증 오류 해결"
- PHASE 3: migration.md "실행 순서", entity-validation-checklist.md PHASE 4
- PHASE 4: scaffolding.md "흔한 오류"
- PHASE 5: testing.md "실전 주의사항 (Common Pitfalls)"
- PHASE 6: api.md, model.md, upsert.md
- PHASE 7: frontend.md

---

## 대규모 프로젝트 (10개 이상 Entity)

**CRITICAL: Entity가 10개 이상인 프로젝트는 한 번에 작업하지 마세요.**

배치 단위로 작업:
1. 연관된 Entity끼리 5-10개씩 묶기
2. 배치마다 PHASE 2-7 완료 후 커밋
3. 다음 배치 진행

**예시:**
```
1차 배치: User, Organization, Role (5개)
  → PHASE 2-7 완료 → Git commit

2차 배치: Consultation, ConsultationHistory (7개)
  → PHASE 2-7 완료 → Git commit

3차 배치: FAQ, Notice, Material (6개)
  → PHASE 2-7 완료 → Git commit
```

**자세한 내용:** testing.md "대규모 프로젝트 전략"

---

## 중요 원칙

1. **순서를 지킬 것** - 단계를 건너뛰지 말 것
2. **검증을 철저히** - 각 단계의 완료 기준 체크
3. **커밋을 자주** - 배치별로 또는 그룹별로 커밋
4. **Business Logic 테스트 필수** - 단순 CRUD만으로는 부족
5. **API 검증 로직 필수** - 비즈니스 규칙 구현
6. **실제 동작 확인 필수** - Frontend에서 반드시 확인
7. **문서를 참조** - 각 스킬 문서에 상세한 가이드 있음

---

## 다음 단계

워크플로우 완료 후:
- 배포: 프로젝트별 배포 가이드 참조
- 모니터링: 로그 및 에러 추적 설정
- 성능 최적화: 쿼리 최적화, 캐싱 전략
