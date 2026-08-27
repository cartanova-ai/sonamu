import { type Meta, type StoryObj } from "@storybook/react-vite";

import { Badge, type badgeVariantsConfig } from "./badge";

const variantKeys = ["default", "secondary", "destructive", "outline"] satisfies Array<
  keyof typeof badgeVariantsConfig.variant
>;

const meta = {
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: variantKeys },
  },
  args: {
    children: "Badge",
    variant: "default",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      {variantKeys.map((v) => (
        <Badge key={v} {...args} variant={v}>
          {v}
        </Badge>
      ))}
    </div>
  ),
};
