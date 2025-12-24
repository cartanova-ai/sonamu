"use client";

import { atom, useAtom } from "jotai";
import type * as React from "react";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

type ExtendedModalProps = {
  title?: string;
  description?: string;
  className?: string;
  onCompleted?: (data?: unknown) => void;
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
  const { open, reactNode, title, description, className: modalClassName } = atomValue;

  const closeAndClear = () => {
    setAtomValue({
      open: false,
      reactNode: null,
    });
  };

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
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {reactNode}
      </DialogContent>
    </Dialog>
  );
}

export function useCommonModal() {
  const [atomValue, setAtomValue] = useAtom(commonModalAtom);
  const { open, reactNode, onCompleted } = atomValue;

  const openModal = (reactNode: React.ReactNode, props?: ExtendedModalProps) => {
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
