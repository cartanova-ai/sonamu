// react-components의 CommonModal을 re-export
export { CommonModal, commonModalAtom, useCommonModal } from "@sonamu-kit/react-components";

// 타입도 필요하면 여기서 정의
export type CommonModalProps = {
  className?: string;
};
