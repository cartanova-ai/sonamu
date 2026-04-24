import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Textarea } from "./textarea";

const meta = {
  component: Textarea,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    return (
      <div className="w-80">
        <Textarea placeholder="내용을 입력해주세요" rows={4} />
      </div>
    );
  },
};

export const Controlled: Story = {
  render: function Render() {
    const [value, setValue] = useState("");
    return (
      <div className="w-80 space-y-2">
        <Textarea
          placeholder="내용을 입력해주세요"
          rows={4}
          value={value}
          onValueChange={(v) => setValue(v)}
        />
        <p className="text-sm text-muted-foreground">현재 길이: {value.length}자</p>
      </div>
    );
  },
};
