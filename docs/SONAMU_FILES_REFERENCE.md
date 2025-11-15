# Sonamu 파일 시스템 레퍼런스

> **작성일**: 2025-11    
> **목적**: Sonamu 프레임워크의 특별한 파일들과 워치/트리거/코드젠 파이프라인 완벽 가이드

---

## 📋 목차

1. [파일 분류 개요](#파일-분류-개요)
2. [소스 파일 (사용자 정의)](#소스-파일-사용자-정의)
3. [생성 파일 (자동 생성)](#생성-파일-자동-생성)
4. [메타 파일 (시스템)](#메타-파일-시스템)
5. [파이프라인 플로우](#파이프라인-플로우)
6. [연쇄 작용 시나리오](#연쇄-작용-시나리오)
7. [ESM 전환 전후 비교](#esm-전환-전후-비교)

---

## 파일 분류 개요

| 분류 | 설명 | 파일 목록 (총 11개) |
|------|------|------|
| **소스 파일** (5개) | 개발자가 직접 작성/수정 | `*.entity.json`, `*.types.ts`, `*.model.ts`, `*.frame.ts`, `*.functions.ts` |
| **생성 파일** (4개) | Syncer가 자동 생성/업데이트 | `sonamu.generated.ts`, `sonamu.generated.sso.ts`, `*.service.ts`, `sonamu.generated.http` |
| **메타 파일** (2개) | 시스템이 관리하는 파일 | `sonamu.lock`, `.swcrc` |

---

## 소스 파일 (사용자 정의)

### 1. `*.entity.json`

#### 📝 기본 정보
- **위치**: `api/src/application/{entity}/{entity}.entity.json`
- **목적**: 엔티티 스키마 정의 (테이블 구조, 관계, 서브셋 등)
- **타입**: **소스 파일**
- **편집**: Sonamu UI 또는 직접 수정
- **예시**: `user.entity.json`, `product.entity.json`

#### 🔍 파일 구조
```json
{
  "id": "User",
  "title": "사용자",
  "description": "사용자 정보",
  "properties": {
    "id": { "type": "int", "primaryKey": true },
    "name": { "type": "string", "length": 50 },
    "email": { "type": "string", "length": 100 }
  },
  "subsets": {
    "A": ["id", "name", "email"],
    "B": ["id", "name"]
  }
}
```

#### 🎯 트리거하는 코드 생성

**직접 생성:**
- ✨ `sonamu.generated.ts` (필수)
- ✨ `sonamu.generated.sso.ts` (필수)
- ✨ `{entity}.types.ts` (신규 entity인 경우만 스캐폴딩)
- ✨ `{entity}.model.ts` (신규 entity인 경우만 스캐폴딩)

**간접 영향 (연쇄 작용):**
- `generated.ts` 변경 → 이를 import하는 모든 `*.types.ts` HMR 리로드
- `types.ts` 변경 → 이를 import하는 모든 `*.model.ts` HMR 리로드
- `model.ts` 변경 → `*.service.ts` 재생성

#### 🔄 파이프라인에서의 역할

**ESM 전환 전 (CJS)**:
```
user.entity.json 저장
  ↓
[chokidar] src/application/user/user.entity.json 감지
  ↓
[Syncer] syncFromWatcher()
  ├─ checksumPatternGroup.entity 매칭
  ├─ EntityManager.reload() - JSON 파일들 읽기
  ├─ actionGenerateSchemas()
  │   ✨ sonamu.generated.ts 생성
  │   ✨ sonamu.generated.sso.ts 생성
  ├─ (신규 entity면)
  │   ✨ user.types.ts 스캐폴딩
  │   ✨ user.model.ts 스캐폴딩
  └─ 수동 트랜스파일 + require.cache 클리어
```

**ESM 전환 후 (현재)**:
```
user.entity.json 저장
  ↓
[chokidar] src/application/user/user.entity.json 감지
  ↓
[Syncer] syncFromWatcher()
  ├─ checksumPatternGroup.entity 매칭
  ├─ EntityManager.reload()
  ├─ actionGenerateSchemas()
  │   ✨ sonamu.generated.ts 생성
  │   ✨ sonamu.generated.sso.ts 생성
  └─ (신규 entity면)
      ✨ user.types.ts 스캐폴딩
      ✨ user.model.ts 스캐폴딩
  
[백그라운드 - 자동]
  [@sonamu-kit/loader] generated.ts 트랜스파일 (온디맨드)
  [dynohot] 의존 모듈들 자동 리로드 ⚡
    ├─ user.types.ts (generated.ts를 import)
    ├─ user.model.ts (user.types.ts를 import)
    └─ 기타 의존 모듈들...
```

**주요 차이점**:
- ❌ 전: Syncer가 트랜스파일 직접 수행
- ✅ 후: loader와 dynohot이 자동 처리
- ✅ 후: 의존성 추적 자동 (import 그래프 기반)

---

### 2. `*.types.ts`

#### 📝 기본 정보
- **위치**: `api/src/application/{entity}/{entity}.types.ts`
- **목적**: Zod 스키마 확장, 커스텀 타입 정의
- **타입**: **소스 파일** (신규 entity 시 자동 생성 → 이후 사용자 수정)
- **편집**: 개발자가 직접 수정
- **예시**: `user.types.ts`, `product.types.ts`

#### 🔍 파일 구조
```typescript
import { UserBaseSchema } from './sonamu.generated';
import { z } from 'zod';

// BaseSchema 그대로 사용 또는 확장
export const UserSchema = UserBaseSchema;

// 리스트 파라미터
export const UserListParams = z.object({
  keyword: z.string().optional(),
  page: z.number().default(1),
  limit: z.number().default(20),
});

// 저장 파라미터
export const UserSaveParams = UserBaseSchema.partial({ id: true });

// 커스텀 타입
export const UserWithStats = UserSchema.extend({
  postCount: z.number(),
  commentCount: z.number(),
});
```

#### 🎯 트리거하는 코드 생성

**직접 생성:**
- 📋 프론트엔드 타겟으로 복사 (`actionSyncFilesToTargets`)
  - `web/src/services/user.types.ts`
  - `app/src/services/user.types.ts`

**간접 영향 (연쇄 작용):**
- `types.ts` 변경 → 이를 import하는 모든 `*.model.ts` HMR 리로드

#### 🔄 파이프라인에서의 역할

**ESM 전환 전 (CJS)**:
```
user.types.ts 수정
  ↓
[chokidar] src/application/user/user.types.ts 감지
  ↓
[Syncer] syncFromWatcher()
  ├─ 트랜스파일: src/user.types.ts → dist/user.types.js
  ├─ checksumPatternGroup.types 매칭 (src 경로)
  └─ actionSyncFilesToTargets()
      📋 web/src/services/user.types.ts (복사)
      📋 app/src/services/user.types.ts (복사)
```

**ESM 전환 후 (현재)**:
```
user.types.ts 수정
  ↓
[chokidar] src/application/user/user.types.ts 감지
  ↓
[Syncer] syncFromWatcher()
  ├─ checksumPatternGroup.types 매칭 (src 경로)
  └─ actionSyncFilesToTargets()
      📋 web/src/services/user.types.ts (복사)
      📋 app/src/services/user.types.ts (복사)

[백그라운드]
  [@sonamu-kit/loader] user.types.ts 트랜스파일 (온디맨드)
  [dynohot] 의존 모듈들 자동 리로드 ⚡
    └─ user.model.ts (user.types.ts를 import)
```

---

### 3. `*.model.ts`

#### 📝 기본 정보
- **위치**: `api/src/application/{entity}/{entity}.model.ts`
- **목적**: 비즈니스 로직, API 엔드포인트 정의 (`@api` 데코레이터)
- **타입**: **소스 파일** (신규 entity 시 자동 생성 → 이후 사용자 수정)
- **편집**: 개발자가 직접 작성
- **예시**: `user.model.ts`, `product.model.ts`

#### 🔍 파일 구조
```typescript
import { BaseModelClass } from 'sonamu';
import { UserSchema, UserListParams, UserSaveParams } from './user.types';
import { ListResult } from 'sonamu';

class UserModelClass extends BaseModelClass {
  modelName = "User";

  @api({ 
    httpMethod: "GET", 
    clients: ["axios", "swr"],
    resourceName: "User" 
  })
  async list(params: UserListParams): Promise<ListResult<User>> {
    const rows = await this.runSubsetQuery({
      subsetKey: "A",
      params,
    });
    return { rows, total: rows.length };
  }

  @api({ httpMethod: "POST" })
  async save(params: UserSaveParams): Promise<number> {
    return await this.insert(params);
  }

  @api({ httpMethod: "GET" })
  async findById(id: number): Promise<User | null> {
    return await this.findOne({ id });
  }
}

export const UserModel = new UserModelClass();
```

#### 🎯 트리거하는 코드 생성

**직접 생성:**
- ✨ `*.service.ts` (프론트엔드 API 클라이언트)
  - `web/src/services/user.service.ts`
  - `app/src/services/user.service.ts`
- ✨ `sonamu.generated.http` (REST Client 테스트 파일)

**중요**: `@api` 데코레이터가 있는 메서드가 변경될 때만 service 재생성!

#### 🔄 파이프라인에서의 역할

**ESM 전환 전 (CJS)**:
```
user.model.ts 수정
  ↓
[chokidar] src/application/user/user.model.ts 감지
  ↓
[Syncer] syncFromWatcher()
  ├─ 트랜스파일: src/user.model.ts → dist/user.model.js
  ├─ require.cache 클리어 (재귀)
  ├─ checksumPatternGroup.model 매칭 (dist/*.js 경로!)
  ├─ autoloadModels() - require("dist/user.model.js")
  │   → @api 데코레이터 실행 → registeredApis에 등록
  ├─ autoloadApis() - registeredApis 읽기
  └─ actionGenerateServices()
      ✨ user.service.ts 생성
      ✨ sonamu.generated.http 업데이트
```

**ESM 전환 후 (현재 - 수정 필요!)**:
```
user.model.ts 수정
  ↓
[@sonamu-kit/loader] user.model.ts → .js 트랜스파일 (백그라운드)
  ↓
[chokidar] src/application/user/user.model.ts 감지
  ↓
[Syncer] syncFromWatcher()
  ├─ checksumPatternGroup.model 매칭 (src/*.ts 경로로 변경 필요!)
  ├─ autoloadModels() - import("src/user.model.ts" 또는 "dist/user.model.js")
  │   → @api 데코레이터 실행 → registeredApis에 등록
  ├─ autoloadApis() - registeredApis 읽기 (AST 기반)
  └─ actionGenerateServices()
      ✨ user.service.ts 생성
      ✨ sonamu.generated.http 업데이트

[백그라운드]
  [dynohot] user.model.ts 자동 리로드 ⚡
```

**주요 차이점**:
- ❌ 전: dist/*.js 감시, Syncer가 트랜스파일
- ⚠️ 후: src/*.ts 감시로 변경 필요, loader가 트랜스파일
- ⚠️ 후: 환경별 import 경로 분기 필요 (dev: src, prod: dist)

---

### 4. `*.frame.ts`

#### 📝 기본 정보
- **위치**: `api/src/application/{entity}/{entity}.frame.ts`
- **목적**: 관계형 데이터 프레임 정의 (JOIN 로직 캡슐화)
- **타입**: **소스 파일**
- **편집**: 개발자가 직접 작성
- **예시**: `user_with_posts.frame.ts`

#### 🔍 파일 구조
```typescript
import { BaseFrameClass } from 'sonamu';

class UserWithPostsFrameClass extends BaseFrameClass {
  frameName = "UserWithPosts";

  @api({ httpMethod: "GET" })
  async list(params: UserWithPostsListParams) {
    // JOIN 로직
    const query = this.db
      .select('users.*', 'posts.title')
      .from('users')
      .leftJoin('posts', 'users.id', 'posts.user_id');
    
    return await query;
  }
}

export const UserWithPostsFrame = new UserWithPostsFrameClass();
```

#### 🔄 파이프라인에서의 역할
- `*.model.ts`와 동일한 처리 과정
- `checksumPatternGroup.frame` 패턴으로 감지
- `@api` 데코레이터가 있으면 service 생성

---

### 5. `*.functions.ts`

#### 📝 기본 정보
- **위치**: `api/src/application/**/*.functions.ts`
- **목적**: 공유 유틸리티 함수, 헬퍼 함수
- **타입**: **소스 파일**
- **편집**: 개발자가 직접 작성
- **예시**: `auth.functions.ts`, `validation.functions.ts`

#### 🔍 파일 구조
```typescript
import bcrypt from 'bcrypt';

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string, 
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
```

#### 🎯 트리거하는 코드 생성

**직접 생성:**
- 📋 프론트엔드 타겟으로 복사 (`actionSyncFilesToTargets`)
  - `web/src/services/auth.functions.ts`
  - `app/src/services/auth.functions.ts`

#### 🔄 파이프라인에서의 역할
- `*.types.ts`와 동일한 처리 (프론트엔드로 복사)
- `checksumPatternGroup.functions` 패턴으로 감지

---

## 생성 파일 (자동 생성)

### 6. `sonamu.generated.ts`

#### 📝 기본 정보
- **위치**: `api/src/application/sonamu.generated.ts`
- **목적**: 모든 엔티티의 BaseSchema, Enums, 타입 정의 자동 생성
- **타입**: **생성 파일** (자동 - 절대 수동 편집 금지!)
- **생성 트리거**: `*.entity.json` 변경 시
- **생성 함수**: `actionGenerateSchemas()` → `Template__generated.render()`

#### 🔍 파일 구조
```typescript
// ⚠️ 자동 생성 파일 - 수동 수정 금지!
import { z } from 'zod';

// Enums
export const UserRole = z.enum(['admin', 'user', 'guest']);
export type UserRole = z.infer<typeof UserRole>;

// BaseSchema
export const UserBaseSchema = z.object({
  id: z.number().int(),
  name: z.string().max(50),
  email: z.string().max(100).email(),
  role: UserRole,
  created_at: z.date(),
});

export type User = z.infer<typeof UserBaseSchema>;

// Subsets
export const UserSubsetA = UserBaseSchema.pick({
  id: true,
  name: true,
  email: true,
});

export type UserSubsetA = z.infer<typeof UserSubsetA>;

export const UserSubsetB = UserBaseSchema.pick({
  id: true,
  name: true,
});

export type UserSubsetB = z.infer<typeof UserSubsetB>;
```

#### 🎯 트리거하는 코드 생성

**직접 생성:**
- 📋 프론트엔드 타겟으로 복사 (`actionSyncFilesToTargets`)
  - `web/src/services/sonamu.generated.ts`
  - `app/src/services/sonamu.generated.ts`

**간접 영향 (연쇄 작용):**
- `generated.ts` 변경 → 이를 import하는 모든 `*.types.ts` HMR 리로드
- `types.ts` 리로드 → 이를 import하는 모든 `*.model.ts` HMR 리로드
- `model.ts` 리로드 → `*.service.ts` 재생성

#### 🔄 파이프라인에서의 역할

**생성 트리거**:
```
*.entity.json 변경
  ↓
[Syncer] doSyncActions()
  ├─ EntityManager.reload()
  └─ actionGenerateSchemas()
      └─ Template__generated.render()
          ✨ sonamu.generated.ts 생성/업데이트
```

**연쇄 트리거** (같은 사이클 내):
```
sonamu.generated.ts 파일 쓰기 완료
  ↓
[Syncer] doSyncActions() 계속
  ├─ checksumPatternGroup.generated 매칭
  └─ actionSyncFilesToTargets()
      📋 web/src/services/sonamu.generated.ts
      📋 app/src/services/sonamu.generated.ts

[백그라운드]
  [dynohot] import 그래프 추적 → 의존 모듈들 자동 리로드
    ├─ *.types.ts (generated를 import)
    ├─ *.model.ts (types를 import)
    └─ 기타...
```

**중요 특징**:
- 🔄 **순환 트리거 방지**: 같은 HMR 사이클 내에서 처리
- 📋 **프론트엔드 동기화**: 자동으로 웹/앱 프로젝트에 복사
- ⚡ **HMR 핵심**: 가장 많은 의존성을 가진 파일

---

### 7. `sonamu.generated.sso.ts`

#### 📝 기본 정보
- **위치**: `api/src/application/sonamu.generated.sso.ts`
- **목적**: SSO(Single Sign-On) 전용 스키마 생성
- **타입**: **생성 파일** (자동 - 절대 수동 편집 금지!)
- **생성 트리거**: `*.entity.json` 변경 시
- **생성 함수**: `actionGenerateSchemas()` → `Template__generated_sso.render()`

#### 🔍 파일 구조
```typescript
// ⚠️ 자동 생성 파일 - 수동 수정 금지!
import { z } from 'zod';

export const SSOUserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string(),
  // SSO 필수 필드만 포함
});
```

#### 🔄 파이프라인에서의 역할
- `sonamu.generated.ts`와 동일한 트리거 및 처리 과정
- `actionGenerateSchemas()`에서 함께 생성됨

---

### 8. `*.service.ts`

#### 📝 기본 정보
- **위치**: `web/src/services/{entity}.service.ts`, `app/src/services/{entity}.service.ts`
- **목적**: 프론트엔드 API 클라이언트 코드 (Axios, SWR)
- **타입**: **생성 파일** (자동 - 절대 수동 편집 금지!)
- **생성 트리거**: `*.model.ts` 또는 `*.frame.ts`에서 `@api` 데코레이터 추가/수정 시
- **생성 함수**: `actionGenerateServices()` → `Template__service.render()`

#### 🔍 파일 구조
```typescript
// ⚠️ 자동 생성 파일 - 수동 수정 금지!
import axios from 'axios';
import useSWR from 'swr';
import { UserListParams, UserSaveParams } from './user.types';
import { User, ListResult } from './sonamu.generated';

// Axios 클라이언트
export const UserService = {
  async list(params: UserListParams): Promise<ListResult<User>> {
    const { data } = await axios.get('/api/users/list', { params });
    return data;
  },
  
  async save(params: UserSaveParams): Promise<number> {
    const { data } = await axios.post('/api/users/save', params);
    return data;
  },

  async findById(id: number): Promise<User | null> {
    const { data } = await axios.get(`/api/users/${id}`);
    return data;
  },
};

// SWR Hooks
export function useUserList(params: UserListParams) {
  return useSWR(['/api/users/list', params], () => 
    UserService.list(params)
  );
}

export function useUser(id: number) {
  return useSWR(`/api/users/${id}`, () => 
    UserService.findById(id)
  );
}
```

#### 🔄 파이프라인에서의 역할

**생성 트리거**:
```
user.model.ts에서 @api 데코레이터 추가/수정
  ↓
[Syncer] doSyncActions()
  ├─ autoloadModels() - 모델 로드 & 데코레이터 실행
  ├─ autoloadApis() - registeredApis 수집
  └─ actionGenerateServices()
      └─ Template__service.render()
          ✨ web/src/services/user.service.ts 생성/업데이트
          ✨ app/src/services/user.service.ts 생성/업데이트
```

**연쇄 트리거 예시**:
```
user.entity.json 변경 (필드 추가)
  ↓
sonamu.generated.ts 재생성
  ↓
[dynohot] user.types.ts 리로드 (generated import)
  ↓
[dynohot] user.model.ts 리로드 (types import)
  ↓
[Syncer] autoloadApis() 재파싱
  ↓
user.service.ts 재생성 (API 시그니처 변경)
```

**중요 특징**:
- 🎯 **타겟별 생성**: web, app 각각 생성
- 🔄 **API 동기화**: 백엔드 API와 자동 동기화
- 📝 **타입 안전**: TypeScript 타입 완전 보장
- 🔗 **의존성**: `*.types.ts`와 `sonamu.generated.ts`에 의존

---

### 9. `sonamu.generated.http`

#### 📝 기본 정보
- **위치**: `api/src/application/sonamu.generated.http`
- **목적**: REST Client 확장용 HTTP 파일 (VSCode 등에서 API 테스트)
- **타입**: **생성 파일** (자동 - 파라미터만 수동 수정 가능)
- **생성 트리거**: `*.model.ts` 또는 `*.frame.ts`에서 `@api` 데코레이터 추가/수정 시
- **생성 함수**: `actionGenerateHttps()` → `Template__generated_http.render()`

#### 🔍 파일 구조
```http
### User.list
GET http://localhost:3000/api/users/list
  ?keyword=test
  &page=1
  &limit=20

### User.save
POST http://localhost:3000/api/users/save
Content-Type: application/json

{
  "name": "홍길동",
  "email": "hong@example.com",
  "role": "user"
}

### User.findById
GET http://localhost:3000/api/users/1
```

#### 🔄 파이프라인에서의 역할

**생성 트리거**:
```
user.model.ts에서 @api 데코레이터 추가/수정
  ↓
[Syncer] doSyncActions()
  ├─ autoloadModels()
  ├─ autoloadApis()
  └─ actionGenerateHttps()
      └─ Template__generated_http.render()
          ✨ sonamu.generated.http 생성/업데이트
```

**특징**:
- 🧪 **즉시 테스트 가능**: VSCode REST Client로 바로 실행
- 📝 **파라미터 예시**: 각 API의 파라미터 예시 포함
- 🔄 **항상 최신**: model.ts 변경 시 자동 업데이트

---

## 메타 파일 (시스템)

### 10. `sonamu.lock`

#### 📝 기본 정보
- **위치**: `api/sonamu.lock`
- **목적**: 파일 체크섬 저장 (변경 감지용)
- **타입**: **메타 파일** (시스템 - 절대 수동 편집 금지!)
- **생성/업데이트**: `sync()` 실행 시

#### 🔍 파일 구조
```json
[
  {
    "path": "/src/application/user/user.entity.json",
    "checksum": "a1b2c3d4e5f6..."
  },
  {
    "path": "/src/application/user/user.types.ts",
    "checksum": "1a2b3c4d5e6f..."
  },
  {
    "path": "/src/application/user/user.model.ts",
    "checksum": "f1e2d3c4b5a6..."
  }
]
```

#### 🔄 파이프라인에서의 역할
```
[Syncer] sync() 시작
  ↓
getCurrentChecksums() - 현재 모든 파일 체크섬 계산
  ↓
getPreviousChecksums() - sonamu.lock에서 이전 체크섬 읽기
  ↓
diff 비교 - 변경된 파일 찾기
  ↓
doSyncActions() - 코드 생성
  ↓
saveChecksums() - sonamu.lock 업데이트
```

---

### 11. `.swcrc`

#### 📝 기본 정보
- **위치**: `api/.swcrc`
- **목적**: SWC 트랜스파일 설정
- **타입**: **설정 파일**
- **편집**: 개발자가 필요시 수정

#### 🔍 파일 구조
```json
{
  "module": {
    "type": "es6",
    "resolveFully": true
  },
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true
    },
    "baseUrl": ".",
    "target": "esnext"
  },
  "minify": false,
  "sourceMaps": true
}
```

#### 🔄 ESM 전환 전후 차이

**전 (CJS)**:
- Syncer 코드에 하드코딩:
  ```typescript
  swc.transformFile(file, {
    module: { type: "commonjs" },
    jsc: { target: "es5" }
  })
  ```
- `.swcrc` 무시됨

**후 (ESM)**:
- `@sonamu-kit/loader`가 `.swcrc` 자동 읽기
- Syncer는 설정 신경 안 씀
- 프로젝트별 커스터마이징 가능

---

## 파이프라인 플로우

### 전체 파일 관계도

```
┌─────────────────────────────────────────────────────────┐
│ 소스 파일 (사용자 작성)                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  *.entity.json ──┐                                      │
│                  │                                      │
│  *.types.ts ─────┤                                      │
│                  │                                      │
│  *.model.ts ─────┤                                      │
│                  │                                      │
│  *.frame.ts ─────┤                                      │
│                  │                                      │
│  *.functions.ts ─┘                                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
                    ↓
         [chokidar 감시] → [Syncer 트리거]
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 생성 파일 (자동 생성)                                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  sonamu.generated.ts ──┐                                │
│                        │                                │
│  sonamu.generated.sso.ts                                │
│                        │                                │
│  *.service.ts ─────────┤                                │
│                        │                                │
│  sonamu.generated.http ┘                                │
│                                                          │
└─────────────────────────────────────────────────────────┘
                    ↓
              [HMR / 배포]
```

### Phase별 상세 플로우

#### Phase 1: Entity 변경
```
user.entity.json 수정
  ↓
[chokidar] 감지
  ↓
[Syncer]
  ├─ EntityManager.reload()
  ├─ actionGenerateSchemas()
  │   ✨ sonamu.generated.ts
  │   ✨ sonamu.generated.sso.ts
  └─ (신규) user.types.ts 스캐폴딩
  ↓
[자동 연쇄 → Phase 2]
```

#### Phase 2: Generated 동기화
```
sonamu.generated.ts 변경됨
  ↓
[Syncer]
  └─ actionSyncFilesToTargets()
      📋 web/src/services/sonamu.generated.ts
      📋 app/src/services/sonamu.generated.ts
  ↓
[dynohot] 의존 모듈들 자동 리로드 ⚡
```

#### Phase 3: Types 직접 수정
```
user.types.ts 수정
  ↓
[chokidar] 감지
  ↓
[Syncer]
  └─ actionSyncFilesToTargets()
      📋 web/src/services/user.types.ts
  ↓
[dynohot] 자동 리로드 ⚡
```

#### Phase 4: Model 수정
```
user.model.ts 수정 (@api 추가/수정)
  ↓
[@sonamu-kit/loader] 트랜스파일 (백그라운드)
  ↓
[chokidar] 감지
  ↓
[Syncer]
  ├─ autoloadModels() - 데코레이터 실행
  ├─ autoloadApis() - API 정보 수집
  ├─ actionGenerateServices()
  │   ✨ user.service.ts
  └─ actionGenerateHttps()
      ✨ sonamu.generated.http
  ↓
[dynohot] 자동 리로드 ⚡
```

---

## 연쇄 작용 시나리오

### 시나리오 1: Entity에 필드 추가

**액션**: `user.entity.json`에 `nickname` 필드 추가

```
user.entity.json 수정
  └─ "nickname": { "type": "string", "length": 50 }
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 1: Syncer 코드 생성
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] actionGenerateSchemas()
  ✨ sonamu.generated.ts 업데이트
      export const UserBaseSchema = z.object({
        id: z.number().int(),
        name: z.string().max(50),
        email: z.string().max(100),
        nickname: z.string().max(50),  // ← 새로 추가
        ...
      });
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 2: HMR 연쇄 리로드 (dynohot 자동)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[dynohot] sonamu.generated.ts 변경 감지
  ↓
user.types.ts 리로드 (generated.ts import)
  import { UserBaseSchema } from './sonamu.generated';
  ↓
user.model.ts 리로드 (user.types.ts import)
  import { UserSchema, UserSaveParams } from './user.types';
  ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 3: Service 재생성 (Syncer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] autoloadApis() 재파싱
  ↓
[Syncer] actionGenerateServices()
  ✨ user.service.ts 재생성
      async save(params: UserSaveParams): Promise<number> {
        // UserSaveParams에 nickname 포함됨
      }
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 4: 프론트엔드 동기화
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] actionSyncFilesToTargets()
  📋 web/src/services/sonamu.generated.ts
  📋 web/src/services/user.types.ts
  📋 web/src/services/user.service.ts
    ↓
[프론트엔드] 타입 안전하게 nickname 사용 가능!
```

**소요 시간**: < 500ms
**재시작 필요**: 없음
**수동 작업**: 없음

---

### 시나리오 2: Types에서 커스텀 스키마 추가

**액션**: `user.types.ts`에 `UserWithStats` 추가

```
user.types.ts 수정
  export const UserWithStats = UserSchema.extend({
    postCount: z.number(),
    commentCount: z.number(),
  });
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 1: Syncer 프론트엔드 동기화
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] actionSyncFilesToTargets()
  📋 web/src/services/user.types.ts
  📋 app/src/services/user.types.ts
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 2: HMR 리로드 (dynohot)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[dynohot] user.types.ts 변경 감지
  ↓
user.model.ts 리로드 (user.types.ts import)
  import { UserWithStats } from './user.types';
  
  @api({ httpMethod: "GET" })
  async getWithStats(id: number): Promise<UserWithStats> {
    // UserWithStats 사용 가능
  }
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 3: Service 재생성 (변경 있으면)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] autoloadApis()
  ↓
(model.ts에서 UserWithStats를 리턴 타입으로 사용했다면)
[Syncer] actionGenerateServices()
  ✨ user.service.ts 재생성
```

**소요 시간**: < 100ms
**재시작 필요**: 없음

---

### 시나리오 3: Model에 새 API 메서드 추가

**액션**: `user.model.ts`에 `findByEmail` 메서드 추가

```
user.model.ts 수정
  @api({ httpMethod: "GET" })
  async findByEmail(email: string): Promise<User | null> {
    return await this.findOne({ email });
  }
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 1: HMR 리로드 (dynohot)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[@sonamu-kit/loader] user.model.ts 트랜스파일
  ↓
[dynohot] user.model.ts 리로드
  → @api 데코레이터 실행
  → registeredApis에 등록
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 2: Service 재생성 (Syncer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] autoloadApis() 재파싱
  ↓
[Syncer] actionGenerateServices()
  ✨ user.service.ts 재생성
      // 새 메서드 추가됨
      async findByEmail(email: string): Promise<User | null> {
        const { data } = await axios.get('/api/users/findByEmail', {
          params: { email }
        });
        return data;
      }
  ✨ sonamu.generated.http 업데이트
      ### User.findByEmail
      GET http://localhost:3000/api/users/findByEmail
        ?email=test@example.com
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 3: 프론트엔드 동기화
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
web/src/services/user.service.ts 업데이트됨
  → 프론트엔드에서 즉시 사용 가능:
    import { UserService } from './services/user.service';
    
    const user = await UserService.findByEmail('test@example.com');
```

**소요 시간**: < 200ms
**재시작 필요**: 없음
**API 즉시 사용 가능**: ✅

---

### 시나리오 4: 새 Entity 생성 (완전 연쇄)

**액션**: `product.entity.json` 신규 생성

```
Sonamu UI에서 Product 엔티티 생성
  ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 1: Syncer 초기 스캐폴딩
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] actionGenerateSchemas()
  ✨ sonamu.generated.ts 업데이트
      export const ProductBaseSchema = z.object({ ... });
  ✨ sonamu.generated.sso.ts 업데이트
  
[Syncer] 신규 entity 감지
  ✨ product.types.ts 스캐폴딩
      import { ProductBaseSchema } from './sonamu.generated';
      export const ProductSchema = ProductBaseSchema;
      export const ProductListParams = z.object({ ... });
      export const ProductSaveParams = ProductBaseSchema.partial({ id: true });
  
  ✨ product.model.ts 스캐폴딩
      class ProductModelClass extends BaseModelClass {
        modelName = "Product";
        
        @api({ httpMethod: "GET", clients: ["axios", "swr"] })
        async list(params: ProductListParams) { ... }
        
        @api({ httpMethod: "POST" })
        async save(params: ProductSaveParams) { ... }
      }
      export const ProductModel = new ProductModelClass();
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 2: Service 자동 생성
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] autoloadModels()
  → product.model.ts 로드
  → @api 데코레이터 실행
  ↓
[Syncer] autoloadApis()
  → Product.list, Product.save 등록
  ↓
[Syncer] actionGenerateServices()
  ✨ product.service.ts 생성
      export const ProductService = {
        async list(params: ProductListParams) { ... },
        async save(params: ProductSaveParams) { ... },
      };
      
      export function useProductList(params: ProductListParams) { ... }
  
  ✨ sonamu.generated.http 업데이트
      ### Product.list
      GET http://localhost:3000/api/products/list
      
      ### Product.save
      POST http://localhost:3000/api/products/save
      Content-Type: application/json
      { ... }
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 3: 프론트엔드 동기화
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] actionSyncFilesToTargets()
  📋 web/src/services/sonamu.generated.ts
  📋 web/src/services/product.types.ts
  📋 web/src/services/product.service.ts
    ↓
[프론트엔드] 즉시 사용 가능!
  import { ProductService, useProductList } from './services/product.service';
  
  function ProductList() {
    const { data, error } = useProductList({ page: 1, limit: 20 });
    return <div>...</div>;
  }
```

**생성된 파일**:
- ✨ `product.entity.json` (사용자)
- ✨ `product.types.ts` (스캐폴딩)
- ✨ `product.model.ts` (스캐폴딩)
- ✨ `product.service.ts` (자동)
- ✨ `sonamu.generated.ts` (업데이트)
- ✨ `sonamu.generated.http` (업데이트)

**소요 시간**: < 1000ms
**수동 작업**: 없음 (스캐폴딩된 파일을 나중에 수정)

---

### 시나리오 5: Generated 변경의 전파

**액션**: `user.entity.json`에서 `email` 필드를 `email_address`로 변경

```
user.entity.json 수정
  "email" → "email_address"
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 1: Syncer 코드 생성
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] actionGenerateSchemas()
  ✨ sonamu.generated.ts 업데이트
      export const UserBaseSchema = z.object({
        id: z.number().int(),
        name: z.string().max(50),
        email_address: z.string().max(100),  // ← 변경됨
        ...
      });
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 2: 연쇄 HMR (dynohot 자동)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[dynohot] sonamu.generated.ts 감지
  ↓
user.types.ts 리로드
  import { UserBaseSchema } from './sonamu.generated';
  export const UserSchema = UserBaseSchema;
  // email → email_address 반영됨
  ↓
user.model.ts 리로드
  import { UserSchema, UserSaveParams } from './user.types';
  
  @api({ httpMethod: "POST" })
  async save(params: UserSaveParams) {
    // params.email_address로 접근해야 함
  }
  ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 3: Service 재생성
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Syncer] actionGenerateServices()
  ✨ user.service.ts 재생성
      // 타입이 자동으로 업데이트됨
      async save(params: {
        name: string;
        email_address: string;  // ← 변경됨
      }) { ... }
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 4: 컴파일 에러 발생 (의도된 동작)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[TypeScript] 기존 코드에서 타입 에러
  
  // 백엔드 (user.model.ts)
  async save(params: UserSaveParams) {
    const email = params.email;  // ❌ 타입 에러: email 속성 없음
    const email = params.email_address;  // ✅ 수정 필요
  }
  
  // 프론트엔드 (UserForm.tsx)
  await UserService.save({
    name: 'John',
    email: 'john@example.com',  // ❌ 타입 에러
  });
  
  // 수정:
  await UserService.save({
    name: 'John',
    email_address: 'john@example.com',  // ✅
  });
```

**결과**:
- ✅ 타입 시스템이 모든 변경 위치를 알려줌
- ✅ 컴파일 타임에 에러 잡기 (런타임 버그 방지)
- ✅ 프론트엔드/백엔드 타입 동기화 자동

---

## ESM 전환 전후 비교

### 요약 테이블

| 항목 | ESM 전환 전 (CJS) | ESM 전환 후 (현재) |
|------|------------------|-------------------|
| **감시 대상** | `src/**/*.ts` | `src/**/*.ts` (동일) |
| **트랜스파일** | Syncer가 직접 | `@sonamu-kit/loader` 자동 |
| **설정** | 코드 하드코딩 | `.swcrc` 파일 |
| **model 감시** | `dist/**/*.model.js` | `src/**/*.model.ts` ⚠️ |
| **import 경로** | 항상 `dist/*.js` | 환경 분기 필요 ⚠️ |
| **캐시 관리** | `require.cache` 수동 | `dynohot` 자동 |
| **HMR** | 수동 재로드 | 자동 리로드 |
| **의존성 추적** | 재귀 탐색 (복잡) | import 그래프 (자동) |

### 상세 비교: Entity 변경

#### 🔴 ESM 전환 전 (CJS)
```
user.entity.json 저장
  ↓
[chokidar] src/user.entity.json 감지
  ↓
[Syncer] syncFromWatcher()
  ├─ EntityManager.reload()
  ├─ actionGenerateSchemas()
  │   ✨ sonamu.generated.ts 생성
  ├─ [Syncer가 직접] swc.transformFile(generated.ts)
  │   → dist/sonamu.generated.js 생성
  ├─ [Syncer가 직접] require.cache 클리어 (재귀)
  │   → generated.js 삭제
  │   → user.types.js 삭제
  │   → user.model.js 삭제
  │   → 부모 모듈들도 삭제...
  ├─ [Syncer가 직접] autoloadTypes() - require() 재실행
  ├─ [Syncer가 직접] autoloadModels() - require() 재실행
  └─ actionSyncFilesToTargets()
      📋 web/services/sonamu.generated.ts

⏱️ 느림: 매번 수동 트랜스파일 + 재귀 캐시 클리어
❌ 복잡: Syncer가 너무 많은 역할
❌ 불안정: 캐시 클리어 실패 가능성
```

#### 🟢 ESM 전환 후 (현재)
```
user.entity.json 저장
  ↓
[chokidar] src/user.entity.json 감지
  ↓
[Syncer] syncFromWatcher()
  ├─ EntityManager.reload()
  ├─ actionGenerateSchemas()
  │   ✨ sonamu.generated.ts 생성
  └─ actionSyncFilesToTargets()
      📋 web/services/sonamu.generated.ts

[백그라운드 - 자동]
  [@sonamu-kit/loader] 필요시 트랜스파일 (온디맨드 + 캐싱)
  [dynohot] import 그래프 추적 → 자동 리로드 ⚡
    ├─ sonamu.generated.ts
    ├─ user.types.ts (generated import)
    ├─ user.model.ts (types import)
    └─ 기타 의존 모듈들...

⚡ 빠름: 온디맨드 트랜스파일 + 자동 HMR
✅ 간단: Syncer는 코드 생성만
✅ 안정적: 검증된 dynohot 라이브러리
```

### 상세 비교: Model 변경

#### 🔴 ESM 전환 전 (CJS)
```
user.model.ts 저장
  ↓
[chokidar] src/user.model.ts 감지
  ↓
[Syncer] syncFromWatcher()
  ├─ [Syncer가 직접] swc.transformFile(user.model.ts)
  │   → dist/user.model.js 생성
  ├─ [Syncer가 직접] require.cache 클리어
  ├─ allFilePaths = [src/user.model.ts, dist/user.model.js]  ← 둘 다!
  ├─ checksumPatternGroup.model 매칭 (dist/*.js)
  ├─ autoloadModels() - require("dist/user.model.js")
  ├─ autoloadApis()
  └─ actionGenerateServices()
      ✨ user.service.ts

⚠️ 문제점: Syncer가 트랜스파일 + 캐시 관리까지
⚠️ 트릭: src/*.ts를 트랜스파일해서 dist/*.js 만들고,
         둘 다 targetFilePaths에 넣어서 패턴 매칭
```

#### 🟢 ESM 전환 후 (현재 - 수정 필요!)
```
user.model.ts 저장
  ↓
[@sonamu-kit/loader] 백그라운드 트랜스파일 (온디맨드)
  ↓
[chokidar] src/user.model.ts 감지
  ↓
[Syncer] syncFromWatcher()
  ├─ checksumPatternGroup.model 매칭 (src/*.ts) ⚠️ 수정 필요
  ├─ autoloadModels() - import 환경 분기 ⚠️ 추가 필요
  │   if (isHMREnabled()) {
  │     import("src/user.model.ts")   // Dev
  │   } else {
  │     import("dist/user.model.js")  // Prod
  │   }
  ├─ autoloadApis()
  └─ actionGenerateServices()
      ✨ user.service.ts

[백그라운드]
  [dynohot] 자동 리로드 ⚡

✅ 개선점: Syncer는 코드젠만, 나머지는 자동
⚠️ TODO: checksumPatternGroup과 autoloadModels 수정 필요
```

---

## 🔄 트랜스파일-처리-코드젠 순환 (Transpile-Process-Codegen Cycle)

> **핵심 질문**: "ts파일 변경 → 워처 감지 → 트랜스파일(ts→js) → 그 js 처리 → 코드젠 → 또 트랜스파일" 이런 흐름이 있나요?
> 
> **답변**: 네, **CJS 방식에서는 정확히 이 흐름이 존재했어요!** ESM에서는 이게 사라졌고요.

### CJS 방식의 순환 흐름 (복잡!)

#### 케이스 1: Model 파일 변경 → Service 생성

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: 사용자가 Model 수정                                 │
└─────────────────────────────────────────────────────────────┘
user.model.ts 수정 (소스 파일)
  - @api 데코레이터 추가/수정
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Syncer가 트랜스파일 (TS → JS)                      │
└─────────────────────────────────────────────────────────────┘
[Syncer] swc.transformFile("src/user.model.ts")
  ✨ dist/user.model.js 생성 (CJS)
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: 생성된 JS를 처리 (Require & 데코레이터 실행)        │
└─────────────────────────────────────────────────────────────┘
[Syncer] autoloadModels()
  - require("dist/user.model.js")
  - @api 데코레이터 실행됨
  - registeredApis에 API 정보 등록
    ↓
[Syncer] autoloadApis()
  - registeredApis 읽기
  - API 메타데이터 수집
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: 코드 생성 (API 메타데이터 → Service TS)            │
└─────────────────────────────────────────────────────────────┘
[Syncer] actionGenerateServices()
  ✨ web/src/services/user.service.ts 생성
      (이건 프론트엔드용이라 Syncer는 트랜스파일 안 함)
```

**트릭의 핵심**:
```typescript
// syncFromWatcher() 내부 (CJS 버전)
const targetFilePaths: string[] = [];

// 1. TS 파일들을 트랜스파일
for (const tsFile of tsFiles) {
  const jsPath = tsFile.replace(/^src\//, "dist/").replace(/\.ts$/, ".js");
  await swc.transformFile(tsFile); // TS → JS 변환
  await writeFile(jsPath, code);
  
  // 중요! JS 경로도 targetFilePaths에 추가
  targetFilePaths.push("/" + path.relative(Sonamu.apiRootPath, jsPath));
}

// 2. 원본 TS 경로도 추가
targetFilePaths.push(
  ...diffFiles.map((filePath) => "/" + path.relative(Sonamu.apiRootPath, filePath))
);

// 3. 패턴 매칭
// targetFilePaths = [
//   "/src/application/user/user.model.ts",  ← types 패턴에 매칭 가능
//   "/dist/application/user/user.model.js",  ← model 패턴에 매칭!
// ]

await this.doSyncActions(targetFilePaths);
```

**왜 이렇게 했나?**:
- `checksumPatternGroup.model = "/dist/**/*.model.js"` (JS 파일 감시)
- `checksumPatternGroup.types = "/src/**/*.types.ts"` (TS 파일 감시)
- 하나의 TS 변경으로 **TS 경로**와 **JS 경로** 둘 다 처리하기 위해!

---

#### 케이스 2: Entity 변경 → Generated 생성 → Types 로드

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: 사용자가 Entity 수정                                │
└─────────────────────────────────────────────────────────────┘
user.entity.json 수정
  - 필드 추가/수정
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Syncer가 코드 생성 (JSON → TS)                     │
└─────────────────────────────────────────────────────────────┘
[Syncer] actionGenerateSchemas()
  - EntityManager.reload() - JSON 읽기
  - Template__generated.render()
  ✨ src/application/sonamu.generated.ts 생성 (TS 소스)
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Syncer가 트랜스파일 (TS → JS)                      │
└─────────────────────────────────────────────────────────────┘
[Syncer] swc.transformFile("src/application/sonamu.generated.ts")
  ✨ dist/application/sonamu.generated.js 생성 (CJS)
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: 생성된 JS를 처리 (Require & Zod 타입 로드)         │
└─────────────────────────────────────────────────────────────┘
[Syncer] autoloadTypes()
  - require("dist/application/sonamu.generated.js")
  - Zod 스키마 추출 (UserBaseSchema 등)
  - this.types에 저장
```

**이 케이스의 순환**:
```
entity.json (JSON)
  → [코드젠] → generated.ts (TS)
  → [트랜스파일] → generated.js (JS)
  → [require] → this.types에 로드
```

**연쇄 작용 (별도 사이클)**:
```
generated.ts 변경됨
  ↓
[다음 HMR 사이클에서]
  - user.types.ts가 generated.ts import
  - user.model.ts가 user.types.ts import
  - require.cache 클리어 필요
  - autoloadModels() 재실행
  - @api 재파싱
  - service.ts 재생성 (필요시)
```

> **중요**: Phase 4까지가 entity.json 변경의 **직접적인** 결과예요.
> 그 이후의 연쇄 작용은 **별도의 HMR 사이클**에서 수동으로 처리됩니다.

---

### ESM 방식 (단순화!)

#### 케이스 1: Model 파일 변경 (ESM)

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: 사용자가 Model 수정                                 │
└─────────────────────────────────────────────────────────────┘
user.model.ts 수정
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Loader가 자동 트랜스파일 (백그라운드)               │
└─────────────────────────────────────────────────────────────┘
[@sonamu-kit/loader] import("src/user.model.ts") 시점에
  - 온디맨드 트랜스파일 (TS → ESM JS)
  - 메모리에서 처리 (파일 안 씀)
  - 캐싱
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Syncer가 TS를 직접 처리                            │
└─────────────────────────────────────────────────────────────┘
[Syncer] autoloadModels()
  - import("src/user.model.ts")  ← TS 직접!
  - @api 데코레이터 실행
  - registeredApis에 등록
    ↓
[Syncer] autoloadApis()
  - API 메타데이터 수집
    ↓
[Syncer] actionGenerateServices()
  ✨ user.service.ts 생성
```

**핵심 차이**:
- ❌ CJS: Syncer가 "수동으로" TS→JS 변환 후 처리
- ✅ ESM: Loader가 "자동으로" import 시점에 변환
- ✅ ESM: Syncer는 TS를 **직접** import (더 간단!)

---

#### 케이스 2: Entity 변경 (ESM)

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: 사용자가 Entity 수정                                │
└─────────────────────────────────────────────────────────────┘
user.entity.json 수정
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Syncer가 코드 생성 (JSON → TS)                     │
└─────────────────────────────────────────────────────────────┘
[Syncer] actionGenerateSchemas()
  ✨ src/application/sonamu.generated.ts 생성
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Dynohot이 파일 변경 감지 & 자동 리로드              │
└─────────────────────────────────────────────────────────────┘
[dynohot] sonamu.generated.ts 변경 감지
  - import 그래프 추적
  - 의존 모듈들 자동 리로드:
    ├─ user.types.ts
    ├─ user.model.ts
    └─ ...
  - [@sonamu-kit/loader]가 필요시 트랜스파일
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: Syncer가 코드 재생성 (필요시)                       │
└─────────────────────────────────────────────────────────────┘
[Syncer] autoloadApis() (model 리로드됨)
  ↓
[Syncer] actionGenerateServices()
  ✨ user.service.ts 재생성
```

**핵심 차이**:
- ❌ CJS: Syncer가 generated.ts를 **명시적으로** 트랜스파일
- ✅ ESM: Loader가 **암묵적으로** import 시 트랜스파일
- ✅ ESM: Dynohot이 의존성 자동 추적

---

### 비교표: 순환의 복잡도

| 단계 | CJS (복잡) | ESM (단순) |
|------|-----------|-----------|
| **1. 파일 감시** | chokidar (src/*.ts) | chokidar (src/*.ts) |
| **2. 트랜스파일** | ✋ **Syncer가 수동** | ✅ Loader가 자동 |
| **3. JS 생성** | ✋ dist/*.js 파일 씀 | ✅ 메모리 (파일 안 씀) |
| **4. 경로 트릭** | ✋ src/와 dist/ 둘 다 처리 | ✅ src/만 처리 |
| **5. 모듈 로드** | require(dist/*.js) | import(src/*.ts) |
| **6. 캐시 관리** | ✋ require.cache 수동 삭제 | ✅ dynohot 자동 |
| **7. 코드 생성** | 동일 | 동일 |
| **8. 재트랜스파일** | ✋ 생성된 .ts → .js | ✅ Loader가 필요시 자동 |

---

### 왜 CJS가 이렇게 복잡했나?

#### 문제 1: Node.js가 TS를 직접 실행 못함
```javascript
// ❌ CJS에서는 불가능
require("./user.model.ts");  // Error: Cannot find module

// ⚠️ 따라서 수동 트랜스파일 필요
swc.transformFile("user.model.ts");  // → user.model.js
require("./user.model.js");  // ✅ 작동
```

```javascript
// ✅ ESM + Loader에서는 가능
import "./user.model.ts";  // Loader가 자동 트랜스파일!
```

#### 문제 2: 패턴 매칭의 딜레마
```typescript
// CJS에서의 문제:
checksumPatternGroup = {
  types: "/src/**/*.types.ts",    // TS 파일 감시
  model: "/dist/**/*.model.js",   // JS 파일 감시 (require 때문)
};

// user.model.ts 변경 시:
// - chokidar는 src/user.model.ts 감지
// - 하지만 model 패턴은 dist/*.js를 찾음!
// - 해결책: src/*.ts를 트랜스파일해서 dist/*.js 만들고
//           둘 다 targetFilePaths에 넣어서 처리
```

```typescript
// ESM에서는 단순:
checksumPatternGroup = {
  types: "/src/**/*.types.ts",
  model: "/src/**/*.model.ts",  // TS 직접 감시!
};

// user.model.ts 변경 시:
// - chokidar가 src/user.model.ts 감지
// - model 패턴 매칭 성공!
// - import("src/user.model.ts") 직접 실행
```

#### 문제 3: 순환 의존성
```
user.model.ts 변경
  → Syncer가 트랜스파일 → user.model.js 생성
  → Syncer가 user.model.js require
  → @api 읽어서 service.ts 생성
  → (service.ts는 또 user.types.ts import)
  → user.types.ts도 트랜스파일 필요
  → user.types.ts는 generated.ts import
  → generated.ts도 트랜스파일 필요
  → ♾️ 끝없는 트랜스파일...
```

**CJS 해결책**: 모든 TS를 미리 한 번에 트랜스파일
**ESM 해결책**: Loader가 온디맨드로 필요한 것만 트랜스파일 (+ 캐싱)

---

### 실제 코드 예시

#### CJS 방식 (syncFromWatcher)

```typescript
// modules/sonamu/src/syncer/syncer.ts (CJS 버전)

async syncFromWatcher(diffFiles: string[]): Promise<void> {
  const targetFilePaths: string[] = [];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 1: 트랜스파일 (TS → JS)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const tsFiles = diffFiles.filter((file) => file.endsWith(".ts"));
  
  for (const tsFile of tsFiles) {
    const jsPath = tsFile.replace(/^src\//, "dist/").replace(/\.ts$/, ".js");
    
    // SWC로 트랜스파일
    const { code, map } = await swc.transformFile(tsFile, {
      module: { type: "commonjs" },  // CJS 출력
      jsc: { target: "es5" },
      sourceMaps: true,
    });
    
    // JS 파일 쓰기
    await writeFile(jsPath, code);
    
    // ⭐ 핵심: JS 경로도 추가!
    targetFilePaths.push("/" + path.relative(Sonamu.apiRootPath, jsPath));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 2: require.cache 클리어
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  for (const diffFile of diffFiles) {
    if (diffFile.endsWith(".ts")) {
      const modulePath = path.resolve(
        diffFile.replace(/^src\//, "dist/").replace(/\.ts$/, ".js")
      );
      clearModuleAndDependents(modulePath);  // 재귀 삭제
    }
  }

  // ⭐ TS 경로도 추가!
  targetFilePaths.push(
    ...diffFiles.map((filePath) => "/" + path.relative(Sonamu.apiRootPath, filePath))
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 3: 코드 생성 (JS 파일들 처리)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await this.doSyncActions(targetFilePaths);
  // → checksumPatternGroup.model이 dist/*.js 매칭
  // → autoloadModels()가 require("dist/*.js") 실행
  // → @api 데코레이터 실행
  // → service.ts 생성

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 4: 모듈 재로드 (수동)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  this.apis = [];
  this.types = {};
  this.models = {};
  await this.autoloadTypes();   // require() 재실행
  await this.autoloadModels();  // require() 재실행
  await this.autoloadApis();

  this.syncUI();
}
```

#### ESM 방식 (간소화)

```typescript
// modules/sonamu/src/syncer/syncer.ts (ESM 버전)

async syncFromWatcher(diffFiles: string[]): Promise<void> {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 1: 필터링 (TS 경로만 사용)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const targetFilePaths = diffFiles
    .filter((filePath) =>
      Object.values(this.checksumPatternGroup).some((pattern) =>
        minimatch(filePath, pattern)
      )
    )
    .map((filePath) => "/" + path.relative(Sonamu.apiRootPath, filePath));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 2: 코드 생성
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await this.doSyncActions(targetFilePaths);
  // → checksumPatternGroup.model이 src/*.ts 매칭
  // → autoloadModels()가 import("src/*.ts") 실행
  // → [@sonamu-kit/loader]가 자동 트랜스파일
  // → @api 데코레이터 실행
  // → service.ts 생성

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 3: API만 재파싱 (types/models는 dynohot이 처리)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  this.apis = [];
  await this.autoloadApis();  // AST 파싱만

  this.syncUI();
}
```

**코드 라인 수 비교**:
- CJS: ~100 lines (트랜스파일 + 캐시 관리 + 로드)
- ESM: ~15 lines (필터링 + 코드 생성)

---

### 결론

**질문**: "ts파일 변경 → 트랜스파일 → js 처리 → 코드젠 → 또 트랜스파일" 흐름이 있나요?

**답변**:
- ✅ **CJS에서는 존재했어요** - Syncer가 모든 단계를 명시적으로 수행
- ❌ **ESM에서는 사라졌어요** - Loader와 Dynohot이 암묵적으로 처리

**핵심**:
```
CJS: 명시적 순환 (Syncer가 전부 관리)
  TS → [Syncer 트랜스파일] → JS → [Syncer require] → 코드젠 → TS → [다시...]

ESM: 암묵적 처리 (인프라가 자동 관리)
  TS → [Loader 자동 트랜스파일] → 코드젠
       [Dynohot 자동 리로드]
```

이게 ESM 마이그레이션의 최대 이점이에요! 🚀

---

## ⚠️ ESM 전환 완료를 위한 TODO

### 1. `checksumPatternGroup` 수정

**현재 (잘못됨)**:
```typescript
public checksumPatternGroup: GlobPattern = {
  entity: Sonamu.apiRootPath + "/src/application/**/*.entity.json",
  types: Sonamu.apiRootPath + "/src/application/**/*.types.ts",
  generated: Sonamu.apiRootPath + "/src/application/sonamu.generated.ts",
  functions: Sonamu.apiRootPath + "/src/application/**/*.functions.ts",
  
  model: Sonamu.apiRootPath + "/dist/application/**/*.model.js",  // ❌
  frame: Sonamu.apiRootPath + "/dist/application/**/*.frame.js",  // ❌
};
```

**수정 필요**:
```typescript
public checksumPatternGroup: GlobPattern = {
  entity: Sonamu.apiRootPath + "/src/application/**/*.entity.json",
  types: Sonamu.apiRootPath + "/src/application/**/*.types.ts",
  generated: Sonamu.apiRootPath + "/src/application/sonamu.generated.ts",
  functions: Sonamu.apiRootPath + "/src/application/**/*.functions.ts",
  
  model: Sonamu.apiRootPath + "/src/application/**/*.model.ts",  // ✅
  frame: Sonamu.apiRootPath + "/src/application/**/*.frame.ts",  // ✅
};
```

### 2. `autoloadModels/Types` 환경 분기 추가

**현재 (환경 무시)**:
```typescript
async autoloadModels(): Promise<{ [modelName: string]: unknown }> {
  const pathPattern = path.join(
    Sonamu.apiRootPath,
    "dist/application/**/*.{model,frame}.js"  // ❌ 항상 dist
  );
  
  const filePaths = await globAsync(pathPattern);
  const modules = await importMultiple(filePaths);
  // ...
}
```

**수정 필요**:
```typescript
async autoloadModels(): Promise<{ [modelName: string]: unknown }> {
  const pathPattern = isHMREnabled()
    ? path.join(Sonamu.apiRootPath, "src/application/**/*.{model,frame}.ts")   // ✅ Dev
    : path.join(Sonamu.apiRootPath, "dist/application/**/*.{model,frame}.js"); // ✅ Prod

  const filePaths = await globAsync(pathPattern);
  const modules = await importMultiple(filePaths, true); // doRefresh = true
  // ...
}
```

---

## 📚 참고 자료

### 관련 파일들

- **Syncer 메인 로직**: `modules/sonamu/src/syncer/syncer.ts`
- **Watcher 설정**: `modules/sonamu/src/api/sonamu.ts` (Lines 463-486)
- **ESM 유틸리티**: `modules/sonamu/src/utils/esm-utils.ts`
- **Path 유틸리티**: `modules/sonamu/src/utils/path-utils.ts`
- **마이그레이션 플랜**: `MIGRATION_PLAN.md`

### 핵심 개념

1. **워치 (Watch)**: chokidar가 파일 시스템 변경 감지
2. **트리거 (Trigger)**: 특정 파일 패턴 매칭으로 액션 실행
3. **코드젠 (Codegen)**: 템플릿 기반 소스 파일 자동 생성
4. **HMR (Hot Module Replacement)**: 서버 재시작 없이 모듈 리로드
5. **연쇄 작용 (Cascade)**: 한 파일의 변경이 다른 파일들에 미치는 영향

---

## 부록 A: 왜 model.js를 체크섬 감시해야 했나?

> **핵심 질문**: "model.ts를 트랜스파일해서 model.js를 만드는데, 왜 체크섬 패턴에서 model.js를 감시해야 했나? model.ts만 감시하면 안 됐나?"

### 근본 원인: Node.js + require()의 한계

```typescript
// ❌ Node.js는 이걸 못해요
require("./user.model.ts");  // Error: Cannot find module

// ✅ 이것만 가능
require("./user.model.js");  // OK
```

### @api 데코레이터를 실행하려면 모듈을 로드해야 함

```typescript
// user.model.ts (소스)
class UserModelClass extends BaseModelClass {
  @api({ httpMethod: "GET" })
  async list() { ... }
}

export const UserModel = new UserModelClass();
```

**Syncer가 해야 할 일**:
1. `@api` 데코레이터 읽기
2. API 메타데이터 추출 (httpMethod, path 등)
3. 이걸로 `user.service.ts` 생성

**문제**: 데코레이터는 **런타임에 실행**되니까 모듈을 로드해야 해요!

```typescript
// Syncer의 autoloadModels()
async autoloadModels() {
  // ❌ 이건 불가능
  const module = require("src/user.model.ts");
  
  // ✅ 이것만 가능
  const module = require("dist/user.model.js");
  
  // 이 시점에 @api 데코레이터가 실행됨
  // registeredApis에 API 정보가 등록됨
}
```

---

### 체크섬의 목적

```typescript
// sonamu.lock
[
  {
    "path": "/dist/application/user/user.model.js",
    "checksum": "abc123..."
  }
]
```

**체크섬은 "실제로 로드되는 파일"의 내용을 추적해요!**

---

### 시나리오 1: model.ts만 감시하면?

```typescript
checksumPatternGroup = {
  model: "/src/**/*.model.ts"  // TS만 감시
};
```

**실제 동작 (syncFromWatcher)**:
```
1. user.model.ts 수정
   ↓
2. chokidar가 감지
   ↓
3. syncFromWatcher()
   ├─ 트랜스파일 실행 (항상!)
   │   swc.transformFile("src/user.model.ts")
   │   → dist/user.model.js 생성 시도
   │
   ├─ targetFilePaths 구성
   │   ["/dist/.../user.model.js", "/src/.../user.model.ts"]
   │
   └─ doSyncActions(targetFilePaths)
       ↓
4. doSyncActions() 안에서
   ├─ checksumPatternGroup.model 매칭
   │   → "/src/**/*.model.ts" 패턴
   │   → "/src/.../user.model.ts" 매칭됨!
   │
   └─ 체크섬 비교 (TS 파일)
       - 이전: "model.ts = abc123"
       - 현재: "model.ts = def456"
       - 다름! → 코드 생성 진행
   ↓
5. autoloadModels()
   - require("dist/user.model.js")
   ↓
6. ⚠️ 문제 상황별:
   
   Case A: 트랜스파일 성공
     ✅ 새 JS 로드
     ✅ 정상 작동
   
   Case B: 트랜스파일 실패 (문법 에러)
     ❌ 이전 JS 그대로 또는 없음
     ❌ 하지만 TS 체크섬은 이미 업데이트됨!
     ❌ 잘못된 service.ts 생성
```

**핵심 문제**: 
- TS 체크섬은 트랜스파일 성공 여부와 무관하게 업데이트
- JS가 실제로 만들어졌는지 보장 못함

---

### 시나리오 2: model.js를 감시하면?

```typescript
checksumPatternGroup = {
  model: "/dist/**/*.model.js"  // JS 감시
};
```

**실제 동작 (syncFromWatcher)**:
```
1. user.model.ts 수정
   ↓
2. chokidar가 감지
   ↓
3. syncFromWatcher()
   ├─ 트랜스파일 실행 (항상!)
   │   swc.transformFile("src/user.model.ts")
   │   → dist/user.model.js 생성 시도
   │
   ├─ targetFilePaths 구성
   │   ["/dist/.../user.model.js", "/src/.../user.model.ts"]
   │
   └─ doSyncActions(targetFilePaths)
       ↓
4. doSyncActions() 안에서
   ├─ checksumPatternGroup.model 매칭
   │   → "/dist/**/*.model.js" 패턴
   │   → "/dist/.../user.model.js" 매칭됨!
   │
   └─ 체크섬 비교 (JS 파일)
       ↓
5. ⚠️ 상황별 처리:
   
   Case A: 트랜스파일 성공
     - 이전: "model.js = abc123"
     - 현재: "model.js = def456"
     - 다름! → 코드 생성 진행
     ↓
     autoloadModels()
     - require("dist/user.model.js")
     ✅ 새 코드 로드!
     ✅ 올바른 service.ts 생성
   
   Case B: 트랜스파일 실패
     - 이전: "model.js = abc123"
     - 현재: "model.js = abc123" (안 바뀜!)
     - 동일! → 코드 생성 건너뜀
     ↓
     ✅ 체크섬 업데이트 안 됨
     ✅ 일관성 유지!
```

**핵심 장점**:
- JS 체크섬은 트랜스파일 성공 시에만 변경됨
- 실제로 로드 가능한 파일만 추적

---

### 트릭의 핵심: TS와 JS 둘 다 처리

```typescript
async syncFromWatcher(diffFiles: string[]): Promise<void> {
  const targetFilePaths: string[] = [];

  // 1단계: TS 파일들을 트랜스파일
  const tsFiles = diffFiles.filter(f => f.endsWith(".ts"));
  
  for (const tsFile of tsFiles) {
    // src/user.model.ts → dist/user.model.js
    const jsPath = tsFile.replace(/^src\//, "dist/").replace(/\.ts$/, ".js");
    
    // 트랜스파일
    const { code } = await swc.transformFile(tsFile, { ... });
    await writeFile(jsPath, code);
    
    // ⭐ 핵심: JS 경로를 targetFilePaths에 추가!
    targetFilePaths.push("/" + path.relative(Sonamu.apiRootPath, jsPath));
  }

  // 2단계: TS 경로도 추가 (types 패턴용)
  targetFilePaths.push(
    ...diffFiles.map(f => "/" + path.relative(Sonamu.apiRootPath, f))
  );

  // 3단계: 패턴 매칭
  // targetFilePaths = [
  //   "/dist/application/user/user.model.js",  ← model 패턴 매칭!
  //   "/src/application/user/user.model.ts",   ← types 패턴 매칭
  // ]

  await this.doSyncActions(targetFilePaths);
}
```

---

### 딜레마

```
chokidar는 src/*.ts를 감시  (사용자가 수정하는 파일)
   vs
require()는 dist/*.js를 로드  (Node.js가 실행하는 파일)
```

**CJS의 해결책**:
```
1. src/*.ts 감시 (chokidar)
2. src/*.ts 트랜스파일 → dist/*.js 생성
3. dist/*.js 체크섬 비교 (실제 로드되는 파일)
4. dist/*.js require() (데코레이터 실행)
5. 코드 생성
```

**ESM의 해결책**:
```
1. src/*.ts 감시 (chokidar)
2. src/*.ts 체크섬 비교 (소스 파일)
3. src/*.ts import() (Loader가 자동 트랜스파일)
4. 코드 생성
```

**핵심 차이**:
- CJS: **2개 파일** 추적 (src/*.ts + dist/*.js)
- ESM: **1개 파일** 추적 (src/*.ts)

---

## 부록 B: TS만 감시하고 JS는 자동 생성으로 가정할 수 없었던 이유

> **핵심 질문**: "결국 데코레이터를 가지고 로드될 실체는 트랜스파일 된 js라서 그걸 체크섬 감시하게 됐다. 그럼 .ts만 감시하고 .js는 항상 그 .ts를 따른다고 가정하고 작성될 수는 없었나? 어떤 의존관계가 생기고 언제 문제가 되나?"

### 이론적으로는 가능했어요

```typescript
// 이상적인 시나리오
checksumPatternGroup = {
  model: "/src/**/*.model.ts"  // TS만 감시
};

// 가정: user.model.ts가 변경되면
//       user.model.js는 자동으로 동기화된다
```

**간단한 로직**:
```
model.ts 변경 감지
  → 무조건 트랜스파일
  → model.js는 자동으로 최신
  → require(model.js)로 로드
  → 코드 생성
```

---

### 하지만 실제로는 여러 문제가 있었어요

#### 문제 1: 트랜스파일 실패 시 일관성 문제

```typescript
// user.model.ts (문법 에러)
class UserModelClass extends BaseModelClass {
  @api({ httpMethod: "GET" })
  async list() {
    return {{{;  // 문법 에러!
  }
}
```

**TS만 감시하는 경우 (실제 흐름)**:
```
1. user.model.ts 저장 (문법 에러 포함)
   ↓
2. syncFromWatcher()
   ├─ 트랜스파일 시도
   │   ❌ SWC 에러: Unexpected token
   │   ❌ dist/user.model.js 생성 실패 (또는 이전 파일 그대로)
   │
   ├─ targetFilePaths = [
   │     "/dist/.../user.model.js",  (실패했지만 경로는 추가됨)
   │     "/src/.../user.model.ts"
   │   ]
   │
   └─ doSyncActions(targetFilePaths)
       ↓
3. checksumPatternGroup.model = "/src/**/*.model.ts" 매칭
   ├─ TS 파일 체크섬 계산
   │   - 이전: "model.ts = abc123"
   │   - 현재: "model.ts = def456" (에러 있지만 내용은 바뀜)
   │   - 다름! → 코드 생성 진행
   │
   └─ ❌ 문제: sonamu.lock 업데이트!
       "model.ts = def456" 기록됨
   ↓
4. autoloadModels()
   - require("dist/user.model.js")
   - ❌ 이전 버전 로드 또는 에러
   ↓
5. ❌ 잘못된 service.ts 생성 가능
```

**문제점**: 
- TS 체크섬은 파일 내용만 보고 업데이트 (트랜스파일 성공 여부 무관)
- JS는 실패했는데 체크섬은 바뀜 → **TS와 JS 불일치**

**JS를 감시하는 경우 (실제 흐름)**:
```
1. user.model.ts 저장 (문법 에러 포함)
   ↓
2. syncFromWatcher()
   ├─ 트랜스파일 시도
   │   ❌ SWC 에러
   │   ❌ dist/user.model.js 생성 실패
   │
   ├─ targetFilePaths = [
   │     "/dist/.../user.model.js",
   │     "/src/.../user.model.ts"
   │   ]
   │
   └─ doSyncActions(targetFilePaths)
       ↓
3. checksumPatternGroup.model = "/dist/**/*.model.js" 매칭
   ├─ JS 파일 체크섬 계산
   │   - 이전: "model.js = abc123"
   │   - 현재: "model.js = abc123" (파일 안 바뀜!)
   │   - 동일! → 코드 생성 건너뜀
   │
   └─ ✅ sonamu.lock 업데이트 안 됨
   ↓
4. ✅ autoloadModels() 실행 안 됨 (변경 없으므로)
   ↓
5. ✅ 일관성 유지!
   ↓
6. 에러 수정 후 다시 저장
   - 이번엔 트랜스파일 성공
   - dist/user.model.js 실제로 변경됨
   - JS 체크섬 변경 감지 → 코드 생성 진행
```

**장점**: "실제로 실행 가능한 코드"만 체크섬에 반영

---

#### 문제 2: 부분 트랜스파일 & 캐싱

```typescript
// 시나리오: 여러 model 파일 동시 수정
// user.model.ts
// product.model.ts
// order.model.ts
```

**TS만 감시하는 경우**:
```
1. 3개 파일 동시 저장 (VSCode "Save All")
   ↓
2. chokidar가 순차적으로 감지
   - user.model.ts (시간: T+0ms)
   - product.model.ts (시간: T+10ms)
   - order.model.ts (시간: T+20ms)
   ↓
3. 각각 독립적으로 트랜스파일
   ✅ dist/user.model.js (T+100ms)
   ✅ dist/product.model.js (T+110ms)
   ❌ dist/order.model.js (T+200ms, 실패했다고 가정)
   ↓
4. 체크섬 업데이트 (TS 기준)
   - user.model.ts ✅ 체크섬 업데이트
   - product.model.ts ✅ 체크섬 업데이트
   - order.model.ts ✅ 체크섬 업데이트 (❌ 하지만 JS는 안 만들어짐!)
   ↓
5. autoloadModels()
   - require("dist/user.model.js") ✅
   - require("dist/product.model.js") ✅
   - require("dist/order.model.js") ❌ 이전 버전 또는 에러
   ↓
6. ❌ 불일치 발생!
```

**JS를 감시하는 경우**:
```
1. 3개 파일 동시 저장
   ↓
2. 트랜스파일
   ✅ dist/user.model.js
   ✅ dist/product.model.js
   ❌ dist/order.model.js (실패)
   ↓
3. 체크섬 비교 (JS 기준)
   - user.model.js: 변경됨 ✅
   - product.model.js: 변경됨 ✅
   - order.model.js: 변경 없음 ❌ (파일이 안 만들어졌으니까)
   ↓
4. doSyncActions() - 2개만 처리
   ✅ user 관련 코드 생성
   ✅ product 관련 코드 생성
   ⏭️ order는 건너뜀 (체크섬 변경 없으므로)
   ↓
5. ✅ 일관성 유지!
```

---

#### 문제 3: 타이밍 문제 (Race Condition)

```typescript
// 빠른 연속 수정
```

**TS만 감시 + 병렬 처리**:
```
T+0ms:  user.model.ts 수정 #1
T+50ms: user.model.ts 수정 #2 (빠른 재저장)

// 두 이벤트 동시 처리
Thread 1: 수정 #1 트랜스파일 중...
Thread 2: 수정 #2 감지 → 체크섬 비교 시작

T+100ms:
  Thread 1: dist/user.model.js 쓰기 완료 (수정 #1 내용)
  Thread 2: TS 체크섬 변경 확인 → 트랜스파일 시작

T+150ms:
  Thread 2: dist/user.model.js 덮어쓰기 (수정 #2 내용)

T+200ms:
  Thread 1: require("dist/user.model.js") ← ❌ 수정 #2 내용!
  Thread 2: require("dist/user.model.js") ← ✅ 수정 #2 내용

❌ Thread 1이 잘못된 내용으로 코드 생성!
```

**JS를 감시하면**:
```
T+0ms:  user.model.ts 수정 #1
T+50ms: user.model.ts 수정 #2

// 트랜스파일은 동일하게 경쟁

T+100ms:
  dist/user.model.js 쓰기 완료 (수정 #1)
  → JS 체크섬 변경 감지
  
T+150ms:
  dist/user.model.js 덮어쓰기 (수정 #2)
  → JS 체크섬 변경 감지 (또 다시!)

✅ 각 JS 변경마다 독립적으로 처리
✅ 마지막 변경이 최종적으로 반영됨
```

**핵심**: JS 파일의 실제 내용 변경을 감시하므로 타이밍 문제 완화

---

#### 문제 4: 수동 수정 감지

```typescript
// 극단적 시나리오: 개발자가 dist/*.js를 직접 수정
```

**TS만 감시**:
```
1. 개발자가 dist/user.model.js 직접 수정 (디버깅 목적)
   - console.log() 추가
   ↓
2. ❌ TS는 안 바뀜 → 체크섬 변경 없음
   ↓
3. 서버 재시작
   - require("dist/user.model.js") ← 수정된 코드 로드
   - @api 실행 → 이상한 결과
   ↓
4. ❌ 문제: Syncer는 변경을 모름
   - sonamu.lock에는 이전 체크섬
   - 다음 sync()에서 변경 감지 못함
```

**JS를 감시**:
```
1. 개발자가 dist/user.model.js 직접 수정
   ↓
2. (chokidar는 dist/ 안 봐서 감지 못함)
   ↓
3. 하지만 다음 sync()에서
   - getCurrentChecksums()가 모든 JS 파일 체크
   - dist/user.model.js 체크섬이 다름!
   ↓
4. ✅ "누군가 JS를 수정했네요" 감지
   - 경고 출력
   - 또는 TS에서 다시 트랜스파일하여 덮어쓰기
```

**장점**: 예상치 못한 JS 변경도 추적

---

#### 문제 5: 증분 빌드 & 선택적 트랜스파일

```typescript
// 시나리오: 일부 파일만 트랜스파일
```

**최적화 시도**:
```typescript
// user.model.ts 수정
// 하지만 내용이 주석만 추가됨
// → 트랜스파일 결과는 동일할 수 있음

// TypeScript → JavaScript 변환
// 주석은 제거되므로 JS 내용은 동일!
```

**TS만 감시**:
```
1. user.model.ts 수정 (주석 추가)
   - TS 체크섬: abc123 → def456
   ↓
2. 트랜스파일
   - JS 내용: 이전과 동일 (주석 제거됨)
   - 하지만 파일은 다시 씀
   ↓
3. ❌ 불필요한 코드 생성
   - 실제로는 JS가 안 바뀌었는데
   - TS 체크섬만 보고 코드 생성
```

**JS를 감시**:
```
1. user.model.ts 수정 (주석 추가)
   ↓
2. 트랜스파일
   - JS 내용: 동일
   ↓
3. JS 체크섬 비교
   - 이전: abc123
   - 현재: abc123 (동일!)
   ↓
4. ✅ 변경 없음 → 코드 생성 건너뜀
   ✅ 불필요한 작업 방지!
```

**장점**: 실제로 의미 있는 변경만 처리

---

### 의존 관계 다이어그램

```
┌─────────────────────────────────────────────────────┐
│ TS만 감시하는 경우                                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  user.model.ts (소스)                               │
│       ↓                                             │
│  [체크섬 비교] ← sonamu.lock                        │
│       ↓                                             │
│  [트랜스파일] ← ⚠️ 실패 가능                         │
│       ↓                                             │
│  user.model.js (출력) ← ⚠️ 안 만들어질 수 있음       │
│       ↓                                             │
│  [require()] ← ❌ 이전 버전 또는 에러                │
│       ↓                                             │
│  [코드 생성] ← ❌ 잘못된 결과                        │
│                                                      │
│  ⚠️ 위험: TS와 JS의 불일치                           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ JS를 감시하는 경우                                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  user.model.ts (소스)                               │
│       ↓                                             │
│  [트랜스파일] ← 먼저 실행                            │
│       ↓                                             │
│  user.model.js (출력) ← ✅ 성공 시에만 존재          │
│       ↓                                             │
│  [체크섬 비교] ← sonamu.lock                        │
│       ↓                                             │
│  [require()] ← ✅ 항상 최신 & 유효한 코드            │
│       ↓                                             │
│  [코드 생성] ← ✅ 올바른 결과                        │
│                                                      │
│  ✅ 안전: JS가 실제 로드되는 파일                     │
└─────────────────────────────────────────────────────┘
```

---

### 결론

**질문**: ".ts만 감시하고 .js는 항상 그 .ts를 따른다고 가정할 수 없었나?"

**답변**: 이론적으로는 가능하지만, 실제로는 여러 문제 때문에 불가능했어요:

| 문제 | TS만 감시 | JS를 감시 |
|------|----------|----------|
| **트랜스파일 실패** | ❌ 체크섬 불일치 | ✅ 실패 감지 |
| **부분 트랜스파일** | ❌ 일관성 깨짐 | ✅ 일관성 유지 |
| **타이밍 문제** | ❌ Race condition | ✅ 완화됨 |
| **수동 수정** | ❌ 감지 못함 | ✅ 감지 가능 |
| **증분 빌드** | ❌ 불필요한 작업 | ✅ 최적화 |

**핵심**:
```
TS는 "의도"를 나타냄
JS는 "실제로 실행되는 것"을 나타냄

체크섬은 "실제로 실행되는 것"을 추적해야 안전!
```

**ESM 전환의 이점**:
```
ESM + Loader:
  - import("src/*.ts") 직접 가능
  - 트랜스파일은 Loader가 보장
  - 실패 시 import 자체가 실패 (명확!)
  - TS와 JS의 분리 문제 자체가 사라짐!
```

이게 바로 ESM 전환이 복잡도를 획기적으로 줄인 이유예요! 🚀

---

**작성**: 2025-11  
**버전**: ESM 전환 진행 중  
**상태**: ⚠️ TODO 완료 필요

