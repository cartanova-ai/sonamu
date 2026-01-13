import { createContext, type ReactNode, useContext } from "react";

export type SonamuFile = {
  name: string;
  url: string;
  mime_type: string;
  size: number;
};

export interface SonamuContextValue {
  uploader?: (files: File[]) => Promise<SonamuFile[]>;
}

const SonamuContext = createContext<SonamuContextValue>({} as SonamuContextValue);

export interface SonamuProviderProps extends SonamuContextValue {
  children: ReactNode;
}

export function SonamuProvider({ children, ...value }: SonamuProviderProps) {
  const normalizedValue: SonamuContextValue = {
    ...value,
    uploader:
      value.uploader ??
      (() => {
        throw new Error(
          "[SonamuProvider] uploader가 설정되지 않았습니다. SonamuProvider에 uploader 함수를 제공해주세요.",
        );
      }),
  };

  return <SonamuContext.Provider value={normalizedValue}>{children}</SonamuContext.Provider>;
}

export function useSonamuContext(): Required<SonamuContextValue> {
  return useContext(SonamuContext) as Required<SonamuContextValue>;
}
