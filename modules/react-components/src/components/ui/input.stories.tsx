import type { Meta, StoryObj } from "@storybook/react-vite";
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
