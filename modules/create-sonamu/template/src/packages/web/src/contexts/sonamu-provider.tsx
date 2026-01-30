import {
  type SonamuFile,
  SonamuProvider,
  useSonamuBaseContext,
} from "@sonamu-kit/react-components";
import type { ReactNode } from "react";
import type { DictKey, MergedDictionary } from "@/i18n/sd.generated";
import { SD } from "@/i18n/sd.generated";

// TODO: User 엔티티 추가 후 아래 타입들을 지정하세요
// - UserSubsetSS: 세션에 저장되는 User 타입 (예: import type { UserSubsetSS } from "@/services/sonamu.generated")
// - UserLoginParams: 로그인 파라미터 타입 (예: import type { UserLoginParams } from "@/services/user/user.types")
export function useSonamuContext() {
  return useSonamuBaseContext<MergedDictionary, any, any>();
}

export function useSonamuConfig() {
  // Auth 설정
  // TODO: User 엔티티 추가 후 auth 로직을 구현하세요
  const auth = {
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
      // 세션 정보 다시 불러오기
    },
  };

  // Uploader 설정
  // TODO: File 엔티티 추가 후 FileService.useUploadMutation()을 사용하세요
  const uploader = async (files: File[]): Promise<SonamuFile[]> => {
    if (files.length === 0) {
      return [];
    }
    console.log("File upload not implemented yet");
    return [];
  };

  // SD 설정
  const sd = <K extends DictKey>(key: K): ReturnType<typeof SD<K>> => SD(key);

  return { auth, uploader, SD: sd };
}

export function SonamuProviderWrapper({ children }: { children: ReactNode }) {
  const config = useSonamuConfig();
  return (
    <SonamuProvider<MergedDictionary, any, any> {...config}>
      {children}
    </SonamuProvider>
  );
}
