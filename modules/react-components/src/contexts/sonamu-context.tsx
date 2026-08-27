import { type BetterAuthClientOptions } from "better-auth/client";
import { createAuthClient } from "better-auth/react";
import { createContext, useContext, useState } from "react";
import { type ReactNode } from "react";

import { rcKeysEn } from "../i18n/rc-keys";
import { type RCKeys } from "../i18n/rc-keys";
import { type Dictionary, type SDReturnType, type SonamuFile, type UploadParams } from "./types";

/** createAuthClient의 반환 타입을 옵션으로부터 추론하는 유틸리티 타입 */
export type SonamuAuthClient<O extends BetterAuthClientOptions> = ReturnType<
  typeof createAuthClient<O>
>;

export interface SonamuContextValue<
  D extends Dictionary = Dictionary,
  O extends BetterAuthClientOptions = BetterAuthClientOptions,
> {
  uploader?: (files: File[], params?: UploadParams) => Promise<SonamuFile[]>;
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

function createSDFallback<D extends Dictionary = RCKeys>(): <K extends keyof D>(
  key: K,
) => SDReturnType<D, K>;
function createSDFallback() {
  const translations = new Map(Object.entries(rcKeysEn));
  return (key: string) => translations.get(key) ?? key;
}

type SonamuContextRuntimeValue = {
  uploader?: SonamuContextValue["uploader"];
  auth?: object;
  SD?: (key: never) => string | ((...args: never[]) => string);
};

const SonamuContext = createContext<SonamuContextValue>({
  uploader: createUploaderFallback(),
  SD: createSDFallback<Dictionary>(),
});

function SonamuContextProvider<D extends Dictionary, O extends BetterAuthClientOptions>({
  children,
  auth,
  ...value
}: SonamuContextValue<D, O> & { children: ReactNode }) {
  const normalizedValue: SonamuContextValue<D, O> = {
    uploader: value.uploader ?? createUploaderFallback(),
    auth,
    SD: value.SD ?? createSDFallback<D>(),
  };

  return <SonamuContext.Provider value={normalizedValue}>{children}</SonamuContext.Provider>;
}

function SonamuAuthProvider<D extends Dictionary, O extends BetterAuthClientOptions>({
  children,
  authOptions,
  ...value
}: SonamuProviderProps<D, O> & { authOptions: O }) {
  const [auth] = useState(() => createAuthClient(authOptions));

  return (
    <SonamuContextProvider {...value} auth={value.auth ?? auth}>
      {children}
    </SonamuContextProvider>
  );
}

export function SonamuProvider<
  D extends Dictionary = Dictionary,
  O extends BetterAuthClientOptions = BetterAuthClientOptions,
>({ children, authOptions, ...value }: SonamuProviderProps<D, O>) {
  return authOptions === undefined ? (
    <SonamuContextProvider {...value}>{children}</SonamuContextProvider>
  ) : (
    <SonamuAuthProvider {...value} authOptions={authOptions}>
      {children}
    </SonamuAuthProvider>
  );
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
>(): Required<SonamuContextValue<D, O>>;
export function useSonamuBaseContext(): SonamuContextRuntimeValue {
  return useContext(SonamuContext);
}
