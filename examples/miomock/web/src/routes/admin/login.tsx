import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@sonamu-kit/react-components";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React from "react";
import FingerprintIcon from "~icons/lucide/fingerprint";
import HomeIcon from "~icons/lucide/home";
import LockIcon from "~icons/lucide/lock";
import LogInIcon from "~icons/lucide/log-in";
import LogOutIcon from "~icons/lucide/log-out";
import MailIcon from "~icons/lucide/mail";
import ShieldIcon from "~icons/lucide/shield";
import UserPlusIcon from "~icons/lucide/user-plus";

import { authClient, useSonamuContext } from "@/contexts/sonamu-provider";

export const Route = createFileRoute("/admin/login")({ component: LoginTestPage });

function LoginTestPage() {
  const { auth } = useSonamuContext();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passkeyLoading, setPasskeyLoading] = React.useState(false);

  const session = authClient.useSession();
  const user = session.data?.user ?? null;
  const navigate = useNavigate();

  // 패스키 autofill 활성화
  React.useEffect(() => {
    if (
      !PublicKeyCredential.isConditionalMediationAvailable ||
      !PublicKeyCredential.isConditionalMediationAvailable()
    ) {
      return;
    }

    void authClient.signIn.passkey({ autoFill: true });
  }, []);

  const handleSubmit = async () => {
    const result = await auth.signIn.email({ email, password });

    if (result.error) {
      alert(result.error.message);
      return;
    }

    // // 2FA가 활성화된 경우 onTwoFactorRedirect 콜백이 자동 호출됨
    // // redirect가 false인 경우에만 수동으로 이동 (2FA 미사용 또는 처리 완료)
    // if (!result.data?.redirect) {
    //   navigate({ to: "/admin" });
    // }
  };

  const handleLogout = () => {
    auth.signOut();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-gray-50"
      style={{ width: "100vw", height: "100vh" }}
    >
      <Card className="shadow-xl p-8 border-0 bg-white" style={{ width: "600px" }}>
        <CardHeader className="text-center pb-4 pt-8">
          <CardTitle className="text-2xl font-bold" style={{ color: "#059669" }}>
            로그인 테스트
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">Test your account credentials</p>
        </CardHeader>
        <CardContent className="space-y-5 px-8 pb-8">
          {user ? (
            <div className="space-y-4">
              <Alert>
                <AlertTitle>로그인 성공</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>사용자: {user.name}</p>
                  <p>이메일: {user.email}</p>
                  <p>역할: {user.role}</p>
                </AlertDescription>
              </Alert>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={handleLogout} icon={<LogOutIcon />}>
                  로그아웃
                </Button>
                <Button
                  variant="outline"
                  icon={<ShieldIcon />}
                  onClick={() => navigate({ to: "/admin/2fa-setup" })}
                >
                  2FA 설정
                </Button>
                <Button
                  variant="outline"
                  icon={<FingerprintIcon />}
                  onClick={async () => {
                    const result = await auth.passkey.addPasskey({ name: `${user.name}의 패스키` });
                    if (result.error) {
                      alert(`패스키 등록 실패: ${result.error.message}`);
                    } else {
                      alert("패스키가 등록되었습니다.");
                    }
                  }}
                >
                  패스키 등록
                </Button>
              </div>
              <Button
                icon={<HomeIcon />}
                className="w-full h-11 gap-2 text-white font-medium shadow-md"
                style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
                onClick={() => navigate({ to: "/admin" })}
              >
                관리자 페이지로 이동
              </Button>
            </div>
          ) : (
            <>
              <div className="relative mb-4">
                <MailIcon
                  className="absolute top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "#10b981", left: "16px" }}
                />
                <Input
                  className="h-11 border-gray-200"
                  style={{ paddingLeft: "40px", paddingRight: "16px" }}
                  placeholder="Email"
                  type="email"
                  autoComplete="username webauthn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
              <div className="relative mb-4">
                <LockIcon
                  className="absolute top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "#10b981", left: "16px" }}
                />
                <Input
                  className="h-11 border-gray-200"
                  style={{ paddingLeft: "40px", paddingRight: "16px" }}
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  icon={<LogInIcon />}
                  className="flex-1 h-11 gap-2 text-white font-medium shadow-md"
                  style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
                  onClick={handleSubmit}
                >
                  Login
                </Button>
                <Button
                  icon={<UserPlusIcon />}
                  variant="outline"
                  className="flex-1 h-11 gap-2"
                  style={{ borderColor: "#6ee7b7", color: "#059669" }}
                  onClick={() => navigate({ to: "/admin/signup" })}
                >
                  회원가입
                </Button>
              </div>

              <Button
                variant="outline"
                className="w-full h-11 gap-2"
                style={{ borderColor: "#6ee7b7", color: "#059669" }}
                disabled={passkeyLoading}
                onClick={async () => {
                  setPasskeyLoading(true);
                  try {
                    const result = await auth.signIn.passkey();
                    if (result.error) {
                      alert(`패스키 인증 실패: ${result.error.message}`);
                    }
                  } finally {
                    setPasskeyLoading(false);
                  }
                }}
              >
                <FingerprintIcon className="h-4 w-4" />
                {passkeyLoading ? "인증 중..." : "패스키로 로그인"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
