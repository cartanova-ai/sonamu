import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { type DateRange } from "react-day-picker";
import CalendarIcon from "~icons/lucide/calendar";

import { DatePickerWithRange } from "./date-picker";

const meta = {
  component: DatePickerWithRange,
  tags: ["autodocs"],
  args: {
    CalendarIcon,
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof DatePickerWithRange>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [range, setRange] = useState<DateRange | undefined>(undefined);

    return (
      <div className="w-[28rem]">
        <DatePickerWithRange
          CalendarIcon={CalendarIcon}
          value={range}
          onValueChange={setRange}
          placeholder="기간을 선택하세요"
        />
      </div>
    );
  },
};
