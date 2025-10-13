import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { UserSubsetMapping } from "src/services/sonamu.generated";
import { UserService } from "src/services/user/user.service";
import { UserLoginParams } from "src/services/user/user.types";

interface AuthContextType {
  user: UserSubsetMapping["A"] | null;
  loading: boolean;
  login: (loginParams: UserLoginParams) => void;
  logout: () => void;
  mutate: () => void;
}

const AuthContext = React.createContext<AuthContextType>({
  user: null,
} as AuthContextType);

export function AuthProvider({ children }: { children?: React.ReactNode }) {
  const { data: user, isLoading: swrLoading, mutate } = UserService.useMe();
  const [loading, setLoading] = useState<boolean>(swrLoading);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(swrLoading);
  }, [swrLoading]);

  const value = {
    user: user ?? null,
    loading,
    login: (loginParams: UserLoginParams) => {
      setLoading(true);
      UserService.login(loginParams)
        .then(({ user }) => {
          let from =
            (location.state as { from?: { pathname?: string } } | undefined)
              ?.from?.pathname ?? "/admin";

          mutate().then(() => {
            navigate(from, { replace: true });
            setLoading(false);
          });
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
        .then(() => {
          mutate();
        })
        .finally(() => {
          setLoading(false);
        });
    },
    mutate,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return React.useContext(AuthContext);
}
