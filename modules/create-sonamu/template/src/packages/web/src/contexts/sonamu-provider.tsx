import {
  type SonamuFile,
  SonamuProvider as BaseSonamuProvider,
  useSonamuBaseContext,
} from "@sonamu-kit/react-components";
import type { ReactNode } from "react";
import type { DictKey, MergedDictionary } from "@/i18n/sd.generated";
import { SD } from "@/i18n/sd.generated";

// TODO: User 엔티티 추가 후 authOptions를 설정하세요
// import type { BetterAuthClientOptions } from "better-auth/client";
// import { inferAdditionalFields } from "better-auth/client/plugins";
// const authOptions = { plugins: [...] } satisfies BetterAuthClientOptions;

export function useSonamuContext() {
  return useSonamuBaseContext<MergedDictionary>();
}

// Uploader 설정
// TODO: File 엔티티 추가 후 FileService.useUploadMutation()을 사용하세요
const uploader = async (files: File[]): Promise<SonamuFile[]> => {
  if (files.length === 0) {
    return [];
  }
  console.log("File upload not implemented yet");
  return [];
};

const sd = <K extends DictKey>(key: K): ReturnType<typeof SD<K>> => SD(key);

export function SonamuProvider({ children }: { children: ReactNode }) {
  return (
    <BaseSonamuProvider<MergedDictionary> uploader={uploader} SD={sd}>
      {children}
    </BaseSonamuProvider>
  );
}
