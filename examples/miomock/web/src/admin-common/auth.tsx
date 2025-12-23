import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { UserService } from "../services/services.generated";
import type { UserSubsetSS } from "../services/sonamu.generated";
import type { UserLoginParams } from "../services/user/user.types";

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
  const [loading, setLoading] = useState<boolean>(isLoading);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(isLoading);
  }, [isLoading]);

  const value = {
    user: user ?? null,
    loading,
    login: (loginParams: UserLoginParams) => {
      setLoading(true);
      UserService.login(loginParams)
        .then(async ({ user: _user }) => {
          const from =
            (location.state as { from?: { pathname?: string } } | undefined)?.from?.pathname ??
            "/admin";

          await queryClient.invalidateQueries({ queryKey: ["User", "me"] });
          await queryClient.refetchQueries({ queryKey: ["User", "me"] });
          navigate(from, { replace: true });
          setLoading(false);
        })
        .catch((error) => {
          console.error("Login failed:", error);
          alert("로그인에 실패했습니다");
          setLoading(false);
        });
    },
    logout: () => {
      setLoading(true);
      UserService.logout()
        .then(async () => {
          await queryClient.invalidateQueries({ queryKey: ["User", "me"] });
          await queryClient.refetchQueries({ queryKey: ["User", "me"] });
        })
        .finally(() => {
          setLoading(false);
        });
    },
    refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return React.useContext(AuthContext);
}
