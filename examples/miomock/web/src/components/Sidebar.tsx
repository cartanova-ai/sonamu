import { Button } from "@sonamu-kit/react-components";
import { Link, useRouterState } from "@tanstack/react-router";
import type React from "react";
import ActivityIcon from "~icons/lucide/activity";
import ArchiveIcon from "~icons/lucide/archive";
import BuildingIcon from "~icons/lucide/building";
import ClipboardListIcon from "~icons/lucide/clipboard-list";
import FileTextIcon from "~icons/lucide/file-text";
import FolderIcon from "~icons/lucide/folder";
import HandshakeIcon from "~icons/lucide/handshake";
import HomeIcon from "~icons/lucide/home";
import LogOutIcon from "~icons/lucide/log-out";
import MessageCircleIcon from "~icons/lucide/message-circle";
import TagIcon from "~icons/lucide/tag";
import TestTubeIcon from "~icons/lucide/test-tube";
import UploadIcon from "~icons/lucide/upload";
import UsersIcon from "~icons/lucide/users";
import ListIcon from "~icons/mdi/format-list-bulleted";

import { authClient, useSonamuContext } from "@/contexts/sonamu-provider";
import { SD } from "@/i18n/sd.generated";

interface SidebarProps {
  className?: string;
}

type MenuKey =
  | "menu.home"
  | "menu.company"
  | "menu.user"
  | "menu.department"
  | "menu.employee"
  | "menu.project"
  | "menu.tag"
  | "menu.file"
  | "menu.fileUploadTest"
  | "menu.selectTest"
  | "menu.document"
  | "menu.auditLog"
  | "menu.telemetry"
  | "menu.chat";

interface MenuItemProps {
  titleKey: MenuKey;
  path: string;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

const menuItems: MenuItemProps[] = [
  { titleKey: "menu.home", path: "/admin", icon: HomeIcon },
  { titleKey: "menu.company", path: "/admin/companies", icon: BuildingIcon },
  { titleKey: "menu.user", path: "/admin/users", icon: UsersIcon },
  { titleKey: "menu.department", path: "/admin/departments", icon: ArchiveIcon },
  { titleKey: "menu.employee", path: "/admin/employees", icon: HandshakeIcon },
  { titleKey: "menu.project", path: "/admin/projects", icon: FolderIcon },
  { titleKey: "menu.tag", path: "/admin/tags", icon: TagIcon },
  { titleKey: "menu.document", path: "/admin/documents", icon: FileTextIcon },
  { titleKey: "menu.file", path: "/admin/files", icon: UploadIcon },
  { titleKey: "menu.auditLog", path: "/admin/audit-logs", icon: ClipboardListIcon },
  { titleKey: "menu.telemetry", path: "/admin/telemetry", icon: ActivityIcon },
  { titleKey: "menu.chat", path: "/admin/chat", icon: MessageCircleIcon },
  { titleKey: "menu.fileUploadTest", path: "/admin/files/upload-test", icon: TestTubeIcon },
  { titleKey: "menu.selectTest", path: "/admin/select-test", icon: ListIcon },
];

export default function Sidebar({ className }: SidebarProps) {
  const { auth } = useSonamuContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const session = authClient.useSession();
  const user = session.data?.user ?? null;

  const isActive = (path: string) => {
    if (path === "/admin") {
      return pathname === "/admin" || pathname === "/admin/";
    }
    return pathname === path;
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
            {user.name} ({user.role})
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
              <span className="truncate">{SD(item.titleKey)}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Footer */}
      {user && (
        <div className="flex shrink-0 flex-col gap-2 p-2 border-t border-sidebar-border">
          <Button variant="destructive" onClick={() => auth.signOut()} icon={<LogOutIcon />}>
            {SD("common.logout")}
          </Button>
        </div>
      )}
    </div>
  );
}
