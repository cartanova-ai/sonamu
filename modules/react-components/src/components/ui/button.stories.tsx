import { type Meta, type StoryObj } from "@storybook/react-vite";

import { Button, type buttonVariantsConfig } from "./button";

const variantKeys = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
  "red",
  "yellow",
  "green",
  "blue",
  "cyan",
  "purple",
  "pink",
  "orange",
] satisfies Array<keyof typeof buttonVariantsConfig.variant>;
const sizeKeys = ["xs", "sm", "default", "lg", "xl"] satisfies Array<
  keyof typeof buttonVariantsConfig.size
>;

const meta = {
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: variantKeys },
    size: { control: "select", options: sizeKeys },
  },
  args: {
    children: "Button",
    variant: "default",
    size: "default",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      {variantKeys.map((v) => (
        <Button key={v} {...args} variant={v}>
          {v}
        </Button>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      {sizeKeys.map((s) => (
        <Button key={s} {...args} size={s}>
          {s}
        </Button>
      ))}
    </div>
  ),
};
