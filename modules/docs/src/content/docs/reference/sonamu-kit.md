---
title: Sonamu Kit
description: Sonamu Kit 레퍼런스 문서
tableOfContents:
  maxHeadingLevel: 4
---

Sonamu Kit은 Sonamu 프로젝트에서 사용하는 라이브러리를 모아놓은 패키지입니다.

## react-sui

Sonamu UI 라이브러리

### base components

semantic-ui-react를 기반으로 개발된 컴포넌트 라이브러리

#### AddButton

AddButton은 새로운 항목을 추가하는 버튼입니다.

- `currentRoute`: 현재 라우트를 기재합니다.
- `as`: 렌더링할 HTML 엘리먼트를 지정합니다. 기본값은 `Link`입니다.
- `to`: 버튼을 클릭했을 때 이동할 경로를 지정합니다. 기본값은 `${currentRoute}/form`입니다.
- `state`: 이동할 때 함께 전달할 상태를 지정합니다. 기본값은 `{ from: currentRoute }`입니다.
- `color`: 버튼의 색상을 지정합니다. `semantic-ui-react`의 색상을 사용할 수 있습니다. 기본값은 `blue`입니다.
- `size`: 버튼의 크기를 지정합니다. `semantic-ui-react`의 크기를 사용할 수 있습니다. 기본값은 `tiny`입니다.
- `icon`: 버튼에 표시할 아이콘을 지정합니다. `semantic-ui-react`의 아이콘을 사용할 수 있습니다.
- `label`: 버튼에 표시할 라벨을 지정합니다.
- 그 외 [`semantic-ui-react`의 `Button` 컴포넌트](https://react.semantic-ui.com/elements/button/)의 props를 사용할 수 있습니다.

#### AppBreadcrumbs

AppBreadcrumbs는 페이지의 경로를 표시하는 컴포넌트입니다.

- `children`: 경로를 표시할 컴포넌트를 지정합니다.
- `semantic-ui-react`의 `Breadcrumb` 컴포넌트를 사용합니다.

#### BackLink

BackLink는 이전 페이지로 이동하는 버튼 컴포넌트입니다.

- `useGoBack` 훅을 사용하여 이전 페이지로 이동합니다.
- `to`: [Sonamu Kit의 `useGoBack` 훅](#usegoback)의 `to` prop을 지정합니다.
- 그 외 [`semantic-ui-react`의 `Button` 컴포넌트](https://react.semantic-ui.com/elements/button/)의 props를 사용할 수 있습니다.

#### BooleanToggle

BooleanToggle은 불리언 값을 토글하는 버튼 컴포넌트입니다.

- `value`: 불리언 값을 지정합니다.
- `onChange`: 불리언 값을 변경할 때 호출할 함수를 지정합니다.
- 그 외 [`semantic-ui-react`의 `Checkbox` 컴포넌트](https://react.semantic-ui.com/modules/checkbox/)의 props를 사용할 수 있습니다.
- Sonamu Kit의 `useTypeForm` 훅과 함께 사용할 수 있습니다.

```tsx
import { BooleanToggle } from "@sonamu-kit/react-sui";

<BooleanToggle {...register("is_active")} />;
```

#### ButtonSet

#### DelButton

#### EditButton

#### ImageUploaderFrame

#### KeyValueTable

#### LinkInput

#### NumberInput

#### Panel

#### SQLDateInput

#### SQLDateRangePicker

#### SQLDateTimeInput

### helpers

<!-- ~@react-sui/src/helpers에 정의된 함수 중 프로젝트에서 사용 중인 것들만 정리~ -->

lodash-es, qs, zod, react-router-dom 등의 라이브러리를 사용해 작성된 helper 함수

#### caster

ZodType을 이용해 raw를 Type Coercing하는 함수

#### dynamic-route

loadDynamicRoutes: 동적 라우트를 로드

#### useTypeForm

Form state를 관리하는 hook

##### Props

| Name           | Type                                  | Description                  |
| -------------- | ------------------------------------- | ---------------------------- |
| `zType(T)`     | `z.ZodObject<any> \| z.ZodArray<any>` | `sonamu.generated`의 ZodType |
| `defaultValue` | `z.infer<T>`                          | 초기값                       |

##### Return

```tsx
const { form, setForm, register, addError, removeError, clearError, reset } =
  useTypeForm(zType, defaultValue);
// zType을 통해 form의 타입을 체크할 수 있음

<input {...register("title")} />;

// 위와 동일하게 동작
const { onChange, value } = register("title");

<input onChange={onChange} value={value} />;
```

| Name          | Type                                                           | Description                                             |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| `form`        | `z.infer<T>`                                                   | Form state                                              |
| `setForm`     | `(form: z.infer<T>) => void`                                   | Form state를 변경하는 함수                              |
| `register`    | `(name: string) => { onChange: (e: any) => void; value: any }` | Form의 입력 요소를 등록하고 유효성 검사를 수행하는 함수 |
| `addError`    | `(name: string) => void`                                       | 입력 요소에 에러 표시                                   |
| `removeError` | `(name: string) => void`                                       | 입력 요소의 에러 표시 제거                              |
| `clearError`  | `() => void`                                                   | 모든 입력 요소의 에러 표시 제거                         |
| `reset`       | `() => void`                                                   | Form을 `defaultValue`로 초기화                          |

:::note
`register`는 [react-hook-form의 register](https://react-hook-form.com/docs/useform/register)와 유사
:::

#### useListParams

리스트 페이지에서 사용하는 파라미터를 관리하는 hook

##### Props

| Name           | Type                                  | Description                  |
| -------------- | ------------------------------------- | ---------------------------- |
| `zType(T)`     | `z.ZodObject<any> \| z.ZodArray<any>` | `sonamu.generated`의 ZodType |
| `defaultValue` | `z.infer<T>`                          | 초기값                       |
| `options`      | `{ disableSearchParams: boolean }`    | URL 파라미터 사용 여부       |

##### Return

```tsx
const { listParams, setListParams, register } = useListParams(
  zType,
  defaultValue
);

<input {...register("title")} />;

// 위와 동일하게 동작
const { onChange, value } = register("title");

<input onChange={onChange} value={value} />;
```

| Name            | Type                                                           | Description                                                      |
| --------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `listParams`    | `z.infer<T>`                                                   | List 파라미터 state                                              |
| `setListParams` | `(listParams: z.infer<T>) => void`                             | List 파라미터 state를 변경하는 함수                              |
| `register`      | `(name: string) => { onChange: (e: any) => void; value: any }` | List 파라미터의 입력 요소를 등록하고 유효성 검사를 수행하는 함수 |

#### useGoBack

React Router의 `useLocation`과 `useNavigate`를 이용해 이전 페이지로 이동하는 기능을 제공하는 훅

- `location.state.from`이 `to`와 같으면 이전 페이지로 이동, 아니면 `to`로 이동 ??

#### useSelection

선택된 항목을 관리하는 hook

##### Props

| Name                  | Type  | Description    |
| --------------------- | ----- | -------------- |
| `allKeys`             | `T[]` | 전체 항목      |
| `defaultSelectedKeys` | `T[]` | 초기 선택 항목 |

SQL Date String을 Date String으로 변환

#### numF

`Intl.NumberFormat`을 이용해 숫자를 포맷팅

- locales: 실행 환경의 기본 locale 사용

#### dateF

SQL Date String을 Date String으로 변환

- e.g. `2021-10-01 00:00:00` -> `2021-10-01`

#### datetimeF

SQL Date String을 DateTime String으로 변환

- e.g. `2021-10-01 00:00:00` -> `2021-10-01 00:00:00`
- ??
