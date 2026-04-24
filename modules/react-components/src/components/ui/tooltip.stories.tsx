import { type Meta, type StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

const meta = {
  component: Tooltip,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">마우스를 올려보세요</Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>툴팁 메시지입니다.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
