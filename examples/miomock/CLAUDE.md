# Miomock 프로젝트 AI 지침서

> 이 문서는 `examples/miomock` 디렉토리에서 작업할 때의 추가 지침을 담고 있습니다.
> 루트의 [CLAUDE.md](../../CLAUDE.md)를 먼저 숙지하십시오.

---

## 프로젝트 개요

Miomock은 Sonamu 프레임워크의 **예제/테스트 프로젝트**입니다. 다음 목적으로 사용됩니다:

1. Sonamu 기능 시연
2. Sonamu 코어 변경에 대한 통합 테스트
3. 개발 패턴 및 베스트 프랙티스 예시

---

## 구조

```
examples/miomock/
├── api/                    # 백엔드 API 서버
│   ├── src/
│   │   ├── application/    # 도메인별 모듈 (user, employee 등)
│   │   ├── migrations/     # DB 마이그레이션
│   │   ├── sonamu-test/    # Sonamu 기능 테스트
│   │   ├── testing/        # 테스트 유틸리티
│   │   └── sonamu.config.ts
│   ├── database/           # Docker compose 및 DB 스크립트
│   └── vitest.config.ts
└── web/                    # 프론트엔드 (React)
```

---

## API 프로젝트 (miomock-api)

### 주요 명령어

```bash
# 개발 서버 실행
pnpm dev

# 프로덕션 빌드 & 실행
pnpm build
pnpm start

# 테스트
pnpm test

# DB 관련
pnpm seed          # fixture 데이터 주입
pnpm dump          # DB 덤프
pnpm sonamu migrate run   # 마이그레이션 실행
```

### 디렉토리 구조: application/

각 도메인 모듈은 다음 파일들로 구성됩니다:

```
application/user/
├── user.entity.json      # Entity 정의 (수정 자제 - Sonamu UI 사용)
├── user.model.ts         # 비즈니스 로직
├── user.model.test.ts    # 테스트
├── user.types.ts         # 타입 정의
└── user.workflow.ts      # 워크플로우 (선택적)
```

### 자동 생성 파일 (수정 금지)

```
application/
├── sonamu.generated.ts      # 타입, 서브셋 매핑
├── sonamu.generated.sso.ts  # 서브셋 쿼리
├── sonamu.generated.http    # HTTP 테스트 파일
└── queries.generated.ts     # 쿼리 정의
```

---

## 테스트 환경 설정

### 1. PostgreSQL 컨테이너 실행

```bash
cd examples/miomock/api/database
docker compose up -d
```

포트 충돌시 기존 컨테이너 중지:
```bash
docker ps  # 포트 5432 사용 컨테이너 확인
docker stop <container_id>
```

### 2. 마이그레이션 실행

```bash
cd examples/miomock/api
pnpm sonamu migrate run
```

### 3. Seed 데이터 주입

```bash
pnpm seed
```

이 명령은 다음을 수행합니다:
- `miomock_fixture` DB에 테스트 데이터 주입
- `miomock_test` DB로 fixture 동기화

### 4. 테스트 실행

```bash
pnpm test
```

---

## 테스트 코드 작성

### 패턴

```typescript
import { bootstrap, test, testAs } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);

describe("UserModel", () => {
  // 일반 테스트
  test("테스트 케이스명", async () => {
    const result = await UserModel.findMany("A", { num: 10 });
    expect(result.rows).toBeDefined();
  });

  // 로그인된 사용자로 테스트
  testAs(adminUser, "관리자 권한 테스트", async () => {
    const me = await UserModel.me();
    expect(me?.role).toBe("admin");
  });
});
```

### 테스트 파일 위치
- 도메인 테스트: `application/{domain}/{domain}.model.test.ts`
- Sonamu 기능 테스트: `sonamu-test/*.test.ts`

---

## Model 작성 패턴

### 기본 구조

```typescript
import { api, BaseModelClass, ListResult } from "sonamu";

class UserModelClass extends BaseModelClass<
  UserSubsetKey,
  UserSubsetMapping,
  typeof userSubsetQueries,
  typeof userLoaderQueries
> {
  constructor() {
    super("User", userSubsetQueries, userLoaderQueries);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  async findById<T extends UserSubsetKey>(subset: T, id: number): Promise<UserSubsetMapping[T]> {
    // ...
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  async findMany<T extends UserSubsetKey>(
    subset: T,
    params: UserListParams
  ): Promise<ListResult<UserListParams, UserSubsetMapping[T]>> {
    const { qb, onSubset } = this.getSubsetQueries(subset);
    // 쿼리 빌드 ...
    return this.executeSubsetQuery({ subset, qb, params });
  }
}

export const UserModel = new UserModelClass();
```

### 로깅

```typescript
// Model 내부에서는 this.logger 사용
this.logger.info("사용자 생성", { userId });
this.logger.error("에러 발생", { error });
```

---

## Entity 및 Migration

**중요**: Entity 수정과 마이그레이션은 대부분 **Sonamu UI**를 통해 수행합니다.

```bash
# Sonamu UI 실행
pnpm sonamu ui
```

AI가 `entity.json`이나 마이그레이션을 직접 수정해야 하는 상황이 오면, 먼저 사용자에게 직접 처리하도록 안내하십시오.

---

## 프론트엔드 (miomock-web)

### 주요 명령어

```bash
pnpm dev      # 개발 서버
pnpm build    # 빌드
pnpm preview  # 빌드 결과 미리보기
```

### 구조

React + Vite 기반이며, 자유롭게 수정 가능합니다.

---

## 개발 서버 확인

개발 서버가 떠 있어야 `entity.json` 변경이 파생 파일에 반영됩니다.

```bash
# 포트 사용 확인
lsof -i :10280

# 개발 서버 실행
pnpm dev
```

---

## 주의사항

### sonamu.lock
- 자동 생성 파일의 체크섬을 관리
- 직접 수정하지 말 것
- 파생 파일 재생성이 필요하면 삭제 후 `pnpm sonamu sync`

### Fixture 데이터
- `database/fixtures/`: 테스트용 초기 데이터
- `pnpm dump`로 현재 DB 상태를 덤프
- `pnpm seed`로 덤프 데이터를 DB에 복원

---

## 문서 업데이트

이 문서는 miomock 프로젝트 작업 경험이 축적됨에 따라 업데이트되어야 합니다:
- 테스트 환경 설정 이슈 발생시 해결책 추가
- 새로운 패턴 발견시 추가
- 함정(gotcha) 발견시 경고 추가
