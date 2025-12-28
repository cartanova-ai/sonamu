import { Button } from "@sonamu-kit/react-components/components";
import { Link, useRouterState } from "@tanstack/react-router";
import type React from "react";
import ArchiveIcon from "~icons/lucide/archive";
import BuildingIcon from "~icons/lucide/building";
import FolderIcon from "~icons/lucide/folder";
import HandshakeIcon from "~icons/lucide/handshake";
import HomeIcon from "~icons/lucide/home";
import LogOutIcon from "~icons/lucide/log-out";
import TagIcon from "~icons/lucide/tag";
import UploadIcon from "~icons/lucide/upload";
import UsersIcon from "~icons/lucide/users";
import { useAuth } from "../admin-common/auth";

interface SidebarProps {
  className?: string;
}

interface MenuItemProps {
  title: string;
  path: string;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

const menuItems: MenuItemProps[] = [
  { title: "홈", path: "/admin", icon: HomeIcon },
  { title: "회사 관리", path: "/admin/companies", icon: BuildingIcon },
  { title: "사용자 관리", path: "/admin/users", icon: UsersIcon },
  { title: "부서 관리", path: "/admin/departments", icon: ArchiveIcon },
  { title: "직원 관리", path: "/admin/employees", icon: HandshakeIcon },
  { title: "프로젝트 관리", path: "/admin/projects", icon: FolderIcon },
  { title: "태그 관리", path: "/admin/tags", icon: TagIcon },
  { title: "파일 업로드", path: "/admin/files", icon: UploadIcon },
];

export default function Sidebar({ className }: SidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();

  const isActive = (path: string) => {
    if (path === "/admin") {
      return pathname === "/admin" || pathname === "/admin/";
    }
    return pathname.startsWith(path);
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
              <div className="size-4 shrink-0">
                {item.icon && <item.icon className="size-4 shrink-0" />}
              </div>
              <span className="truncate">{item.title}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Footer */}
      {user && (
        <div className="flex shrink-0 flex-col gap-2 p-2 border-t border-sidebar-border">
          <Button variant="destructive" className="w-full" onClick={logout}>
            <LogOutIcon className="size-4" />
            로그아웃
          </Button>
        </div>
      )}
    </div>
  );
}
