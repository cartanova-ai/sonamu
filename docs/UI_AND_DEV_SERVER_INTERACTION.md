# Sonamu UI와 Dev 서버 상호작용

## 개요

Sonamu UI는 개발 환경에서만 사용되는 관리 도구로, 사용자 프로젝트의 dev 서버와 긴밀하게 연동되어 실시간 동기화를 제공합니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                         사용자 프로젝트                           │
│                                                                   │
│  ┌──────────────┐    파일 변경    ┌─────────────────────┐       │
│  │  Dev 서버    │────────────────▶│  Sonamu Watcher     │       │
│  │              │                  │  (Syncer)           │       │
│  │  (프로세스 A) │                  │                     │       │
│  └──────────────┘                  │  - 파일 변경 감지     │       │
│        │                           │  - 코드 생성          │       │
│        │                           │  - 캐시 무효화        │       │
│        │                           │  - UI 알림            │       │
│        │                           └─────────────────────┘       │
│        │                                      │                  │
│        │                                      │ HTTP GET         │
│        │                           /api/reload│                  │
│        │                                      ▼                  │
│        │                           ┌─────────────────────┐       │
│        │                           │   Sonamu UI         │       │
│        │◀─────────────────────────▶│                     │       │
│        │   Entity/Model 읽기       │  - hot-hook 활성화   │       │
│                                    │  - 캐시 무효화        │       │
│                                    │  - EntityManager     │       │
│                                    │    리로드            │       │
│                                    └─────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## 시나리오

### 1️⃣ 사용자가 코드를 수정하는 경우

```
사용자 파일 수정
    ↓
Dev 서버의 Watcher 감지
    ↓
Syncer가 변경 처리
    ├─ 코드 생성
    ├─ hot-hook으로 캐시 무효화
    └─ syncUI() 호출
        ↓
        HTTP GET http://127.0.0.1:57000/api/reload
            ↓
            UI 서버 수신
                ├─ hot.invalidateAll(apiRootPath) - 모든 캐시 무효화
                └─ EntityManager.reload() - 엔티티 재로드
```

### 2️⃣ UI에서 Entity나 Model을 수정하는 경우

```
UI에서 Entity JSON 수정
    ↓
파일 저장
    ↓
(사용자 파일로 간주됨)
    ↓
시나리오 1️⃣과 동일하게 진행
    ↓
결국 UI 자체도 리로드됨
```

## 환경별 역할

### 개발 환경 (Development)

| 컴포넌트 | 상태 | 역할 |
|---------|------|------|
| **Dev 서버** | 필수 (실행 중) | - 파일 변경 감지<br>- 코드 생성 및 동기화<br>- hot-hook 캐시 무효화<br>- UI에 리로드 신호 전송 |
| **Sonamu UI** | 선택 (개발용) | - Entity/Model 관리 UI 제공<br>- Dev 서버로부터 리로드 신호 수신<br>- hot-hook으로 캐시 무효화<br>- 사용자 프로젝트 코드 로드 |

**특징:**
- ✅ Dev 서버와 UI가 **함께 작동**
- ✅ 실시간 양방향 동기화
- ✅ Hot Module Replacement (HMR) 활성화

### 프로덕션 환경 (Production)

| 컴포넌트 | 상태 | 역할 |
|---------|------|------|
| **Prod 서버** | 실행 중 | - 빌드된 코드 실행<br>- Watcher 없음<br>- HMR 없음 |
| **Sonamu UI** | ❌ 사용 불가 | - 프로덕션에서는 의미 없음<br>- Dev 서버 없어서 동기화 불가 |

**특징:**
- ❌ UI 실행해도 **아무 일도 일어나지 않음**
- ❌ Dev 서버가 없어서 파일 변경 감지 안 됨
- ❌ Watcher가 없어서 동기화 불가

## 궁합 매트릭스

| Dev 서버 | UI | 결과 |
|---------|-----|------|
| ✅ 실행 중 | ✅ 실행 중 | 🎉 **완벽** - 실시간 동기화, HMR 작동 |
| ✅ 실행 중 | ❌ 없음 | ✅ 정상 - Dev 서버만으로도 개발 가능 |
| ❌ 없음 | ✅ 실행 중 | ⚠️ **의미 없음** - UI는 보이지만 동기화 불가 |
| ❌ 없음 (Prod) | ✅ 실행 중 | ⚠️ **의미 없음** - Watcher 없어서 작동 안 함 |

## Hot-Hook 설정

### Dev 서버

```typescript
// dev 명령어 실행 시 자동으로 활성화
await hot.init({
  root: Sonamu.apiRootPath,
  boundaries: ["**/*.model.ts", "**/*.entity.json"],
  disableAutoWatch: false, // Watcher 자동 활성화
});
```

### UI 서버

UI 서버는 **별도 프로세스**로 실행되며, `--import` 플래그로 hot-hook을 초기화합니다:

```bash
node \
  --import @sonamu-kit/loader \
  --import @sonamu-kit/ui/node/hot-hook-register \
  --enable-source-maps \
  run-ui.js
```

**hot-hook-register.ts:**
```typescript
// 프로세스 시작 시 최상위 레벨에서 초기화
if (process.env.HOT === 'yes' && process.env.API_ROOT_PATH) {
  const { hot } = await import('@sonamu-kit/hot-hook');
  
  await hot.init({
    root: process.env.API_ROOT_PATH,
    boundaries: ['./src/**/*.ts'],
    disableAutoWatch: true, // Dev 서버의 Watcher가 알려줌
  });
}
```

## 핵심 API

### Syncer (Dev 서버)

```typescript
// 파일 변경 시 UI에 알림
syncUI() {
  const uiPort = Sonamu.config.ui?.port ?? 57000;
  
  fetch(`http://127.0.0.1:${uiPort}/api/reload`, {
    method: "GET",
  }).catch((e) =>
    console.log(chalk.dim(`Failed to reload Sonamu UI: ${e.message}`))
  );
}
```

### Hot-Hook

```typescript
// 특정 파일 무효화
await hot.invalidateFile(filePath, "change");

// 디렉토리 전체 무효화 (UI용)
await hot.invalidateAll(rootPath);
```

### UI 서버

```typescript
// /api/reload 엔드포인트
server.get("/api/reload", async () => {
  // 1. 모든 캐시 무효화
  await hot.invalidateAll(Sonamu.apiRootPath);
  
  // 2. EntityManager 리로드
  await EntityManager.reload();
  
  return true;
});
```

## 프로세스 구조

### Dev 서버 (사용자 프로젝트)
```
yarn sonamu dev
  ↓
node --import @sonamu-kit/loader --import @sonamu-kit/hot-hook src/index.ts
  ↓
- Watcher 활성화
- Syncer 작동
- hot-hook 초기화
```

### UI 서버 (별도 프로세스)
```
yarn sonamu ui
  ↓
spawn(node, [
  "--import", "@sonamu-kit/loader",
  "--import", "@sonamu-kit/ui/node/hot-hook-register",
  "run-ui.js"
], {
  env: {
    HOT: "yes",
    API_ROOT_PATH: "/path/to/user/project/api"
  }
})
  ↓
- hot-hook 초기화 (hot-hook-register.ts)
- UI 서버 시작
- /api/reload 엔드포인트 대기
```

**중요:** UI는 **별도 프로세스**로 실행되며, 프로세스 시작 시 `--import` 플래그로 hot-hook이 초기화됩니다.

## 요약

### ✅ UI는 개발용 전용 도구

- UI는 **Dev 서버가 실행 중일 때**만 의미가 있음
- Dev 서버 없이 UI만 실행하면 동기화 불가
- 프로덕션 환경에서는 사용하지 않음

### ✅ 실시간 양방향 동기화

- Dev 서버 → UI: `/api/reload` 엔드포인트로 리로드 신호
- UI → Dev 서버: 수정한 파일을 Dev 서버가 감지

### ✅ Hot-Hook 기반 캐시 관리

- Dev 서버: 변경된 파일과 의존성만 무효화
- UI 서버: 리로드 시 전체 캐시 무효화 (`invalidateAll`)
- **별도 프로세스**: UI는 독립 프로세스로 실행되어 hot-hook 충돌 방지

### ✅ 환경별 명확한 역할

- **개발**: Dev + UI 함께 사용, 실시간 동기화
- **프로덕션**: UI 사용 불가, Dev 서버도 없음

