import { type Meta, type StoryObj } from "@storybook/react-vite";

import { Avatar, AvatarFallback } from "./avatar";

const meta = {
  component: Avatar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback>홍</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>KS</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>정</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const Fallback: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>홍</AvatarFallback>
    </Avatar>
  ),
};
