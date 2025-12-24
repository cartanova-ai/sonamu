import { Icon as IconifyIcon, type IconProps as IconifyIconProps } from "@iconify/react";
import { Button } from "@sonamu-kit/react-components/components";
import classNames from "classnames";
import { Link, useLocation } from "react-router-dom";
import { Icon, type IconProps, Menu } from "semantic-ui-react";
import { useAuth } from "../admin-common/auth";

// Icons
const SignOutIcon = (props: Omit<IconifyIconProps, "icon">) => (
  <IconifyIcon icon="lucide:log-out" {...props} />
);

interface SidebarProps {
  className?: string;
}

interface MenuItemProps {
  title: string;
  path: string;
  icon?: string;
}

const menuItems: MenuItemProps[] = [
  {
    title: "홈",
    path: "/admin",
    icon: "home",
  },
  {
    title: "회사 관리",
    path: "/admin/companies",
    icon: "building",
  },
  {
    title: "사용자 관리",
    path: "/admin/users",
    icon: "users",
  },
  {
    title: "부서 관리",
    path: "/admin/departments",
    icon: "archive",
  },
  {
    title: "직원 관리",
    path: "/admin/employees",
    icon: "handshake",
  },
  {
    title: "프로젝트 관리",
    path: "/admin/projects",
    icon: "folder",
  },
  {
    title: "태그 관리",
    path: "/admin/tags",
    icon: "tag",
  },
  {
    title: "파일 업로드",
    path: "/admin/files",
    icon: "upload",
  },
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

  const handleLogout = () => {
    logout();
  };

  return (
    <div className={classNames("sidebar", className)}>
      <div className="sidebar-header">
        <h3>Sonamu Admin</h3>
        {user && (
          <div style={{ fontSize: "0.9em", marginTop: "0.5em", color: "#666" }}>
            {user.username} ({user.role})
          </div>
        )}
      </div>
      <Menu vertical fluid className="sidebar-menu">
        {menuItems.map((item) => (
          <Menu.Item
            key={item.path}
            as={Link}
            to={item.path}
            active={isActive(item.path)}
            className="sidebar-menu-item"
          >
            {item.icon && <Icon name={item.icon as IconProps["icon"]} />}
            {item.title}
          </Menu.Item>
        ))}
      </Menu>
      {user && (
        <div style={{ padding: "1em" }}>
          <Button variant="destructive" className="w-full" onClick={handleLogout}>
            <SignOutIcon />
            로그아웃
          </Button>
        </div>
      )}
    </div>
  );
}
