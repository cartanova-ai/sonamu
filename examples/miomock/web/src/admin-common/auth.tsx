import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import React from "react";
import { type LocalizedString, SD } from "../i18n/sd.generated";
import { UserService } from "../services/services.generated";
import type { UserSubsetSS } from "../services/sonamu.generated";
import type { UserLoginParams } from "../services/user/user.types";

/**
 * LocalizedString만 받는 MessageAlert
 * 하드코딩된 문자열 사용 시 타입 에러 발생
 *
 * @example
 * showAlert(SD("error.loginFailed"))  // ✅ OK
 * showAlert("로그인 실패")             // ❌ 타입 에러
 */
interface MessageAlertProps {
  message: LocalizedString;
}

function showAlert({ message }: MessageAlertProps) {
  alert(message);
}

interface AuthContextType {
  user: UserSubsetSS | null;
  loading: boolean;
  login: (loginParams: UserLoginParams) => void;
  logout: () => void;
  refetch: () => void;
}

const AuthContext = React.createContext<AuthContextType>({
  user: null,
} as AuthContextType);

export function AuthProvider({ children }: { children?: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading, refetch } = UserService.useMe();
  const loginMutation = UserService.useLoginMutation();
  const logoutMutation = UserService.useLogoutMutation();
  const navigate = useNavigate();

  const value = {
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
            showAlert({ message: SD("user.login.failed") });
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
          showAlert({ message: SD("user.logout.failed") });
        },
      });
    },
    refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return React.useContext(AuthContext);
}
