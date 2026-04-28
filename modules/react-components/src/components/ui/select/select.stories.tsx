import { type Meta, type StoryObj } from "@storybook/react-vite";
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

// 여기서는 다른 story들과 다르게 Story를 StoryObj<typeof meta>가 아니라 StoryObj<typeof meta.args>로 정의합니다.
// 이는 근본적으로 Storybook이 Select와 안 맞는 구석이 있어서 그렇습니다.
// Select 컴포넌트의 prop은 discriminated union 타입입니다.
// 그런데 Storybook은 discriminated union props를 만나면 "특정 필드(multiple/async)로 구분되는 분기 가능 타입"으로 놔두지 않고,
// 모든 분기를 한 번에 만족시켜야 하는 타입으로 decay시켜버립니다.
// 이렇게 되면 두 가지 문제가 생깁니다:
//  1. 스토리에 args가 요구되는데, 이 args를 쓸 때 discrimination이 작동 안 합니다. 그냥 모든 분기에 등장하는 타입들의 교집합을 다 써줘야 해요. 이건 애초에 가능하지도 않습니다.
//  2. render 함수에서 받은 args도 그 짬뽕 타입이 되다 보니, 그걸 Select가 못 먹습니다(not assignable).
// 이를 해결하기 위해 Story 타입을 만들 때 typeof meta 대신 typeof meta.args만 넘기게 했어요.
// 다행히 StoryObj가 제네릭 인자로 TMetaOrCmpOrArgs를 받아서, meta 말고 meta.args를 넘겨도 되거든요!
// 이렇게 되면 meta의 공통 args를 여러 스토리에서 활용할 수 있습니다 ㅋㅎ
// 다만 StoryObj에 meta의 다른 정보(component 등)는 타입으로 넘어가지는 않지만, 그건 런타임에 다 잘 넘어가니 문제 없습니다!
type Story = StoryObj<typeof meta.args>;

export const SingleSync: Story = {
  render: function Render(args) {
    const [value, setValue] = useState<string | undefined>(undefined);
    return <Select {...args} value={value} onValueChange={(v) => setValue(v)} clearable />;
  },
};

export const MultiSync: Story = {
  render: function Render(args) {
    const [values, setValues] = useState<string[]>([]);
    return (
      <Select {...args} multiple value={values} onValueChange={(v) => setValues(v)} clearable />
    );
  },
};
