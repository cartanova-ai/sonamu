import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { EnumSelect } from "./enum-select";

const fruitEnum = { options: ["apple", "banana", "cherry", "grape"] as const };
const fruitLabels = {
  apple: "사과",
  banana: "바나나",
  cherry: "체리",
  grape: "포도",
};

const meta = {
  component: EnumSelect,
  tags: ["autodocs"],
  args: {
    enum: fruitEnum,
    labels: fruitLabels,
    placeholder: "과일을 선택하세요",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof EnumSelect>;

export default meta;
type MetaArgs = typeof meta.args;

export const Single: StoryObj<MetaArgs> = {
  render: function Render(args) {
    const [value, setValue] = useState("");
    return (
      <EnumSelect
        {...args}
        value={value}
        onValueChange={(nextValue) => setValue(Array.isArray(nextValue) ? "" : (nextValue ?? ""))}
      />
    );
  },
};

export const Multiple: StoryObj<MetaArgs> = {
  render: function Render(args) {
    const [values, setValues] = useState<string[]>([]);
    return (
      <EnumSelect
        {...args}
        multiple
        value={values}
        onValueChange={(nextValue) => setValues(Array.isArray(nextValue) ? nextValue : [])}
      />
    );
  },
};
