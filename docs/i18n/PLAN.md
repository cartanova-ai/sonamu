# Sonamu Dictionary (i18n) 구현 계획

## 1. 배경 및 목적

### 핵심 목적: 프로젝트 전체 i18n SSoT

**현재 문제:**
- 텍스트가 코드베이스 전체에 하드코딩
- api 에러 메시지, web/app UI 텍스트가 각각 분리
- i18n 적용 시 일관성 없고 누락 발생
- 어느 부분이 번역되지 않았는지 추적 불가

```tsx
// 현재: 하드코딩으로 인한 문제들
throw new BadRequestException('잘못된 요청입니다')  // api
<Button>저장</Button>  // web
<MessageAlert message="정말 삭제하시겠습니까?" />  // app

// 문제점:
// 1. i18n 적용 어려움
// 2. 동일한 의미의 텍스트가 여러 곳에 중복
// 3. 번역 누락 감지 불가
// 4. 일관성 없는 메시지
```

**해결 방향: Sonamu Dictionary (SD)**

프로젝트 전체(api/web/app)에 걸친 **i18n Single Source of Truth**:

```tsx
// 새로운 방식: SD를 통한 통합 관리
throw new BadRequestException(SD('error.badRequest'))  // api
<Button>{SD('common.save')}</Button>  // web  
<MessageAlert message={SD('confirm.delete')('상품')} />  // app

// 장점:
// 1. 모든 텍스트가 중앙 관리
// 2. api/web/app 동일한 dictionary 사용
// 3. 타입으로 번역 누락 강제 방지 (BrandedType)
// 4. locale 변경 시 전체 적용
```

### 부수 효과: 스캐폴딩 재사용성

SD 도입의 부가적인 이점으로 **스캐폴딩 재사용**이 가능해짐:

```tsx
// 스캐폴딩된 코드
<Button>{SD('common.save')}</Button>

// 텍스트 수정 필요 시 - 코드는 그대로, dictionary만 변경
// api/src/i18n/ko.ts
export default {
  'common.save': '저장하기',  // '저장' → '저장하기'로 변경
}

// → 재스캐폴딩 가능! 코드는 변경 없음
```

**핵심:**
- **주목적**: 프로젝트 전체 i18n SSoT 구축
- **부수효과**: 스캐폴딩 단위를 "단어"로 축소하여 재사용성 확보

---

## 2. 핵심 개념

### 2.1 Dictionary의 범위

**포함 대상:**
- UI 텍스트: 버튼, 레이블, 메시지
- Validation 메시지: 에러 메시지 템플릿
- 공통 용어: 상태값, 액션명

**제외 대상:**
- DB 컬럼명/필드명 → 별도 `intlCol()` 함수 사용
- 비즈니스 로직
- 복잡한 렌더링 함수

### 2.2 사용 인터페이스

```ts
// 기본 (context에서 locale 자동 판단)
SD('common.save')  // → '저장' (string)
SD.locale('en')('common.save')  // → 'Save' (string)

// 템플릿 함수 - 정의한 형태 그대로 반환
SD('validation.required')  // → function
SD('validation.required')('이름')  // → '이름은 필수입니다'
SD('validation.range')('나이', 0, 100)  // → '나이는 0~100 사이여야 합니다'

// locale 지정도 동일한 패턴
const EN = SD.locale('en')
EN('common.save')  // → 'Save'
EN('validation.required')('Name')  // → 'Name is required'
```

---

## 3. 아키텍처 설계

### 3.1 파일 구조

```
packages/api/src/i18n/
  ├── sd.generated.ts      # 자동 생성 (수정 불가)
  ├── ko.ts                # defaultLocale - 키 정의 기준
  ├── en.ts                # 기타 locale
  └── ja.ts

packages/web/src/i18n/
  ├── sd.generated.ts      # api와 별도 생성
  ├── ko.ts → ../../api/src/i18n/ko.ts (symlink)
  ├── en.ts → ../../api/src/i18n/en.ts (symlink)
  └── ja.ts → ../../api/src/i18n/ja.ts (symlink)

packages/app/src/i18n/
  └── (동일 구조)
```

**중요:**
- `sd.generated.ts`는 api/web/app 각각 **독립 생성** (플랫폼별 구현 다름)
- locale 파일(`ko.ts`, `en.ts` 등)은 api에만 실제 존재, web/app은 symlink

### 3.2 설정

```ts
// sonamu.config.ts
export default defineConfig({
  // ... 기존 설정
  
  i18n: {
    defaultLocale: 'ko',        // 키 정의 기준 + 런타임 기본값
    supportedLocales: ['ko', 'en', 'ja'],
  },
  
  // ... 나머지 설정
});
```

### 3.3 Locale 파일 형식

```ts
// api/src/i18n/ko.ts (defaultLocale - 키 정의)
export default {
  'common.save': '저장',
  'common.cancel': '취소',
  'common.delete': '삭제',
  'confirm.delete': '정말 삭제하시겠습니까?',
  'validation.required': '필수 항목입니다',
  // 템플릿 함수 (개별 파라미터)
  'validation.minLength': (field: string, min: number) => 
    `${field}는 최소 ${min}자 이상이어야 합니다`,
  'validation.range': (field: string, min: number, max: number) => 
    `${field}는 ${min}~${max} 사이여야 합니다`,
}
```

```ts
// api/src/i18n/en.ts
import { defineLocale } from './sd.generated'

export default defineLocale({
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'confirm.delete': 'Are you sure you want to delete?',
  'validation.required': 'Required field',
  // 템플릿 함수 - 시그니처까지 강제!
  'validation.minLength': (field: string, min: number) => 
    `${field} must be at least ${min} characters`,
  'validation.range': (field: string, min: number, max: number) => 
    `${field} must be between ${min} and ${max}`,
  // 키 누락 또는 시그니처 불일치 시 타입 에러!
})
```

### 3.4 타입 안전성

#### BrandedType으로 하드코딩 방지

```ts
// sd.generated.ts
import ko from './ko'

type Dictionary = typeof ko;
export type DictKey = keyof Dictionary;

// LocalizedString BrandedType
export type LocalizedString = string & { __brand: 'LocalizedString' };

// SD는 항상 LocalizedString 반환
export function SD<K extends DictKey>(key: K): 
  Dictionary[K] extends (...args: infer P) => string
    ? (...args: P) => LocalizedString
    : LocalizedString;
```

**하드코딩 방지 메커니즘:**

```ts
// api - Exception은 LocalizedString만 받음
class BadRequestException {
  constructor(message: LocalizedString) { ... }
}

throw new BadRequestException(SD('error.badRequest'))  // ✅ OK
throw new BadRequestException('잘못된 요청')  // ❌ 타입 에러!

// web/app - MessageAlert는 LocalizedString만 받음
interface MessageAlertProps {
  message: LocalizedString;
}

<MessageAlert message={SD('confirm.delete')('상품')} />  // ✅ OK
<MessageAlert message="정말 삭제하시겠습니까?" />  // ❌ 타입 에러!
```

**장점:**
- ✅ 하드코딩 문자열 사용 시 컴파일 에러
- ✅ i18n 누락 부분 자동 감지
- ✅ 모든 사용자 대면 텍스트 강제 번역

#### Locale 동기화 보장

```ts
// 다른 locale 파일이 defaultLocale과 동일한 타입을 가지도록 강제
type LocaleDefinition = {
  [K in DictKey]: Dictionary[K]  // string이면 string, 함수면 같은 시그니처의 함수
};

export function defineLocale(dict: LocaleDefinition) {
  return dict;
}
```

**동작:**
1. `ko.ts`에 `'product.title': '상품명'` 추가
2. `sonamu codegen` 실행 → `DictKey` 타입 업데이트
3. `en.ts`에서 `'product.title'` 누락 → **타입 에러**
4. 개발자가 `en.ts`에 추가
5. 모든 locale 동기화 완료

---

## 4. 플랫폼별 구현

### 4.1 Backend (api)

**Locale 관리: Sonamu Context**

```ts
// sonamu/src/api/context.ts
export interface Context {
  request: FastifyRequest | null;
  reply: FastifyReply | null;
  headers: Record<string, string | string[] | undefined>;
  createSSE: <T extends ZodObject>(...) => SSEFactory<T>;
  naiteStore: Map<string, any>;
  locale?: string;  // 추가
  // ...
}
```

```ts
// sonamu/src/api/sonamu.ts - createContext 수정
async createContext(
  config: SonamuFastifyConfig,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Context> {
  // locale 자동 감지 (i18n 설정 있을 때만)
  let locale: string | undefined;
  if (this.config.i18n) {
    const acceptLanguage = request.headers['accept-language'];
    locale = this.detectLocale(
      acceptLanguage,
      this.config.i18n.supportedLocales
    ) ?? this.config.i18n.defaultLocale;
  }

  const { createSSEFactory } = await import("../stream/sse");
  const createSSE = ...

  const context: Context = {
    ...(await Promise.resolve(
      config.contextProvider(
        {
          request,
          reply,
          headers: request.headers,
          createSSE,
          naiteStore: Naite.createStore(),
          user: request.user ?? null,
          passport: {
            login: request.login.bind(request),
            logout: request.logout.bind(request),
          },
          locale, // Sonamu가 자동 주입
        },
        request,
        reply,
      ),
    )),
  };
  return context;
}

private detectLocale(acceptLanguage?: string, supported: string[]): string | undefined {
  if (!acceptLanguage) return undefined;
  
  // Accept-Language: ko-KR,ko;q=0.9,en;q=0.8
  const langs = acceptLanguage.split(',').map(lang => {
    const [code] = lang.split(';');
    return code.trim().split('-')[0]; // ko-KR -> ko
  });
  
  return langs.find(lang => supported.includes(lang));
}
```

**sd.generated.ts (api)**

```ts
// api/src/i18n/sd.generated.ts (자동 생성)
import { Sonamu } from 'sonamu';
import ko from './ko';
import en from './en';
import ja from './ja';

type Dictionary = typeof ko;
export type DictKey = keyof Dictionary;

// LocalizedString BrandedType
export type LocalizedString = string & { __brand: 'LocalizedString' };

// 다른 locale 파일이 defaultLocale과 동일한 타입을 가지도록 강제
type LocaleDefinition = {
  [K in DictKey]: Dictionary[K]
};

export function defineLocale(dict: LocaleDefinition) {
  return dict;
}

const DEFAULT_LOCALE = 'ko';

const dictionaries = {
  ko,
  en,
  ja,
};

function getCurrentLocale(): string {
  const ctx = Sonamu.getContext();
  return ctx?.locale ?? DEFAULT_LOCALE;
}

function getDictValue<K extends DictKey>(key: K, locale: string): Dictionary[K] {
  const dict = dictionaries[locale as keyof typeof dictionaries];
  return (dict?.[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key) as Dictionary[K];
}

// 함수 타입인 경우 래퍼 반환, 아니면 LocalizedString 반환
export function SD<K extends DictKey>(key: K): 
  Dictionary[K] extends (...args: infer P) => string
    ? (...args: P) => LocalizedString
    : LocalizedString {
  const locale = getCurrentLocale();
  const value = getDictValue(key, locale);
  
  if (typeof value === 'function') {
    return ((...args: any[]) => value(...args) as LocalizedString) as any;
  }
  return value as LocalizedString;
}

SD.locale = (locale: string) => <K extends DictKey>(key: K): 
  Dictionary[K] extends (...args: infer P) => string
    ? (...args: P) => LocalizedString
    : LocalizedString => {
  const value = getDictValue(key, locale);
  
  if (typeof value === 'function') {
    return ((...args: any[]) => value(...args) as LocalizedString) as any;
  }
  return value as LocalizedString;
};
```

### 4.2 Frontend (web/app)

**Locale 관리: 전역 변수**

```ts
// web/src/i18n/sd.generated.ts (자동 생성)
import ko from './ko';
import en from './en';
import ja from './ja';

type Dictionary = typeof ko;
export type DictKey = keyof Dictionary;

// LocalizedString BrandedType
export type LocalizedString = string & { __brand: 'LocalizedString' };

// 다른 locale 파일이 defaultLocale과 동일한 타입을 가지도록 강제
type LocaleDefinition = {
  [K in DictKey]: Dictionary[K]
};

export function defineLocale(dict: LocaleDefinition) {
  return dict;
}

const DEFAULT_LOCALE = 'ko';

const dictionaries = {
  ko,
  en,
  ja,
};

let _currentLocale = DEFAULT_LOCALE;

export function setLocale(locale: string) {
  _currentLocale = locale;
}

export function getCurrentLocale(): string {
  return _currentLocale;
}

function getDictValue<K extends DictKey>(key: K, locale: string): Dictionary[K] {
  const dict = dictionaries[locale as keyof typeof dictionaries];
  return (dict?.[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key) as Dictionary[K];
}

// 함수 타입인 경우 래퍼 반환, 아니면 LocalizedString 반환
export function SD<K extends DictKey>(key: K): 
  Dictionary[K] extends (...args: infer P) => string
    ? (...args: P) => LocalizedString
    : LocalizedString {
  const locale = getCurrentLocale();
  const value = getDictValue(key, locale);
  
  if (typeof value === 'function') {
    return ((...args: any[]) => value(...args) as LocalizedString) as any;
  }
  return value as LocalizedString;
}

SD.locale = (locale: string) => <K extends DictKey>(key: K): 
  Dictionary[K] extends (...args: infer P) => string
    ? (...args: P) => LocalizedString
    : LocalizedString => {
  const value = getDictValue(key, locale);
  
  if (typeof value === 'function') {
    return ((...args: any[]) => value(...args) as LocalizedString) as any;
  }
  return value as LocalizedString;
};
```

**사용 예시 (React)**

```tsx
// App.tsx
import { setLocale } from '@/i18n/sd.generated';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // 브라우저 locale 감지
    const browserLocale = navigator.language.split('-')[0];
    if (['ko', 'en', 'ja'].includes(browserLocale)) {
      setLocale(browserLocale);
    }
  }, []);
  
  return <YourApp />;
}
```

```tsx
// components/Button.tsx
import { SD, type LocalizedString } from '@/i18n/sd.generated';

export function SaveButton() {
  return <button>{SD('common.save')}</button>;
}

export function DeleteConfirm({ itemName }: { itemName: string }) {
  const message = SD('confirm.delete')(itemName);
  return <Dialog>{message}</Dialog>;
}

// MessageAlert는 LocalizedString만 받음
interface MessageAlertProps {
  message: LocalizedString;
}

function MessageAlert({ message }: MessageAlertProps) {
  return <div className="alert">{message}</div>;
}

// 사용
<MessageAlert message={SD('success.saved')} />  // ✅ OK
<MessageAlert message="저장되었습니다" />  // ❌ 타입 에러!
```

---

## 5. 코드 생성 시스템

### 5.1 Template 구현

```ts
// sonamu/src/template/implementations/sd.template.ts
import path from "path";
import { Sonamu } from "../../api/sonamu";
import type { TemplateOptions } from "../../types/types";
import { Template } from "../template";

export class Template__sd extends Template {
  constructor() {
    super("sd");
  }

  getTargetAndPath(options: TemplateOptions["sd"]) {
    const { target } = options;
    const dir = target === 'api' 
      ? Sonamu.config.api.dir 
      : target === 'web'
      ? path.join(Sonamu.appRootPath, 'web')
      : path.join(Sonamu.appRootPath, 'app');
    
    return {
      target: `${dir}/src/i18n`,
      path: `sd.generated.ts`,
    };
  }

  render(options: TemplateOptions["sd"]) {
    const { target } = options;
    const i18nConfig = Sonamu.config.i18n ?? { 
      defaultLocale: 'ko', 
      supportedLocales: ['ko'] 
    };

    const { defaultLocale, supportedLocales } = i18nConfig;

    // defaultLocale 파일에서 키 추출
    const keys = this.extractKeysFromDefaultLocale(target, defaultLocale);
    const keysType = keys.length > 0 
      ? keys.map(k => `'${k}'`).join(' | ')
      : 'string'; // 키가 없으면 일단 string

    // 플랫폼별 locale 관리 코드
    const localeManagementCode = target === 'api'
      ? `
import { Sonamu } from 'sonamu';

function getCurrentLocale(): string {
  const ctx = Sonamu.getContext();
  return ctx?.locale ?? '${defaultLocale}';
}
      `.trim()
      : `
let _currentLocale = '${defaultLocale}';

export function setLocale(locale: string) {
  _currentLocale = locale;
}

export function getCurrentLocale(): string {
  return _currentLocale;
}
      `.trim();

    // locale import
    const localeImports = supportedLocales
      .map(locale => `import ${locale} from './${locale}';`)
      .join('\n');

    // dictionaries object
    const dictionariesObj = supportedLocales
      .map(locale => `  ${locale},`)
      .join('\n');

    const body = `
${localeManagementCode}

${localeImports}

type Dictionary = typeof ${defaultLocale};
export type DictKey = ${keysType};

// 다른 locale 파일이 defaultLocale과 동일한 타입을 가지도록 강제
type LocaleDefinition = {
  [K in DictKey]: Dictionary[K]
};

export function defineLocale(dict: LocaleDefinition) {
  return dict;
}

const DEFAULT_LOCALE = '${defaultLocale}';

const dictionaries = {
${dictionariesObj}
};

function getDictValue<K extends DictKey>(key: K, locale: string): Dictionary[K] {
  const dict = dictionaries[locale as keyof typeof dictionaries];
  return (dict?.[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key) as Dictionary[K];
}

export function SD<K extends DictKey>(key: K): Dictionary[K] {
  const locale = getCurrentLocale();
  return getDictValue(key, locale);
}

SD.locale = (locale: string) => <K extends DictKey>(key: K): Dictionary[K] => {
  return getDictValue(key, locale);
};
    `.trim();

    return {
      ...this.getTargetAndPath(options),
      body,
      importKeys: [],
      customHeaders: [
        "/** biome-ignore-all lint: generated는 무시 */",
        "/** biome-ignore-all assist: generated는 무시 */",
        "",
      ],
    };
  }

  private extractKeysFromDefaultLocale(target: string, locale: string): string[] {
    // TODO: 실제 구현
    // 1. target에 따라 올바른 경로 찾기
    // 2. {locale}.ts 파일 읽기
    // 3. default export에서 키 추출
    // 4. 키 배열 반환
    return [];
  }
}
```

### 5.2 TemplateOptions 타입 추가

```ts
// sonamu/src/types/types.ts
export interface TemplateOptions {
  // ... 기존 템플릿들
  
  sd: {
    target: 'api' | 'web' | 'app';
  };
}
```

### 5.3 Template 등록

```ts
// sonamu/src/template/index.ts
export class TemplateManager {
  static async autoload(): Promise<void> {
    // ... 기존 템플릿들
    
    const { Template__sd } = await import("./implementations/sd.template");
    this.register(new Template__sd());
  }
}
```

### 5.4 Syncer에서 생성 트리거

```ts
// sonamu/src/syncer/syncer.ts
export class Syncer {
  async sync(): Promise<void> {
    // ... 기존 sync 로직
    
    // i18n 설정이 있으면 SD 생성
    if (Sonamu.config.i18n) {
      await this.syncSD();
    }
  }

  private async syncSD(): Promise<void> {
    const targets: Array<'api' | 'web' | 'app'> = ['api'];
    
    // sync.targets 확인
    if (Sonamu.config.sync?.targets) {
      if (Sonamu.config.sync.targets.includes('web')) {
        targets.push('web');
      }
      if (Sonamu.config.sync.targets.includes('app')) {
        targets.push('app');
      }
    }

    for (const target of targets) {
      const template = TemplateManager.get('sd');
      const result = template.render({ target });
      await this.writeTemplate(result);
    }
  }
}
```

---

## 6. Watch 시스템 통합

locale 파일(ko.ts, en.ts 등) 변경 시 자동 재생성:

```ts
// sonamu/src/api/sonamu.ts - handleFileChange 수정
private async handleFileChange(event: string, filePath: AbsolutePath): Promise<void> {
  // ... 기존 로직
  
  // i18n 파일 변경 감지
  const isI18nFile = filePath.includes('/i18n/') && 
                     (filePath.endsWith('.ts') && !filePath.endsWith('.generated.ts'));
  
  if (isI18nFile) {
    await this.syncer.syncSD();
    return;
  }
  
  // ... 나머지 로직
}
```

---

## 7. Sonamu 내장 Dictionary

Sonamu가 자체적으로 사용하는 기본 메시지:

```ts
// sonamu-kit/dict/ko.ts
export const sonamuDict = {
  'error.badRequest': '잘못된 요청입니다',
  'error.unauthorized': '인증이 필요합니다',
  'error.forbidden': '권한이 없습니다',
  'error.notFound': '찾을 수 없습니다',
  'error.internalError': '서버 오류가 발생했습니다',
}
```

**타입 확장:**
프로젝트의 DictKey는 Sonamu 내장 키를 자동 포함:

```ts
// api/src/i18n/sd.generated.ts
import { sonamuDict } from 'sonamu-kit/dict';
import ko from './ko';

// Sonamu 내장 + 프로젝트 키 합침
export type DictKey = keyof typeof sonamuDict | keyof typeof ko;
```

---

## 8. 스캐폴딩 통합

### 8.1 스캐폴딩 템플릿 수정

**Before:**
```tsx
// list.template.tsx
export function ProductList() {
  return (
    <div>
      <h1>상품 목록</h1>
      <Button>저장</Button>
    </div>
  );
}
```

**After:**
```tsx
// list.template.tsx
import { SD } from '@/i18n/sd.generated';

export function ProductList() {
  return (
    <div>
      <h1>{SD('product.list.title')}</h1>
      <Button>{SD('common.save')}</Button>
    </div>
  );
}
```

### 8.2 스캐폴딩 시 자동 키 생성

```bash
$ sonamu scaffold list Product
```

→ 자동으로 필요한 키를 defaultLocale에 추가:

```ts
// api/src/i18n/ko.ts (자동 추가)
export default {
  // ... 기존 키들
  'product.list.title': '상품 목록',  // 자동 추가
}
```

---

## 9. 구현 체크리스트

### Phase 1: Core Infrastructure
- [ ] `Context` 타입에 `locale` 필드 추가
- [ ] `Sonamu.createContext()`에 locale 자동 감지 로직 추가
- [ ] `Sonamu.detectLocale()` 메서드 구현
- [ ] `sonamu.config.ts` 타입에 `i18n` 설정 추가
- [ ] Sonamu 내장 dictionary 기본 키 정의 (`sonamu-kit/dict/`)

### Phase 2: Template System
- [ ] `Template__sd` 클래스 구현
- [ ] `extractKeysFromDefaultLocale()` 메서드 구현
- [ ] `TemplateOptions['sd']` 타입 정의
- [ ] `TemplateManager`에 sd 템플릿 등록
- [ ] `Syncer.syncSD()` 메서드 구현

### Phase 3: File Generation
- [ ] api용 `sd.generated.ts` 생성 (ALS 기반)
- [ ] web용 `sd.generated.ts` 생성 (싱글턴 기반)
- [ ] app용 `sd.generated.ts` 생성 (싱글턴 기반)
- [ ] locale 파일 자동 생성 (ko.ts, en.ts 등)
- [ ] web/app locale 파일 symlink 처리

### Phase 4: Watch System
- [ ] locale 파일 변경 감지
- [ ] 변경 시 자동 재생성 트리거
- [ ] HMR 메시지 출력

### Phase 5: Scaffolding Integration
- [ ] 기존 스캐폴딩 템플릿에 SD 적용
- [ ] 스캐폴딩 시 자동 키 추가 로직
- [ ] Sonamu UI에서 Dictionary 편집 기능 (선택)

### Phase 6: Testing & Documentation
- [ ] 단위 테스트 작성
- [ ] 통합 테스트 작성
- [ ] 마이그레이션 가이드 작성
- [ ] API 문서 작성

---

## 10. 예상 이슈 및 대응

### 10.1 키 동기화 문제
**문제:** defaultLocale에 키 추가 후 다른 locale에 반영 전 타입 에러

**대응:**
- `defineLocale()` 함수로 타입 강제
- 누락된 키는 빌드 시 에러 → 개발자가 즉시 인지

### 10.2 Symlink 관리
**문제:** Windows에서 symlink 권한 이슈

**대응:**
- 개발자 모드 활성화 안내
- 또는 symlink 대신 파일 복사 (watch로 자동 동기화)

### 10.3 성능 문제
**문제:** 매 렌더링마다 SD() 호출 시 성능 우려

**대응:**
- getDictValue는 단순 객체 참조라 오버헤드 미미
- 필요시 memoization 추가

### 10.4 Locale 감지 커스터마이징
**문제:** Accept-Language 외 다른 방식으로 locale 결정하고 싶은 경우

**대응:**
- contextProvider에서 locale을 덮어쓸 수 있도록 허용
- Sonamu가 자동 감지한 locale을 defaultContext에 포함
- 사용자가 원하면 덮어쓰기 가능

```ts
// sonamu.config.ts
apiConfig: {
  contextProvider: (defaultContext, request) => {
    // Sonamu가 감지한 locale 사용 가능
    // 또는 커스텀 로직으로 덮어쓰기
    const locale = request.session?.locale ?? defaultContext.locale;
    
    return {
      ...defaultContext,
      locale, // 덮어쓰기
    };
  },
}
```

---

## 11. 마이그레이션 전략

### 기존 프로젝트 적용
1. `sonamu.config.ts`에 `i18n` 설정 추가
2. `sonamu codegen` 실행 → locale 파일 자동 생성
3. 기존 하드코딩된 텍스트를 점진적으로 SD로 교체
4. 스캐폴딩 재실행 → 새로운 파일은 자동으로 SD 사용

### 점진적 적용
- 기존 코드는 그대로 유지 (하드코딩)
- 새로 생성되는 코드만 SD 사용
- 필요에 따라 기존 코드 리팩토링

---

## 12. 향후 확장

### 12.1 Plural Forms
```ts
'item.count': (n: number) => 
  n === 0 ? '항목 없음' :
  n === 1 ? '항목 1개' :
  `항목 ${n}개`
```

### 12.3 Sonamu UI 통합
- Dictionary 키 목록 시각화
- Excel과 유사한 편집 UI
- 번역 누락 경고
- 번역 통계 (완성도 %)

---

## 참고자료

- [typesafe-i18n](https://github.com/ivanhofer/typesafe-i18n) - 타입 안전한 i18n 라이브러리
- Sonamu Template System: `sonamu/src/template/`
- Sonamu Context: `sonamu/src/api/context.ts`
- Sonamu Syncer: `sonamu/src/syncer/syncer.ts`
