/** biome-ignore-all lint/suspicious/noExplicitAny: 제네릭 기본값으로 any 사용 */
import { createContext, type ReactNode, useContext } from "react";
import { type RCKeyName, type RCKeys, rcKeysEn } from "../i18n/rc-keys";
import type { Dictionary, SDReturnType, SonamuAuth, SonamuFile } from "./types";

export interface SonamuContextValue<
  D extends Dictionary = Dictionary,
  TUser = any,
  TLoginParams = any,
> {
  uploader?: (files: File[]) => Promise<SonamuFile[]>;
  auth?: SonamuAuth<TUser, TLoginParams>;
  SD?: <K extends keyof D>(key: K) => SDReturnType<D, K>;
}

export interface SonamuProviderProps<
  D extends Dictionary = Dictionary,
  TUser = any,
  TLoginParams = any,
> extends SonamuContextValue<D, TUser, TLoginParams> {
  children: ReactNode;
}

const SONAMU_CONTEXT_ERROR_MESSAGE = (key: string) =>
  `[SonamuProvider] ${key} is not configured. Please provide ${key} configuration to SonamuProvider.`;

const createUploaderFallback = () => {
  return () => {
    throw new Error(SONAMU_CONTEXT_ERROR_MESSAGE("uploader"));
  };
};

const createAuthFallback = <TUser, TLoginParams>(): SonamuAuth<TUser, TLoginParams> => {
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

const createSDFallback = <D extends Dictionary = RCKeys>() => {
  return <K extends keyof D>(key: K): SDReturnType<D, K> => {
    const value = rcKeysEn[key as unknown as RCKeyName];
    return value as unknown as SDReturnType<D, K>;
  };
};

const SonamuContext = createContext<SonamuContextValue>({} as SonamuContextValue);

export function SonamuProvider<D extends Dictionary = Dictionary, TUser = any, TLoginParams = any>({
  children,
  ...value
}: SonamuProviderProps<D, TUser, TLoginParams>) {
  const normalizedValue: SonamuContextValue<D, TUser, TLoginParams> = {
    ...value,
    uploader: value.uploader ?? createUploaderFallback(),
    auth: value.auth ?? createAuthFallback<TUser, TLoginParams>(),
    SD: value.SD ?? createSDFallback<D>(),
  };

  return <SonamuContext.Provider value={normalizedValue}>{children}</SonamuContext.Provider>;
}

/**
 * 타입이 지정된 useSonamuContext를 만들기 위한 베이스 훅
 *
 * @example
 * // contexts/sonamu-provider.tsx
 * export function useSonamuContext() {
 *   return useSonamuBaseContext<MergedDictionary, UserSubsetSS, UserLoginParams>();
 * }
 */
export function useSonamuBaseContext<
  D extends Dictionary = Dictionary,
  TUser = any,
  TLoginParams = any,
>(): Required<SonamuContextValue<D, TUser, TLoginParams>> {
  return useContext(SonamuContext) as Required<SonamuContextValue<D, TUser, TLoginParams>>;
}
