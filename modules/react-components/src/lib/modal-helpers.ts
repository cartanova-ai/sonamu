import React, { useState } from "react";

import { type ControlledModalProps } from "./types";

export function useModal<T extends object>(
  ModalComponent: (props: T & ControlledModalProps) => React.ReactElement,
  defaultProps: T,
) {
  const [modalProps, setModalProps] = useState<T & { open: boolean }>({
    ...defaultProps,
    open: false,
  });

  const close = () => {
    setModalProps({
      ...modalProps,
      open: false,
    });
  };

  return {
    open: (newProps: T) => {
      setModalProps({
        ...newProps,
        open: true,
        close,
      });
    },
    modal: React.createElement(ModalComponent, {
      ...modalProps,
      close,
    }),
  };
}
