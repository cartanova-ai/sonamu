import {
  type SonamuContextValue,
  type SonamuFile,
  SonamuProvider,
  useSonamuBaseContext,
} from "@sonamu-kit/react-components";
import type { ReactNode } from "react";
import type { MergedDictionary } from "@/i18n/sd.generated";
import { SD } from "@/i18n/sd.generated";

// TODO: User 엔티티 추가 후 아래 타입들을 지정하세요
// - UserSubsetSS: 세션에 저장되는 User 타입 (예: import type { UserSubsetSS } from "@/services/sonamu.generated")
// - UserLoginParams: 로그인 파라미터 타입 (예: import type { UserLoginParams } from "@/services/user/user.types")
export function useSonamuContext() {
  return useSonamuBaseContext<MergedDictionary, any, any>();
}

export function createSonamuConfig(): SonamuContextValue<MergedDictionary, any, any> {
  // Auth configuration
  const auth_config = {
    user: null,
    loading: false,
    login: async (_loginParams: any) => {
      // TODO: Implement login logic
      console.log("Login not implemented yet");
    },
    logout: async () => {
      // TODO: Implement logout logic
      console.log("Logout not implemented yet");
    },
    refetch: async () => {
      // TODO: Implement refetch logic
    },
  };

  // Uploader configuration
  const uploader_config = async (files: File[]): Promise<SonamuFile[]> => {
    // TODO: Implement file upload logic
    if (files.length === 0) {
      return [];
    }

    console.log("File upload not implemented yet");
    return [];
  };

  // SD configuration
  const sd_config = <K extends keyof MergedDictionary>(key: K) => {
    return SD(key as string);
  };

  return { auth: auth_config, uploader: uploader_config, SD: sd_config };
}

export function SonamuProviderWrapper({ children }: { children: ReactNode }) {
  const sonamuConfig = createSonamuConfig();
  return (
    <SonamuProvider<MergedDictionary, any, any> {...sonamuConfig}>
      {children}
    </SonamuProvider>
  );
}
