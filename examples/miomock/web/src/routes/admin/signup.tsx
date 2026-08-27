import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@sonamu-kit/react-components";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import LockIcon from "~icons/lucide/lock";
import LogInIcon from "~icons/lucide/log-in";
import MailIcon from "~icons/lucide/mail";
import UserIcon from "~icons/lucide/user";
import UserPlusIcon from "~icons/lucide/user-plus";

import { useSonamuContext } from "@/contexts/sonamu-provider";
import { SD } from "@/i18n/sd.generated";

export const Route = createFileRoute("/admin/signup")({
  head: () => ({
    meta: [{ title: "Miomock - Sign Up" }, { name: "description", content: "회원가입" }],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { auth } = useSonamuContext();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setError("");

    if (password !== confirmPassword) {
      setError(SD("signup.passwordMismatch"));
      return;
    }

    const result = await auth.signUp.email({
      name,
      email,
      password,
      role: "normal",
      created_at: new Date(),
    });

    if (result.error) {
      setError(result.error.message ?? SD("error.unauthorized"));
      return;
    }

    navigate({ to: "/admin/login" });
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
          <CardTitle className="text-2xl font-bold mb-1" style={{ color: "#059669" }}>
            {SD("signup.title")}
          </CardTitle>
          <p className="text-sm text-gray-500">{SD("signup.subtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-5 px-8 pb-8">
          <div className="relative mb-4">
            <UserIcon
              className="absolute top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: "#10b981", left: "16px" }}
            />
            <Input
              className="h-11 border-gray-200"
              style={{ paddingLeft: "40px", paddingRight: "16px" }}
              placeholder={SD("signup.name")}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="relative mb-4">
            <MailIcon
              className="absolute top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: "#10b981", left: "16px" }}
            />
            <Input
              className="h-11 border-gray-200"
              style={{ paddingLeft: "40px", paddingRight: "16px" }}
              placeholder={SD("signup.email")}
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
              placeholder={SD("signup.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              placeholder={SD("signup.confirmPassword")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <div className="flex gap-3">
            <Button
              className="flex-1 h-11 gap-2 text-white font-medium shadow-md"
              style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
              onClick={handleSubmit}
            >
              <UserPlusIcon className="h-4 w-4" />
              {SD("signup.submit")}
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-11 gap-2"
              style={{ borderColor: "#6ee7b7", color: "#059669" }}
              onClick={() => navigate({ to: "/admin/login" })}
            >
              <LogInIcon className="h-4 w-4" />
              {SD("signup.login")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
