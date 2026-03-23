---
name: sonamu-api
description: Sonamu @api 데코레이터로 Model 메서드를 HTTP 엔드포인트로 노출. httpMethod, guards, clients 옵션 설정. Use when exposing Model methods as API endpoints.
---

# @api 데코레이터

## 기본 사용

```typescript
@api({ httpMethod: "GET" })
async findById(id: number): Promise<User> { }
// → GET /user/findById?id=1
```

## 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `httpMethod` | GET, POST, PUT, DELETE, PATCH | GET |
| `clients` | 생성할 클라이언트 타입 | `["axios"]` |
| `resourceName` | TanStack Query의 queryKey | - |
| `guards` | 인증/권한 가드 | - |
| `path` | 커스텀 경로 | `/{model}/{method}` |
| `description` | API 설명 (문서화용) | - |
| `timeout` | 요청 타임아웃 (ms) | - |
| `contentType` | 응답 Content-Type | `application/json` |
| `cacheControl` | Cache-Control 헤더 설정 | - |
| `compress` | 응답 압축 설정 (`false`로 비활성화 가능) | - |

## clients 옵션

| Client | 용도 |
|--------|------|
| `axios` | 일반 API 호출 |
| `axios-multipart` | 파일 업로드 (axios) |
| `tanstack-query` | 조회용 Query hook |
| `tanstack-mutation` | 변경용 Mutation hook |
| `tanstack-mutation-multipart` | 파일 업로드 Mutation |
| `window-fetch` | 브라우저 fetch API |

## 패턴별 예시

### 조회 API

```typescript
@api({
  httpMethod: "GET",
  clients: ["axios", "tanstack-query"],
  resourceName: "Users",
})
async findMany(params: UserListParams): Promise<ListResult<User>> { }
```

### 변경 API

```typescript
@api({
  httpMethod: "POST",
  clients: ["axios", "tanstack-mutation"],
})
async save(params: UserSaveParams[]): Promise<number[]> { }
```

### 권한 필요 API

```typescript
@api({ httpMethod: "POST", guards: ["admin"] })
async del(ids: number[]): Promise<number> { }
```

## Context 접근

```typescript
import { Sonamu } from "sonamu";

@api({ httpMethod: "GET", guards: ["user"] })
async me(): Promise<User | null> {
  const { user } = Sonamu.getContext();
  return user ? this.findById("A", user.id) : null;
}
```

| Context 속성 | 설명 |
|-------------|------|
| `user` | 인증된 사용자 (better-auth User, null이면 미인증) |
| `session` | 현재 세션 정보 (better-auth Session, null이면 미인증) |
| `request` | FastifyRequest |
| `reply` | FastifyReply |
| `headers` | HTTP 요청 헤더 |
| `bufferedFiles` | 버퍼 모드 업로드 파일 |
| `uploadedFiles` | 스트림 모드 업로드 파일 |
| `locale` | 요청 언어 |

## 파일 업로드 (@upload)

> **CRITICAL: `@upload`는 `@api` 없이 단독으로 사용한다.**
> `@upload`를 붙이면 POST 엔드포인트와 `axios-multipart`/`tanstack-mutation-multipart` 클라이언트가 **자동 생성**된다.
> `@api`를 함께 붙이면 `checkSingleDecorator` 충돌로 **빌드 에러**가 발생한다.

```typescript
// CORRECT
@upload({ limits: { files: 10 }, guards: ["user"] })
async upload(...): Promise<number[]> { }

// WRONG — 빌드 에러 발생
@api({ httpMethod: "POST", clients: ["axios-multipart"] })
@upload({ limits: { files: 10 } })
async upload(...): Promise<number[]> { }
```

**`@upload` 지원 옵션** (`httpMethod`, `clients`는 지원하지 않음 — 자동 설정됨)

| 옵션 | 설명 |
|------|------|
| `guards` | 인증/권한 가드 |
| `limits` | 파일 개수/크기 제한 (`{ files: N }`) |
| `consume` | `"buffer"` (기본) 또는 `"stream"` |
| `description` | API 문서 설명 |
| `destination` | 스트림 모드 전용: 스토리지 드라이버 키 |
| `keyGenerator` | 스트림 모드 전용: 저장 경로 생성 함수 |

### 파라미터 규칙: 반드시 단일 객체로 묶기

> **CRITICAL: `@upload` 메서드에 파라미터가 2개 이상이면 반드시 단일 객체로 묶는다.**
>
> primitive 파라미터를 여러 개 쓰면 `services.template.ts`의 codegen 버그로 `useUploadMutation`이 잘못 생성된다.

```typescript
// WRONG — codegen 깨짐 (mutationFn 인수 누락)
async upload(entity_type: string, entity_id: number, file_type: string)

// CORRECT — 단일 객체로 묶기
async upload(params: { entity_type: string; entity_id: number; file_type: string })
```

호출부 패턴:
```typescript
uploadMutation.mutate({
  params: { entity_type, entity_id, file_type },
  files,
})
```

> 자세한 원인 분석은 `framework-change.md`의 `@upload 다중 파라미터` 섹션 참고.

### 버퍼 모드 (기본)

```typescript
@upload({ limits: { files: 10 } })
async uploadFiles(): Promise<{ files: SonamuFile[] }> {
  const { bufferedFiles } = Sonamu.getContext();
  // bufferedFiles[].buffer로 파일 데이터 접근
}
```

### 스트림 모드 (대용량)

```typescript
@upload({
  consume: "stream",
  destination: "s3",  // 또는 "fs"
  keyGenerator: (file) => `uploads/${Date.now()}-${file.filename}`,
  limits: { files: 5 },
})
async uploadLargeFiles(): Promise<{ urls: string[] }> {
  const { uploadedFiles } = Sonamu.getContext();
  // uploadedFiles[].key로 저장된 경로 접근
}
```

---

## 실전 비즈니스 로직 패턴

### 트랜잭션과 이력 기록

상태 변경 시 트랜잭션으로 메인 데이터와 이력을 함께 처리하는 패턴:

```typescript
// consultation.model.ts

@api({ httpMethod: "POST", guards: ["user"] })
async changeStatus(
  id: number,
  status: ConsultationStatus,
  memo?: string
): Promise<Consultation> {
  const wdb = this.getPuri("w");
  
  return wdb.transaction(async (trx) => {
    // 1. 상담 업데이트
    await trx.ubRegister("consultations", {
      id,
      status,
      updated_at: new Date()
    });
    await trx.ubUpsert("consultations");
    
    // 2. 상태 변경 이력 기록
    await trx.ubRegister("consultation_histories", {
      consultation_id: id,
      status,
      memo,
      created_at: new Date(),
    });
    await trx.ubUpsert("consultation_histories");
    
    // 3. 결과 반환
    return this.findById("A", id);
  });
}
```

**핵심 포인트:**
- 트랜잭션으로 원자성 보장
- ubRegister + ubUpsert 패턴
- 변경 후 최신 데이터 반환

### 검증 로직과 비즈니스 규칙

등록 전 중복 체크, 정원 확인 등 복잡한 검증을 수행하는 패턴:

```typescript
@api({ httpMethod: "POST", guards: ["user"] })
async enroll(
  courseId: number,
  userId: number
): Promise<Enrollment> {
  // 1. 중복 등록 방지
  const existing = await this.findOne("A", {
    course_id: courseId,
    user_id: userId,
  });
  
  if (existing) {
    throw new Error("이미 등록된 강좌입니다");
  }
  
  // 2. 정원 확인
  const course = await CourseModel.findById("A", courseId);
  const { total } = await this.findMany({ course_id: courseId });
  
  if (total >= course.max_students) {
    throw new Error("정원이 가득 찼습니다");
  }
  
  // 3. 등록 실행
  const [id] = await this.save([{ course_id: courseId, user_id: userId }]);
  return this.findById("A", id);
}
```

**핵심 포인트:**
- 단계별 검증 (중복 → 정원)
- 명확한 에러 메시지
- 검증 통과 후 저장

### 권한 가드 활용

사용자 역할에 따른 접근 제어:

```typescript
// 일반 사용자 전용
@api({ httpMethod: "POST", guards: ["user"] })
async save(spa: PostSaveParams[]): Promise<number[]> { }

// 관리자 전용
@api({ httpMethod: "POST", guards: ["admin"] })
async del(ids: number[]): Promise<number> { }

// 현재 로그인 사용자 정보 활용
@api({ httpMethod: "GET", guards: ["user"] })
async myConsultations(): Promise<ListResult<Consultation>> {
  const { user } = Sonamu.getContext();
  return this.findMany({ user_id: user!.id });
}
```

### API 테스트 작성

Business Logic 테스트에서 커스텀 API를 검증:

```typescript
// consultation.test.ts
describe("E. Business Logic", () => {
  test("상태 변경 API", async () => {
    const { consultationId } = await createTestConsultationWithDeps();
    
    // 커스텀 API 호출
    const updated = await ConsultationModel.changeStatus(
      consultationId,
      "completed",
      "상담 완료"
    );
    
    expect(updated.status).toBe("completed");
    
    // 이력 기록 확인
    const histories = await ConsultationHistoryModel.findMany({
      consultation_id: consultationId,
    });
    expect(histories.rows).toHaveLength(1);
  });
  
  test("등록 검증", async () => {
    const courseId = 1;
    const userId = 1;
    
    // 첫 등록 성공
    await EnrollmentModel.enroll(courseId, userId);
    
    // 중복 등록 실패
    await expect(
      EnrollmentModel.enroll(courseId, userId)
    ).rejects.toThrow("이미 등록된 강좌입니다");
  });
});
```

---

## 컨벤션과 베스트 프랙티스

### 에러 메시지 패턴

일관된 에러 메시지를 위해 `this.modelName`과 `SD()` 함수를 사용합니다.

**BAD: 하드코딩된 모델명**
```typescript
// findById
if (!rows[0]) {
  throw new NotFoundException(SD("error.entityNotFound")("Department", id));
}

// findMany
throw new BadRequestException(SD("error.unknownSearchField")(params.search));
```

**GOOD: this.modelName 사용**
```typescript
// findById - 모델명 자동 인식
if (!rows[0]) {
  throw new NotFoundException(SD("notFound")(this.modelName, id));
}

// findMany - 짧고 명확한 키
throw new BadRequestException(SD("search.invalidField")(params.search));
```

**장점:**
- DRY 원칙 준수: 모델명 한 곳에서 관리
- 리팩토링 안전: 모델명 변경 시 에러 메시지 자동 반영
- 짧은 i18n 키: `notFound`, `search.invalidField`가 더 간결

### satisfies 키워드

TypeScript의 satisfies 키워드로 타입 추론을 유지하면서 타입 체크합니다.

**BAD: 타입 추론 상실**
```typescript
const params: RoleListParams = {
  num: 24,
  page: 1,
  search: "id" as const,
  orderBy: "id-desc" as const,
  ...rawParams,
};
```

**GOOD: satisfies로 타입 체크 + 추론 유지**
```typescript
const params = {
  num: 24,
  page: 1,
  search: "id" as const,
  orderBy: "id-desc" as const,
  ...rawParams,
} satisfies RoleListParams;
```

**장점:**
- 컴파일 타임 검증: params가 RoleListParams 타입을 만족하는지 확인
- 타입 추론 유지: params의 실제 타입이 좁혀진 상태로 유지됨
- IDE 지원 향상: 자동완성과 타입 체크가 더 정확

### debug 옵션

executeSubsetQuery의 debug 옵션은 기본값이 false이므로 명시할 필요 없습니다.

**BAD: 불필요한 debug: false**
```typescript
return this.executeSubsetQuery({
  subset,
  qb,
  params,
  enhancers,
  debug: false,  // 기본값이므로 불필요
});
```

**GOOD: 기본값 활용**
```typescript
return this.executeSubsetQuery({
  subset,
  qb,
  params,
  enhancers,
});
```

**debug: true를 사용하는 경우:**
```typescript
// 디버깅 시에만 명시
return this.executeSubsetQuery({
  subset,
  qb,
  params,
  debug: true,  // SQL 쿼리 로그 출력
});
```

## @stream 데코레이터 (SSE)

Server-Sent Events 엔드포인트를 생성합니다.

```typescript
import { stream } from "sonamu";
import { z } from "zod";

@stream({
  type: "sse",
  events: z.object({
    progress: z.object({ percent: z.number() }),
    done: z.object({ result: z.string() }),
  }),
  guards: ["user"],
})
async processStream() { ... }
```

| 옵션 | 설명 | 필수 |
|------|------|------|
| `type` | `"sse"` (현재 SSE만 지원) | 예 |
| `events` | Zod 스키마로 이벤트 키별 페이로드 정의 | 예 |
| `path` | 커스텀 경로 | - |
| `resourceName` | 리소스 이름 | - |
| `guards` | 인증/권한 가드 | - |

## @transactional 데코레이터

메서드 전체를 자동 트랜잭션으로 감쌉니다. 이미 트랜잭션 컨텍스트 안이면 재사용합니다.

```typescript
import { transactional } from "sonamu";

@transactional({ isolation: "serializable" })
async transferFunds(fromId: number, toId: number, amount: number) {
  // this.getPuri("w")가 자동으로 트랜잭션 안에서 실행됨
}
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `isolation` | 트랜잭션 격리 수준 (read uncommitted/read committed/repeatable read/serializable) | - |
| `readOnly` | 읽기 전용 트랜잭션 | `false` |
| `dbPreset` | DB 프리셋 | `"w"` |
