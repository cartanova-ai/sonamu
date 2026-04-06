# TemplateManager 가이드

## 📋 목차

1. [Before/After 비교](#beforeafter-비교)
2. [TemplateManager 상세 설명](#templatemanager-상세-설명)
3. [사용 예제](#사용-예제)

---

## Before/After 비교

### 🔴 Before: Template 클래스의 정적 메서드 방식

#### 구조

```typescript
// 기존 방식: Template 클래스에 정적 메서드로 구현
export abstract class Template {
  private static templates: Map<TemplateKey, Template> = new Map();

  public static async autoload() { ... }
  public static find(key: TemplateKey): Template { ... }
}
```

#### 사용법

```typescript
// 템플릿 로드
await Template.autoload();

// 템플릿 조회
const template = Template.find("entity");
```

#### 문제점

1. **확장성 부족**
   - 빌트인 템플릿만 지원
   - 커스텀 템플릿을 추가할 방법이 없음
   - 프로젝트별 템플릿 커스터마이징 불가능

2. **테스트 어려움**
   - 정적 상태로 인한 테스트 격리 불가능
   - 여러 테스트가 같은 템플릿 맵을 공유
   - Mock 템플릿 주입이 어려움

3. **상태 관리 부재**
   - 로드 여부를 확인할 방법이 없음
   - 중복 로드 방지 메커니즘 없음

4. **에러 메시지 부족**
   - 템플릿을 찾을 수 없을 때 사용 가능한 템플릿 목록 미제공
   - 디버깅이 어려움

5. **단일 책임 원칙 위반**
   - Template 클래스가 템플릿 정의와 템플릿 관리 두 가지 역할을 담당
   - 관심사 분리(Separation of Concerns) 부족

---

### 🟢 After: TemplateManager 인스턴스 기반 방식

#### 구조

```typescript
// 새로운 방식: 별도의 TemplateManager 클래스로 관리
class TemplateManagerClass {
  private templates: Map<TemplateKey | string, Template> = new Map();
  isAutoloaded: boolean = false;

  async autoload(): Promise<void> { ... }
  get(key: TemplateKey | string): Template { ... }
  register(template: Template): void { ... }
  // ... 기타 메서드들
}

export const TemplateManager = new TemplateManagerClass();
```

#### 사용법

```typescript
// 템플릿 로드
await TemplateManager.autoload();

// 템플릿 조회
const template = TemplateManager.get("entity");

// 커스텀 템플릿 로드
await TemplateManager.loadFromDirectory("./custom-templates");

// 커스텀 템플릿 등록
TemplateManager.register(new MyCustomTemplate());
```

#### 개선점

1. **확장성 향상** ✅
   - 커스텀 템플릿 지원 (`loadFromDirectory`, `register`)
   - 런타임에 템플릿 추가/제거 가능
   - 프로젝트별 템플릿 커스터마이징 지원

2. **테스트 용이성** ✅
   - 인스턴스 기반으로 테스트 격리 가능
   - `createInstance()`로 독립적인 매니저 생성
   - `reset()` 메서드로 테스트 지원

3. **상태 관리** ✅
   - `isAutoloaded` 플래그로 중복 로드 방지
   - `reload()` 메서드로 템플릿 재로드 가능

4. **향상된 에러 메시지** ✅
   - 사용 가능한 템플릿 목록을 에러 메시지에 포함
   - 더 명확한 디버깅 정보 제공

5. **관심사 분리** ✅
   - Template: 템플릿 정의 및 렌더링 로직
   - TemplateManager: 템플릿 생명주기 관리
   - 단일 책임 원칙 준수

6. **추가 기능** ✅
   - 템플릿 존재 여부 확인
   - 템플릿 목록 조회
   - 하위 호환성 유지 (Template.\_getTemplatesMap())

---

## TemplateManager 상세 설명

### 🏗️ 아키텍처 개요

```
┌─────────────────────────────────────────┐
│         TemplateManagerClass            │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  templates: Map<Key, Template>   │  │  ← 현재 활성 템플릿들
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  isAutoloaded: boolean          │  │  ← 로드 상태 플래그
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
           │
           │ 관리
           ▼
┌─────────────────────────────────────────┐
│           Template (추상 클래스)         │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Template__entity                │  │
│  │  Template__model                 │  │
│  │  Template__generated             │  │
│  │  ... (빌트인 템플릿들)            │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  CustomTemplate (커스텀 템플릿)    │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 📦 주요 구성 요소

#### 1. 내부 상태 (Private State)

```typescript
class TemplateManagerClass {
  // 현재 활성화된 템플릿들을 저장
  // Key: TemplateKey (빌트인) 또는 string (커스텀)
  private templates: Map<TemplateKey | string, Template> = new Map();

  // autoload()가 이미 실행되었는지 여부
  // 중복 로드를 방지하기 위한 플래그
  isAutoloaded: boolean = false;
}
```

---

### 🔧 주요 메서드 상세 설명

#### 1. `autoload()` - 빌트인 템플릿 자동 로드

```typescript
async autoload(): Promise<void>
```

**역할:**

- `implementations/*.template.js` 파일들을 찾아서 자동으로 로드
- 각 템플릿 파일에서 클래스를 찾아 인스턴스 생성
- 템플릿을 내부 Map에 등록

**동작 과정:**

```typescript
1. isAutoloaded 체크 → 이미 로드되었으면 즉시 반환
2. globAsync로 템플릿 파일들 찾기
3. 각 파일에 대해:
   a. importMembers로 export된 클래스 가져오기
   b. Template를 상속한 클래스인지 확인
   c. new로 인스턴스 생성
   d. templates Map에 등록
4. Template._getTemplatesMap()에도 등록 (하위 호환)
5. isAutoloaded = true로 설정
```

**예제:**

```typescript
// Sonamu 초기화 시 자동 호출
await TemplateManager.autoload();

// 이미 로드되었으면 아무것도 하지 않음 (idempotent)
await TemplateManager.autoload(); // 두 번째 호출은 무시됨
```

**왜 idempotent하게 만들었나요?**

- 여러 곳에서 호출해도 안전하게 동작
- 테스트에서 여러 번 초기화해도 문제없음

---

#### 2. `loadFromDirectory()` - 커스텀 템플릿 로드

```typescript
async loadFromDirectory(dir: string): Promise<number>
```

**역할:**

- 프로젝트 디렉토리에서 커스텀 템플릿 파일들을 찾아서 로드
- 빌트인 템플릿과 동일한 방식으로 처리
- 로드된 템플릿 개수를 반환

**동작 과정:**

```typescript
1. dir 경로에서 *.template.{ts,js} 파일들 찾기
2. 각 파일에 대해:
   a. importMembers로 모든 export 가져오기
   b. 각 export가 Template 클래스인지 확인
   c. 인스턴스 생성 후 register()로 등록
3. 로드된 템플릿 개수 반환
```

**예제:**

```typescript
// 프로젝트의 커스텀 템플릿 로드
const count = await TemplateManager.loadFromDirectory("./src/templates");
console.log(`${count}개의 커스텀 템플릿이 로드되었습니다.`);
```

**사용 사례:**

- 프로젝트별 특수한 코드 생성 템플릿 필요 시
- 빌트인 템플릿을 확장한 커스텀 버전 사용 시

---

#### 3. `get()` - 템플릿 조회

```typescript
get(key: TemplateKey | (string & {})): Template
```

**역할:**

- 키로 템플릿을 찾아서 반환
- 빌트인 템플릿은 `TemplateKey` 타입으로 자동완성 지원
- 커스텀 템플릿은 임의의 문자열 키 사용 가능

**타입 안전성:**

```typescript
// 빌트인 템플릿: 자동완성 지원
const entityTemplate = TemplateManager.get("entity"); // ✅ 자동완성으로 "entity" 제안

// 커스텀 템플릿: 임의 문자열 허용 (타입 레벨에서는 모두 통과)
const customTemplate = TemplateManager.get("my-custom-template"); // ✅
const invalidTemplate = TemplateManager.get("invalid"); // ✅ (타입 에러 없음)

// 주의: 존재하지 않는 템플릿은 런타임에 에러 발생
// TemplateManager.get("invalid"); // 런타임 에러: Template 'invalid' not found
```

**에러 처리:**

```typescript
// 템플릿이 없으면 명확한 에러 메시지와 함께 사용 가능한 템플릿 목록 제공
try {
  const template = TemplateManager.get("nonexistent");
} catch (error) {
  // Error: Template 'nonexistent' not found.
  // Available: [entity, model, generated, ...]
}
```

---

#### 4. `register()` / `registerAll()` - 템플릿 등록

```typescript
register(template: Template): void
registerAll(templates: Template[]): void
```

**역할:**

- 수동으로 템플릿을 등록
- 프로그래밍 방식으로 템플릿 추가 시 사용

**예제:**

```typescript
// 단일 템플릿 등록
class MyCustomTemplate extends Template {
  constructor() {
    super("my-custom" as TemplateKey);
  }
  // ... 구현
}

TemplateManager.register(new MyCustomTemplate());

// 여러 템플릿 일괄 등록
TemplateManager.registerAll([new MyCustomTemplate1(), new MyCustomTemplate2()]);
```

---

#### 5. `reload()` - 템플릿 재로드

```typescript
async reload(): Promise<void>
```

**역할:**

- 모든 템플릿을 초기화하고 다시 로드
- 개발 중 템플릿 파일 변경 시 사용

**동작 과정:**

```typescript
1. templates Map 초기화
2. Template._clearTemplates() 호출 (하위 호환)
3. isAutoloaded = false로 설정
4. autoload() 다시 호출
```

**예제:**

```typescript
// 템플릿 파일을 수정한 후
await TemplateManager.reload();
```

---

#### 6. `exists()` - 템플릿 존재 여부 확인

```typescript
exists(key: string): boolean
```

**역할:**

- 특정 키의 템플릿이 등록되어 있는지 확인

**예제:**

```typescript
if (TemplateManager.exists("my-custom-template")) {
  const template = TemplateManager.get("my-custom-template");
}
```

---

#### 7. `getAllKeys()` - 모든 템플릿 키 목록

```typescript
getAllKeys(): string[]
```

**역할:**

- 등록된 모든 템플릿의 키 목록을 정렬된 배열로 반환

**예제:**

```typescript
const keys = TemplateManager.getAllKeys();
console.log(`등록된 템플릿: ${keys.join(", ")}`);
```

---

#### 8. `size` - 템플릿 개수

```typescript
get size(): number
```

**역할:**

- 등록된 템플릿의 개수를 반환

**예제:**

```typescript
console.log(`총 ${TemplateManager.size}개의 템플릿이 등록되어 있습니다.`);
```

---

#### 9. 테스트 지원 메서드

##### `reset()` - 모든 상태 초기화

```typescript
reset(): void
```

- 테스트 간 격리를 위해 모든 상태 초기화
- `templates` Map 비우기
- `isAutoloaded` 플래그 리셋
- `Template._clearTemplates()` 호출 (하위 호환)

**예제:**

```typescript
beforeEach(() => {
  TemplateManager.reset();
  await TemplateManager.autoload();
});
```

##### `createInstance()` - 격리된 인스턴스 생성

```typescript
static createInstance(): TemplateManagerClass
```

- 새로운 TemplateManager 인스턴스 생성
- 테스트 간 완전한 격리 보장
- 각 테스트가 독립적인 템플릿 맵을 가짐

**예제:**

```typescript
describe("TemplateManager 테스트", () => {
  let manager: TemplateManagerClass;

  beforeEach(() => {
    manager = TemplateManagerClass.createInstance();
    await manager.autoload();
    // 각 테스트마다 새로운 인스턴스 사용
  });

  afterEach(() => {
    manager.reset();
  });

  it("템플릿을 조회할 수 있다", () => {
    const template = manager.get("entity");
    expect(template).toBeDefined();
  });
});
```

---

### 🔄 하위 호환성 (Backward Compatibility)

TemplateManager는 기존 `Template` 클래스의 정적 메서드와도 호환됩니다:

```typescript
// TemplateManager가 내부적으로 Template._getTemplatesMap()을 업데이트
// 따라서 기존 코드도 계속 동작:

// 기존 방식 (deprecated이지만 여전히 동작)
const template = Template.find("entity");

// 새로운 방식 (권장)
const template = TemplateManager.get("entity");
```

**왜 하위 호환성을 유지하나요?**

- 기존 코드를 한 번에 모두 수정할 필요 없음
- 점진적 마이그레이션 가능
- 레거시 코드와의 호환성 보장

---

## 사용 예제

### 기본 사용법

```typescript
import { TemplateManager } from "sonamu";

// 1. 템플릿 로드 (Sonamu.init() 시 자동 호출됨)
await TemplateManager.autoload();

// 2. 템플릿 조회 및 사용
const entityTemplate = TemplateManager.get("entity");
const rendered = await entityTemplate.render({
  entityId: "user",
  title: "사용자",
  // ... 기타 옵션
});
```

### 커스텀 템플릿 추가

```typescript
// 1. 커스텀 템플릿 클래스 정의
class MyCustomTemplate extends Template {
  constructor() {
    super("my-custom" as TemplateKey);
  }

  render(options: any) {
    return {
      target: "./src",
      path: "custom.ts",
      body: "// Custom code",
      importKeys: [],
    };
  }

  getTargetAndPath() {
    return { target: "./src", path: "custom.ts" };
  }
}

// 2. 등록
TemplateManager.register(new MyCustomTemplate());

// 3. 사용
const template = TemplateManager.get("my-custom");
```

### 디렉토리에서 커스텀 템플릿 로드

```typescript
// 프로젝트의 커스텀 템플릿 디렉토리에서 로드
const count = await TemplateManager.loadFromDirectory("./src/templates");
console.log(`${count}개의 커스텀 템플릿이 로드되었습니다.`);
```

### 테스트에서 사용

```typescript
describe("템플릿 테스트", () => {
  let manager: TemplateManagerClass;

  beforeEach(async () => {
    // 격리된 인스턴스 생성
    manager = TemplateManagerClass.createInstance();
    await manager.autoload();
  });

  afterEach(() => {
    // 상태 초기화
    manager.reset();
  });

  it("템플릿을 조회할 수 있다", () => {
    const template = manager.get("entity");
    expect(template).toBeDefined();
  });

  it("커스텀 템플릿을 등록할 수 있다", () => {
    const customTemplate = new MyCustomTemplate();
    manager.register(customTemplate);

    expect(manager.exists("my-custom")).toBe(true);
    expect(manager.get("my-custom")).toBe(customTemplate);
  });
});
```

### 전역 TemplateManager 사용 (테스트 격리 패턴)

```typescript
describe("전역 TemplateManager 테스트", () => {
  beforeEach(async () => {
    // 전역 인스턴스 초기화
    TemplateManager.reset();
    await TemplateManager.autoload();
  });

  afterAll(async () => {
    // 테스트 후 정리
    TemplateManager.reset();
    await TemplateManager.autoload();
  });

  it("격리된 테스트", () => {
    // 각 테스트마다 깨끗한 상태에서 시작
    expect(TemplateManager.size).toBeGreaterThanOrEqual(17);
  });
});
```

---

## 요약

### 핵심 개선사항

1. ✅ **확장성**: 커스텀 템플릿 지원
2. ✅ **테스트 용이성**: 인스턴스 기반 격리
3. ✅ **상태 관리**: 로드 상태 관리
4. ✅ **에러 처리**: 명확한 에러 메시지
5. ✅ **관심사 분리**: Template vs TemplateManager
6. ✅ **하위 호환성**: 기존 코드와 호환

### 권장 사용 패턴

- **일반 사용**: `TemplateManager.get(key)`
- **커스텀 템플릿**: `TemplateManager.loadFromDirectory()` 또는 `register()`
- **테스트**: `TemplateManagerClass.createInstance()` + `reset()`
- **템플릿 재로드**: `reload()`

### 제거된 기능

다음 기능들은 현재 구현에서 제거되었습니다:

- ❌ `mock()` - 테스트에서는 `vi.spyOn()` 사용 권장
- ❌ `override()` / `restoreOriginal()` - 필요시 `register()`로 덮어쓰기 가능
- ❌ `getOriginal()` / `getOverrides()` - 오버라이드 기능 제거로 불필요
