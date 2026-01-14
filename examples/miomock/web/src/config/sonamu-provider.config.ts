import type { SonamuAuth, SonamuFile } from "@sonamu-kit/react-components";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { SD } from "@/i18n/sd.generated";
import { FileService, UserService } from "@/services/services.generated";
import type { UserSubsetSS } from "@/services/sonamu.generated";
import type { UserLoginParams } from "@/services/user/user.types";

export function createSonamuConfig() {
  // Auth 설정
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: user, isLoading, refetch } = UserService.useMe();
  const loginMutation = UserService.useLoginMutation();
  const logoutMutation = UserService.useLogoutMutation();

  const auth: SonamuAuth<UserSubsetSS, UserLoginParams> = {
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
  const uploadMutation = FileService.useUploadMutation();

  const uploader = async (files: File[]): Promise<SonamuFile[]> => {
    if (files.length === 0) {
      return [];
    }

    const result = await uploadMutation.mutateAsync({ files });
    return result.files;
  };

  return { auth, uploader };
}
