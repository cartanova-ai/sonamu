import type { ReactElement } from "react";

export type PaginationProps = {
  activePage?: number;
  totalPages?: number;
};

export type TableColumnWidth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export type ErrorObj = {
  content: string;
  pointing?: "above" | "below" | "left" | "right";
};

export type ControlledModalProps = {
  open: boolean;
  close: () => void;
};

export type SonamuCol<T> = {
  label: string;
  th?: ReactElement;
  tc: (row: T, index: number) => ReactElement;
  className?: string;
  collapsing?: boolean;
  width?: TableColumnWidth;
  hidden?: boolean;
  parentLabel?: string;
};

// Union 타입을 분배하여 각각에 Omit을 적용하는 유틸리티 타입
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Override<T, U> = Omit<T, keyof U> & U;
