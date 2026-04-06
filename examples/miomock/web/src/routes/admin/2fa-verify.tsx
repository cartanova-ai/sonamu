import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@sonamu-kit/react-components";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import KeyIcon from "~icons/lucide/key";
import ShieldCheckIcon from "~icons/lucide/shield-check";

import { useSonamuContext } from "@/contexts/sonamu-provider";

export const Route = createFileRoute("/admin/2fa-verify")({ component: TwoFactorVerifyPage });

function TwoFactorVerifyPage() {
  const { auth } = useSonamuContext();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError("6자리 코드를 입력하세요");
      return;
    }

    setIsLoading(true);
    setError("");

    const result = await auth.twoFactor.verifyTotp({ code });

    setIsLoading(false);

    if (result.error) {
      setError(result.error.message ?? "인증에 실패했습니다");
      return;
    }

    navigate({ to: "/admin" });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleVerify();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-gray-50"
      style={{ width: "100vw", height: "100vh" }}
    >
      <Card className="shadow-xl p-8 border-0 bg-white" style={{ width: "450px" }}>
        <CardHeader className="text-center pb-4 pt-8">
          <div className="flex justify-center mb-4">
            <ShieldCheckIcon className="h-12 w-12" style={{ color: "#059669" }} />
          </div>
          <CardTitle className="text-2xl font-bold" style={{ color: "#059669" }}>
            2단계 인증
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">인증 앱에서 6자리 코드를 입력하세요</p>
        </CardHeader>
        <CardContent className="space-y-5 px-8 pb-8">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="relative">
            <KeyIcon
              className="absolute top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: "#10b981", left: "16px" }}
            />
            <Input
              className="h-14 text-center text-2xl tracking-widest font-mono border-gray-200"
              style={{ paddingLeft: "48px", paddingRight: "16px", letterSpacing: "0.5em" }}
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          <Button
            className="w-full h-11 gap-2 text-white font-medium shadow-md"
            style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
            onClick={handleVerify}
            disabled={isLoading || code.length !== 6}
          >
            {isLoading ? "확인 중..." : "확인"}
          </Button>

          <p className="text-center text-sm text-gray-500">
            Google Authenticator, Authy 등의 앱을 사용하세요
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
