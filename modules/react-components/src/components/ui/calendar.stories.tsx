import { type Meta, type StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Calendar, type DateRange } from "./calendar";

const meta = {
  component: Calendar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleDate: Story = {
  render: function Render() {
    const [date, setDate] = React.useState<Date | undefined>(new Date());

    return (
      <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border" />
    );
  },
};

export const Range: Story = {
  render: function Render() {
    const today = new Date();
    const [range, setRange] = React.useState<DateRange | undefined>({
      from: today,
      to: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5),
    });

    return (
      <Calendar
        mode="range"
        selected={range}
        onSelect={setRange}
        numberOfMonths={2}
        className="rounded-md border"
      />
    );
  },
};
