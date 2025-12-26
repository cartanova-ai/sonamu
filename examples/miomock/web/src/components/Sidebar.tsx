import { Icon } from "@iconify/react";
import { Button } from "@sonamu-kit/react-components/components";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../admin-common/auth";

interface SidebarProps {
  className?: string;
}

interface MenuItemProps {
  title: string;
  path: string;
  icon?: string;
}

const menuItems: MenuItemProps[] = [
  { title: "홈", path: "/admin", icon: "lucide:home" },
  { title: "회사 관리", path: "/admin/companies", icon: "lucide:building" },
  { title: "사용자 관리", path: "/admin/users", icon: "lucide:users" },
  { title: "부서 관리", path: "/admin/departments", icon: "lucide:archive" },
  { title: "직원 관리", path: "/admin/employees", icon: "lucide:handshake" },
  { title: "프로젝트 관리", path: "/admin/projects", icon: "lucide:folder" },
  { title: "태그 관리", path: "/admin/tags", icon: "lucide:tag" },
  { title: "파일 업로드", path: "/admin/files", icon: "lucide:upload" },
];

export default function Sidebar({ className }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();

  const isActive = (path: string) => {
    if (path === "/admin") {
      return location.pathname === "/admin" || location.pathname === "/admin/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div
      className={`flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground shrink-0 ${className || ""}`}
    >
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 p-4 border-b border-sidebar-border">
        <h3 className="text-lg font-semibold">Sonamu Admin</h3>
        {user && (
          <div className="text-sm text-sidebar-foreground/70">
            {user.username} ({user.role})
          </div>
        )}
      </div>

      {/* Menu Content */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
        <nav className="flex w-full min-w-0 flex-col gap-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`
                flex w-full items-center gap-2 overflow-hidden rounded-md px-3 py-2 text-left text-sm outline-none
                transition-colors
                hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                ${
                  isActive(item.path)
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground"
                }
              `}
            >
              {item.icon && <Icon icon={item.icon} className="size-4 shrink-0" />}
              <span className="truncate">{item.title}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Footer */}
      {user && (
        <div className="flex shrink-0 flex-col gap-2 p-2 border-t border-sidebar-border">
          <Button variant="destructive" className="w-full" onClick={logout}>
            <Icon icon="lucide:log-out" className="size-4" />
            로그아웃
          </Button>
        </div>
      )}
    </div>
  );
}
