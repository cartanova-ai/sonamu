# Hot Hook

See the documentation [here](https://github.com/Julien-R44/hot-hook/blob/main/README.md)

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
