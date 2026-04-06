---
title: "Storybook 10 StoryObj 타입이 discriminated union props 컴포넌트에서 동작하지 않는 문제 해결"
category: integration-issues
tags:
  - storybook-10
  - typescript
  - discriminated-union
  - react-components
  - contravariance
  - StoryObj
  - Meta
module: "@sonamu-kit/react-components"
symptom: |
  StoryObj<typeof meta>를 사용할 때 args가 union의 모든 분기를 동시에 만족하도록 강제되어,
  discriminated union props를 가진 컴포넌트의 스토리를 작성할 수 없음.
root_cause: |
  Storybook의 Meta<typeof Component> -> StoryObj<typeof meta> 타입 체인이
  component의 props 타입을 그대로 전파하며, discriminated union에 대해
  모든 분기 동시 만족을 요구함.
  Meta의 component 필드가 ComponentType<T>로 체크되어 contravariance가 발생.
solution_summary: |
  StoryObj<MetaArgs> 패턴으로 component 타입 체인을 우회.
  type MetaArgs = typeof meta.args로 공통 args 타입만 추출하여 StoryObj에 전달.
date: "2026-03-18"
---

# Storybook 10 + Discriminated Union Props 타입 Workaround

## 증상

`SelectProps`처럼 discriminated union으로 정의된 props를 가진 컴포넌트에서 Storybook 스토리를 작성할 때, `StoryObj<typeof meta>`를 사용하면 args가 모든 union 분기를 동시에 만족하도록 강제되어 타입 에러가 발생한다.

```
SelectProps = SingleSyncProps | SingleAsyncProps | MultiSyncProps | MultiAsyncProps
```

## 근본 원인

```
meta.component: typeof Select
       |
typeof meta → component 타입에서 union props 추론
       |
StoryObj<typeof meta> → args가 모든 branch를 동시에 만족해야 함 (BROKEN)
```

`StoryObj<T>`의 제네릭 `T`가 meta 타입이면, 내부적으로 `ComponentProps<T["component"]>`를 추출한다. 이 과정에서 discriminated union이 풀리면서 모든 분기의 필수 필드를 동시에 요구하게 된다.

추가로, Select는 `forwardRef` + 타입 단언으로 제네릭을 유지하는데, `ComponentProps` 추출 시 제네릭이 `unknown`으로 소거되면서 `valueKey`가 필수가 되는 등 부차적 문제도 발생한다.

## 시도했으나 실패한 접근

| 시도                                         | 실패 원인                                                         |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `StoryObj<typeof meta>`                      | union props가 component에서 args 요구사항으로 전파                |
| `StoryObj` (제네릭 없음)                     | args 타입이 `{}`가 되어 render 함수에서 타입 정보 소실            |
| `Meta<SelectCommonProps>` + `Pick`           | component 필드의 contravariance 체크 실패                         |
| `Meta<(props: CommonProps) => ReactElement>` | 동일한 contravariance 문제                                        |
| `satisfies` 제거                             | `typeof meta`가 여전히 component 타입 전달                        |
| args에 discriminant 필드 채우기              | 모든 union branch 만족 요구 + generic erasure로 `valueKey` 필수화 |

## 해결: `StoryObj<MetaArgs>` 패턴

`StoryObj<T>`에 plain object 타입을 넘기면, component 타입을 거치지 않고 해당 객체를 args 타입으로 직접 사용한다.

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Select } from "./select";

const fruitItems = ["사과", "바나나", "체리", "포도", "딸기", "수박", "오렌지"];

const meta = {
  component: Select,
  tags: ["autodocs"],
  args: {
    items: fruitItems,
    placeholder: "과일을 선택하세요",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Select>;

export default meta;

// component 타입 체인 우회: meta.args 타입만 추출
type MetaArgs = typeof meta.args;

// StoryObj<MetaArgs>: args가 { items: string[]; placeholder: string }로 추론
export const SingleSync: StoryObj<MetaArgs> = {
  render: function Render(args) {
    // args.items, args.placeholder 타입 정상 추론
    const [value, setValue] = useState<string | undefined>(undefined);
    return <Select {...args} value={value} onValueChange={(v) => setValue(v)} clearable />;
  },
};

export const MultiSync: StoryObj<MetaArgs> = {
  render: function Render(args) {
    const [values, setValues] = useState<string[]>([]);
    return <Select {...args} multiple value={values} onValueChange={(v) => setValues(v)} />;
  },
};
```

### 핵심 원리

```
typeof meta.args → { items: string[]; placeholder: string } (plain object)
       |
StoryObj<MetaArgs> → args = plain object, union 개입 없음 (WORKS)
```

`StoryObj<T>`는 `T`에 `component` 필드가 있으면 component props를 추출하지만, plain object이면 그대로 args 타입으로 사용한다. `typeof meta.args`는 component 타입을 포함하지 않으므로 union 저주를 피한다.

## 영향받는 컴포넌트

| 컴포넌트          | Discriminant         | Branch 수 |
| ----------------- | -------------------- | --------- |
| **Select**        | `multiple` x `async` | 4         |
| **EnumSelect**    | `multiple`           | 2         |
| **IdAsyncSelect** | `multiple`           | 2         |

나머지 컴포넌트(Button, Input, Dialog, Sheet, Tabs 등)는 union props가 아니므로 표준 `StoryObj<typeof meta>` 사용 가능.

## 탐지 체크리스트

스토리 작성 전에 확인:

1. Props 타입이 `A | B | C` 형태의 union인가?
2. Union branch를 구분하는 discriminant 필드가 있는가? (`multiple`, `async`, `mode`, `type` 등)
3. 각 branch에 서로 다른 필수 속성이 존재하는가?

하나라도 해당하면 `StoryObj<MetaArgs>` 패턴을 사용한다.

## 3줄 규칙

1. `meta`는 `satisfies Meta<typeof Component>`로 타입 안전성 확보
2. `type MetaArgs = typeof meta.args`로 union을 우회하는 타입 추출
3. `StoryObj<MetaArgs>`로 각 스토리 정의, 모드별 props는 render에서 직접 전달

## 참조

- Storybook GitHub #29818: ArgTypes inferred incorrectly for discriminated union props
- Storybook GitHub #23966: discriminated union args 처리 제한
- TypeScript #30769: ComponentType과 props 추론 관련
- SON-385 Linear 댓글: 이 workaround에 대한 요약
