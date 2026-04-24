import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Slider } from "./slider";

const meta = {
  component: Slider,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [value, setValue] = useState<number[]>([50]);
    return (
      <div className="w-80 space-y-2">
        <Slider value={value} min={0} max={100} onValueChange={(v) => setValue([v])} />
        <p className="text-sm text-muted-foreground">현재 값: {value[0]}</p>
      </div>
    );
  },
};

// 주의: 컴포넌트 내부 구현상 onValueChange는 첫 번째 핸들의 값만 number로 전달합니다.
// 따라서 Range 스토리는 defaultValue로 초기 범위를 보여주는 용도로만 사용합니다.
export const Range: Story = {
  args: {
    defaultValue: [20, 80],
    min: 0,
    max: 100,
    className: "w-80",
  },
};

export const Stepped: Story = {
  args: {
    defaultValue: [50],
    min: 0,
    max: 100,
    step: 10,
    className: "w-80",
  },
};
