import { Dialog, DialogContent, DialogDescription } from "@sonamu-kit/react-components/components";
import { atom, useAtom } from "jotai";
import type React from "react";
import { useEffect } from "react";

type ExtendedDialogProps = {
  onCompleted?: (data?: unknown) => void;
  onControlledOpen?: () => void;
  onControlledClose?: () => void;
  className?: string;
};

export const commonModalAtom = atom<
  {
    open: boolean;
    reactNode: React.ReactNode | null;
  } & ExtendedDialogProps
>({
  open: false,
  reactNode: null,
});

export type CommonModalProps = {};

export function CommonModal({}: CommonModalProps) {
  const [atomValue, setAtomValue] = useAtom(commonModalAtom);
  const { open, reactNode, onControlledOpen, onControlledClose, className } = atomValue;

  const closeAndClear = () => {
    if (onControlledClose) {
      onControlledClose();
    }

    setAtomValue({
      open: false,
      reactNode: null,
    });
  };

  useEffect(() => {
    if (open && onControlledOpen) {
      onControlledOpen();
    }
  }, [open, onControlledOpen]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && closeAndClear()}>
      <DialogContent className={className}>
        <DialogDescription asChild>{reactNode}</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

export function useCommonModal() {
  const [atomValue, setAtomValue] = useAtom(commonModalAtom);
  const { open, reactNode, onCompleted, onControlledClose } = atomValue;

  const openModal = (reactNode: React.ReactNode, props?: ExtendedDialogProps) => {
    setAtomValue({
      open: true,
      reactNode,
      ...props,
    });
  };

  const closeModal = () => {
    setAtomValue({
      open: false,
      reactNode: null,
    });
    if (onControlledClose) {
      onControlledClose();
    }
  };

  const doneModal = (data?: unknown) => {
    closeModal();
    if (onCompleted) {
      onCompleted(data);
    }
  };

  return {
    open,
    reactNode,
    openModal,
    closeModal,
    doneModal,
  };
}
