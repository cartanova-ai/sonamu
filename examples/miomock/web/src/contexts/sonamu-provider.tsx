import {
  type SonamuAuth,
  type SonamuContextValue,
  type SonamuFile,
  SonamuProvider,
} from "@sonamu-kit/react-components";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { DictKey, MergedDictionary } from "@/i18n/sd.generated";
import { SD } from "@/i18n/sd.generated";
import { FileService, UserService } from "@/services/services.generated";
import type { UserSubsetSS } from "@/services/sonamu.generated";
import type { UserLoginParams } from "@/services/user/user.types";

export function createSonamuConfig(): SonamuContextValue<MergedDictionary> {
  // Auth 설정
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: user, isLoading, refetch } = UserService.useMe();
  const loginMutation = UserService.useLoginMutation();
  const logoutMutation = UserService.useLogoutMutation();

  const auth_config: SonamuAuth<UserSubsetSS, UserLoginParams> = {
    user: user ?? null,
    loading: isLoading || loginMutation.isPending || logoutMutation.isPending,
    login: (loginParams: UserLoginParams) => {
      loginMutation.mutate(
        { params: loginParams },
        {
          onSuccess: async ({ user: _user }) => {
            await queryClient.invalidateQueries({ queryKey: ["User", "me"] });
            await queryClient.refetchQueries({ queryKey: ["User", "me"] });
            navigate({ to: "/admin", replace: true });
          },
          onError: (error) => {
            console.error("Login failed:", error);
            alert(SD("user.login.failed"));
          },
        },
      );
    },
    logout: () => {
      logoutMutation.mutate(undefined, {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: ["User", "me"] });
          await queryClient.refetchQueries({ queryKey: ["User", "me"] });
        },
        onError: (error) => {
          console.error("Logout failed:", error);
          alert(SD("user.logout.failed"));
        },
      });
    },
    refetch,
  };

  // Uploader 설정
  const uploader_config = async (files: File[]): Promise<SonamuFile[]> => {
    const uploadMutation = FileService.useUploadMutation();

    if (files.length === 0) {
      return [];
    }

    const result = await uploadMutation.mutateAsync({ files });
    return result.files;
  };

  // SD 설정
  const sd_config = <K extends DictKey>(key: K): ReturnType<typeof SD<K>> => SD(key);

  return { auth: auth_config, uploader: uploader_config, SD: sd_config };
}

export function SonamuProviderWrapper({ children }: { children: ReactNode }) {
  const sonamuConfig = createSonamuConfig();
  return <SonamuProvider<MergedDictionary> {...sonamuConfig}>{children}</SonamuProvider>;
}
