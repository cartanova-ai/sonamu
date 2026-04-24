import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Checkbox } from "./checkbox";
import { Label } from "./label";

const meta = {
  component: Checkbox,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [checked, setChecked] = useState(false);
    return (
      <div className="flex items-center gap-2">
        <Checkbox id="terms" value={checked} onValueChange={setChecked} />
        <Label htmlFor="terms">이용약관에 동의합니다</Label>
      </div>
    );
  },
};

export const Checked: Story = {
  render: function Render() {
    const [checked, setChecked] = useState(true);
    return (
      <div className="flex items-center gap-2">
        <Checkbox id="notify" value={checked} onValueChange={setChecked} />
        <Label htmlFor="notify">알림 받기</Label>
      </div>
    );
  },
};
