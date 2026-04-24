import { type Meta, type StoryObj } from "@storybook/react-vite";

import { Separator } from "./separator";

const meta = {
  component: Separator,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-80 space-y-4">
      <div>섹션 1</div>
      <Separator />
      <div>섹션 2</div>
      <Separator />
      <div>섹션 3</div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-10 items-center gap-4 text-sm">
      <div>대시보드</div>
      <Separator orientation="vertical" />
      <div>환자</div>
      <Separator orientation="vertical" />
      <div>항생제 관리</div>
    </div>
  ),
};
