import { Button, DialogTitle } from "@sonamu-kit/react-components/components";
import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useSetAtom } from "jotai";
import { useCallback } from "react";

import { CommonModal, commonModalAtom } from "./CommonModal";

const meta = {
  component: CommonModal,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof CommonModal>;

export default meta;
type Story = StoryObj<typeof meta>;

function ModalTrigger() {
  const setModal = useSetAtom(commonModalAtom);

  const onCompleted = useCallback(() => {
    console.log("[CommonModal] completed");
  }, []);
  const onControlledClose = useCallback(() => {
    console.log("[CommonModal] closed");
  }, []);

  const openModal = useCallback(() => {
    setModal({
      open: true,
      reactNode: (
        <div className="flex flex-col gap-2 p-4">
          <DialogTitle className="text-lg font-semibold">샘플 모달</DialogTitle>
          <p className="text-sm text-muted-foreground">
            카르타노바 소나무 프레임워크의 공통 모달 시연입니다.
          </p>
        </div>
      ),
      onCompleted,
      onControlledClose,
    });
  }, [setModal, onCompleted, onControlledClose]);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={openModal}>모달 열기</Button>
      <CommonModal />
    </div>
  );
}

export const Default: Story = {
  render: () => <ModalTrigger />,
};
