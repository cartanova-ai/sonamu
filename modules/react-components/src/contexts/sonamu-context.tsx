import { createContext, type ReactNode, useContext } from "react";
import { type RCKeyName, type RCKeys, rcKeys } from "../i18n/rc-keys";
import type { Dictionary, SDReturnType, SonamuAuth, SonamuFile } from "./types";

export interface SonamuContextValue<D extends Dictionary = Dictionary> {
  uploader?: (files: File[]) => Promise<SonamuFile[]>;
  auth?: SonamuAuth;
  SD?: <K extends keyof D>(key: K) => SDReturnType<D, K>;
}

const SonamuContext = createContext<SonamuContextValue>({} as SonamuContextValue);

export interface SonamuProviderProps<D extends Dictionary = Dictionary>
  extends SonamuContextValue<D> {
  children: ReactNode;
}

export function SonamuProvider<D extends Dictionary = Dictionary>({
  children,
  ...value
}: SonamuProviderProps<D>) {
  const normalizedValue: SonamuContextValue<D> = {
    ...value,
    uploader: value.uploader ?? createUploaderFallback(),
    auth: value.auth ?? createAuthFallback(),
    SD: value.SD ?? createSDFallback<D>(),
  };

  return <SonamuContext.Provider value={normalizedValue}>{children}</SonamuContext.Provider>;
}

export function useSonamuContext<D extends Dictionary = Dictionary>(): Required<
  SonamuContextValue<D>
> {
  return useContext(SonamuContext) as Required<SonamuContextValue<D>>;
}

const SONAMU_CONTEXT_ERROR_MESSAGE = (key: string) =>
  `[SonamuProvider] ${key} is not configured. Please provide ${key} configuration to SonamuProvider.`;

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

/**
 * SD fallback
 * react-components 내부의 rcKeys를 기본값으로 사용
 */
const createSDFallback = <D extends Dictionary = RCKeys>() => {
  return <K extends keyof D>(key: K): SDReturnType<D, K> => {
    const value = rcKeys[key as unknown as RCKeyName];
    return value as unknown as SDReturnType<D, K>;
  };
};
