import React, { useEffect } from "react";
import { Button, Modal, ModalProps } from "semantic-ui-react";
import { atom, useAtom } from "jotai";

type ExtendedModalProps = ModalProps & {
  onCompleted?: (data?: unknown) => void;
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

export type CommonModalProps = {};
export function CommonModal({}: CommonModalProps) {
  const [atomValue, setAtomValue] = useAtom(commonModalAtom);
  const {
    open,
    reactNode,
    onCompleted,
    onControlledOpen,
    onControlledClose,
    ...modalProps
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
  }, [open]);

  return (
    <Modal
      basic
      open={open}
      centered={false}
      className="common-modal"
      closeOnEscape={true}
      closeOnDimmerClick={true}
      {...modalProps}
      onClose={(e) => {
        if (modalProps.onClose) {
          modalProps.onClose(e, {});
        }
        closeAndClear();
      }}
    >
      <Modal.Actions>
        <Button
          icon="close"
          inverted
          circular
          className="floating-close"
          onClick={closeAndClear}
        />
      </Modal.Actions>
      <Modal.Content>
        <Modal.Description>{reactNode}</Modal.Description>
      </Modal.Content>
    </Modal>
  );
}

export function useCommonModal() {
  const [atomValue, setAtomValue] = useAtom(commonModalAtom);
  const { open, reactNode, onCompleted, onControlledClose } = atomValue;

  const openModal = (
    reactNode: React.ReactNode,
    props?: ExtendedModalProps
  ) => {
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
