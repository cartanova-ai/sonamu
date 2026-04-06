# @sonamu-kit/react-components 리팩토링 플랜

## 목표

1. 모든 폼 컴포넌트를 `onValueChange` 방식으로 통일
2. useTypeForm/useListParams를 새로운 API에 맞춰 수정
3. react-router-dom 의존성 완전 제거, tanstack-router로 전환
4. useListParams, useTypeForm을 별도 파일로 분리
5. lodash-es → radashi 전환
6. 빌드 검증 후 miomock/web 마이그레이션

## Phase 1: 컴포넌트 API 통일 (onValueChange)

### 1.1 수정 대상 컴포넌트 (13개)

**네이티브 기반 (onChange → onValueChange 변환 필요)**:

- `input.tsx` - `onChange={(e) => onValueChange(e.target.value)}`
- `textarea.tsx` - `onChange={(e) => onValueChange(e.target.value)}`

**Radix 기반 (이미 전용 핸들러 사용, onValueChange로 래핑)**:

- `select.tsx` - 이미 `onValueChange` 사용
- `multi-select.tsx` - 이미 `onValueChange` 사용
- `checkbox.tsx` - `onCheckedChange → onValueChange`
- `switch.tsx` - `onCheckedChange → onValueChange`
- `radio-group.tsx` - 이미 `onValueChange` 사용
- `slider.tsx` - 이미 `onValueChange` 사용
- `combobox.tsx` - 확인 필요
- `async-select.tsx` - 확인 필요

**커스텀 컴포넌트**:

- `date-picker.tsx` - 확인 필요
- `image-uploader.tsx` - 확인 필요
- `multi-image-uploader.tsx` - 확인 필요

### 1.2 변환 패턴

**타입 오버라이드 유틸리티 사용**:

```ts
import { Override } from "@sonamu-kit/react-components";

// ❌ 직접 Omit 사용 금지
export interface SonamuInputProps extends Omit<InputProps, "onChange"> {
  onValueChange?: (value: string) => void;
}

// ✅ Override 유틸리티 사용
export type SonamuInputProps = Override<
  InputProps,
  {
    onValueChange?: (value: string) => void;
    onChange?: React.ChangeEventHandler<HTMLInputElement>; // 패스스루용
  }
>;
```

**Note**: `Override<T, U>` 유틸리티는 `@sonamu-kit/react-components/lib/helpers`에 정의되어 있으며, 모든 웹 프로젝트에서 사용 가능합니다. 타입 오버라이드 시 직접 `Omit<T, keyof U> & U` 패턴을 구현하지 말고 반드시 이 유틸리티를 사용하세요.

```tsx
// Before (네이티브)
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return <input {...props} />;
  },
);

// After (Sonamu 통일 API)
export type SonamuInputProps = Override<
  InputProps,
  {
    onValueChange?: (value: string) => void;
    onChange?: React.ChangeEventHandler<HTMLInputElement>; // 패스스루용
  }
>;

export const Input = React.forwardRef<HTMLInputElement, SonamuInputProps>(
  ({ className, type, onValueChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e); // 네이티브 이벤트 필요한 경우
      onValueChange?.(e.target.value); // Sonamu API
    };

    return <input onChange={handleChange} {...props} ref={ref} />;
  },
);
```

```tsx
// Before (Radix - Checkbox)
export const Checkbox = React.forwardRef<...>(
  ({ onCheckedChange, ...props }, ref) => {
    return <CheckboxPrimitive.Root onCheckedChange={onCheckedChange} {...props} />
  }
)

// After (Sonamu 통일 API)
export type SonamuCheckboxProps = Override<CheckboxProps, {
  onValueChange?: (checked: boolean) => void;
  onCheckedChange?: (checked: boolean) => void;  // 패스스루용
}>;

export const Checkbox = React.forwardRef<..., SonamuCheckboxProps>(
  ({ onValueChange, onCheckedChange, ...props }, ref) => {
    const handleChange = (checked: boolean) => {
      onCheckedChange?.(checked);  // Radix 네이티브
      onValueChange?.(checked);  // Sonamu API
    };

    return <CheckboxPrimitive.Root onCheckedChange={handleChange} {...props} ref={ref} />
  }
)
```

### 1.3 작업 순서

1. input.tsx 수정 및 테스트
2. select.tsx 수정 (이미 onValueChange 사용, 타입만 정리)
3. checkbox.tsx 수정
4. 나머지 컴포넌트 순차 적용
5. 각 컴포넌트별로 간단한 테스트 작성하여 검증

## Phase 2: useTypeForm 수정

### 2.1 파일 분리

```
helpers.ts →
  - useTypeForm.ts
  - useListParams.ts
  - helpers.ts (나머지 유틸)
```

### 2.2 useTypeForm 수정 내용

**변경 전**:

```ts
register: (objPath: string) => ({
  value: srcValue,
  onChange: (_e: any, prop?: any) => {
    if (prop && "value" in prop) {
      updateValue(prop.value);
    } else if (prop && "checked" in prop) {
      updateValue(prop.checked);
    }
  },
  checked: typeof srcValue === "boolean" ? srcValue : undefined,
  error,
});
```

**변경 후**:

```ts
register: (objPath: string) => {
  const srcValue = get(form, objPath) as unknown;
  const error = errorObjs.get(objPath);

  const updateValue = (newValue: any) => {
    // ... 기존 로직
  };

  return {
    value: srcValue ?? (typeof srcValue === "boolean" ? false : ""),
    onValueChange: (value: any) => updateValue(value),
    error,
  };
};
```

**주요 변경사항**:

- `onChange` → `onValueChange`
- semantic-ui 스타일의 `(_e, prop)` 시그니처 제거
- 단순하게 `(value) => updateValue(value)`로 통일
- `checked` prop 제거 (value로 통일)

### 2.3 lodash-es → radashi 변환

```ts
// Before
import { get as _get, set as _set, cloneDeep, intersection, isObject, uniq } from "lodash-es";

// After
import { get, set, clone, intersects } from "radashi";

// 변환 매핑
_get → get
_set → set
cloneDeep → clone
intersection → intersects (사용처 확인 필요)
uniq → unique
isObject → isObject (radashi에 있는지 확인)
```

**주의사항**: radashi API가 lodash와 다를 수 있으므로 각 함수별로 확인 필요

## Phase 3: useListParams 통합

### 3.1 현재 상황

- `useListParams` - react-router-dom 기반
- `useListParams` - @tanstack/react-router 기반

### 3.2 통합 전략

**방안 A: useListParams 하나로 통합** (권장)

```ts
// useListParams.ts
export function useListParams<U extends z.ZodType<any>, T extends Partial<z.infer<U>>>(
  zType: U,
  defaultValue: T,
  options?: {
    disableSearchParams?: boolean;
  },
) {
  // tanstack-router만 사용
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();

  // ... 기존 useListParams 로직

  return {
    listParams,
    setListParams,
    register: (name: ZodKeys) => ({
      value: currentValue ?? "",
      onValueChange: (value: any) => updateListParams(value),
    }),
  };
}
```

**방안 B: 별도 파일 유지**

- react-router-dom 의존성이 완전히 제거될 때까지 임시로 유지
- 최종적으로는 방안 A로 수렴

**선택**: 방안 A (react-router-dom 완전 제거)

### 3.3 register 수정

```ts
// Before
register: (name: ZodKeys) => {
  if (name === "page") {
    return {
      activePage: (listParams as any).page ?? 1,
      onPageChange: (_event, data: PaginationProps) => {
        setListParams({ ...listParams, page: Number(data.activePage ?? 1) });
      },
      onChange: (_e, prop) => { ... }
    };
  } else {
    return {
      value: currentValue ?? "",
      onChange: (_e, prop) => { ... },
      checked: ...
    };
  }
}

// After
register: (name: ZodKeys) => {
  if (name === "page") {
    return {
      value: (listParams as any).page ?? 1,
      onValueChange: (page: number) => {
        setListParams({ ...listParams, page });
      }
    };
  } else {
    return {
      value: currentValue ?? "",
      onValueChange: (value: any) => {
        setListParams({
          ...listParams,
          page: 1,
          [name]: value === "" ? undefined : value,
        });
      }
    };
  }
}
```

**주의**: Pagination 컴포넌트도 같이 수정 필요할 수 있음

## Phase 4: 의존성 정리

### 4.1 package.json 수정

**제거**:

```json
{
  "dependencies": {
    "lodash-es": "catalog:" // 제거
  },
  "peerDependencies": {
    "react-router-dom": "catalog:" // 제거
  },
  "devDependencies": {
    "@types/lodash-es": "catalog:", // 제거
    "react-router-dom": "catalog:" // 제거
  }
}
```

**확인 (이미 있음)**:

```json
{
  "dependencies": {
    "radashi": "catalog:" // 이미 있음
  },
  "peerDependencies": {
    "@tanstack/react-router": "catalog:" // 이미 있음
  }
}
```

### 4.2 import 정리

```bash
# 전체 검색
grep -r "react-router-dom" src/
grep -r "lodash-es" src/
grep -r "from 'lodash-es'" src/

# 전부 제거 및 변경
```

## Phase 5: 파일 구조 재정리

### 5.1 새로운 구조

```
src/lib/
├── helpers.ts          # 기타 유틸 함수들
├── useTypeForm.ts      # 폼 관리 훅
├── useListParams.ts    # 리스트 파라미터 관리 훅
├── caster.ts          # 기존 유지
└── index.ts           # export 통합
```

### 5.2 helpers.ts 남길 함수들

```ts
// helpers.ts
export { hidden };
export { searchParamsToParams };
export { paramsToSearchParams };
export { useGoBack };
export { useSelection };
export { sqlDateToDateString };
export { numF, dateF, datetimeF };
export { arrayableToArray };
export { useModal };
export { caller };
export type { ... };
```

### 5.3 index.ts 업데이트

```ts
// src/lib/index.ts
export * from "./helpers";
export * from "./useTypeForm";
export * from "./useListParams";
export * from "./caster";
```

## Phase 6: 빌드 검증

### 6.1 체크리스트

```bash
# 1. 타입 체크
cd modules/react-components
npm run build

# 2. 주요 컴포넌트 import 테스트
# - Input, Select, Checkbox 등이 정상적으로 export되는지
# - useTypeForm, useListParams가 정상 동작하는지

# 3. 타입 정의 확인
# - onValueChange가 모든 컴포넌트에서 올바른 타입인지
# - register()의 반환 타입이 맞는지
```

### 6.2 문제 발생 시 대응

**타입 에러**:

- 각 컴포넌트의 Props 인터페이스 재확인
- React.forwardRef 제네릭 타입 확인

**빌드 에러**:

- radashi import 경로 확인
- 누락된 export 확인

## Phase 7: miomock/web 마이그레이션

### 7.1 영향받는 파일 찾기

```bash
cd examples/miomock/web

# onChange 사용처 찾기
grep -r "\.\.\.register" src/

# semantic-ui 스타일 찾기
grep -r "onChange.*_e.*prop" src/
```

### 7.2 마이그레이션 패턴

**useTypeForm 사용처**:

```tsx
// Before
<Input {...register('email')} />
// onChange: (_e, {value}) => ... 자동 생성

// After (변경 없음!)
<Input {...register('email')} />
// onValueChange: (value) => ... 자동 생성
```

**useListParams 사용처**:

```tsx
// Before
<Select {...register('status')} />
// onChange: (_e, {value}) => ... 자동 생성

// After (변경 없음!)
<Select {...register('status')} />
// onValueChange: (value) => ... 자동 생성
```

**Pagination**:

```tsx
// Before
<Pagination {...register('page')} />
// onPageChange: (_e, {activePage}) => ...

// After (확인 필요)
<Pagination {...register('page')} />
// onValueChange: (page) => ...
```

### 7.3 직접 onChange 사용하는 경우

```tsx
// Before
<Input
  value={form.email}
  onChange={(_e, {value}) => setForm({...form, email: value})}
/>

// After
<Input
  value={form.email}
  onValueChange={(value) => setForm({...form, email: value})}
/>
```

### 7.4 마이그레이션 순서

1. **어드민 페이지 우선** (admin/\*/index.tsx)
   - 비교적 단순한 CRUD 페이지들
   - 패턴이 일정함
2. **공통 컴포넌트** (components/\*)
   - SearchInput.tsx 등
   - 한 번 수정하면 여러 곳에 영향

3. **메인 페이지들**
   - Sidebar.tsx
   - 기타 복잡한 로직이 있는 페이지

4. **테스트 및 검증**
   - 각 페이지 동작 확인
   - 폼 제출 정상 동작 확인

## 예상 이슈 및 대응

### Issue 1: Pagination API 변경

**문제**: Pagination이 semantic-ui의 특이한 API를 사용할 수 있음

**대응**:

- Pagination 컴포넌트도 onValueChange로 래핑
- 또는 register('page')가 Pagination 전용 props 반환

### Issue 2: 복잡한 폼 로직

**문제**: onChange에서 e.preventDefault() 같은 네이티브 이벤트 처리

**대응**:

- 컴포넌트가 onChange도 함께 제공 (패스스루)
- 필요시 onChange 직접 사용

### Issue 3: 타입 호환성

**문제**: 기존 코드가 semantic-ui 타입에 의존

**대응**:

- 점진적 마이그레이션
- 타입 에러 발생 시 명시적 타입 캐스팅

## 체크포인트

### Checkpoint 1: Phase 1-2 완료 후

- [ ] 모든 컴포넌트에 onValueChange 추가됨
- [ ] useTypeForm이 onValueChange 반환
- [ ] 간단한 예제로 동작 확인

### Checkpoint 2: Phase 3-5 완료 후

- [ ] react-router-dom 의존성 제거됨
- [ ] lodash-es 의존성 제거됨
- [ ] 파일 구조 재정리됨
- [ ] 빌드 성공

### Checkpoint 3: Phase 7 완료 후

- [ ] miomock/web의 모든 페이지 마이그레이션
- [ ] 개발 서버 정상 동작
- [ ] 주요 기능 테스트 통과

## 타임라인 (예상)

- Phase 1-2: 2-3시간 (컴포넌트 수정 + useTypeForm)
- Phase 3-5: 1-2시간 (의존성 정리 + 파일 분리)
- Phase 6: 30분 (빌드 검증)
- Phase 7: 3-4시간 (miomock/web 마이그레이션)

**총 예상 시간**: 7-10시간

## 다음 단계

1. Phase 1 시작: input.tsx 수정
2. 작은 단위로 커밋하면서 진행
3. 각 Phase 완료마다 동작 검증
