"use client";

import { atom, useAtom } from "jotai";
import type * as React from "react";
import { useEffect } from "react";

import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

type ExtendedModalProps<CompletionData = unknown> = {
  title?: string;
  description?: string;
  className?: string;
  onCompleted?: (data?: CompletionData) => void;
  onControlledOpen?: () => void;
  onControlledClose?: () => void;
};

export const commonModalAtom = atom<
  {
    open: boolean;
    reactNode: React.ReactNode | null;
  } & ExtendedModalProps
>({
  open: false,
  reactNode: null,
});

type CommonModalProps = {
  className?: string;
};

export function CommonModal({ className }: CommonModalProps) {
  const [atomValue, setAtomValue] = useAtom(commonModalAtom);
  const {
    open,
    reactNode,
    title,
    description,
    className: modalClassName,
    onControlledOpen,
    onControlledClose,
  } = atomValue;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          closeAndClear();
        }
      }}
    >
      <DialogContent className={cn("max-w-4xl", modalClassName, className)}>
        <DialogHeader>
          <DialogTitle className={!title ? "sr-only" : undefined}>{title || "Modal"}</DialogTitle>
          <DialogDescription className={!description ? "sr-only" : undefined}>
            {description || "Modal content"}
          </DialogDescription>
        </DialogHeader>
        {reactNode}
      </DialogContent>
    </Dialog>
  );
}

export function useCommonModal() {
  const [atomValue, setAtomValue] = useAtom(commonModalAtom);
  const { open, reactNode, onCompleted } = atomValue;

  const openModal = (content: React.ReactNode, props?: ExtendedModalProps) => {
    setAtomValue({
      open: true,
      reactNode: content,
      ...props,
    });
  };

  const closeModal = () => {
    setAtomValue({
      open: false,
      reactNode: null,
    });
  };

  const doneModal = <CompletionData,>(data?: CompletionData) => {
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
