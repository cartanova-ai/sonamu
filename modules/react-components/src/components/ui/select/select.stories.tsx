import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Select } from "./select";

const fruitItems = ["사과", "바나나", "체리", "포도", "딸기", "수박", "오렌지"];

const meta = {
  component: Select,
  tags: ["autodocs"],
  args: {
    items: fruitItems,
    placeholder: "과일을 선택하세요",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Select>;

export default meta;
type MetaArgs = typeof meta.args;

export const SingleSync: StoryObj<MetaArgs> = {
  render: function Render(args) {
    const [value, setValue] = useState<string | undefined>(undefined);
    return <Select {...args} value={value} onValueChange={(v) => setValue(v)} clearable />;
  },
};

export const MultiSync: StoryObj<MetaArgs> = {
  render: function Render(args) {
    const [values, setValues] = useState<string[]>([]);
    return (
      <Select {...args} multiple value={values} onValueChange={(v) => setValues(v)} clearable />
    );
  },
};
