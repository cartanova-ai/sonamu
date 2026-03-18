import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const meta = {
  component: Dialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">다이얼로그 열기</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>제목</DialogTitle>
          <DialogDescription>다이얼로그의 설명 텍스트입니다.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">다이얼로그 내용이 여기에 표시됩니다.</p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <Button>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
