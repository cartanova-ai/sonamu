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
