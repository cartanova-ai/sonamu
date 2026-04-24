import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Label } from "./label";
import { Switch } from "./switch";

const meta = {
  component: Switch,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [checked, setChecked] = useState(false);
    return (
      <div className="flex items-center gap-2">
        <Switch id="airplane-mode" value={checked} onValueChange={setChecked} />
        <Label htmlFor="airplane-mode">비행기 모드</Label>
      </div>
    );
  },
};

export const Checked: Story = {
  render: function Render() {
    const [checked, setChecked] = useState(true);
    return (
      <div className="flex items-center gap-2">
        <Switch id="airplane-mode-on" value={checked} onValueChange={setChecked} />
        <Label htmlFor="airplane-mode-on">비행기 모드</Label>
      </div>
    );
  },
};
