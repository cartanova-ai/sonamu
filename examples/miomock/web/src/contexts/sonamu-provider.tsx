import { passkeyClient } from "@better-auth/passkey/client";
import {
  SonamuProvider as BaseSonamuProvider,
  useSonamuBaseContext,
} from "@sonamu-kit/react-components";
import { type SonamuFile } from "@sonamu-kit/react-components";
import { type BetterAuthClientOptions } from "better-auth/client";
import { adminClient, inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { type ReactNode } from "react";

import { type MergedDictionary } from "@/i18n/sd.generated";
import { SD } from "@/i18n/sd.generated";
import { FileService } from "@/services/services.generated";

const authOptions = {
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: "string" },
        created_at: { type: "date" },
        twoFactorEnabled: { type: "boolean", nullable: true, required: false },
      },
    }),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/admin/2fa-verify";
      },
    }),
    passkeyClient(),
    adminClient(),
  ],
} satisfies BetterAuthClientOptions;

export const authClient = createAuthClient(authOptions);

/** 타입이 지정된 useSonamuContext */
export function useSonamuContext() {
  return useSonamuBaseContext<MergedDictionary, typeof authOptions>();
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
    <BaseSonamuProvider<MergedDictionary, typeof authOptions>
      auth={authClient}
      uploader={uploader}
      SD={SD}
    >
      {children}
    </BaseSonamuProvider>
  );
}
