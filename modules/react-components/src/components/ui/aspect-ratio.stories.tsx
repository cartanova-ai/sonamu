import { type Meta, type StoryObj } from "@storybook/react-vite";

import { AspectRatio } from "./aspect-ratio";

const meta = {
  component: AspectRatio,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof AspectRatio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    return (
      <div className="w-80">
        <AspectRatio ratio={16 / 9}>
          <div className="flex h-full w-full items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
            16:9 비율
          </div>
        </AspectRatio>
      </div>
    );
  },
};

export const Square: Story = {
  render: function Render() {
    return (
      <div className="w-64">
        <AspectRatio ratio={1}>
          <div className="flex h-full w-full items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
            1:1 비율
          </div>
        </AspectRatio>
      </div>
    );
  },
};
