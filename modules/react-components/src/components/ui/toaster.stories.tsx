import { type Meta, type StoryObj } from "@storybook/react-vite";

import { useToast } from "../../hooks/use-toast";
import { Button } from "./button";
import { Toaster } from "./toaster";

const meta = {
  component: Toaster,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const { toast: showToast } = useToast();

    return (
      <div className="p-8 space-x-2">
        <Button
          onClick={() => {
            showToast({
              title: "저장 완료",
              description: "변경 사항이 성공적으로 저장되었습니다.",
            });
          }}
        >
          저장 성공 알림
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            showToast({
              title: "저장 실패",
              description:
                "네트워크 오류로 변경 사항을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
              variant: "destructive",
            });
          }}
        >
          저장 실패 알림
        </Button>
        <Toaster />
      </div>
    );
  },
};
