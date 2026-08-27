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
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import ArrowLeftIcon from "~icons/lucide/arrow-left";
import CheckCircleIcon from "~icons/lucide/check-circle";
import CopyIcon from "~icons/lucide/copy";
import KeyIcon from "~icons/lucide/key";
import LockIcon from "~icons/lucide/lock";
import ShieldIcon from "~icons/lucide/shield";
import ShieldOffIcon from "~icons/lucide/shield-off";

import { authClient, useSonamuContext } from "@/contexts/sonamu-provider";

export const Route = createFileRoute("/admin/2fa-setup")({ component: TwoFactorSetupPage });

type SetupStep = "password" | "qr" | "verify" | "done";

function TwoFactorSetupPage() {
  const { auth } = useSonamuContext();
  const { data: session, refetch } = authClient.useSession();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [totpURI, setTotpURI] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [step, setStep] = useState<SetupStep>("password");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const is2FAEnabled = session?.user?.twoFactorEnabled;

  // 2FA 활성화 시작 - TOTP URI 생성
  const handleEnable = async () => {
    if (!password) {
      setError("비밀번호를 입력하세요");
      return;
    }

    setIsLoading(true);
    setError("");

    const result = await auth.twoFactor.enable({ password });

    setIsLoading(false);

    if (result.error) {
      setError(result.error.message ?? "2FA 활성화에 실패했습니다");
      return;
    }

    setTotpURI(result.data?.totpURI ?? "");
    setBackupCodes(result.data?.backupCodes ?? []);
    setStep("qr");
  };

  // TOTP 코드 검증
  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setError("6자리 코드를 입력하세요");
      return;
    }

    setIsLoading(true);
    setError("");

    const result = await auth.twoFactor.verifyTotp({ code: verifyCode });

    setIsLoading(false);

    if (result.error) {
      setError(result.error.message ?? "코드 검증에 실패했습니다");
      return;
    }

    await refetch();
    setStep("done");
  };

  // 2FA 비활성화
  const handleDisable = async () => {
    if (!password) {
      setError("비밀번호를 입력하세요");
      return;
    }

    setIsLoading(true);
    setError("");

    const result = await auth.twoFactor.disable({ password });

    setIsLoading(false);

    if (result.error) {
      setError(result.error.message ?? "2FA 비활성화에 실패했습니다");
      return;
    }

    await refetch();
    setPassword("");
    alert("2FA가 비활성화되었습니다");
  };

  // 백업 코드 복사
  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    alert("백업 코드가 클립보드에 복사되었습니다");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (step === "password") {
        if (is2FAEnabled) {
          handleDisable();
        } else {
          handleEnable();
        }
      } else if (step === "verify") {
        handleVerify();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-gray-50"
      style={{ width: "100vw", height: "100vh" }}
    >
      <Card className="shadow-xl p-8 border-0 bg-white" style={{ width: "500px" }}>
        <CardHeader className="text-center pb-4 pt-8">
          <div className="flex justify-center mb-4">
            <ShieldIcon className="h-12 w-12" style={{ color: "#059669" }} />
          </div>
          <CardTitle className="text-2xl font-bold" style={{ color: "#059669" }}>
            2단계 인증 설정
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            {is2FAEnabled ? "2FA가 활성화되어 있습니다" : "계정 보안을 강화하세요"}
          </p>
        </CardHeader>

        <CardContent className="space-y-5 px-8 pb-8">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 2FA 이미 활성화된 경우: 비활성화 UI */}
          {is2FAEnabled && (
            <div className="space-y-4">
              <Alert>
                <CheckCircleIcon className="h-4 w-4" />
                <AlertTitle>2FA 활성화됨</AlertTitle>
                <AlertDescription>
                  현재 2단계 인증이 활성화되어 있습니다. 비활성화하려면 비밀번호를 입력하세요.
                </AlertDescription>
              </Alert>

              <div className="relative">
                <LockIcon
                  className="absolute top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "#10b981", left: "16px" }}
                />
                <Input
                  className="h-11 border-gray-200"
                  style={{ paddingLeft: "40px", paddingRight: "16px" }}
                  type="password"
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  icon={<ArrowLeftIcon />}
                  onClick={() => navigate({ to: "/admin/login" })}
                >
                  돌아가기
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  icon={<ShieldOffIcon />}
                  onClick={handleDisable}
                  disabled={isLoading}
                >
                  {isLoading ? "처리 중..." : "2FA 비활성화"}
                </Button>
              </div>
            </div>
          )}

          {/* Step 1: 비밀번호 입력 */}
          {!is2FAEnabled && step === "password" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                2FA를 활성화하면 로그인 시 인증 앱의 코드가 필요합니다.
              </p>

              <div className="relative">
                <LockIcon
                  className="absolute top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "#10b981", left: "16px" }}
                />
                <Input
                  className="h-11 border-gray-200"
                  style={{ paddingLeft: "40px", paddingRight: "16px" }}
                  type="password"
                  placeholder="현재 비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  icon={<ArrowLeftIcon />}
                  onClick={() => navigate({ to: "/admin/login" })}
                >
                  취소
                </Button>
                <Button
                  className="flex-1 text-white"
                  style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
                  onClick={handleEnable}
                  disabled={isLoading}
                >
                  {isLoading ? "처리 중..." : "다음"}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: QR 코드 표시 */}
          {!is2FAEnabled && step === "qr" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Google Authenticator, Authy 등의 앱으로
                <br />
                아래 QR 코드를 스캔하세요
              </p>

              <div className="flex justify-center p-4 bg-white rounded-lg border">
                <QRCodeSVG value={totpURI} size={180} />
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-amber-800">백업 코드</span>
                  <Button variant="ghost" size="sm" onClick={copyBackupCodes} icon={<CopyIcon />}>
                    복사
                  </Button>
                </div>
                <p className="text-xs text-amber-700 mb-2">
                  인증 앱에 접근할 수 없을 때 사용할 수 있습니다. 안전한 곳에 보관하세요.
                </p>
                <div className="grid grid-cols-2 gap-1 font-mono text-xs">
                  {backupCodes.map((code, i) => (
                    <span key={i} className="text-amber-900">
                      {code}
                    </span>
                  ))}
                </div>
              </div>

              <Button
                className="w-full text-white"
                style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
                onClick={() => setStep("verify")}
              >
                다음
              </Button>
            </div>
          )}

          {/* Step 3: 코드 검증 */}
          {!is2FAEnabled && step === "verify" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                인증 앱에 표시된 6자리 코드를 입력하세요
              </p>

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
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("qr")}>
                  이전
                </Button>
                <Button
                  className="flex-1 text-white"
                  style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
                  onClick={handleVerify}
                  disabled={isLoading || verifyCode.length !== 6}
                >
                  {isLoading ? "확인 중..." : "확인"}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: 완료 */}
          {!is2FAEnabled && step === "done" && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircleIcon className="h-16 w-16 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">2FA 설정 완료!</h3>
              <p className="text-sm text-gray-600">다음 로그인부터 인증 앱의 코드가 필요합니다.</p>
              <Button
                className="w-full text-white"
                style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
                onClick={() => navigate({ to: "/admin/login" })}
              >
                완료
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
