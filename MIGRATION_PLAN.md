# Sonamu ESM + dynohot HMR 마이그레이션 종합 플랜

> **작성일**: 2025-11-14    
> **목표**: saessak PoC의 Vite-style TypeScript HMR 개발 서버를 Sonamu에 적용    
> **핵심**: CJS require.cache 방식 → ESM dynohot 방식 전환

---

## 목차

1. [프로젝트 이해하기](#1-프로젝트-이해하기)
2. [현재 상태 분석](#2-현재-상태-분석)
3. [빌드 시스템 정리 (선행 작업)](#3-빌드-시스템-정리-선행-작업)
4. [Phase 0: 준비 및 백업](#phase-0-준비-및-백업)
5. [Phase 1: 빌드 설정 통일 (SWC 천하통일)](#phase-1-빌드-설정-통일-swc-천하통일)
6. [Phase 2: ESM 유틸리티 준비](#phase-2-esm-유틸리티-준비)
7. [Phase 3: Syncer 핵심 변경](#phase-3-syncer-핵심-변경)
8. [Phase 4: 동적 임포트 경로 수정](#phase-4-동적-임포트-경로-수정)
9. [Phase 5: 커스텀 로더 & dynohot 통합](#phase-5-커스텀-로더--dynohot-통합)
10. [Phase 6: HMR accept() 추가](#phase-6-hmr-accept-추가)
11. [Phase 7: 파일 워처 간소화](#phase-7-파일-워처-간소화)
12. [Phase 8: 개발 명령어 업데이트](#phase-8-개발-명령어-업데이트)
13. [Phase 9: 테스트 및 검증](#phase-9-테스트-및-검증)
14. [Phase 10: 정리 및 문서화](#phase-10-정리-및-문서화)
15. [부록 A: 파일별 변경 체크리스트](#부록-a-파일별-변경-체크리스트)
16. [부록 B: 트러블슈팅 가이드](#부록-b-트러블슈팅-가이드)

---

## 1. 프로젝트 이해하기

### 1.1 Sonamu 프레임워크란?

Sonamu는 **엔티티 중심 TypeScript 백엔드 프레임워크**입니다:

- **엔티티 정의** (`*.entity.json`) → DB 스키마, Zod 스키마, TypeScript 타입 자동 생성
- **Syncer**가 파일 변경을 감지하여 코드 자동 생성
- 모델 → 서비스 → HTTP API 자동 생성
- 프론트엔드 프로젝트로 타입 자동 동기화

**핵심 파일 플로우:**
```
*.entity.json (사용자 정의)
  ↓
sonamu.generated.ts (자동 생성: BaseSchema, Enums, Subsets)
  ↓
*.types.ts (사용자 정의: BaseSchema 확장)
  ↓
*.model.ts (사용자 정의: 비즈니스 로직 + @api 데코레이터)
  ↓
서비스/API 자동 생성
```

### 1.2 현재 HMR 방식의 문제

**현재 (CJS 기반):**
1. 파일 변경 감지 (chokidar)
2. **SWC로 수동 트랜스파일** (TS → CJS)
3. **require.cache 수동 클리어** (변경된 모듈 + 의존 모듈)
4. 코드 생성 (entity → generated 등)
5. 모듈 재로드

**문제점:**
- ESM에서는 `require.cache`가 없음 → 캐시 클리어 불가
- 수동 트랜스파일 오버헤드
- 의존성 추적이 복잡 (재귀적 캐시 클리어)
- CJS 설정과 ESM 설정이 혼재 (일관성 없음)

**목표 (ESM + @sonamu-kit/loader + dynohot):**
1. 파일 변경 감지 (chokidar 유지 - 코드 생성 트리거용)
2. **@sonamu-kit/loader가 자동 트랜스파일** (온디맨드, 캐싱, .ts → .js 변환)
3. **dynohot이 자동 HMR** (import 그래프 기반 모듈 재로드)
4. Syncer는 **코드 생성만** 담당 (본연의 역할)
5. **HMR은 import하는 쪽에서 관리** (`import.meta.hot.accept('경로', callback)`)

---

## 2. 현재 상태 분석

### 2.1 빌드 시스템 현황

**설정 파일 인벤토리:**
- `.swcrc`: 2개 (sonamu, tasks)
- `tsconfig.json`: 17개 (모든 패키지)
- `tsup.config.js`: 1개 (ui/node - **불필요**)
- `rollup.config.mjs`: 1개 (ui - **미사용**)

**빌드 도구 사용 현황:**
| 패키지 | 트랜스파일 | 타입 체크 | 번들링 |
|--------|-----------|----------|--------|
| sonamu | SWC (ESM) | TSC | - |
| tasks | SWC (CJS!) | TSC | - |
| loader | - | TSC | - |
| ui (client) | - | TSC | Vite |
| ui (node) | **tsup** | TSC | - |
| react-sui | - | TSC | Vite |

**문제점:**
1. **tasks/.swcrc**가 CJS 출력 (sonamu는 ESM)
2. **ui/node**가 tsup 사용 (불필요 - SWC로 통일 가능)
3. **ui/rollup.config.mjs** 미사용 파일
4. **syncer.ts와 build-config.ts**에 하드코딩된 CJS 설정
5. tsconfig 중복 설정 (17개 파일에 공통 옵션 반복)

### 2.2 HMR 관련 코드 위치

**핵심 파일:**

1. **`src/syncer/syncer.ts`** (Lines 371-474)
   - `syncFromWatcher()` - HMR 메인 로직
   - `clearModuleAndDependents()` - require.cache 클리어 (ESM 불가)
   - 하드코딩된 SWC 설정 (CommonJS, ES5)

2. **`src/api/sonamu.ts`** (Lines 463-632)
   - `startWatcher()` - chokidar 설정
   - `handleFileChange()` - 파일 변경 핸들러
   - `finishHMR()` - HMR 완료 처리

3. **`src/utils/utils.ts`** (Lines 12-36)
   - `importMultiple()` - 동적 임포트 헬퍼
   - require.cache 클리어 로직 포함

4. **`src/entity/entity.ts`** (Line 556)
   - `importTypes()` - 상대 경로 동적 임포트

5. **`src/entity/entity-manager.ts`** (Lines 49-66)
   - `reload()` - 엔티티 재로드 시 require.cache 클리어

**require.cache 사용 위치:**
- `syncer.ts:424-453` - clearModuleAndDependents()
- `utils.ts:21-22` - importMultiple()
- `entity-manager.ts:55-59` - reload()

**__dirname 사용 위치:**
- `syncer.ts:152-154, 1307`
- `utils.ts:19, 50`
- `entity.ts:556`

### 2.3 Syncer 동작 흐름 (상세)

#### 2.3.1 서버 시작 시 초기화

**시작점**: `api/src/index.ts` (애플리케이션 엔트리)
```
index.ts
  → Sonamu.init(true, false, undefined, true)  // (doSilent, doTest, dbConfig, enableSync)
      [sonamu.ts:180-218]

    1. EntityManager.autoload(doSilent)  [sonamu.ts:200]
       - 모든 *.entity.json 파일 로드 (글로브: `${apiRootPath}/src/application/**/*.entity.json`)
       - Entity 인스턴스 생성 및 검증

    2. new Syncer()  [sonamu.ts:204]

    3. syncer.autoloadTypes()  [syncer.ts:969-999]
       - 글로브: `dist/application/**/*.types.js`
       - 글로브: `dist/application/**/*.generated.js`
       - importMultiple()로 동적 로드
       - Zod 스키마만 필터링하여 this.types에 저장

    4. syncer.autoloadModels()  [syncer.ts:941-966]
       - 글로브: `dist/application/**/*.{model,frame}.js`
       - src에 원본이 있는 파일만 필터링 (삭제된 파일 제외)
       - importMultiple()로 동적 로드
       - *Model, *Frame export만 this.models에 저장

    5. syncer.autoloadApis()  [syncer.ts:926-939]
       - 글로브: `src/application/**/*.{model,frame}.ts`
       - readApisFromFile()로 @api 데코레이터 파싱
       - registeredApis 전역 배열에서 API 정보 수집
       - this.apis에 저장

    6. syncer.sync()  [sonamu.ts:212]
       - 초기 동기화 수행 (체크섬 비교)

    7. Sonamu.startWatcher()  [sonamu.ts:215, 463-486]
       - 감시 대상: `${apiRootPath}/src/**/*`
       - 감시 파일: *.ts, *.json (index.ts 제외)
       - chokidar 이벤트: 'change', 'add'
       - 핸들러: handleFileChange()
```

#### 2.3.2 파일 변경 감지 및 HMR (현재 방식)

**Watch 디렉토리**: `${apiRootPath}/src/`
**감시 대상**: `*.ts`, `*.json` (단, `src/index.ts` 제외)
**이벤트 타입**: `change`, `add`

**호출 체인 (현재 CJS 방식)**:
```
파일 저장 (예: api/src/application/user/user.entity.json)
  ↓
chokidar 'change' 이벤트  [sonamu.ts:475]
  ↓
Sonamu.handleFileChange(event, filePath)  [sonamu.ts:596-619]
  - this.pendingFiles.push(filePath)
  - this.hmrStartTime 기록 (첫 파일인 경우)
  ↓
syncer.syncFromWatcher([filePath])  [syncer.ts:371-474]
  │
  ├─ 1단계: 트랜스파일 (TS 파일인 경우)  [syncer.ts:375-421]
  │    - SWC로 src/*.ts → dist/*.js 변환
  │    - 하드코딩: module.type = "commonjs", target = "es5"
  │    - 5개씩 청크로 병렬 처리
  │
  ├─ 2단계: 모듈 캐시 클리어  [syncer.ts:423-453]
  │    - clearModuleAndDependents(jsPath)
  │    - require.resolve()로 절대 경로 확인
  │    - require.cache에서 해당 모듈 삭제
  │    - children에 해당 모듈 포함한 부모들도 삭제 (재귀)
  │    - dist/index.js 포함 시 SIGUSR2 전송 (프로세스 재시작)
  │
  ├─ 3단계: 코드 생성  [syncer.ts:455-464]
  │    - doSyncActions(targetFilePaths)
  │      │
  │      ├─ entity/types 변경 → EntityManager.reload()  [syncer.ts:267]
  │      │   - require.cache에서 sonamu.generated.js 삭제
  │      │   - 모든 entity.json 재로드
  │      │
  │      ├─ actionGenerateSchemas()  [syncer.ts:269]
  │      │   - generated.template.ts 실행 → sonamu.generated.ts 생성
  │      │   - generated_sso.template.ts 실행 → sonamu.generated.sso.ts 생성
  │      │
  │      ├─ entity 신규 추가인 경우  [syncer.ts:272-301]
  │      │   - init_types.template.ts → *.types.ts 생성
  │      │   - entity.template.ts → *.entity.ts 생성
  │      │   - model.template.ts → *.model.ts 생성
  │      │
  │      ├─ model 변경 → actionGenerateServices()  [syncer.ts:322-357]
  │      │   - service.template.ts → *.service.ts 생성
  │      │
  │      └─ 항상 → actionGenerateHttps()  [syncer.ts:359]
  │          - generated_http.template.ts → sonamu.generated.http 생성
  │
  ├─ 4단계: 모듈 재로드  [syncer.ts:466-471]
  │    - this.apis = []
  │    - this.types = {}
  │    - this.models = {}
  │    - autoloadTypes() 재실행
  │    - autoloadModels() 재실행
  │    - autoloadApis() 재실행
  │
  └─ 5단계: UI 동기화  [syncer.ts:473]
       - syncUI() (프론트엔드 타입 복사)
  ↓
Sonamu.finishHMR()  [sonamu.ts:621-632]
  - 체크섬 저장
  - 소요 시간 출력
```

**현재 방식의 주요 문제점**:
- **Syncer가 너무 많은 역할**: 트랜스파일 + 캐시 관리 + 코드 생성 + 모듈 로드
- **require.cache 의존**: ESM에서 사용 불가
- **하드코딩된 CJS 설정**: .swcrc 무시하고 syncer.ts에 직접 CJS 출력 설정
- **수동 의존성 추적**: clearModuleAndDependents()가 재귀적으로 부모 찾기

#### 2.3.3 파일 변경 감지 및 HMR (목표 ESM 방식)

**호출 체인 (ESM + @sonamu-kit/loader + dynohot)**:
```
파일 저장 (예: api/src/application/user/user.entity.json)
  ↓
chokidar 'change' 이벤트  [sonamu.ts:475]
  ↓
Sonamu.handleFileChange(event, filePath)  [sonamu.ts:596-619]
  ↓
syncer.doSyncActions(targetFilePaths)  [syncer.ts:246-367]
  - 트랜스파일 제거 (로더가 담당)
  - 캐시 클리어 제거 (dynohot이 담당)
  - 순수하게 코드 생성만 수행
  │
  ├─ entity/types 변경 → EntityManager.reload()
  │   - require.cache 제거 (ESM에서는 불필요)
  │   - 모든 entity.json 재로드
  │
  ├─ actionGenerateSchemas()
  │   - sonamu.generated.ts 파일 쓰기
  │     ↓
  │     dynohot이 파일 변경 감지
  │     ↓
  │     autoloadTypes()에서 import.meta.hot.accept() 호출
  │       accept('./path/to/sonamu.generated.js', (newModule) => {
  │         // 새 모듈로 this.types 업데이트
  │       })
  │     ↓
  │     의존 모듈들 자동 재로드 (import 그래프 기반)
  │
  ├─ actionGenerateServices() (필요시)
  │   - *.service.ts 파일 쓰기
  │
  └─ actionGenerateHttps()
      - sonamu.generated.http 파일 쓰기
  ↓
Syncer의 autoload 함수들에서 import.meta.hot.accept()로 HMR 관리
  - autoloadTypes(): generated.ts, types.ts 파일들에 대한 accept()
  - autoloadModels(): model.ts 파일들에 대한 accept()
  - autoloadApis(): API 데코레이터 재파싱
  ↓
Sonamu.finishHMR()
  - 체크섬 저장
  - 소요 시간 출력
```

**ESM 방식의 개선점**:
- **Syncer는 코드 생성만**: 본연의 역할에 집중
- **@sonamu-kit/loader가 트랜스파일**: `import './foo.ts'` 시 자동 변환
- **dynohot이 HMR 관리**: import 그래프 기반 자동 의존성 추적
- **accept()는 import하는 쪽에서**: 모듈 내부가 아닌 사용처에서 관리

---

## 3. 빌드 시스템 정리 (선행 작업)

> **이유**: ESM 마이그레이션 전에 불필요한 파일 제거 및 하드코딩된 설정 수정

### 3.1 목표: "SWC 천하통일"

**최종 빌드 아키텍처:**
- **백엔드 패키지**: SWC (트랜스파일) + TSC (타입 체크 & 선언)
- **프론트엔드 패키지**: Vite (번들링) + TSC (타입 체크)
- **설정 파일**: 각 패키지가 독립적으로 유지 (향후 독립 가능성 고려)

### 3.2 제거할 파일

```bash
# 미사용 파일만 제거
rm modules/ui/rollup.config.mjs  # 완전 미사용
rm modules/ui/tsup.config.js     # ui/node는 SWC로 통일
```

**주의**:
- ❌ tsconfig.base.json 생성하지 않음 (각 패키지 독립성 유지)
- ❌ tasks/.swcrc 제거하지 않음 (신규 패키지, 독립 설정 유지)

### 3.3 제거할 의존성

**`modules/ui/package.json`에서 제거:**
```json
"devDependencies": {
  "@rollup/plugin-alias": "^5.0.0",
  "@rollup/plugin-commonjs": "^25.0.4",
  "@rollup/plugin-json": "^6.0.0",
  "@rollup/plugin-node-resolve": "^15.1.0",
  "rollup": "^3.28.0",
  "rollup-plugin-dts": "^5.3.1",
  "rollup-plugin-esbuild": "^5.0.0",
  "tsup": "^8.1.0"
}
```

### 3.4 tasks/.swcrc 확인 및 ESM 통일

**현재**: `modules/tasks/.swcrc`가 CJS 출력 중
**목표**: ESM 출력으로 변경 (sonamu와 일관성 유지)

**`modules/tasks/.swcrc`** 수정:
```json
{
  "module": {
    "type": "es6",        // ← commonjs에서 변경
    "resolveFully": true
  },
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true   // tasks에서도 데코레이터 사용 가능성
    },
    "baseUrl": ".",
    "target": "esnext"     // ← es5에서 변경
  },
  "minify": false,
  "sourceMaps": true
}
```

**`modules/tasks/package.json`** 확인:
```json
{
  "type": "module",  // ← 반드시 추가/확인
  "scripts": {
    "build": "swc src -d dist --strip-leading-paths --source-maps"
  }
}
```

### 3.5 하드코딩된 SWC 설정 제거

**`modules/sonamu/src/bin/build-config.ts`**:

**기존:**
```typescript
export const SWC_BUILD_COMMAND = `swc src -d ${BUILD_DIR} --strip-leading-paths --source-maps -C module.type=commonjs -C jsc.parser.syntax=typescript -C jsc.parser.decorators=true -C jsc.target=es5`;
```

**변경:**
```typescript
export const SWC_BUILD_COMMAND = `swc src -d ${BUILD_DIR} --strip-leading-paths --source-maps`;
// .swcrc 설정을 사용하도록 -C 플래그 제거
```

**`modules/sonamu/src/syncer/syncer.ts` (Lines 376-421)**:

**기존:**
```typescript
const { code, map } = await swc.transformFile(diffFile, {
  module: { type: "commonjs" },
  jsc: {
    parser: { syntax: "typescript", decorators: true },
    target: "es5",
  },
  sourceMaps: true,
});
```

**변경:**
```typescript
// .swcrc 사용 (하드코딩 제거)
const { code, map } = await swc.transformFile(diffFile, {
  configFile: path.join(Sonamu.apiRootPath, '.swcrc'),
  filename: diffFile,
});
```

**참고**: Phase 3에서 이 트랜스파일 코드 자체를 제거할 예정 (로더가 담당)

### 3.6 빌드 검증

**모든 패키지 빌드 테스트:**
```bash
# 워크스페이스 루트에서
yarn workspaces foreach -A run build

# 또는 개별 패키지
cd modules/sonamu && yarn build
cd modules/tasks && yarn build
cd modules/loader && yarn build
cd modules/ui && yarn build
```

**예상 결과:**
- ✅ 모든 패키지가 ESM으로 빌드
- ✅ dist/ 디렉토리에 .js + .d.ts 생성
- ✅ .swcrc 설정이 올바르게 적용됨

---

## Phase 0: 준비 및 백업

### Step 0.1: Git 브랜치 생성

```bash
cd ~/Projects/sonamu
git checkout -b feat/esm-dynohot-hmr
```

### Step 0.2: 현재 개발 서버 동작 확인

```bash
cd examples/miomock/api
yarn dev

# 다른 터미널에서
curl http://localhost:3000/api/health
```

**HMR 동작 확인:**
1. user.entity.json에 필드 추가
2. 콘솔에서 HMR 로그 확인
3. API 응답 확인

---

## Phase 1: 빌드 시스템 정리

> **Section 3에서 정의한 내용 실행**

### Step 1.1: 미사용 파일 제거

```bash
cd ~/Projects/sonamu

# rollup 설정 제거
rm modules/ui/rollup.config.mjs

# tsup 설정 제거
rm modules/ui/tsup.config.js

git add -A
git commit -m "chore: 미사용 빌드 설정 파일 제거 (rollup, tsup)"
```

### Step 1.2: tasks/.swcrc ESM 통일

**파일**: `modules/tasks/.swcrc`

**변경:**
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

**파일**: `modules/tasks/package.json`

**"type": "module" 확인:**
```json
{
  "name": "@sonamu-kit/tasks",
  "type": "module",
  "scripts": {
    "build": "swc src -d dist --strip-leading-paths --source-maps && tsc --emitDeclarationOnly"
  }
}
```

```bash
git add modules/tasks/.swcrc modules/tasks/package.json
git commit -m "chore(tasks): .swcrc ESM 통일"
```

### Step 1.3: 하드코딩된 SWC 설정 제거

**파일**: `modules/sonamu/src/bin/build-config.ts`

**변경 전:**
```typescript
export const SWC_BUILD_COMMAND = `swc src -d ${BUILD_DIR} --strip-leading-paths --source-maps -C module.type=commonjs -C jsc.parser.syntax=typescript -C jsc.parser.decorators=true -C jsc.target=es5`;
```

**변경 후:**
```typescript
export const SWC_BUILD_COMMAND = `swc src -d ${BUILD_DIR} --strip-leading-paths --source-maps`;
// .swcrc 설정 사용
```

```bash
git add modules/sonamu/src/bin/build-config.ts
git commit -m "refactor(sonamu): SWC 빌드 명령에서 하드코딩 제거, .swcrc 사용"
```

### Step 1.4: 의존성 제거

**파일**: `modules/ui/package.json`

```json
{
  "devDependencies": {
    // 제거
    // "@rollup/plugin-alias": "^5.0.0",
    // "@rollup/plugin-commonjs": "^25.0.4",
    // "@rollup/plugin-json": "^6.0.0",
    // "@rollup/plugin-node-resolve": "^15.1.0",
    // "rollup": "^3.28.0",
    // "rollup-plugin-dts": "^5.3.1",
    // "rollup-plugin-esbuild": "^5.0.0",
    // "tsup": "^8.1.0"
  }
}
```

```bash
cd modules/ui
# package.json 수동 편집 후
yarn install

cd ../..
git add modules/ui/package.json yarn.lock
git commit -m "chore(ui): 미사용 빌드 도구 의존성 제거"
```

### Step 1.5: 빌드 검증

```bash
yarn workspaces foreach -A run build
```

**예상 결과:**
- ✅ 모든 패키지 빌드 성공
- ✅ dist/ 디렉토리 생성
- ✅ ESM 모듈 출력 확인

---

## Phase 2: ESM 유틸리티 준비

### Step 2.1: esm-utils.ts 작성

**파일**: `modules/sonamu/src/utils/esm-utils.ts`

**내용**: 앞서 Section 2에서 정의한 코드 그대로 작성
- getFilename()
- getDirname()
- createImportUrl()
- isHMREnabled()
- isDevMode()

### Step 2.2: path-utils.ts 작성

**파일**: `modules/sonamu/src/utils/path-utils.ts`

**내용**: 앞서 Section 2에서 정의한 코드 그대로 작성 (양방향 변환 포함)
- resolveModulePath()
- resolveGlobPattern() with 'toDev' | 'toProd' | 'auto'
- changeExtension()

### Step 2.3: 커밋

```bash
git add modules/sonamu/src/utils/esm-utils.ts
git add modules/sonamu/src/utils/path-utils.ts
git commit -m "feat(sonamu): ESM 유틸리티 추가 (esm-utils, path-utils)"
```

---

## Phase 3: Syncer 핵심 변경

> **목표**: Syncer가 코드 생성만 하도록 리팩토링 (트랜스파일/캐시 제거)

### Step 3.1: syncFromWatcher() 간소화

**파일**: `modules/sonamu/src/syncer/syncer.ts`

**현재 코드 (Lines 371-474):**
```typescript
async syncFromWatcher(diffFiles: string[]): Promise<void> {
  const targetFilePaths: string[] = [];

  // 1. TS 파일 트랜스파일 (CJS로 변환)
  const tsFiles = diffFiles.filter((file) => file.endsWith(".ts"));
  const chunks = _.chunk(tsFiles, 5); // 5개씩 처리

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (diffFile) => {
        const jsPath = diffFile.replace(/^src\//, "dist/").replace(/\.ts$/, ".js");
        const mapPath = jsPath + ".map";

        // SWC로 트랜스파일
        const { code, map } = await swc.transformFile(diffFile, {
          module: { type: "commonjs" },
          jsc: {
            parser: { syntax: "typescript", decorators: true },
            target: "es5",
          },
          sourceMaps: true,
        });

        // 파일 쓰기
        await mkdir(path.dirname(jsPath), { recursive: true });
        await writeFile(jsPath, code);
        if (map) {
          await writeFile(mapPath, map);
        }

        targetFilePaths.push("/" + path.relative(Sonamu.apiRootPath, jsPath));
      })
    );
  }

  // 2. require.cache 클리어
  for (const diffFile of diffFiles) {
    if (diffFile.endsWith(".ts")) {
      const modulePath = path.resolve(
        diffFile.replace(/^src\//, "dist/").replace(/\.ts$/, ".js")
      );
      clearModuleAndDependents(modulePath);
    }
  }

  // 3. 코드 생성
  targetFilePaths.push(
    ...diffFiles
      .filter((filePath) =>
        Object.values(this.checksumPatternGroup).some((pattern) =>
          minimatch(filePath, pattern)
        )
      )
      .map((filePath) => "/" + path.relative(Sonamu.apiRootPath, filePath))
  );

  await this.doSyncActions(targetFilePaths);

  // 4. 모듈 재로드
  this.apis = [];
  this.types = {};
  this.models = {};
  await this.autoloadTypes();
  await this.autoloadModels();
  await this.autoloadApis();

  this.syncUI();
}
```

**새 코드:**
```typescript
/**
 * 파일 변경 시 코드 생성만 수행
 *
 * 트랜스파일과 모듈 리로딩은 dynohot이 자동 처리
 */
async syncFromWatcher(diffFiles: string[]): Promise<void> {
  // 1. Syncer가 관심있는 파일만 필터링
  const targetFilePaths = diffFiles
    .filter((filePath) =>
      Object.values(this.checksumPatternGroup).some((pattern) =>
        minimatch(filePath, pattern)
      )
    )
    .map((filePath) => "/" + path.relative(Sonamu.apiRootPath, filePath));

  // 2. 코드 생성 액션 실행
  await this.doSyncActions(targetFilePaths);

  // 3. 메타데이터 재로드 (models/types는 dynohot이 자동 처리)
  //    APIs만 재파싱 (AST 기반이라 파일 읽기만 하면 됨)
  this.apis = [];
  await this.autoloadApis();

  // 4. UI에 변경 알림
  this.syncUI();
}
```

**주요 변경점:**
- ✅ **삭제**: SWC 트랜스파일 로직 (Lines 378-421)
- ✅ **삭제**: `clearModuleAndDependents()` 호출 (Lines 424-431)
- ✅ **삭제**: `autoloadTypes()`, `autoloadModels()` 호출
- ✅ **유지**: `doSyncActions()` - 코드 생성 (본연의 역할)
- ✅ **유지**: `autoloadApis()` - AST 파싱 (파일만 읽음)

### Step 3.2: clearModuleAndDependents() 삭제

**파일**: `modules/sonamu/src/syncer/syncer.ts`

**Lines 424-453 삭제:**
```typescript
// ❌ 삭제할 함수
function clearModuleAndDependents(filePath: string) {
  if (!require.resolve) {
    return;
  }

  const resolved = require.resolve(filePath);
  const toDelete = new Set([resolved]);

  // 의존 모듈 찾기
  Object.keys(require.cache).forEach((key) => {
    const mod = require.cache[key];
    if (mod?.children?.some((child) => child.id === resolved)) {
      toDelete.add(key);
    }
  });

  // 캐시 삭제
  toDelete.forEach((key) => {
    if (key.includes("dist/index.js")) {
      process.kill(process.pid, "SIGUSR2"); // 서버 재시작
    }
    delete require.cache[key];
  });
}
```

**이유**: ESM에서는 `require.cache`가 없고, dynohot이 자동으로 처리

### Step 3.3: autoloadModels() 경로 해석 수정

**파일**: `modules/sonamu/src/syncer/syncer.ts`

**현재 코드 (Lines 941-999):**
```typescript
async autoloadModels(): Promise<{ [modelName: string]: unknown }> {
  const pathPattern = path.join(
    Sonamu.apiRootPath,
    "dist/application/**/*.{model,frame}.js"
  );

  const filePaths = await globAsync(pathPattern);
  const modules = await importMultiple(filePaths);

  // ... 모델 등록 로직
}
```

**새 코드:**
```typescript
import { resolveGlobPattern } from '../utils/path-utils';

async autoloadModels(): Promise<{ [modelName: string]: unknown }> {
  // Dev 모드: src/**/*.model.ts
  // Prod 모드: dist/**/*.model.js
  const pathPattern = resolveGlobPattern(
    path.join(Sonamu.apiRootPath, "dist/application/**/*.{model,frame}.js")
  );

  const filePaths = await globAsync(pathPattern);

  // importMultiple이 알아서 캐시 우회 처리
  const modules = await importMultiple(filePaths, true); // doRefresh = true

  // ... 모델 등록 로직 (동일)
}
```

### Step 3.4: autoloadTypes() 경로 해석 수정

**파일**: `modules/sonamu/src/syncer/syncer.ts`

**새 코드:**
```typescript
import { resolveGlobPattern } from '../utils/path-utils';

async autoloadTypes(doRefresh: boolean = false): Promise<{ [typeName: string]: z.ZodObject<any> }> {
  const pathPatterns = [
    resolveGlobPattern(path.join(Sonamu.apiRootPath, "/dist/application/**/*.types.js")),
    resolveGlobPattern(path.join(Sonamu.apiRootPath, "/dist/application/**/*.generated.js")),
  ];

  const filePaths = (
    await Promise.all(pathPatterns.map((pattern) => globAsync(pattern)))
  ).flat();

  const modules = await importMultiple(filePaths, doRefresh);

  // ... 타입 등록 로직 (동일)
}
```

### Step 3.5: checksumPatternGroup 경로 해석

**파일**: `modules/sonamu/src/syncer/syncer.ts`

**현재 코드:**
```typescript
public checksumPatternGroup: GlobPattern = {
  entity: Sonamu.apiRootPath + "/src/application/**/*.entity.json",
  types: Sonamu.apiRootPath + "/src/application/**/*.types.ts",
  generated: Sonamu.apiRootPath + "/src/application/sonamu.generated.ts",
  functions: Sonamu.apiRootPath + "/src/application/**/*.functions.ts",
  model: Sonamu.apiRootPath + "/dist/application/**/*.model.js",
  frame: Sonamu.apiRootPath + "/dist/application/**/*.frame.js",
};
```

**새 코드:**
```typescript
import { resolveGlobPattern } from '../utils/path-utils';

public checksumPatternGroup: GlobPattern = {
  entity: Sonamu.apiRootPath + "/src/application/**/*.entity.json",
  types: Sonamu.apiRootPath + "/src/application/**/*.types.ts",
  generated: Sonamu.apiRootPath + "/src/application/sonamu.generated.ts",
  functions: Sonamu.apiRootPath + "/src/application/**/*.functions.ts",

  // Dev 모드에서는 src/*.ts, Prod에서는 dist/*.js
  model: resolveGlobPattern(Sonamu.apiRootPath + "/dist/application/**/*.model.js"),
  frame: resolveGlobPattern(Sonamu.apiRootPath + "/dist/application/**/*.frame.js"),
};
```

**주의**: Entity/types/generated/functions는 항상 src/를 봐야 함 (소스 파일)

### Step 3.6: .swcrc 읽기 유틸리티 추가

**파일**: `modules/sonamu/src/syncer/syncer.ts`

**새 메서드 추가:**
```typescript
import { readFile } from 'fs/promises';

/**
 * .swcrc 설정 읽기 (필요한 경우 - 향후 확장용)
 */
private async loadSWCConfig(): Promise<any> {
  const swcrcPath = path.join(Sonamu.apiRootPath, '.swcrc');
  try {
    const content = await readFile(swcrcPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('Failed to load .swcrc, using defaults');
    return {
      module: { type: "es6", resolveFully: true },
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        target: "esnext",
      },
      sourceMaps: true,
    };
  }
}
```

**참고**: 현재는 dynohot이 트랜스파일하므로 불필요하지만, 향후 확장을 위해 준비

---

## Phase 4: 동적 임포트 경로 수정

> **목표**: 모든 동적 임포트를 ESM 방식으로 변경

### Step 4.1: importMultiple() 리팩토링

**파일**: `modules/sonamu/src/utils/utils.ts`

**현재 코드 (Lines 12-36):**
```typescript
export async function importMultiple(
  filePaths: string[],
  doRefresh: boolean = false
): Promise<{ filePath: string; imported: any }[]> {
  const results: { filePath: string; imported: any }[] = [];

  for (const filePath of filePaths) {
    let importPath = "./" + path.relative(__dirname, filePath);

    if (doRefresh) {
      if (require.resolve) {
        delete require.cache[require.resolve(importPath)];
      } else {
        importPath += `?t=${Date.now()}`;
      }
    }

    const imported = await import(importPath);
    results.push({ filePath, imported });
  }

  return results;
}
```

**새 코드:**
```typescript
import { createImportUrl } from './esm-utils';

/**
 * 여러 파일을 동적으로 임포트
 *
 * ESM 환경에서는 file:// URL + query string으로 캐시 우회
 *
 * @param filePaths - 절대 경로 배열
 * @param doRefresh - 캐시 우회 여부
 * @returns 임포트된 모듈 배열
 */
export async function importMultiple(
  filePaths: string[],
  doRefresh: boolean = false
): Promise<{ filePath: string; imported: any }[]> {
  const results: { filePath: string; imported: any }[] = [];

  for (const filePath of filePaths) {
    // ESM: file:// URL 사용
    const importUrl = createImportUrl(filePath, { cacheBust: doRefresh });

    const imported = await import(importUrl);
    results.push({ filePath, imported });
  }

  return results;
}
```

**주요 변경점:**
- ✅ `path.relative(__dirname, ...)` → `createImportUrl()` (file:// URL)
- ✅ `require.cache` 삭제 → query string `?t=timestamp`
- ✅ 절대 경로 기반으로 변경 (상대 경로 문제 해결)

### Step 4.2: Entity.importTypes() 수정

**파일**: `modules/sonamu/src/entity/entity.ts`

**현재 코드 (Line 556):**
```typescript
async importTypes() {
  const typesFileDistPath = this.typesFilePath.replace(/^src\//, "dist/").replace(/\.ts$/, ".js");
  const importPath = path.relative(__dirname, typesFileDistPath);
  const imported = await import(importPath);

  // ... Zod 타입 파싱
}
```

**새 코드:**
```typescript
import { createImportUrl } from '../utils/esm-utils';
import { resolveModulePath } from '../utils/path-utils';

async importTypes() {
  // Dev 모드: src/*.ts, Prod 모드: dist/*.js
  const resolvedPath = resolveModulePath(this.typesFilePath);

  // file:// URL로 변환 (캐시 우회)
  const importUrl = createImportUrl(resolvedPath, { cacheBust: true });

  const imported = await import(importUrl);

  // ... Zod 타입 파싱 (동일)
}
```

### Step 4.3: Syncer.getZodTypeById() 수정

**파일**: `modules/sonamu/src/syncer/syncer.ts`

**현재 코드 (Line 1307):**
```typescript
async getZodTypeById(zodTypeId: string): Promise<z.ZodTypeAny> {
  const [moduleName, ...rest] = zodTypeId.split(".");
  const modulePath = `application/${moduleName}/${moduleName}.types`;

  const moduleAbsPath = path.join(
    Sonamu.apiRootPath,
    "dist/application",
    modulePath + ".js"
  );

  const importPath = "./" + path.relative(__dirname, moduleAbsPath);
  const imported = await import(importPath);

  return imported[zodTypeId];
}
```

**새 코드:**
```typescript
import { createImportUrl } from '../utils/esm-utils';
import { resolveModulePath } from '../utils/path-utils';

async getZodTypeById(zodTypeId: string): Promise<z.ZodTypeAny> {
  const [moduleName, ...rest] = zodTypeId.split(".");
  const relativePath = `dist/application/${moduleName}/${moduleName}.types.js`;

  // Dev/Prod 경로 해석
  const resolvedPath = resolveModulePath(relativePath);

  // file:// URL로 변환
  const importUrl = createImportUrl(resolvedPath, { cacheBust: false });

  const imported = await import(importUrl);

  return imported[zodTypeId];
}
```

### Step 4.4: EntityManager.reload() 수정

**파일**: `modules/sonamu/src/entity/entity-manager.ts`

**현재 코드 (Lines 49-66):**
```typescript
async reload(): Promise<void> {
  this.entities.clear();
  this.modulePaths.clear();
  this.tableSpecs.clear();

  // require.cache 클리어
  if (require.resolve) {
    const generatedPath = path.join(
      Sonamu.apiRootPath,
      "dist/application/sonamu.generated.js"
    );
    try {
      delete require.cache[require.resolve(generatedPath)];
    } catch {}
  }

  await this.autoload();
}
```

**새 코드:**
```typescript
async reload(): Promise<void> {
  // 내부 맵 초기화
  this.entities.clear();
  this.modulePaths.clear();
  this.tableSpecs.clear();

  // ESM에서는 명시적 캐시 클리어 불필요
  // dynohot이 자동 처리하거나, importMultiple에서 ?t= 사용

  // 엔티티 재로드
  await this.autoload();
}
```

---

## Phase 5: 커스텀 로더 & dynohot 통합

> **목표**: modules/loader가 제대로 작동하도록 확인 및 dynohot 연동

### Step 5.1: 로더 패키지 확인

**파일**: `modules/loader/package.json`

```json
{
  "name": "@sonamu-kit/loader",
  "version": "2.1.1",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./hooks": "./dist/hooks.js"
  },
  "dependencies": {
    "@swc/core": "^1.3.0"
  }
}
```

### Step 5.2: 로더 ESM hooks 확인

**파일**: `modules/loader/src/hooks.ts` (또는 esm.ts)

**확인 사항:**
```typescript
import type { LoadHook, ResolveHook } from 'node:module';
import { transform } from '@swc/core';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  // .ts 파일을 .js로 해석
  if (specifier.endsWith('.ts')) {
    const jsSpecifier = specifier.replace(/\.ts$/, '.js');
    return nextResolve(jsSpecifier, context);
  }

  // .js import를 .ts 파일로 해석
  if (specifier.endsWith('.js')) {
    // 파일 시스템에서 .ts 찾기
    // ...
  }

  return nextResolve(specifier, context);
};

export const load: LoadHook = async (url, context, nextLoad) => {
  // .ts 파일 트랜스파일
  if (url.endsWith('.ts')) {
    const filePath = fileURLToPath(url);
    const source = await readFile(filePath, 'utf8');

    const result = await transform(source, {
      filename: filePath,
      module: { type: 'es6', resolveFully: true },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        target: 'esnext',
      },
      sourceMaps: 'inline',
    });

    // dynohot 통합
    if (context.hot) {
      context.hot.watch(url);
    }

    return {
      format: 'module',
      source: result.code,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
};
```

**핵심:**
- ✅ `context.hot.watch(url)` 호출 → dynohot에 파일 등록
- ✅ SWC 설정이 `.swcrc`와 일치 (ESM, esnext)
- ✅ Source map을 inline으로 포함

### Step 5.3: 로더 빌드

```bash
cd modules/loader
yarn build

# dist/ 폴더 확인
ls -la dist/
# hooks.js, index.js 등 생성 확인
```

### Step 5.4: dynohot 설정 확인

**파일**: `modules/sonamu/package.json`

```json
{
  "dependencies": {
    "@sonamu-kit/loader": "workspace:^"
  },
  "devDependencies": {
    "dynohot": "^2.1.1"
  },
  "dependenciesMeta": {
    "dynohot@2.1.1": {
      "unplugged": true
    }
  }
}
```

**Yarn Berry 확인:**
```bash
# .yarnrc.yml에 nodeLinker 확인
cat .yarnrc.yml
# nodeLinker: pnp 또는 node-modules

# dynohot이 unplugged되어 있는지 확인
ls -la .yarn/unplugged/
```

---

## Phase 6: HMR accept() 추가

> **목표**: **모듈을 import하는 쪽에서** `import.meta.hot.accept(모듈경로, 콜백)` 추가

### 핵심 개념 변경

**잘못된 접근** (각 모듈 내부에 HMR 코드 추가):
```typescript
// ❌ sonamu.generated.ts (생성된 파일)
export const UserSchema = z.object({...});

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log('Updated');
  });
}
```

**올바른 접근** (import하는 쪽에서 accept 호출):
```typescript
// ✅ syncer.ts (모듈을 사용하는 쪽)
import * as generatedModule from './application/sonamu.generated.js';

if (import.meta.hot) {
  import.meta.hot.accept('./application/sonamu.generated.js', (newModule) => {
    // 새 모듈로 업데이트
    this.types = { ...this.types, ...extractTypes(newModule) };
    console.log('[HMR] sonamu.generated.ts reloaded');
  });
}
```

**이유**:
- dynohot은 import 그래프를 추적하여 의존 모듈을 자동 재로드
- accept()는 "이 모듈이 변경되면 내가 처리할게"라는 선언
- 모듈 내부가 아닌 **사용처에서** 재로드 후 처리 방법을 정의해야 함
- 생성된 파일에 HMR 코드를 넣으면 코드 생성 템플릿이 복잡해지고 불필요

### Step 6.1: syncer.autoloadTypes()에 HMR accept() 추가

**파일**: `modules/sonamu/src/syncer/syncer.ts`

**현재 코드** (Lines 969-999):
```typescript
async autoloadTypes(
  doRefresh: boolean = false
): Promise<{ [typeName: string]: z.ZodObject<any> }> {
  if (!doRefresh && Object.keys(this.types).length > 0) {
    return this.types;
  }

  const pathPatterns = [
    path.join(Sonamu.apiRootPath, "/dist/application/**/*.types.js"),
    path.join(Sonamu.apiRootPath, "/dist/application/**/*.generated.js"),
  ];

  const filePaths = await filterAsync(
    (await mapAsync(pathPatterns, globAsync)).flat(),
    async (path) => {
      const srcPath = path.replace("/dist/", "/src/").replace(".js", ".ts");
      return await exists(srcPath);
    }
  );

  const modules = await importMultiple(filePaths, doRefresh);
  const functions = modules
    .map(({ imported }) => Object.entries(imported))
    .flat();
  this.types = Object.fromEntries(
    functions.filter(([, f]) => f instanceof z.ZodType)
  ) as typeof this.types;

  return this.types;
}
```

**새 코드** (HMR accept 추가):
```typescript
async autoloadTypes(
  doRefresh: boolean = false
): Promise<{ [typeName: string]: z.ZodObject<any> }> {
  if (!doRefresh && Object.keys(this.types).length > 0) {
    return this.types;
  }

  const pathPatterns = [
    path.join(Sonamu.apiRootPath, "/dist/application/**/*.types.js"),
    path.join(Sonamu.apiRootPath, "/dist/application/**/*.generated.js"),
  ];

  const filePaths = await filterAsync(
    (await mapAsync(pathPatterns, globAsync)).flat(),
    async (path) => {
      const srcPath = path.replace("/dist/", "/src/").replace(".js", ".ts");
      return await exists(srcPath);
    }
  );

  const modules = await importMultiple(filePaths, doRefresh);
  const functions = modules
    .map(({ imported }) => Object.entries(imported))
    .flat();
  this.types = Object.fromEntries(
    functions.filter(([, f]) => f instanceof z.ZodType)
  ) as typeof this.types;

  // HMR: types 파일들에 대한 accept 등록
  if (import.meta.hot) {
    for (const filePath of filePaths) {
      import.meta.hot.accept(filePath, async (newModule) => {
        if (newModule) {
          // 변경된 모듈의 Zod 타입만 추출하여 업데이트
          const newTypes = Object.fromEntries(
            Object.entries(newModule).filter(([, f]) => f instanceof z.ZodType)
          );
          this.types = { ...this.types, ...newTypes };
          console.log(chalk.green(`[HMR] Types reloaded: ${path.basename(filePath)}`));
        }
      });
    }
  }

  return this.types;
}
```

### Step 6.2: syncer.autoloadModels()에 HMR accept() 추가

**파일**: `modules/sonamu/src/syncer/syncer.ts`

**현재 코드** (Lines 941-966):
```typescript
async autoloadModels(): Promise<{ [modelName: string]: unknown }> {
  const pathPattern = path.join(
    Sonamu.apiRootPath,
    "dist/application/**/*.{model,frame}.js"
  );

  const filePaths = await filterAsync(
    await globAsync(pathPattern),
    async (path) => {
      const srcPath = path.replace("/dist/", "/src/").replace(".js", ".ts");
      return await exists(srcPath);
    }
  );

  const modules = await importMultiple(filePaths);
  const functions = modules
    .map(({ imported }) => Object.entries(imported))
    .flat();
  this.models = Object.fromEntries(
    functions.filter(
      ([name]) => name.endsWith("Model") || name.endsWith("Frame")
    )
  );

  return this.models;
}
```

**새 코드** (HMR accept 추가):
```typescript
async autoloadModels(): Promise<{ [modelName: string]: unknown }> {
  const pathPattern = path.join(
    Sonamu.apiRootPath,
    "dist/application/**/*.{model,frame}.js"
  );

  const filePaths = await filterAsync(
    await globAsync(pathPattern),
    async (path) => {
      const srcPath = path.replace("/dist/", "/src/").replace(".js", ".ts");
      return await exists(srcPath);
    }
  );

  const modules = await importMultiple(filePaths);
  const functions = modules
    .map(({ imported }) => Object.entries(imported))
    .flat();
  this.models = Object.fromEntries(
    functions.filter(
      ([name]) => name.endsWith("Model") || name.endsWith("Frame")
    )
  );

  // HMR: model 파일들에 대한 accept 등록
  if (import.meta.hot) {
    for (const filePath of filePaths) {
      import.meta.hot.accept(filePath, async (newModule) => {
        if (newModule) {
          // 변경된 모듈의 Model/Frame만 추출하여 업데이트
          const newModels = Object.fromEntries(
            Object.entries(newModule).filter(
              ([name]) => name.endsWith("Model") || name.endsWith("Frame")
            )
          );
          this.models = { ...this.models, ...newModels };
          console.log(chalk.green(`[HMR] Models reloaded: ${path.basename(filePath)}`));
        }
      });
    }
  }

  return this.models;
}
```

### Step 6.3: syncer.autoloadApis()에 HMR accept() 추가

**파일**: `modules/sonamu/src/syncer/syncer.ts`

**현재 코드** (Lines 926-939):
```typescript
async autoloadApis() {
  const pathPattern = path.join(
    Sonamu.apiRootPath,
    "/src/application/**/*.{model,frame}.ts"
  );

  const filePaths = await globAsync(pathPattern);
  const result = await Promise.all(
    filePaths.map((filePath) => this.readApisFromFile(filePath))
  );
  this.apis = result.flat();
  return this.apis;
}
```

**새 코드** (HMR accept 추가):
```typescript
async autoloadApis() {
  const pathPattern = path.join(
    Sonamu.apiRootPath,
    "/src/application/**/*.{model,frame}.ts"
  );

  const filePaths = await globAsync(pathPattern);
  const result = await Promise.all(
    filePaths.map((filePath) => this.readApisFromFile(filePath))
  );
  this.apis = result.flat();

  // HMR: API 파일들에 대한 accept 등록
  if (import.meta.hot) {
    for (const filePath of filePaths) {
      // src/*.ts 파일이므로 로더가 처리
      import.meta.hot.accept(filePath, async () => {
        // API 데코레이터 재파싱
        const newApis = await this.readApisFromFile(filePath);

        // 기존 API 중 이 파일에서 온 것들 제거
        this.apis = this.apis.filter(api => api.filePath !== filePath);

        // 새 API 추가
        this.apis.push(...newApis);

        console.log(chalk.green(`[HMR] APIs reloaded: ${path.basename(filePath)}`));
      });
    }
  }

  return this.apis;
}
```

### Step 6.4: 간단한 HMR 테스트

**개발 서버 시작:**
```bash
cd examples/miomock/api
yarn dev
```

**테스트 시나리오:**

1. **Entity 파일 변경 테스트**
   ```bash
   # user.entity.json 파일 수정 (필드 하나 추가)
   # → sonamu.generated.ts 재생성
   # → autoloadTypes()의 accept() 콜백 실행
   # → 콘솔에 "[HMR] Types reloaded: sonamu.generated.ts" 출력
   ```

2. **Model 파일 변경 테스트**
   ```bash
   # user.model.ts 파일 수정 (함수 하나 수정)
   # → autoloadModels()의 accept() 콜백 실행
   # → 콘솔에 "[HMR] Models reloaded: user.model.js" 출력
   ```

3. **API 데코레이터 변경 테스트**
   ```bash
   # user.model.ts의 @api 데코레이터 수정
   # → autoloadApis()의 accept() 콜백 실행
   # → 콘솔에 "[HMR] APIs reloaded: user.model.ts" 출력
   ```

**예상 로그:**
```
Detected(change): api/src/application/user/user.entity.json
[HMR] Types reloaded: sonamu.generated.ts
HMR Done! 145ms
```

---

## Phase 7: 파일 워처 간소화

> **목표**: sonamu.ts의 handleFileChange()를 간소화 (코드 생성만)

### Step 7.1: handleFileChange() 리팩토링

**파일**: `modules/sonamu/src/api/sonamu.ts`

**현재 코드 (Lines 596-632):**
```typescript
private async handleFileChange(
  event: string,
  filePath: string
): Promise<void> {
  if (this.pendingFiles.length === 0) {
    this.hmrStartTime = Date.now();
  }

  this.pendingFiles.push(filePath);

  const relativePath = filePath.replace(this.apiRootPath, "api");
  console.log(chalk.bold(`Detected(${event}): ${chalk.blue(relativePath)}`));

  // syncer에 위임 (트랜스파일 + 캐시 클리어 + 코드 생성)
  await this.syncer.syncFromWatcher([filePath]);

  this.pendingFiles = this.pendingFiles.slice(1);

  if (this.pendingFiles.length === 0) {
    await this.finishHMR();
  }
}
```

**새 코드:**
```typescript
private async handleFileChange(
  event: string,
  filePath: string
): Promise<void> {
  if (this.pendingFiles.length === 0) {
    this.hmrStartTime = Date.now();
  }

  this.pendingFiles.push(filePath);

  const relativePath = filePath.replace(this.apiRootPath, "api");
  console.log(chalk.bold(`[HMR] Detected(${event}): ${chalk.blue(relativePath)}`));

  // Syncer에 위임 (코드 생성만 - dynohot이 나머지 처리)
  await this.syncer.syncFromWatcher([filePath]);

  this.pendingFiles = this.pendingFiles.slice(1);

  if (this.pendingFiles.length === 0) {
    await this.finishHMR();
  }
}
```

**주요 변경점:**
- ✅ 로그 메시지에 `[HMR]` 추가 (디버깅 용이)
- ✅ `syncer.syncFromWatcher()` 호출은 유지 (이미 Phase 3에서 간소화됨)

### Step 7.2: finishHMR() 메시지 개선

**파일**: `modules/sonamu/src/api/sonamu.ts`

**현재 코드:**
```typescript
private async finishHMR(): Promise<void> {
  const elapsed = Date.now() - this.hmrStartTime;
  console.log(chalk.green.bold(`HMR Done! (${elapsed}ms)`));

  this.hmrStartTime = 0;
}
```

**새 코드:**
```typescript
private async finishHMR(): Promise<void> {
  const elapsed = Date.now() - this.hmrStartTime;

  console.log(
    chalk.green.bold(`✨ [HMR] Update complete`) +
    chalk.gray(` (${elapsed}ms)`)
  );

  this.hmrStartTime = 0;
}
```

### Step 7.3: startWatcher() 로그 개선

**파일**: `modules/sonamu/src/api/sonamu.ts`

**현재 코드:**
```typescript
startWatcher(): void {
  console.log(chalk.yellow("👀 Watching for changes..."));

  this.watcher = chokidar.watch(apiRootPath + "/src", {
    ignored: (path, stats) =>
      (!!stats?.isFile() && !path.endsWith(".ts") && !path.endsWith(".json")) ||
      path.endsWith("src/index.ts"),
  });

  this.watcher.on("all", async (event: string, filePath: string) => {
    if (event !== "change" && event !== "add") return;
    await this.handleFileChange(event, filePath);
  });
}
```

**새 코드:**
```typescript
startWatcher(): void {
  console.log(chalk.yellow.bold("👀 [HMR] Watching src/ for changes..."));
  console.log(chalk.gray("   Using dynohot for automatic module reloading\n"));

  this.watcher = chokidar.watch(apiRootPath + "/src", {
    ignored: (path, stats) =>
      (!!stats?.isFile() && !path.endsWith(".ts") && !path.endsWith(".json")) ||
      path.endsWith("src/index.ts"),
  });

  this.watcher.on("all", async (event: string, filePath: string) => {
    if (event !== "change" && event !== "add") return;
    await this.handleFileChange(event, filePath);
  });
}
```

---

## Phase 8: 개발 명령어 업데이트

> **목표**: `yarn dev:serve` 등 개발 명령어를 dynohot 방식으로 변경

### Step 8.1: 예제 프로젝트 package.json 수정

**파일**: `examples/miomock/api/package.json`

**현재 코드:**
```json
{
  "scripts": {
    "dev:serve": "nodemon",
    "build": "swc src -d dist --strip-leading-paths && tsc --emitDeclarationOnly"
  }
}
```

**새 코드:**
```json
{
  "scripts": {
    "dev:serve": "node --import @sonamu-kit/loader --import dynohot --enable-source-maps src/index.ts",
    "dev:serve:old": "nodemon",
    "build": "swc src -d dist --config-file ../../../modules/sonamu/.swcrc --strip-leading-paths && tsc --emitDeclarationOnly"
  }
}
```

**주요 변경점:**
- ✅ `dev:serve`가 직접 Node.js 실행 (nodemon 대신)
- ✅ `--import @sonamu-kit/loader` - 커스텀 로더
- ✅ `--import dynohot` - HMR 런타임
- ✅ `--enable-source-maps` - 소스맵 지원
- ✅ `src/index.ts` 직접 실행 (dist/ 불필요)
- ✅ 기존 방식은 `dev:serve:old`로 보존

### Step 8.2: nodemon.json 백업

**파일**: `examples/miomock/api/nodemon.json`

파일명 변경:
```bash
mv examples/miomock/api/nodemon.json examples/miomock/api/nodemon.json.backup
```

**이유**: dynohot이 HMR을 처리하므로 nodemon 불필요

### Step 8.3: CLI 개발 서버 명령어 추가

**파일**: `modules/sonamu/src/bin/cli.ts`

**새 명령어 추가:**
```typescript
import { spawn } from 'child_process';
import path from 'path';

/**
 * Dev 서버 시작 (dynohot HMR)
 */
async function devServe() {
  const apiRoot = Sonamu.apiRootPath || process.cwd();
  const entryPoint = path.join(apiRoot, 'src/index.ts');

  console.log(chalk.yellow.bold('🚀 Starting Sonamu dev server with HMR...\n'));

  const serverProcess = spawn(
    'node',
    [
      '--import', '@sonamu-kit/loader',
      '--import', 'dynohot',
      '--enable-source-maps',
      entryPoint,
    ],
    {
      cwd: apiRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
    }
  );

  // 종료 처리
  const cleanup = () => {
    console.log(chalk.yellow('\n\n👋 Shutting down...'));
    serverProcess.kill('SIGTERM');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  serverProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(chalk.red(`❌ Server exited with code ${code}`));
      process.exit(code || 1);
    }
  });
}

// CLI 라우팅에 추가
if (args[0] === 'dev' && args[1] === 'serve') {
  await devServe();
} else if (args[0] === 'dev:serve') {
  await devServe();
}
```

### Step 8.4: 환경 변수 설정

**파일**: `examples/miomock/api/.env`

```env
NODE_ENV=development

# Dynohot 디버그 (선택)
# DEBUG=dynohot:*

# Source map 지원
NODE_OPTIONS=--enable-source-maps
```

### Step 8.5: 개발 서버 시작 테스트

```bash
cd examples/miomock/api

# 새 방식으로 실행
yarn dev:serve

# 로그 확인:
# 👀 [HMR] Watching src/ for changes...
#    Using dynohot for automatic module reloading
#
# 🚀 Server listening on http://localhost:3000

# 다른 터미널에서 파일 변경
echo "// test" >> src/application/user/user.model.ts

# 로그 확인:
# [HMR] Detected(change): api/src/application/user/user.model.ts
# ✨ [HMR] Update complete (125ms)
```

### Step 8.6: 프로덕션 빌드 확인

```bash
cd examples/miomock/api

# 빌드
yarn build

# dist/ 폴더 확인
ls -la dist/

# 프로덕션 실행
node dist/index.js

# 정상 동작 확인
curl http://localhost:3000/api/health
```

---

## Phase 9: 테스트 및 검증

> **목표**: 모든 HMR 시나리오 테스트 및 이슈 해결

### Step 9.1: Entity 변경 테스트

**시나리오 1: 기존 엔티티에 필드 추가**

```bash
# 서버 실행
cd examples/miomock/api
yarn dev:serve
```

**다른 터미널:**
```bash
cd examples/miomock/api/src/application/user

# user.entity.json 수정
# "nickname" 필드 추가
code user.entity.json
```

**예상 로그:**
```
[HMR] Detected(change): api/src/application/user/user.entity.json
[Syncer] Generating schemas...
[Syncer] Writing sonamu.generated.ts
✨ [HMR] Update complete (234ms)
```

**검증:**
```bash
# API 호출
curl http://localhost:3000/api/users/1

# 응답에 nickname 필드 포함 확인
```

**시나리오 2: 새 엔티티 생성**

```bash
# sonamu CLI 사용
yarn sonamu entity add product

# 자동 생성 확인:
# - src/application/product/product.entity.json
# - src/application/product/product.types.ts
# - src/application/product/product.model.ts
```

**예상 로그:**
```
[HMR] Detected(add): api/src/application/product/product.entity.json
[HMR] Detected(add): api/src/application/product/product.types.ts
[HMR] Detected(add): api/src/application/product/product.model.ts
[Syncer] Generating schemas...
✨ [HMR] Update complete (456ms)
```

### Step 9.2: Types 변경 테스트

**시나리오: user.types.ts에 새 타입 추가**

```typescript
// src/application/user/user.types.ts

export const UserSaveParams = UserBaseSchema.partial({
  id: true,
}).extend({
  nickname: z.string().optional(), // 새로 추가
});

// HMR 코드 (이미 추가됨)
if (import.meta.hot) {
  import.meta.hot.accept();
}
```

**예상 로그:**
```
[HMR] Detected(change): api/src/application/user/user.types.ts
[HMR] user.types.ts updated
✨ [HMR] Update complete (89ms)
```

**검증:**
```bash
# 타입 에러 없이 컴파일 확인
# 웹 프로젝트로 sync 확인
ls -la ../web/src/services/user.types.ts
```

### Step 9.3: Model 변경 테스트

**시나리오: user.model.ts 메서드 수정**

```typescript
// src/application/user/user.model.ts

class UserModelClass extends BaseModel<User> {
  @api({ httpMethod: "GET", clients: ["axios", "swr"] })
  async list(listParams: UserListParams): Promise<ListResult<User>> {
    console.log('[DEBUG] UserModel.list called'); // 추가

    const rows = await this.runSubsetQuery({
      subsetKey: "A",
      params: listParams,
    });

    return { rows, total: rows.length };
  }
}

// HMR 코드
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log('[HMR] user.model.ts updated');
  });
}
```

**예상 로그:**
```
[HMR] Detected(change): api/src/application/user/user.model.ts
[HMR] user.model.ts updated
[Syncer] Parsing APIs...
✨ [HMR] Update complete (112ms)
```

**검증:**
```bash
# API 호출
curl http://localhost:3000/api/users/list

# 서버 콘솔에 [DEBUG] 로그 출력 확인
```

### Step 9.4: Generated 파일 체인 테스트

**시나리오: sonamu.generated.ts 변경 → 의존 모듈 리로드**

```bash
# 1. user.entity.json 수정
# → sonamu.generated.ts 재생성
# → user.types.ts 리로드 (sonamu.generated 임포트)
# → user.model.ts 리로드 (user.types 임포트)

# 로그 확인:
# [HMR] Detected(change): api/src/application/user/user.entity.json
# [Syncer] Generating schemas...
# [HMR] sonamu.generated.ts updated
# [HMR] user.types.ts updated
# [HMR] user.model.ts updated
# ✨ [HMR] Update complete (287ms)
```

### Step 9.5: 동시 다중 파일 변경 테스트

**시나리오: 여러 파일 동시 저장 (VSCode 전체 저장)**

```bash
# VSCode에서 Cmd+K S (모두 저장)

# 예상 로그:
# [HMR] Detected(change): api/src/application/user/user.entity.json
# [HMR] Detected(change): api/src/application/user/user.types.ts
# [HMR] Detected(change): api/src/application/user/user.model.ts
# [Syncer] Generating schemas...
# [HMR] sonamu.generated.ts updated
# [HMR] user.types.ts updated
# [HMR] user.model.ts updated
# ✨ [HMR] Update complete (312ms)
```

**검증:**
- [ ] 순서대로 처리됨 (pendingFiles 큐)
- [ ] 중복 작업 없음
- [ ] 모든 변경 반영됨

### Step 9.6: 에러 처리 테스트

**시나리오 1: 타입 에러**

```typescript
// src/application/user/user.model.ts에 의도적 에러

async list(listParams: UserListParams): Promise<ListResult<User>> {
  return "wrong type"; // 타입 에러
}
```

**예상 동작:**
- 로더가 트랜스파일 시도
- SWC는 통과 (런타임 에러)
- API 호출 시 에러 발생
- 서버는 계속 실행 (crash 없음)

**시나리오 2: 문법 에러**

```typescript
// 의도적 문법 에러
async list(listParams: UserListParams): Promise<ListResult<User>> {
  return {{{; // 문법 에러
}
```

**예상 동작:**
```
[HMR] Detected(change): api/src/application/user/user.model.ts
❌ Error: Failed to compile user.model.ts
  Unexpected token {{{
[HMR] Skipping update due to compilation error
```

**검증:**
- [ ] 서버는 계속 실행
- [ ] 이전 버전의 모듈 유지
- [ ] 에러 메시지 명확

### Step 9.7: 성능 테스트

**HMR 속도 측정:**

```bash
# 스크립트 작성: scripts/benchmark-hmr.ts

import { writeFile } from 'fs/promises';
import { performance } from 'perf_hooks';

async function benchmarkHMR() {
  const results: number[] = [];

  for (let i = 0; i < 10; i++) {
    const start = performance.now();

    // 파일 변경
    await writeFile(
      'examples/miomock/api/src/application/user/user.model.ts',
      `// Benchmark ${i}\n` + originalContent
    );

    // HMR 완료 대기 (로그 파싱 또는 API 폴링)
    await waitForHMR();

    const elapsed = performance.now() - start;
    results.push(elapsed);
  }

  console.log('HMR Times:', results);
  console.log('Average:', results.reduce((a, b) => a + b) / results.length);
  console.log('Min:', Math.min(...results));
  console.log('Max:', Math.max(...results));
}
```

**목표:**
- **Entity 변경**: < 500ms
- **Types 변경**: < 100ms
- **Model 변경**: < 200ms

### Step 9.8: 메모리 사용량 테스트

```bash
# Node.js 메모리 프로파일링
node --import @sonamu-kit/loader \
     --import dynohot \
     --enable-source-maps \
     --expose-gc \
     --max-old-space-size=512 \
     src/index.ts

# 다른 터미널에서 반복 HMR
for i in {1..100}; do
  echo "// Iteration $i" >> src/application/user/user.model.ts
  sleep 1
done

# 메모리 증가 모니터링
ps aux | grep node
```

**예상:**
- 메모리 증가 < 50MB (100회 HMR 후)
- GC가 정상 동작

### Step 9.9: 회귀 테스트

```bash
# 기존 테스트 스위트 실행
cd examples/miomock/api
yarn test

# 모든 테스트 통과 확인
```

---

## Phase 10: 정리 및 문서화

> **목표**: 불필요한 코드 제거, 문서 업데이트

### Step 10.1: 불필요한 코드 제거

**파일 삭제:**
```bash
# nodemon 설정 (백업본도 삭제)
rm examples/miomock/api/nodemon.json.backup

# 미사용 빌드 파일
rm modules/ui/rollup.config.mjs.backup  # 있다면
```

**코드 정리:**

**`modules/sonamu/src/syncer/syncer.ts`:**
- `clearModuleAndDependents()` 함수 완전 삭제
- CJS 관련 주석 제거

**`modules/sonamu/src/utils/utils.ts`:**
- `importMultiple()`의 CJS 폴백 코드 제거
- ESM 전용으로 간소화

**`modules/sonamu/src/entity/entity-manager.ts`:**
- `require.cache` 관련 코드 제거

### Step 10.2: README 업데이트

**파일**: `README.md`

**추가 섹션:**
```markdown
## Development

### Hot Module Replacement (HMR)

Sonamu uses **dynohot** for automatic module reloading during development:

\`\`\`bash
# Start dev server with HMR
yarn dev:serve

# Or using Sonamu CLI
yarn sonamu dev serve
\`\`\`

**What gets hot-reloaded:**
- ✅ Entity changes → Schema regeneration
- ✅ Type changes → Sync to frontend
- ✅ Model changes → API updates
- ✅ Generated files → Dependent modules reload

**No server restart needed!**

### Architecture

\`\`\`
*.entity.json → sonamu.generated.ts → *.types.ts → *.model.ts → APIs
     ↓                                      ↓            ↓
  [Codegen]                            [HMR Accept] [HMR Accept]
\`\`\`

### Build System

- **Dev**: TypeScript executed directly via custom ESM loader
- **Prod**: Transpiled to ES modules via SWC
- **Type-check**: TypeScript compiler (declarations only)

\`\`\`bash
# Build for production
yarn build

# Type-check only
yarn tsc --noEmit
\`\`\`
```

### Step 10.3: 마이그레이션 가이드 작성

**파일**: `MIGRATION_GUIDE.md`

```markdown
# Migration Guide: CJS → ESM + dynohot HMR

## For Existing Sonamu Projects

If you have an existing Sonamu project using the old HMR system:

### 1. Update Dependencies

\`\`\`json
{
  "devDependencies": {
    "@sonamu-kit/loader": "workspace:^",
    "dynohot": "^2.1.1"
  },
  "dependenciesMeta": {
    "dynohot@2.1.1": {
      "unplugged": true
    }
  }
}
\`\`\`

### 2. Update Dev Script

**Before:**
\`\`\`json
{
  "scripts": {
    "dev:serve": "nodemon"
  }
}
\`\`\`

**After:**
\`\`\`json
{
  "scripts": {
    "dev:serve": "node --import @sonamu-kit/loader --import dynohot --enable-source-maps src/index.ts"
  }
}
\`\`\`

### 3. Add HMR Acceptance to Existing Files

Run the migration script:

\`\`\`bash
npx tsx scripts/add-hmr-to-existing-files.ts path/to/your/api
\`\`\`

Or manually add to each model/types file:

\`\`\`typescript
// At the end of each file
if (import.meta.hot) {
  import.meta.hot.accept();
}
\`\`\`

### 4. Remove nodemon.json

\`\`\`bash
rm nodemon.json
\`\`\`

### 5. Test

\`\`\`bash
yarn dev:serve

# Make a change to any file
# Should see: [HMR] Update complete (Xms)
\`\`\`

## Breaking Changes

### No More require.cache

If you have custom code that uses `require.cache`:

**Before:**
\`\`\`typescript
delete require.cache[require.resolve('./some-module')];
const mod = require('./some-module');
\`\`\`

**After:**
\`\`\`typescript
import { createImportUrl } from 'sonamu/utils/esm-utils';

const url = createImportUrl('./some-module.js', { cacheBust: true });
const mod = await import(url);
\`\`\`

### No More __dirname

**Before:**
\`\`\`typescript
const filePath = path.join(__dirname, 'file.txt');
\`\`\`

**After:**
\`\`\`typescript
import { getDirname } from 'sonamu/utils/esm-utils';

const __dirname = getDirname(import.meta.url);
const filePath = path.join(__dirname, 'file.txt');
\`\`\`
```

### Step 10.4: CHANGELOG 작성

**파일**: `CHANGELOG.md`

```markdown
# Changelog

## [2.0.0] - 2025-01-15

### 🚀 Major Changes

#### Hot Module Replacement (HMR) Rewrite
- **BREAKING**: Migrated from CommonJS to ES Modules
- **NEW**: Integrated dynohot for Vite-style HMR
- **NEW**: Custom ESM loader for on-the-fly TypeScript execution
- **REMOVED**: Manual transpilation during HMR
- **REMOVED**: require.cache manipulation

**Migration Required**: See MIGRATION_GUIDE.md

#### Build System Unification
- **CHANGED**: All backend packages now use SWC + TSC
- **REMOVED**: tsup, rollup configs
- **NEW**: Shared tsconfig.base.json
- **IMPROVED**: Consistent ES module output

### ✨ Features

- Direct TypeScript execution in dev mode (no dist/ needed)
- Faster HMR (< 200ms average)
- Better error messages
- Source maps support out of the box

### 🐛 Bug Fixes

- Fixed circular dependency issues with generated files
- Fixed race conditions in multi-file changes
- Fixed memory leaks in long-running dev servers

### 📚 Documentation

- Added comprehensive migration guide
- Updated README with new architecture
- Added troubleshooting section

### 🔧 Internal

- Refactored Syncer to focus on code generation
- Simplified file watcher logic
- Added ESM utility functions
- Removed 2000+ lines of CJS-specific code
```

### Step 10.5: 트러블슈팅 가이드 작성

**파일**: `TROUBLESHOOTING.md`

```markdown
# Troubleshooting

## HMR Issues

### HMR Not Working

**Symptoms:**
- File changes not detected
- No "[HMR] Update complete" message

**Solutions:**
1. Check if dynohot is loaded:
   \`\`\`bash
   # Should see both loaders
   node --import @sonamu-kit/loader --import dynohot src/index.ts
   \`\`\`

2. Verify HMR acceptance:
   \`\`\`typescript
   // At end of file
   if (import.meta.hot) {
     import.meta.hot.accept();
   }
   \`\`\`

3. Check file watcher:
   \`\`\`bash
   # Should not be ignored
   ls -la src/application/**/*.ts
   \`\`\`

### "Cannot find module" Errors

**Symptoms:**
\`\`\`
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/path/to/file.ts'
\`\`\`

**Solutions:**
1. Check if loader is registered:
   \`\`\`bash
   node --import @sonamu-kit/loader src/index.ts
   \`\`\`

2. Verify import paths use .js extension:
   \`\`\`typescript
   // ✅ Correct
   import { User } from './user.model.js';

   // ❌ Wrong (even though file is .ts)
   import { User } from './user.model.ts';
   \`\`\`

3. Check tsconfig moduleResolution:
   \`\`\`json
   {
     "compilerOptions": {
       "module": "ESNext",
       "moduleResolution": "bundler"
     }
   }
   \`\`\`

### Slow HMR

**Symptoms:**
- HMR takes > 1 second
- CPU usage high

**Solutions:**
1. Check number of files:
   \`\`\`bash
   find src -name "*.ts" | wc -l
   # Should be < 500 for good performance
   \`\`\`

2. Disable source maps temporarily:
   \`\`\`bash
   node --import @sonamu-kit/loader --import dynohot src/index.ts
   # Remove --enable-source-maps
   \`\`\`

3. Check for circular dependencies:
   \`\`\`bash
   npx madge --circular src/
   \`\`\`

### Memory Leaks

**Symptoms:**
- Memory usage grows over time
- Server becomes slow after many HMR cycles

**Solutions:**
1. Check for global state:
   \`\`\`typescript
   // ❌ Bad: Global mutable state
   let cache = {};

   // ✅ Good: Local state
   class MyModel {
     private cache = {};
   }
   \`\`\`

2. Clear timers/intervals:
   \`\`\`typescript
   if (import.meta.hot) {
     import.meta.hot.accept(() => {
       clearInterval(myInterval); // Clean up
     });
   }
   \`\`\`

3. Restart server periodically:
   \`\`\`bash
   # After 100+ HMR cycles, restart for fresh state
   \`\`\`

## Build Issues

### "SWC failed to compile"

**Solutions:**
1. Check .swcrc syntax:
   \`\`\`bash
   cat .swcrc | jq .  # Validate JSON
   \`\`\`

2. Verify SWC version:
   \`\`\`bash
   yarn why @swc/core
   # Should be >= 1.3.0
   \`\`\`

### Type Errors After Migration

**Solutions:**
1. Clear build cache:
   \`\`\`bash
   rm -rf dist/ node_modules/.cache
   yarn build
   \`\`\`

2. Regenerate declarations:
   \`\`\`bash
   yarn tsc --emitDeclarationOnly
   \`\`\`

3. Check for .js imports:
   \`\`\`typescript
   // Use .js even for .ts files
   import { User } from './user.model.js';
   \`\`\`
```

### Step 10.6: 최종 Git 커밋

```bash
cd ~/Projects/sonamu

# 스테이징
git add .

# 커밋
git commit -m "feat: migrate to ESM + dynohot HMR

BREAKING CHANGE: HMR system rewritten

- Replace CommonJS require.cache with dynohot
- Add custom ESM loader for TypeScript
- Simplify Syncer to focus on code generation
- Unify build system (SWC + TSC)
- Remove tsup, rollup, nodemon dependencies

Migration required for existing projects. See MIGRATION_GUIDE.md.

Closes #xxx"

# 푸시
git push origin feat/esm-dynohot-hmr
```

### Step 10.7: PR 생성

```markdown
# [BREAKING] Migrate to ESM + dynohot HMR

## Summary

Complete rewrite of the HMR system to use ES Modules and dynohot instead of CommonJS require.cache manipulation.

## Motivation

- ESM is the future of Node.js
- require.cache is CJS-only and fragile
- dynohot provides Vite-style HMR with better DX
- Simplifies codebase (removed 2000+ lines)

## Changes

### User-Facing
- ✅ Faster HMR (< 200ms average)
- ✅ Better error messages
- ✅ No dist/ folder needed in dev
- ✅ Direct TypeScript execution
- ⚠️ **BREAKING**: New dev:serve command
- ⚠️ **BREAKING**: Migration required

### Internal
- Refactored Syncer (code generation only)
- Added ESM utilities
- Simplified file watcher
- Unified build system
- Removed CJS-specific code

## Testing

- [x] Entity changes → Schema regen
- [x] Types changes → Frontend sync
- [x] Model changes → API updates
- [x] Multi-file changes
- [x] Error handling
- [x] Performance (< 200ms)
- [x] Memory usage (< 50MB increase)
- [x] All existing tests pass

## Migration Guide

See MIGRATION_GUIDE.md

**TL;DR:**
1. Update dependencies (dynohot)
2. Change `dev:serve` script
3. Add HMR acceptance to files
4. Remove nodemon.json

## Checklist

- [x] Tests added/updated
- [x] Documentation updated
- [x] Migration guide written
- [x] Changelog updated
- [x] Backward compatibility considered
- [x] Breaking changes documented

## Related Issues

Closes #xxx (if any)
```

---

## 부록 A: 파일별 변경 체크리스트

### 빌드 설정

- [x] `/tsconfig.base.json` - 생성
- [x] `modules/sonamu/tsconfig.json` - extends base
- [x] `modules/tasks/tsconfig.json` - extends base
- [x] `modules/sonamu/.swcrc` - 확인 (ESM, esnext)
- [x] `modules/tasks/.swcrc` - 삭제
- [x] `modules/ui/rollup.config.mjs` - 삭제
- [x] `modules/ui/tsup.config.js` - 삭제
- [x] `modules/ui/package.json` - build:node 스크립트 변경
- [x] `modules/react-sui/package.json` - build 스크립트 수정

### 핵심 코드

- [x] `modules/sonamu/src/utils/esm-utils.ts` - 생성
- [x] `modules/sonamu/src/utils/path-utils.ts` - 생성
- [x] `modules/sonamu/src/utils/utils.ts` - importMultiple() 리팩토링
- [x] `modules/sonamu/src/syncer/syncer.ts` - syncFromWatcher() 간소화
- [x] `modules/sonamu/src/syncer/syncer.ts` - clearModuleAndDependents() 삭제
- [x] `modules/sonamu/src/syncer/syncer.ts` - autoloadModels() 경로 수정
- [x] `modules/sonamu/src/syncer/syncer.ts` - autoloadTypes() 경로 수정
- [x] `modules/sonamu/src/syncer/syncer.ts` - getZodTypeById() 수정
- [x] `modules/sonamu/src/entity/entity.ts` - importTypes() 수정
- [x] `modules/sonamu/src/entity/entity-manager.ts` - reload() 간소화
- [x] `modules/sonamu/src/api/sonamu.ts` - handleFileChange() 로그 개선
- [x] `modules/sonamu/src/api/sonamu.ts` - finishHMR() 메시지 개선
- [x] `modules/sonamu/src/bin/build-config.ts` - 하드코딩 제거
- [x] `modules/sonamu/src/bin/cli.ts` - devServe() 추가

### 템플릿

- [x] `modules/sonamu/src/templates/generated.template.ts` - HMR 추가
- [x] `modules/sonamu/src/templates/generated_sso.template.ts` - HMR 추가
- [x] `modules/sonamu/src/templates/model.template.ts` - HMR 추가
- [x] `modules/sonamu/src/templates/init_types.template.ts` - HMR 추가

### 예제 프로젝트

- [x] `examples/miomock/api/package.json` - dev:serve 변경
- [x] `examples/miomock/api/nodemon.json` - 삭제 or 백업
- [x] `examples/miomock/api/src/**/*.model.ts` - HMR 추가
- [x] `examples/miomock/api/src/**/*.types.ts` - HMR 추가
- [x] `examples/miomock/api/src/**/*.frame.ts` - HMR 추가

### 문서

- [x] `README.md` - HMR 섹션 추가
- [x] `MIGRATION_PLAN.md` - 이 문서
- [x] `MIGRATION_GUIDE.md` - 생성
- [x] `TROUBLESHOOTING.md` - 생성
- [x] `CHANGELOG.md` - 업데이트

### 스크립트

- [x] `scripts/add-hmr-to-existing-files.ts` - 생성
- [x] `scripts/benchmark-hmr.ts` - 선택사항

---

## 부록 B: 트러블슈팅 가이드

### 자주 발생하는 문제

#### 1. "Cannot find module" 에러

**원인**: Import 경로에 .ts 확장자 사용

**해결:**
```typescript
// ❌ 틀림
import { User } from './user.model.ts';

// ✅ 맞음 (파일은 .ts지만 import는 .js)
import { User } from './user.model.js';
```

#### 2. HMR이 작동하지 않음

**원인**: import.meta.hot.accept() 누락

**해결:**
```typescript
// 모든 hot-reloadable 파일 끝에 추가
if (import.meta.hot) {
  import.meta.hot.accept();
}
```

#### 3. "dynohot is not defined"

**원인**: --import dynohot 플래그 누락

**해결:**
```bash
# 올바른 명령어
node --import @sonamu-kit/loader --import dynohot src/index.ts
```

#### 4. 느린 HMR

**원인**: 너무 많은 파일 또는 순환 참조

**해결:**
```bash
# 순환 참조 체크
npx madge --circular src/

# 파일 개수 확인
find src -name "*.ts" | wc -l
```

#### 5. 메모리 누수

**원인**: 전역 상태 또는 타이머 정리 안 됨

**해결:**
```typescript
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    // 정리 작업
    clearInterval(myInterval);
    myGlobalCache = {};
  });
}
```

### 디버깅 팁

#### 1. Dynohot 디버그 로그

```bash
DEBUG=dynohot:* yarn dev:serve
```

#### 2. 로더 디버그

```bash
NODE_OPTIONS='--import @sonamu-kit/loader --import dynohot --trace-warnings' yarn dev:serve
```

#### 3. HMR 타임라인

```typescript
// sonamu.ts에 추가
private logHMRTimeline(event: string) {
  const elapsed = Date.now() - this.hmrStartTime;
  console.log(chalk.gray(`  [${elapsed}ms] ${event}`));
}
```

#### 4. 모듈 캐시 상태 확인

```typescript
// ESM에서는 직접 접근 불가
// dynohot 내부 상태는 DEBUG 로그로 확인
```

### 성능 최적화

#### 1. Source Map 비활성화 (프로덕션)

```json
// .swcrc
{
  "sourceMaps": false
}
```

#### 2. 파일 워처 최적화

```typescript
// sonamu.ts
this.watcher = chokidar.watch(apiRootPath + "/src", {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,  // 파일 쓰기 완료 대기
    pollInterval: 50,
  },
});
```

#### 3. 코드 생성 최적화

```typescript
// 불필요한 재생성 방지
if (checksum === prevChecksum) {
  console.log('Skipping codegen (no changes)');
  return;
}
```

---

## 요약

### Before (CJS HMR)

```
파일 변경
  → chokidar 감지
    → SWC 트랜스파일 (TS → CJS)
      → require.cache 클리어 (재귀적)
        → 코드 생성
          → 모듈 재로드
```

**문제:**
- ESM 불가 (require.cache 없음)
- 느림 (수동 트랜스파일)
- 복잡 (의존성 추적)
- 불안정 (캐시 클리어 실패)

### After (ESM + dynohot HMR)

```
파일 변경
  → chokidar 감지
    → 코드 생성
      → 파일 쓰기
        → dynohot 감지
          → import.meta.hot.accept() 트리거
            → 자동 리로드
```

**개선:**
- ✅ ESM 네이티브
- ✅ 빠름 (온디맨드 트랜스파일)
- ✅ 간단 (dynohot이 처리)
- ✅ 안정적 (검증된 라이브러리)

### 핵심 통찰

1. **Syncer의 역할 명확화**: 코드 생성만 담당
2. **관심사의 분리**: 트랜스파일(로더) ↔ 코드 생성(Syncer) ↔ HMR(dynohot)
3. **빌드 시스템 통일**: SWC + TSC로 일관성
4. **개발자 경험 향상**: 빠른 HMR, 명확한 로그, 좋은 에러 메시지

**결과**: 유지보수 가능하고, 확장 가능하며, 성능 좋은 개발 환경 🚀
