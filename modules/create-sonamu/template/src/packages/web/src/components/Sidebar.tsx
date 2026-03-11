import {
  Button,
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenu,
} from "@sonamu-kit/react-components/components";
import { Link, useRouterState } from "@tanstack/react-router";
import type React from "react";
import { useSonamuContext } from "@/contexts/sonamu-provider";
import { SD } from "@/i18n/sd.generated";
import HomeIcon from "~icons/lucide/home";
import LogOutIcon from "~icons/lucide/log-out";
// TODO: 필요한 아이콘 추가
// import UsersIcon from "~icons/lucide/users";
// import SettingsIcon from "~icons/lucide/settings";

interface SidebarProps {
  className?: string;
}

interface MenuItemProps {
  title: string;
  path: string;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

// 관리자용 메뉴
const adminMenuItems: MenuItemProps[] = [
  { title: "Dashboard", path: "/admin", icon: HomeIcon },
  // TODO: 엔티티 추가 시 메뉴 추가
  // { title: "Users", path: "/admin/users", icon: UsersIcon },
  // { title: "Settings", path: "/admin/settings", icon: SettingsIcon },
];

// 일반 사용자용 메뉴
const userMenuItems: MenuItemProps[] = [
  { title: "Home", path: "/", icon: HomeIcon },
  // TODO: 사용자용 메뉴 추가
  // { title: "Profile", path: "/profile", icon: UserIcon },
];

export default function Sidebar({ className }: SidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { auth } = useSonamuContext();
  const session = auth?.useSession?.();
  const user = session?.data?.user ?? null;
  const logout = () => auth?.signOut?.();

  // 경로에 따라 메뉴 및 타이틀 분기
  const isAdmin = pathname.startsWith("/admin");
  const menuItems = isAdmin ? adminMenuItems : userMenuItems;
  const title = isAdmin ? "Admin" : "Sonamu App";

  const isActive = (path: string) => {
    if (path === "/admin" || path === "/") {
      return pathname === path || pathname === `${path}/`;
    }
    return pathname.startsWith(path);
  };

  return (
    <SidebarComponent collapsible="none" className={`h-screen sticky top-0 ${className || ""}`}>
      {/* Header */}
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">{title}</span>
        </div>
        {user && (
          <div className="text-sm text-sidebar-foreground/70 mt-1">
            {user.name ?? user.email ?? "User"}
          </div>
        )}
      </SidebarHeader>

      {/* Menu Content */}
      <SidebarContent className="flex-1 overflow-y-auto">
        <SidebarGroup className="px-2 py-2">
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton asChild isActive={isActive(item.path)}>
                  <Link to={item.path} className="!no-underline">
                    {item.icon && <item.icon className="size-4" />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      {user && (
        <SidebarFooter className="border-t border-sidebar-border px-4 py-3">
          <Button variant="destructive" onClick={logout} className="w-full">
            <LogOutIcon className="size-4 mr-2" />
            {SD("common.logout")}
          </Button>
        </SidebarFooter>
      )}
    </SidebarComponent>
  );
}
