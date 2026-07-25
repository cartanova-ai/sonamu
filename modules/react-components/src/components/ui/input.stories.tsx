import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Input } from "./input";

const meta = {
  component: Input,
  tags: ["autodocs"],
  args: {
    placeholder: "입력하세요...",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render(args) {
    const [value, setValue] = useState("");
    return <Input {...args} value={value} onValueChange={(v) => setValue(v)} />;
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: "비활성화됨",
  },
};

// clearable: 내용이 채워지면 오른쪽에 X 아이콘이 뜨고, 누르면 초기화된다. (controlled)
export const Clearable: Story = {
  args: {
    clearable: true,
  },
  render: function Render(args) {
    const [value, setValue] = useState("초기값");
    return <Input {...args} value={value} onValueChange={(v) => setValue(v)} />;
  },
};

// uncontrolled 입력에서도 clear가 동작한다.
export const ClearableUncontrolled: Story = {
  args: {
    clearable: true,
    defaultValue: "초기값",
  },
};
