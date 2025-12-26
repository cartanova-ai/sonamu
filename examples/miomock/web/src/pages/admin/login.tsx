import { Icon as IconifyIcon, type IconProps } from "@iconify/react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@sonamu-kit/react-components/components";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/admin-common/auth";

// Icons
const MailIcon = (props: Omit<IconProps, "icon">) => <IconifyIcon icon="lucide:mail" {...props} />;
const LockIcon = (props: Omit<IconProps, "icon">) => <IconifyIcon icon="lucide:lock" {...props} />;
const LogInIcon = (props: Omit<IconProps, "icon">) => (
  <IconifyIcon icon="lucide:log-in" {...props} />
);
const UserIcon = (props: Omit<IconProps, "icon">) => <IconifyIcon icon="lucide:user" {...props} />;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = () => {
    login({ email, password });
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
            Welcome Back
          </CardTitle>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </CardHeader>
        <CardContent className="space-y-5 px-8 pb-8">
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

          {user !== null && (
            <Button
              variant="outline"
              className="w-full h-11 gap-2"
              style={{ borderColor: "#6ee7b7", color: "#059669" }}
              onClick={() =>
                navigate(
                  (location.state as { from?: { pathname?: string } })?.from?.pathname ?? "/admin",
                )
              }
            >
              <UserIcon className="h-4 w-4" />
              {user.username}으로 로그인
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
