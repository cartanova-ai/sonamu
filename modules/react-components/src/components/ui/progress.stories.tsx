import { type Meta, type StoryObj } from "@storybook/react-vite";

import { Progress } from "./progress";

const meta = {
  component: Progress,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-80">
      <Progress value={66} />
    </div>
  ),
};

export const Steps: Story = {
  render: () => (
    <div className="w-80 space-y-4">
      <Progress value={33} />
      <Progress value={66} />
      <Progress value={100} />
    </div>
  ),
};
