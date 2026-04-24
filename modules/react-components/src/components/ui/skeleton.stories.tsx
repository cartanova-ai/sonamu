import { type Meta, type StoryObj } from "@storybook/react-vite";

import { Skeleton } from "./skeleton";

const meta = {
  component: Skeleton,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    return <Skeleton className="h-4 w-48" />;
  },
};

export const Composition: Story = {
  render: function Render() {
    return (
      <div className="w-80 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  },
};
