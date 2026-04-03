# 아키텍처 설계

> 이 문서는 시스템의 전체 구조와 설계 결정을 기록합니다.
> 개발 과정에서 결정된 아키텍처 사항들을 업데이트합니다.

## 시스템 개요

### 기술 스택

- **Backend**: Sonamu + Node.js + TypeScript
- **Database**: PostgreSQL
- **Frontend**: React + TanStack Router + TanStack Query
- **Auth**: better-auth
- **Storage**: Local FS / S3 (선택)
- **Deployment**: (추후 결정)

---

## 데이터베이스 설계

### 주요 테이블

<!--
예시:

**users**
- id (PK)
- email (unique)
- name
- role (enum: admin, user)
- created_at

**posts**
- id (PK)
- title
- content
- author_id (FK → users)
- status (enum: draft, published)
- created_at
- updated_at
-->

### 관계도

<!--
ERD 또는 텍스트로 표현

예시:
```
users 1---N posts
users 1---N comments
posts 1---N comments
users N---M roles (user__roles)
```
-->

### 인덱스 전략

<!--
예시:
- users.email: unique index
- posts.author_id: index (조회 성능)
- posts.created_at: index (정렬용)
- posts(status, created_at): composite index (필터+정렬)
-->

---

## API 설계

### 엔드포인트 구조

```
/api/{model}/{method}

예시:
GET  /api/user/findMany
GET  /api/user/findById?id=1
POST /api/user/save
POST /api/user/del
```

### 인증/권한

<!--
예시:
- Public: 공개 API (로그인 불필요)
- User: 로그인 필요
- Admin: 관리자 권한 필요
- Owner: 본인 데이터만 접근 가능
-->

### 에러 응답

```json
{
  "code": 400,
  "message": "잘못된 요청입니다",
  "issues": [
    {
      "path": ["email"],
      "message": "이메일 형식이 올바르지 않습니다"
    }
  ]
}
```

---

## 프론트엔드 구조

### 라우팅

<!--
예시:
```
/                    # 홈
/login               # 로그인
/admin               # 관리자 대시보드
/admin/users         # 사용자 목록
/admin/users/:id     # 사용자 상세/편집
/admin/posts         # 게시글 관리
```
-->

### 상태 관리

- **서버 상태**: TanStack Query (자동 캐싱, 리페칭)
- **폼 상태**: useTypeForm (Zod 검증)
- **전역 상태**: Context API (최소화)

### 컴포넌트 구조

```
src/
├── routes/           # 페이지 컴포넌트
├── components/       # 재사용 컴포넌트
├── services/         # API Service (자동생성)
├── contexts/         # Context Providers
└── lib/              # 유틸리티
```

---

## 보안 설계

### 인증

- **세션 기반**: better-auth 사용
- **쿠키**: httpOnly, secure, sameSite
- **만료 시간**: 24시간 (연장 가능)

### 권한 관리

<!--
예시 (연구과제):
- Role 기반: admin, evaluator, applicant
- Guard를 통한 API 접근 제어
- 프론트엔드 라우트 보호

예시 (의료 실험):
- Role 기반: principal_investigator, researcher, monitor, subject
- 데이터 접근 레벨: full, anonymized, restricted
- IRB 승인 상태에 따른 기능 제한

예시 (커머스):
- Role 기반: admin, seller, customer
- 리소스 소유권 검증 (본인 주문/상품만 접근)
- IP 기반 관리자 접근 제한 (선택)

예시 (AI Agent):
- Role 기반: admin, developer, user
- 플랜별 기능 제한 (free, pro, enterprise)
- API 키 기반 인증 (외부 연동)

예시 (의사 소통 도구):
- Role 기반: admin, moderator, member
- 채널별 권한 설정 (읽기/쓰기/관리)
- 의료정보 접근 로그 기록 (감사용)
-->

### 데이터 보호

<!--
예시 (일반):
- 비밀번호: bcrypt 해싱
- 개인정보: 암호화 저장 (선택)
- SQL Injection: Knex parameterized query
- XSS: React 자동 이스케이핑

예시 (의료 실험 - HIPAA 준수):
- PHI(Protected Health Information): AES-256 암호화
- 데이터 전송: TLS 1.3
- 감사 로그: 모든 접근 기록 저장 (삭제 불가)
- 데이터 익명화: 개인식별정보 분리 저장

예시 (커머스 - PCI DSS 준수):
- 카드 정보: PG사에 위임 (직접 저장 금지)
- 결제 토큰: 일회용 사용 후 폐기
- 주문 정보: 배송 완료 후 일부 마스킹

예시 (AI Agent):
- 프롬프트 내 민감정보 자동 감지 및 마스킹
- 대화 히스토리: 사용자별 격리 저장
- API 키: 해싱 후 저장, 원본은 1회만 표시

예시 (의사 소통 도구):
- 메시지 E2E 암호화 (선택적)
- 파일: 바이러스 스캔 + 암호화 저장
- 의료정보 자동 감지 시 강제 암호화
- 삭제된 메시지: 30일 후 완전 삭제 (right to be forgotten)
-->

---

## 파일 저장소

### 업로드 방식

<!--
예시:
- 개발: Local FS (packages/api/public/uploaded)
- 프로덕션: S3
- URL: /api/public/uploaded/{key}
-->

### 파일 관리

<!--
예시 (게시판):
- 파일명: UUID + 원본파일명
- 최대 크기: 10MB
- 허용 확장자: jpg, png, pdf, docx
- 삭제 정책: 소프트 삭제 (30일 후 영구 삭제)

예시 (의료 실험):
- 파일명: 익명화된 피험자 ID + 타임스탬프
- 최대 크기: 100MB (DICOM 이미지 등)
- 허용 확장자: dcm, jpg, png, pdf, xlsx
- 버전 관리: 모든 버전 보관 (감사 추적)
- 암호화: AES-256 (at rest)

예시 (커머스):
- 상품 이미지: CDN 업로드, 자동 리사이징 (여러 해상도)
- 최대 크기: 5MB (이미지), 20MB (기타)
- 썸네일: 자동 생성 (200x200, 400x400, 800x800)
- 삭제 정책: 상품 삭제 시 즉시 CDN에서 제거

예시 (AI Agent):
- 업로드 파일: 텍스트 추출 후 임베딩 생성
- 최대 크기: 10MB
- 허용 확장자: txt, pdf, docx, md
- 처리 후 원본 삭제 (임베딩만 보관)

예시 (의사 소통 도구):
- 파일명: UUID (원본명은 메타데이터로 저장)
- 최대 크기: 50MB
- 바이러스 스캔: 업로드 시 필수
- 미리보기: 이미지/PDF 자동 생성
- 삭제 정책: 메시지 삭제 시 함께 삭제 (7일 유예)
-->

---

## 성능 최적화

### 캐싱 전략

<!--
예시:
- 정적 데이터: 브라우저 캐시 (1년)
- API 응답: 필요시 Redis 캐시
- 쿼리 결과: Sonamu 내장 캐시
-->

### 데이터베이스 최적화

<!--
예시:
- N+1 문제: Subset의 relation으로 해결
- 대량 조회: 페이지네이션 필수
- 집계 쿼리: 인덱스 활용
-->

### 프론트엔드 최적화

<!--
예시:
- 코드 스플리팅: TanStack Router 자동 처리
- 이미지 최적화: lazy loading
- API 호출: debounce, throttle 적용
-->

---

## 배포 아키텍처

<!--
예시:
```
[Client Browser]
       |
       v
[Nginx / CloudFront]
       |
       v
[Node.js Server]
       |
       v
[PostgreSQL]
```
-->

### 환경 구성

<!--
예시:
- Development: localhost:34900
- Staging: staging.example.com
- Production: api.example.com
-->

---

## 모니터링 & 로깅

<!--
예시:
- 에러 추적: Sentry (선택)
- 로그: Winston / Pino
- 성능: New Relic / Datadog (선택)
- 헬스체크: /api/health
-->

---

## 개발 중 아키텍처 결정

<!--
날짜별로 중요한 아키텍처 결정 기록

### 2024-01-15
- 파일 저장소: S3 사용 결정 (확장성 고려)
- 이유: 서버 디스크 용량 제한, CDN 연동 용이

### 2024-01-20
- 캐싱: Redis 도입 결정
- 대상: 대시보드 통계, 검색 결과
- TTL: 5분
-->

---

## 마이그레이션 전략

<!--
예시:
- 스키마 변경: Sonamu migration 사용
- 데이터 마이그레이션: 별도 스크립트 작성
- 롤백 계획: 각 마이그레이션마다 down 함수 구현
-->

---

## 확장성 고려사항

<!--
예시:
- 수평 확장: 무상태(stateless) 서버 설계
- 데이터베이스: 읽기 복제본 추가 가능
- 파일 저장소: S3로 무제한 확장
- 캐시: Redis Cluster 고려
-->
