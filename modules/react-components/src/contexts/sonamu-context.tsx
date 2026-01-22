import { createContext, type ReactNode, useContext } from "react";
import { type RCKeyName, type RCKeys, rcKeys } from "../i18n/rc-keys";
import type { Dictionary, SDReturnType, SonamuAuth, SonamuFile } from "./types";

const RC_KEY_PREFIX = "rc.";

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
  // rc.* 키는 제공된 SD에 없으면 rcKeys로 자동 fallback
  const wrappedSD: typeof value.SD = value.SD
    ? (key) => {
        const providedSD = value.SD as NonNullable<typeof value.SD>;
        const providedValue = providedSD(key);

        // rc.*로 시작하는 키: providedSD에 없으면 rcKeys로 fallback
        if (String(key).startsWith(RC_KEY_PREFIX)) {
          // providedSD가 키를 찾지 못한 경우: rcKeys 사용
          if (providedValue === (key as string)) {
            return (rcKeys[key as unknown as RCKeyName] ??
              providedValue) as unknown as SDReturnType<D, typeof key>;
          }
          return providedValue as SDReturnType<D, typeof key>;
        }

        // rc.*가 시작하지 않는 키: providedValue 그대로 사용
        return providedValue;
      }
    : createSDFallback<D>();

  const normalizedValue: SonamuContextValue<D> = {
    ...value,
    uploader: value.uploader ?? createUploaderFallback(),
    auth: value.auth ?? createAuthFallback(),
    SD: wrappedSD,
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

const createSDFallback = <D extends Dictionary = RCKeys>() => {
  return <K extends keyof D>(key: K): SDReturnType<D, K> => {
    const value = rcKeys[key as unknown as RCKeyName];
    return value as unknown as SDReturnType<D, K>;
  };
};
