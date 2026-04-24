import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { DatePicker } from "./date-picker";

const meta = {
  component: DatePicker,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [date, setDate] = useState<Date | undefined>(undefined);

    return (
      <div className="w-80">
        <DatePicker value={date} onValueChange={setDate} placeholder="날짜를 선택하세요" />
      </div>
    );
  },
};
