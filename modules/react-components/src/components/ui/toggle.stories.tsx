import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Toggle } from "./toggle";

const meta = {
  component: Toggle,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [pressed, setPressed] = useState(false);
    return (
      <Toggle value={pressed} onValueChange={setPressed} aria-label="굵게">
        굵게
      </Toggle>
    );
  },
};

export const Variants: Story = {
  render: function Render() {
    return (
      <div className="flex items-center gap-2">
        <Toggle variant="default" aria-label="default">
          기본
        </Toggle>
        <Toggle variant="default" pressed aria-label="default-pressed">
          기본 선택됨
        </Toggle>
        <Toggle variant="outline" aria-label="outline">
          아웃라인
        </Toggle>
        <Toggle variant="outline" pressed aria-label="outline-pressed">
          아웃라인 선택됨
        </Toggle>
      </div>
    );
  },
};
