import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { TagInput } from "./tag-input";

const meta = {
  component: TagInput,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof TagInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [tags, setTags] = useState<string[]>([]);

    return (
      <div className="w-80">
        <TagInput value={tags} onChange={setTags} placeholder="태그 입력" />
      </div>
    );
  },
};

export const WithPresetTags: Story = {
  render: function Render() {
    const [tags, setTags] = useState<string[]>(["리액트", "타입스크립트", "스토리북"]);

    return (
      <div className="w-80">
        <TagInput value={tags} onChange={setTags} placeholder="태그 입력" />
      </div>
    );
  },
};
