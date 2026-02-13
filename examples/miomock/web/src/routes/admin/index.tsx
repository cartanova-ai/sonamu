import { Button, Card, CardContent, CardHeader, CardTitle } from "@sonamu-kit/react-components";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSonamuContext } from "@/contexts/sonamu-provider";
import { SD } from "@/i18n/sd.generated";

export const Route = createFileRoute("/admin/")({
  component: AdminIndexPage,
});

function AdminIndexPage() {
  const { auth } = useSonamuContext();
  const session = auth.useSession();
  const user = session.data?.user ?? null;
  const navigate = useNavigate();

  const handleLogout = () => {
    auth.signOut();
  };

  return (
    <div className="container mx-auto mt-8 space-y-6">
      <h1 className="text-3xl font-bold">{SD("dashboard.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{SD("dashboard.welcome")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {user ? (
            <>
              <p>
                <strong>{SD("dashboard.name")}:</strong> {user.name}
              </p>
              <p>
                <strong>{SD("dashboard.email")}:</strong> {user.email}
              </p>
              <p>
                <strong>{SD("dashboard.role")}:</strong> {user.role}
              </p>
              <p>
                <strong>{SD("dashboard.createdAt")}:</strong>{" "}
                {user.created_at ? new Date(user.created_at).toLocaleDateString("ko-KR") : "-"}
              </p>

              <Button variant="secondary" onClick={handleLogout}>
                {SD("common.logout")}
              </Button>
            </>
          ) : (
            <>
              <p>{SD("dashboard.loginRequired")}</p>
              <Button variant="secondary" onClick={() => navigate({ to: "/admin/login-test" })}>
                {SD("common.login")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{SD("dashboard.adminMenu")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 w-24">
            <Button onClick={() => navigate({ to: "/admin/companies" })}>
              {SD("menu.company")}
            </Button>
            <Button onClick={() => navigate({ to: "/admin/users" })}>{SD("menu.user")}</Button>
            <Button onClick={() => navigate({ to: "/admin/departments" })}>
              {SD("menu.department")}
            </Button>
            <Button onClick={() => navigate({ to: "/admin/employees" })}>
              {SD("menu.employee")}
            </Button>
            <Button onClick={() => navigate({ to: "/admin/projects" })}>
              {SD("menu.project")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
