/* oxlint-disable @typescript-eslint/no-explicit-any */ // 제네릭 기본값으로 any 사용

import type { BetterAuthClientOptions } from "better-auth/client";
import { createAuthClient } from "better-auth/react";
import { createContext, type ReactNode, useContext, useRef } from "react";

import { type RCKeyName, type RCKeys, rcKeysEn } from "../i18n/rc-keys";
import type { Dictionary, SDReturnType, SonamuFile } from "./types";

/** createAuthClient의 반환 타입을 옵션으로부터 추론하는 유틸리티 타입 */
export type SonamuAuthClient<O extends BetterAuthClientOptions> = ReturnType<
  typeof createAuthClient<O>
>;

export interface SonamuContextValue<
  D extends Dictionary = Dictionary,
  O extends BetterAuthClientOptions = BetterAuthClientOptions,
> {
  uploader?: (files: File[]) => Promise<SonamuFile[]>;
  auth?: SonamuAuthClient<O>;
  SD?: <K extends keyof D>(key: K) => SDReturnType<D, K>;
}

export interface SonamuProviderProps<
  D extends Dictionary = Dictionary,
  O extends BetterAuthClientOptions = BetterAuthClientOptions,
> extends SonamuContextValue<D, O> {
  children: ReactNode;
  authOptions?: O;
}

const SONAMU_CONTEXT_ERROR_MESSAGE = (key: string) =>
  `[SonamuProvider] ${key} is not configured. Please provide ${key} configuration to SonamuProvider.`;

const createUploaderFallback = () => {
  return () => {
    throw new Error(SONAMU_CONTEXT_ERROR_MESSAGE("uploader"));
  };
};

const createSDFallback = <D extends Dictionary = RCKeys>() => {
  return <K extends keyof D>(key: K): SDReturnType<D, K> => {
    const value = rcKeysEn[key as unknown as RCKeyName];
    return value as unknown as SDReturnType<D, K>;
  };
};

const SonamuContext = createContext({} as SonamuContextValue);

export function SonamuProvider<
  D extends Dictionary = Dictionary,
  O extends BetterAuthClientOptions = BetterAuthClientOptions,
>({ children, authOptions, ...value }: SonamuProviderProps<D, O>) {
  const authRef = useRef<SonamuAuthClient<O> | undefined>(undefined);
  if (authOptions && !authRef.current) {
    authRef.current = createAuthClient(authOptions);
  }

  const normalizedValue: SonamuContextValue<D, O> = {
    uploader: value.uploader ?? createUploaderFallback(),
    auth: value.auth ?? authRef.current,
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
 *   return useSonamuBaseContext<MergedDictionary>();
 * }
 */
export function useSonamuBaseContext<
  D extends Dictionary = Dictionary,
  O extends BetterAuthClientOptions = BetterAuthClientOptions,
>(): Required<SonamuContextValue<D, O>> {
  return useContext(SonamuContext) as unknown as Required<SonamuContextValue<D, O>>;
}
