import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, buttonVariantsConfig } from "./button";

const variantKeys = Object.keys(buttonVariantsConfig.variant);
const sizeKeys = Object.keys(buttonVariantsConfig.size);

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
        <Button key={v} {...args} variant={v as typeof args.variant}>
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
        <Button key={s} {...args} size={s as typeof args.size}>
          {s}
        </Button>
      ))}
    </div>
  ),
};
