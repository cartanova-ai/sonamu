import {
  type SonamuFile,
  SonamuProvider,
  useSonamuBaseContext,
} from "@sonamu-kit/react-components";
import type { ReactNode } from "react";
import type { DictKey, MergedDictionary } from "@/i18n/sd.generated";
import { SD } from "@/i18n/sd.generated";
import type { signIn, useSession } from "@/lib/auth-client";
import { FileService } from "@/services/services.generated";

type User = NonNullable<ReturnType<typeof useSession>["data"]>["user"];

type UserLoginParams = Parameters<typeof signIn.email>[0];

/** 타입이 지정된 useSonamuContext */
export function useSonamuContext() {
  return useSonamuBaseContext<MergedDictionary, User, UserLoginParams>();
}

function useSonamuConfig() {
  const uploadMutation = FileService.useUploadMutation();

  // Uploader 설정
  const uploader = async (files: File[]): Promise<SonamuFile[]> => {
    if (files.length === 0) {
      return [];
    }

    const result = await uploadMutation.mutateAsync({ files });
    return result.files;
  };

  // SD 설정
  const sd = <K extends DictKey>(key: K): ReturnType<typeof SD<K>> => SD(key);

  return { uploader, SD: sd };
}

export function SonamuProviderWrapper({ children }: { children: ReactNode }) {
  const config = useSonamuConfig();
  return (
    <SonamuProvider<MergedDictionary, User, UserLoginParams> {...config}>{children}</SonamuProvider>
  );
}
