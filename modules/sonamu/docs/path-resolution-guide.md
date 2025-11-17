# Sonamu 경로 해석 가이드

Sonamu는 다양한 실행 환경(개발/배포)과 여러 타입의 경로(절대/상대)를 다룹니다. 이 문서는 경로 관련 타입, 함수, 그리고 사용 시 주의사항을 정리합니다.

---

## 📁 경로 타입 체계

### 1. `ApiRelativePath` (API 패키지 상대 경로)

**형식**: `"src/"` 또는 `"dist/"`로 시작하는 경로

**기준점**: `Sonamu.apiRootPath` (일반적으로 `/path/to/project/api`)

**예시**:
```typescript
"src/application/user/user.model.ts"
"dist/application/user/user.model.js"
```

**사용처**:
- API 패키지 내부 파일 참조
- sonamu.lock 파일에 경로 저장
- module-loader, entity-operations 등

---

### 2. `AppRelativePath` (앱 루트 상대 경로)

**형식**: 타겟 디렉토리(`api/`, `web/`, `app/` 등)로 시작하는 경로

**기준점**: `Sonamu.appRootPath` (모노레포 루트)

**예시**:
```typescript
"api/src/application/user/user.model.ts"
"web/src/pages/admin/users/index.tsx"
"app/dist/index.js"
```

**사용처**:
- 여러 타겟(api, web 등) 간 파일 참조
- 타겟 디렉토리 간 파일 복사 (syncer)
- code-generator의 타겟 경로 생성

---

### 3. `AbsolutePath` (시스템 절대 경로)

**형식**: `/`로 시작하는 전체 경로

**예시**:
```typescript
"/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts"
```

**사용처**:
- 파일시스템 직접 접근 (fs, glob)
- 동적 import의 최종 경로
- checksum 계산

**중요 주의사항**:
- **동적 import 시**: 로더가 알아서 src/dist 변환 → 어느 경로든 가능
- **파일시스템 접근 시** (fs.readFile, glob 등): **실제 존재하는 경로**를 사용해야 함
  - Dev 환경: `src/*.ts` 경로 사용
  - Prod 환경: `dist/*.js` 경로 사용

---

## 🔄 실행 환경별 경로 동작

### Dev 모드 (`yarn dev:serve`)

**특징**:
- TypeScript 파일을 직접 실행
- TS 로더가 실시간으로 트랜스파일
- 파일시스템에 `src/*.ts` 파일만 존재

**경로 사용**:
```typescript
// ✅ 올바른 사용
const files = await globAsync('/path/to/api/src/application/**/*.model.ts');
const module = await import('/path/to/api/src/application/user/user.model.ts');

// ❌ 잘못된 사용 (dist 파일이 없음)
const files = await globAsync('/path/to/api/dist/application/**/*.model.js');
```

---

### Prod 모드 (`yarn build && yarn serve`)

**특징**:
- 사전 빌드된 JavaScript 파일 실행
- 파일시스템에 `dist/*.js` 파일만 존재

**경로 사용**:
```typescript
// ✅ 올바른 사용
const files = await globAsync('/path/to/api/dist/application/**/*.model.js');
const module = await import('/path/to/api/dist/application/user/user.model.js');

// ❌ 잘못된 사용 (src 파일이 없음)
const files = await globAsync('/path/to/api/src/application/**/*.model.ts');
```

---

## 🛠️ 경로 변환 함수

### `resolveModulePath(relativePath: string): AbsolutePath`

**목적**: 동적 import를 위한 절대 경로 생성

**환경별 동작**:
- **Dev**: `src/*.ts` 경로 반환
- **Prod**: `dist/*.js` 경로 반환

**예시**:
```typescript
// Dev 환경
resolveModulePath('src/application/user/user.model.ts')
// → /Users/potados/Projects/sonamu/api/src/application/user/user.model.ts

// Prod 환경
resolveModulePath('src/application/user/user.model.ts')
// → /Users/potados/Projects/sonamu/api/dist/application/user/user.model.js
```

**사용처**: `module-loader.ts`, `entity-manager.ts`

---

### `resolveGlobPattern(pattern: string, direction?: 'toDev' | 'toProd' | 'auto'): string`

**목적**: Glob 패턴을 환경에 맞게 변환

**환경별 동작**:
- **Dev** (auto 또는 toDev): `dist/**/*.js` → `src/**/*.ts`
- **Prod** (auto 또는 toProd): `src/**/*.ts` → `dist/**/*.js`

**예시**:
```typescript
// Dev 환경에서 auto
resolveGlobPattern('dist/application/**/*.model.js')
// → 'src/application/**/*.model.ts'

// 명시적 toProd 변환 (환경 무관)
resolveGlobPattern('src/application/**/*.ts', 'toProd')
// → 'dist/application/**/*.js'
```

**사용처**: `module-loader.ts`, `file-patterns.ts`

---

### `toApiRelativePath(absolutePath: AbsolutePath): ApiRelativePath`

**목적**: 절대 경로 → API 상대 경로 변환

**예시**:
```typescript
toApiRelativePath('/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts')
// → 'src/application/user/user.model.ts'
```

**사용처**: `checksum.ts` (sonamu.lock에 저장 시)

---

### `toAbsolutePath(relativePath: ApiRelativePath): AbsolutePath`

**목적**: API 상대 경로 → 절대 경로 변환

**예시**:
```typescript
toAbsolutePath('src/application/user/user.model.ts')
// → '/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts'
```

**사용처**: `syncer.ts`, `file-patterns.ts`

---

## ⚠️ 주의사항 및 베스트 프랙티스

### 1. 로더 vs 파일시스템

```typescript
// ✅ 동적 import - 로더가 알아서 처리
await import('/path/to/api/dist/application/user/user.model.js');
// Dev: src/*.ts를 찾아서 트랜스파일
// Prod: dist/*.js를 그대로 로드

// ❌ 파일시스템 직접 접근 - 실제 파일이 있어야 함
await fs.readFile('/path/to/api/dist/application/user/user.model.js');
// Dev: 파일이 없어서 에러!
// Prod: 정상 동작
```

**해결**: `resolveModulePath()` 사용
```typescript
const modulePath = resolveModulePath('src/application/user/user.model.ts');
await import(modulePath);  // ✅ 환경에 맞는 경로
```

---

### 2. Glob 패턴 사용

```typescript
// ❌ 하드코딩된 경로
const files = await globAsync('/path/to/api/src/application/**/*.model.ts');
// Prod 환경에서 파일을 못 찾음!

// ✅ resolveGlobPattern 사용
const pattern = resolveGlobPattern('src/application/**/*.model.ts');
const files = await globAsync(path.join(Sonamu.apiRootPath, pattern));
```

---

### 3. 경로 타입 명시

```typescript
// ❌ 타입 없이 사용
function processPath(p: string) {
  // 이게 절대경로인지 상대경로인지 알 수 없음
}

// ✅ 명확한 타입 사용
function processPath(p: ApiRelativePath) {
  const absolutePath = toAbsolutePath(p);  // 타입 안전
}
```

---

### 4. Sonamu 프레임워크 코드 vs 프로젝트 코드

```typescript
// Sonamu 코드 (이 코드베이스)
// - 항상 dist에 빌드되어 있음
// - import.meta.dirname 사용 가능
const sonamuCodePath = path.join(import.meta.dirname, '../shared/template.ts');

// 프로젝트 코드 (사용자 코드)
// - Dev: src에만 존재
// - Prod: dist에만 존재
// - 환경에 맞게 경로 해석 필요
const userCodePath = resolveModulePath('src/application/user/user.model.ts');
```

---

## 📝 실제 사용 예시

### module-loader.ts
```typescript
export async function loadApis(): Promise<LoadedApis> {
  // 1. Glob 패턴을 환경에 맞게 변환
  const pattern = resolveGlobPattern('src/application/**/*.{model,frame}.ts');

  // 2. 절대 경로 패턴 생성
  const modelPathsPattern = path.join(Sonamu.apiRootPath, pattern);

  // 3. 파일시스템에서 실제 파일 찾기 (환경에 맞는 경로)
  const modelPaths = await globAsync(modelPathsPattern) as AbsolutePath[];

  // 4. 각 파일을 동적 import (로더가 처리)
  for (const filePath of modelPaths) {
    const apis = await readApisFromFile(filePath);
    // ...
  }
}
```

### checksum.ts
```typescript
async function saveChecksums(checksums: PathAndChecksum[]): Promise<void> {
  const checksumFilePath = getChecksumFilePath();

  // 절대 경로를 API 상대 경로로 변환하여 저장
  await writeFile(
    checksumFilePath,
    JSON.stringify(
      checksums.map((r) => ({
        path: toApiRelativePath(r.path),  // "src/application/..."
        checksum: r.checksum,
      }))
    )
  );
}
```

### syncer.ts
```typescript
private async handleEntityChange(diffGroups: DiffGroups): Promise<void> {
  // diffGroups["entity"]는 AbsolutePath[] 타입
  const entityPath = diffGroups["entity"]?.[0];

  // EntityManager는 절대 경로를 받아서 처리
  const entityId = EntityManager.getEntityIdFromPath(entityPath);

  // 생성할 파일의 상대 경로
  const typeFilePath = toAbsolutePath(
    `src/application/${entity.names.fs}/${entity.names.fs}.types.ts`
  );

  if (!(await exists(typeFilePath))) {
    await generateTemplate("init_types", { entityId });
  }
}
```

---

## 🔍 디버깅 팁

### 현재 환경 확인
```typescript
import { isHMREnabled } from './utils/esm-utils';

console.log('Current mode:', isHMREnabled() ? 'Dev' : 'Prod');
console.log('API Root:', Sonamu.apiRootPath);
console.log('App Root:', Sonamu.appRootPath);
```

### 경로 변환 확인
```typescript
const input = 'src/application/user/user.model.ts';
console.log('Input:', input);
console.log('Resolved:', resolveModulePath(input));
console.log('Glob pattern:', resolveGlobPattern(input));
```

---

## 📚 관련 파일

- **타입 정의**: `src/utils/path-utils.ts`
- **경로 변환 함수**: `src/utils/path-utils.ts`
- **실제 사용 예시**:
  - `src/syncer/module-loader.ts`
  - `src/syncer/checksum.ts`
  - `src/syncer/file-patterns.ts`
  - `src/entity/entity-manager.ts`

---

## 🎯 요약

1. **동적 import**: `resolveModulePath()` 사용 → 환경에 맞는 경로 자동 선택
2. **Glob 패턴**: `resolveGlobPattern()` 사용 → 파일시스템 탐색용 패턴 변환
3. **타입 명시**: `ApiRelativePath`, `AppRelativePath`, `AbsolutePath` 사용
4. **로더 vs FS**: 로더는 관대하지만, FS는 실제 파일이 있어야 함
5. **환경 인식**: Dev(src/*.ts) vs Prod(dist/*.js) 항상 고려
