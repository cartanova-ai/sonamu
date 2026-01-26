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
| `user` | 인증된 사용자 (또는 null) |
| `request` | FastifyRequest |
| `reply` | FastifyReply |
| `headers` | HTTP 요청 헤더 |
| `bufferedFiles` | 버퍼 모드 업로드 파일 |
| `uploadedFiles` | 스트림 모드 업로드 파일 |
| `locale` | 요청 언어 |
| `passport` | login/logout 메서드 |

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
