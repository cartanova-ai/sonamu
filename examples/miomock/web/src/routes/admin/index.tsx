import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sonamu-kit/react-components/components";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/admin-common/auth";

export const Route = createFileRoute("/admin/")({
  component: AdminIndexPage,
});

function AdminIndexPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="container mx-auto mt-8 space-y-6">
      <h1 className="text-3xl font-bold">관리자 대시보드</h1>

      <Card>
        <CardHeader>
          <CardTitle>환영합니다!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {user ? (
            <>
              <p>
                <strong>이름:</strong> {user.username}
              </p>
              <p>
                <strong>이메일:</strong> {user.email}
              </p>
              <p>
                <strong>역할:</strong> {user.role}
              </p>
              <p>
                <strong>가입일:</strong>{" "}
                {user.created_at ? new Date(user.created_at).toLocaleDateString("ko-KR") : "-"}
              </p>

              <Button variant="secondary" onClick={handleLogout}>
                로그아웃
              </Button>
            </>
          ) : (
            <>
              <p>로그인이 필요합니다.</p>
              <Button variant="secondary" onClick={() => navigate({ to: "/admin/login-test" })}>
                로그인
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>관리 메뉴</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 w-24">
            <Button variant="default" onClick={() => navigate({ to: "/admin/companies" })}>
              회사 관리
            </Button>
            <Button variant="default" onClick={() => navigate({ to: "/admin/users" })}>
              사용자 관리
            </Button>
            <Button variant="default" onClick={() => navigate({ to: "/admin/departments" })}>
              부서 관리
            </Button>
            <Button variant="default" onClick={() => navigate({ to: "/admin/employees" })}>
              직원 관리
            </Button>
            <Button variant="default" onClick={() => navigate({ to: "/admin/projects" })}>
              프로젝트 관리
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
