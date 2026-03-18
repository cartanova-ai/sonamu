import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Select, type SelectProps } from "./select";

type StringItem = string;

const fruitItems: StringItem[] = ["사과", "바나나", "체리", "포도", "딸기", "수박", "오렌지"];

const meta = {
  component: Select,
  tags: ["autodocs"],
  args: {
    items: fruitItems,
    placeholder: "과일을 선택하세요",
  },
  parameters: { layout: "centered" },
} satisfies Meta<SelectProps<StringItem>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleSync: Story = {
  render: function Render(args) {
    const [value, setValue] = useState<string | undefined>(undefined);
    return (
      <div className="w-64 space-y-2">
        <Select {...args} value={value} onValueChange={(v) => setValue(v)} clearable />
        <p className="text-sm text-muted-foreground">선택: {value ?? "(없음)"}</p>
      </div>
    );
  },
};

export const MultiSync: Story = {
  render: function Render(args) {
    const [values, setValues] = useState<string[]>([]);
    return (
      <div className="w-64 space-y-2">
        <Select {...args} multiple value={values} onValueChange={(v) => setValues(v)} />
        <p className="text-sm text-muted-foreground">선택: {values.join(", ") || "(없음)"}</p>
      </div>
    );
  },
};
