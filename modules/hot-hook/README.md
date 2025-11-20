# @sonamu-kit/hot-hook

이 패키지는 [hot-hook](https://github.com/Julien-R44/hot-hook)을 기반으로 하여 Sonamu 프레임워크에서 사용할 목적으로 수정을 가한 패키지입니다.

Credit: [Julien Ripouteau](https://github.com/Julien-R44) for [hot-hook](https://github.com/Julien-R44/hot-hook). Thank you for your great work!

원본 문서는 [여기](https://github.com/Julien-R44/hot-hook/blob/main/README.md)에서 확인하실 수 있습니다.

## 원본 패키지로부터의 주요 변경사항

### 1. 변수 기반 동적 Import 허용

**위치**: [`src/dynamic_import_checker.ts:23-46`](src/dynamic_import_checker.ts#L23-L46) - `ensureFileIsImportedDynamicallyFromParent()`

변수를 사용한 동적 import(`await import(variablePath)`)도 유효한 동적 import로 인정하도록 변경했습니다. 원본은 리터럴 문자열만 허용했으나, 프레임워크 패턴에서 경로가 런타임에 결정되는 경우를 지원하기 위해 수정했습니다.

### 2. Boundary 간 정적 Import 허용

**위치**: [`src/loader.ts:390-424`](src/loader.ts#L390-L424) - `resolve` 훅

부모 파일도 boundary인 경우 자식 boundary를 정적 import하는 것을 허용합니다. 부모가 reload될 때 자식도 함께 새로 로드되므로 안전하게 HMR이 작동합니다.

### 3. @sonamu-kit/loader와의 통합

**위치**: [`src/loader.ts:345-357`](src/loader.ts#L345-L357) - `resolve` 훅

`@sonamu-kit/loader`가 제공하는 `result.importAttributes.ts`를 활용하여 실제 소스 파일(.ts) 경로를 정확히 추적합니다.

### 4. 수동 파일 변경 알림 기능

**위치**: [`src/hot.ts:160-183`](src/hot.ts#L160-L183) - `invalidateFile()` 메서드

외부 파일 워처를 사용하는 경우를 위해 파일 변경을 수동으로 알릴 수 있는 메서드를 추가했습니다.

### 5. 전체 캐시 무효화 기능

**위치**:
- [`src/hot.ts:189-210`](src/hot.ts#L189-L210) - `invalidateAll()` 메서드
- [`src/loader.ts:120-143`](src/loader.ts#L120-L143) - 메시지 핸들러

Sonamu UI 서버에서 사용자 프로젝트의 모든 모듈을 한번에 리로드할 수 있도록 전체 캐시 무효화 기능을 추가했습니다.

### 6. 의존성 트리에 없는 파일 처리

**위치**: [`src/loader.ts:439-445`](src/loader.ts#L439-L445)

외부 패키지가 프로젝트 소스를 동적으로 import할 때 의존성 트리에 없어 발생하는 오류를 방지하기 위해 버전을 0으로 처리합니다.

## 관련 커밋

- [`8562208`](https://github.com/cartanova-ai/sonamu/commit/8562208): knex같은 외부 패키지가 프로젝트 소스코드를 동적으로 임포트하려는 경우 처리
- [`e2c4e9b`](https://github.com/cartanova-ai/sonamu/commit/e2c4e9b): 모든 모듈 cache를 invalidate하는 메소드 추가

---

# hot-hook HMR 규칙 정리

## 원래 hot-hook의 규칙

### 1. Boundary 파일의 기본 규칙
- **Boundary 파일은 반드시 부모로부터 동적 import되어야 함**
- 정적 import는 재실행할 방법이 없어서 HMR 불가능

### 2. ROOT까지의 경로 규칙
- Boundary에서 ROOT까지 가는 **모든 경로**에 최소 1개 이상의 동적 import가 있어야 함
- 중간에 정적 import만 있어도 괜찮음 (동적 import 위쪽은 상관없음)

### 예시 (원래 규칙):
```
ROOT (index.ts)
  ↓ 정적 import (OK)
app.ts
  ↓ 정적 import (OK)
loader.ts
  ↓ 동적 import (필수!) ← 여기서 끊을 수 있음
BOUNDARY (service.ts)
  ↓ 정적 import (OK, boundary 아니니까)
helper.ts
```

---

## 우리가 추가한 예외 규칙

### 예외 1: 변수 기반 동적 import 허용
**파일:** `dynamic_import_checker.ts`

**원래:** 리터럴 문자열 동적 import만 인정
```typescript
await import('./service.ts')  // ✅ OK
await import(variablePath)    // ❌ 불인정
```

**수정 후:** 변수 기반도 인정
```typescript
await import(variablePath)    // ✅ OK!
```

**이유:** 프레임워크 패턴 지원 (경로가 런타임에 결정됨)

---

### 예외 2: Boundary 간 정적 import 허용
**파일:** `loader.ts`

**원래:** Boundary는 무조건 동적 import만
```
mymodel.ts [BOUNDARY]
  ↓ 정적 import
libmodel.ts [BOUNDARY]  // ❌ 에러!
```

**수정 후:** 부모도 boundary면 정적 import 허용
```
module-loader.js
  ↓ 동적 import (OK!)
mymodel.ts [BOUNDARY]
  ↓ 정적 import (OK! 부모가 boundary니까) ✅
libmodel.ts [BOUNDARY]
```

**이유:**
- mymodel.ts가 reload되면 내부의 `import libmodel from './libmodel'`도 재실행됨
- libmodel.ts가 변경되면 dependent인 mymodel.ts도 invalidate됨
- 결과: 안전하게 HMR 작동!

---

## 최종 규칙 요약

### ✅ 허용되는 패턴
1. **프레임워크 → Boundary (변수 동적 import)**
2. **Boundary → Boundary (정적 import)**
3. **Boundary → 일반 모듈 (정적 import)**
4. **ROOT → 프레임워크 (정적 import 체인)**

### ❌ 여전히 불가능한 패턴
- **일반 모듈 → Boundary (정적 import)**
  - 일반 모듈은 reload되지 않으므로 boundary도 reload 불가

---

이제 Saessak 프레임워크가 hot-hook과 완벽하게 호환됩니다! 🎉
