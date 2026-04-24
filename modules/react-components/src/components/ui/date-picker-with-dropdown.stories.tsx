import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { DatePickerWithDropdown } from "./date-picker";

const meta = {
  component: DatePickerWithDropdown,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof DatePickerWithDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [date, setDate] = useState<Date | undefined>(undefined);

    return (
      <div className="w-80">
        <DatePickerWithDropdown
          value={date}
          onValueChange={setDate}
          placeholder="연/월 드롭다운으로 선택"
        />
      </div>
    );
  },
};
