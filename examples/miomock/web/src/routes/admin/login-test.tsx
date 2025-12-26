import { Icon as IconifyIcon, type IconProps } from "@iconify/react";
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
} from "@sonamu-kit/react-components/components";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React from "react";

export const Route = createFileRoute("/admin/login-test")({ component: LoginTestPage });

import { useAuth } from "@/admin-common/auth";

// Icons
const MailIcon = (props: Omit<IconProps, "icon">) => <IconifyIcon icon="lucide:mail" {...props} />;
const LockIcon = (props: Omit<IconProps, "icon">) => <IconifyIcon icon="lucide:lock" {...props} />;
const LogInIcon = (props: Omit<IconProps, "icon">) => (
  <IconifyIcon icon="lucide:log-in" {...props} />
);
const LogOutIcon = (props: Omit<IconProps, "icon">) => (
  <IconifyIcon icon="lucide:log-out" {...props} />
);
const HomeIcon = (props: Omit<IconProps, "icon">) => <IconifyIcon icon="lucide:home" {...props} />;

function LoginTestPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const { login, logout, user } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = () => {
    login({ email, password });
  };

  const handleLogout = () => {
    logout();
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
                  <p>사용자: {user.username}</p>
                  <p>이메일: {user.email}</p>
                  <p>역할: {user.role}</p>
                </AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full h-11 gap-2" onClick={handleLogout}>
                <LogOutIcon className="h-4 w-4" />
                로그아웃
              </Button>
              <Button
                className="w-full h-11 gap-2 text-white font-medium shadow-md"
                style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
                onClick={() => navigate({ to: "/admin" })}
              >
                <HomeIcon className="h-4 w-4" />
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

              <Button
                className="w-full h-11 gap-2 text-white font-medium shadow-md"
                style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
                onClick={handleSubmit}
              >
                <LogInIcon className="h-4 w-4" />
                Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
