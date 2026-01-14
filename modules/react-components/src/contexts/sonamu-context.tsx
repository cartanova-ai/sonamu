import { createContext, type ReactNode, useContext } from "react";
import type { SonamuAuth, SonamuFile } from "./types";

export interface SonamuContextValue {
  uploader?: (files: File[]) => Promise<SonamuFile[]>;
  auth?: SonamuAuth;
}

const SonamuContext = createContext<SonamuContextValue>({} as SonamuContextValue);

export interface SonamuProviderProps extends SonamuContextValue {
  children: ReactNode;
}

export function SonamuProvider({ children, ...value }: SonamuProviderProps) {
  const normalizedValue: SonamuContextValue = {
    ...value,
    uploader: value.uploader ?? createUploaderFallback(),
    auth: value.auth ?? createAuthFallback(),
  };

  return <SonamuContext.Provider value={normalizedValue}>{children}</SonamuContext.Provider>;
}

export function useSonamuContext(): Required<SonamuContextValue> {
  return useContext(SonamuContext) as Required<SonamuContextValue>;
}

const SONAMU_CONTEXT_ERROR_MESSAGE = (key: string) =>
  `[SonamuProvider] ${key}가 설정되지 않았습니다. SonamuProvider에 ${key} 설정을 제공해주세요.`;

const createUploaderFallback = () => {
  return () => {
    throw new Error(SONAMU_CONTEXT_ERROR_MESSAGE("uploader"));
  };
};

const createAuthFallback = (): SonamuAuth => {
  const throwAuthError = () => {
    throw new Error(SONAMU_CONTEXT_ERROR_MESSAGE("auth"));
  };

  return {
    user: null,
    loading: false,
    login: throwAuthError,
    logout: throwAuthError,
    refetch: throwAuthError,
  };
};
