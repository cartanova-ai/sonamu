import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Combobox, type ComboboxOption } from "./combobox";

const meta = {
  component: Combobox,
  tags: ["autodocs"],
  args: {
    options: [],
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

const frameworks: ComboboxOption[] = [
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "svelte", label: "Svelte" },
  { value: "solid", label: "Solid" },
  { value: "qwik", label: "Qwik" },
];

export const Default: Story = {
  render: function Render() {
    const [value, setValue] = useState<string | undefined>(undefined);
    return (
      <div className="w-80">
        <Combobox
          options={frameworks}
          value={value}
          onValueChange={setValue}
          placeholder="프레임워크를 선택하세요"
          clearable
        />
      </div>
    );
  },
};

export const EmptyState: Story = {
  render: function Render() {
    const [value, setValue] = useState<string | undefined>(undefined);
    return (
      <div className="w-80">
        <Combobox
          options={[]}
          value={value}
          onValueChange={setValue}
          placeholder="사용 가능한 항목이 없습니다"
          emptyText="사용 가능한 항목이 없습니다"
        />
      </div>
    );
  },
};
