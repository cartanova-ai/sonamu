# UI 프레임워크 마이그레이션 계획

## 📋 목표

semantic-ui-react → shadcn/ui + tailwindcss로 전환하고,
최종적으로 sonamu/ui로 모듈화하여 이전

## ✅ 완료된 작업 (Phase 1) - 100% 완료!

### 1. 기본 인프라 구축

- ✅ `packages/react-components` 디렉토리 구조 생성
- ✅ yarn workspace 설정 (`@sonamu-kit/react-components`)
- ✅ tailwindcss + PostCSS + shadcn/ui 기본 설정
- ✅ TypeScript 설정 (`moduleResolution: "bundler"`)
- ✅ 경로 문제 완벽 해결 (상대 경로 사용)
- ✅ 로컬 패키지 연결 및 동작 확인

### 2. shadcn/ui 컴포넌트 설치 (48개 완료!)

**Form & Input (12개):**

- ✅ Button, Form, Input, Textarea, Select
- ✅ Checkbox, Radio Group, Label, Switch, Slider
- ✅ Input OTP, Combobox (커스텀 구현)

**Data Display (7개):**

- ✅ Table, Card, Badge, Avatar
- ✅ Separator, Skeleton, Progress

**Feedback & Overlay (10개):**

- ✅ Dialog, Alert Dialog, Alert
- ✅ Toast + Toaster, Tooltip, Popover
- ✅ Sheet, Hover Card, Drawer

**Navigation (6개):**

- ✅ Tabs, Pagination, Navigation Menu
- ✅ Menubar, Breadcrumb, Command

**Menus (2개):**

- ✅ Dropdown Menu, Context Menu

**Date & Time (2개):**

- ✅ Calendar
- ✅ Date Picker (커스텀 구현, Popover + Calendar 조합)

**Layout (5개):**

- ✅ Scroll Area, Accordion, Collapsible
- ✅ Resizable, Aspect Ratio

**Other (4개):**

- ✅ Carousel, Toggle, Toggle Group, Sonner

### 3. 문서화 및 가이드

- ✅ 컴포넌트 가이드 페이지 완성 (`/admin/shadcn-guide`)
  - 48개 컴포넌트 각각 Card로 구성
  - 실제 동작하는 UI 예시
  - 사용 방법 코드 스니펫 포함
- ✅ `COMPONENTS_LIST.md` - 전체 컴포넌트 목록 및 CLI 명령어
- ✅ `COMPONENTS_STATUS.md` - 설치 현황 추적
- ✅ `README.md` - 패키지 사용 가이드
- ✅ `SETUP_GUIDE.md` - 초기 설정 가이드

### 4. 기존 시스템 분석

- ✅ useTypeForm 사용 패턴 분석 완료
- ✅ useListParams 사용 패턴 분석 완료

**분석 결과:**

```typescript
// 기존 useTypeForm 패턴
const { form, setForm, register } = useTypeForm(ZodSchema, initialValues);

// 기존 useListParams 패턴
const { listParams, register } = useListParams(ZodSchema, initialValues);
```

### 5. 의존성 설치

- ✅ react-hook-form, @hookform/resolvers 설치 완료
- ✅ date-fns 설치 완료
- ✅ 모든 @radix-ui 컴포넌트 의존성 자동 설치됨
- ✅ lucide-react (아이콘), class-variance-authority, clsx, tailwind-merge 등

## 🚀 다음 단계 (Phase 2 - Hooks 재구현)

### 1. react-hook-form 기반 useTypeForm 재구현

**목표:**

- 기존 API와 호환성 유지
- shadcn/ui Form 컴포넌트와 통합
- Zod 스키마 기반 타입 안정성

**구현 계획:**

```typescript
// packages/react-components/src/hooks/use-type-form.ts

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export function useTypeForm<T extends z.ZodType>(schema: T, defaultValues: z.infer<T>) {
  const form = useForm<z.infer<T>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // semantic-ui-react register 호환 래퍼
  const register = (name: keyof z.infer<T>) => ({
    name,
    value: form.watch(name),
    onChange: (e: any, { value }: any) => {
      form.setValue(name, value);
    },
    error: !!form.formState.errors[name],
  });

  return {
    form: form.watch(),
    setForm: (values: Partial<z.infer<T>>) => {
      Object.entries(values).forEach(([key, value]) => {
        form.setValue(key as any, value);
      });
    },
    register,
    rhfForm: form, // react-hook-form 네이티브 폼 객체
  };
}
```

### 2. useListParams URL 연동 재구현

**목표:**

- URL 쿼리 파라미터와 동기화
- tanstack-router의 search params와 통합
- 페이지네이션, 정렬, 필터링 지원

**구현 계획:**

```typescript
// packages/react-components/src/hooks/use-list-params.ts

import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback } from "react";

export function useListParams<T extends z.ZodType>(schema: T, defaultValues: z.infer<T>) {
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false });

  // URL에서 파라미터 파싱
  const listParams = schema.parse({
    ...defaultValues,
    ...searchParams,
  });

  // 파라미터 업데이트 함수
  const updateParams = useCallback(
    (updates: Partial<z.infer<T>>) => {
      navigate({
        search: (prev) => ({ ...prev, ...updates }),
      });
    },
    [navigate],
  );

  // register 호환 함수
  const register = (name: keyof z.infer<T>) => ({
    name,
    value: listParams[name],
    onChange: (e: any, { value }: any) => {
      updateParams({ [name]: value } as any);
    },
  });

  return {
    listParams,
    updateParams,
    register,
  };
}
```

### 3. 필수 의존성 추가 (✅ 완료)

~~필요한 의존성은 모두 설치 완료~~

```bash
# ✅ 이미 설치됨
react-hook-form @hookform/resolvers
date-fns
zod (이미 프로젝트에 존재)
```

## 🎯 Phase 3 - tanstack-router 마이그레이션

### 1. 라우터 기본 설정

```typescript
// packages/react-components/src/router/routes.ts

import { createRootRoute, createRoute } from "@tanstack/react-router";

// 기본 route tree 구성
// Admin 영역과 Public 영역 분리
```

### 2. 점진적 마이그레이션 전략

1. **공존 단계**: react-router-dom과 tanstack-router 병행 사용
2. **부분 교체**: Admin 페이지 한 섹션을 완전히 교체
3. **전체 교체**: 모든 페이지를 tanstack-router로 전환

## 🔄 Phase 4 - 점진적 컴포넌트 마이그레이션

### 우선순위

1. **Form 관련 페이지** (가장 많이 사용)
   - `/admin/antimicrobials/form`
   - `/admin/patients/form`
   - 등등...

2. **List 페이지**
   - `/admin/antimicrobials`
   - `/admin/patients`
   - 등등...

3. **기타 페이지**

### 마이그레이션 체크리스트 (페이지당)

- [ ] Form.Input → Form + Input (shadcn/ui)
- [ ] Form.Select → Form + Select (shadcn/ui)
- [ ] Dropdown → Select (shadcn/ui)
- [ ] Button → Button (shadcn/ui)
- [ ] Table → Table (shadcn/ui)
- [ ] Modal → Dialog (shadcn/ui)
- [ ] useTypeForm → useTypeForm (new)
- [ ] useListParams → useListParams (new)

## 📦 Phase 5 - sonamu/ui로 이전

### 준비 작업

1. **패키지 독립성 검증**
   - web 프로젝트 특정 코드 제거
   - 순수한 UI 라이브러리로 정리

2. **문서화**
   - README.md 완성
   - 컴포넌트별 사용 예제
   - Storybook 추가 고려

3. **빌드 설정**
   - TypeScript 빌드
   - CSS 번들링
   - ESM/CJS 동시 지원

4. **이전 실행**

   ```bash
   # sonamu/ui 리포지토리로 이동
   cp -r packages/react-components/* sonamu/ui/

   # web 프로젝트에서는 npm 패키지로 사용
   # web/package.json
   {
     "dependencies": {
       "@sonamu/ui": "^1.0.0"
     }
   }
   ```

## ⚠️ 주의사항

### 스타일 충돌 방지

- semantic-ui-css와 tailwindcss 공존 시 CSS 우선순위 문제
- 점진적 마이그레이션 시 스타일 격리 필요
- Tailwind의 reset CSS가 기존 스타일에 영향

### API 호환성

- 기존 코드 변경 최소화를 위해 register API 호환성 유지
- 하지만 새로운 기능은 react-hook-form 네이티브 API 사용 권장

### 테스트

- 각 마이그레이션 단계마다 철저한 테스트
- Form validation 동작 확인
- URL 파라미터 동기화 확인

## 📊 현재 진행 상황

```
[██████████] 100% - Phase 1 완료! 🎉
[░░░░░░░░░░]   0% - Phase 2 준비 완료, 구현 대기
[░░░░░░░░░░]   0% - Phase 3 대기
[░░░░░░░░░░]   0% - Phase 4 대기
[░░░░░░░░░░]   0% - Phase 5 대기
```

### 🎯 현재 상태 요약

- ✅ **48개 컴포넌트** 설치 및 테스트 완료
- ✅ **전체 가이드 페이지** 구현 완료
- ✅ **경로 문제** 완벽 해결
- ✅ **TypeScript 설정** 최적화
- ✅ **의존성** 모두 설치
- ⏳ **Hooks 구현** 시작 준비 완료

## 🎓 학습 리소스

- [shadcn/ui 공식 문서](https://ui.shadcn.com)
- [react-hook-form 공식 문서](https://react-hook-form.com)
- [TanStack Router 공식 문서](https://tanstack.com/router)
- [Zod 공식 문서](https://zod.dev)

## 💡 다음 작업 제안

### 🎯 Phase 2 시작 준비 완료!

**Option 1: useTypeForm 먼저 구현 (추천 ⭐)**

1. **useTypeForm Hook 구현**

   ```typescript
   // packages/react-components/src/hooks/use-type-form.ts
   // react-hook-form 기반
   // 기존 API 호환성 유지
   ```

2. **테스트 페이지 생성**

   ```typescript
   // src/pages/admin/form-test.tsx
   // 간단한 Form으로 PoC
   // 기존 페이지와 비교
   ```

3. **실제 페이지 적용**
   ```typescript
   // 예: antimicrobials/form
   // 기존 코드와 병행 테스트
   ```

**Option 2: useListParams 먼저 구현**

1. **tanstack-router 기본 설정**
2. **useListParams Hook 구현**
3. **List 페이지 테스트**

**Option 3: 간단한 페이지 전체 마이그레이션**

1. 작은 Form 페이지 선택
2. 처음부터 끝까지 완전히 교체
3. 실전 경험 축적

---

### 📝 진행 방식

- ✅ Phase 1 완료로 모든 준비 완료
- 🎯 작은 단위로 점진적 진행
- 🔄 각 단계마다 동작 확인
- 🤝 기존 코드 유지하면서 새 코드 추가

### 🚀 바로 시작할 수 있는 첫 작업

```typescript
// 1단계: useTypeForm 구현
// packages/react-components/src/hooks/use-type-form.ts 생성

// 2단계: hooks export에 추가
// packages/react-components/src/hooks/index.ts

// 3단계: 테스트 페이지로 검증
// src/pages/admin/form-test.tsx
```

어떤 작업부터 시작하시겠어요? 🎯
