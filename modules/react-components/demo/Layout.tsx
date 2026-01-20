import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const navLinks = [
  { to: "/form", label: "Form" },
  { to: "/layout", label: "Layout" },
  { to: "/data-display", label: "Data Display" },
  { to: "/dialogs-alerts", label: "Dialogs & Alerts" },
  { to: "/navigation", label: "Navigation1" },
];

function Layout() {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const getLinkClassName = (to: string) => {
    return cn(
      "text-sm font-medium transition-colors",
      pathname === to ? "text-black font-semibold" : "text-gray-600 hover:text-black",
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 상단 네비게이션 */}
      <nav className="border-b bg-white">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center space-x-6">
            <Link to="/" className="text-xl font-bold hover:text-primary">
              @sonamu-kit/react-components
            </Link>
            <div className="flex space-x-4">
              {navLinks.map((link) => (
                <Link key={link.to} to={link.to} className={getLinkClassName(link.to)}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* 메인 콘텐츠 */}
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
