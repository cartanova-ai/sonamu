import {
  SonamuProvider as BaseSonamuProvider,
  type SonamuFile,
  useSonamuBaseContext,
} from "@sonamu-kit/react-components";
import type { ReactNode } from "react";
import type { MergedDictionary } from "@/i18n/sd.generated";
import { SD } from "@/i18n/sd.generated";
import type { signIn, useSession } from "@/lib/auth-client";
import { FileService } from "@/services/services.generated";

type User = NonNullable<ReturnType<typeof useSession>["data"]>["user"];

type UserLoginParams = Parameters<typeof signIn.email>[0];

/** 타입이 지정된 useSonamuContext */
export function useSonamuContext() {
  return useSonamuBaseContext<MergedDictionary, User, UserLoginParams>();
}

export function SonamuProvider({ children }: { children: ReactNode }) {
  const uploadMutation = FileService.useUploadMutation();

  const uploader = async (files: File[]): Promise<SonamuFile[]> => {
    if (files.length === 0) {
      return [];
    }

    const result = await uploadMutation.mutateAsync({ files });
    return result.files;
  };
  return (
    <BaseSonamuProvider<MergedDictionary, User, UserLoginParams> uploader={uploader} SD={SD}>
      {children}
    </BaseSonamuProvider>
  );
}
