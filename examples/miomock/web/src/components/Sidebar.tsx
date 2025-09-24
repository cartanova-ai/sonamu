import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Icon } from "semantic-ui-react";
import classNames from "classnames";

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
    path: "/",
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
];

export default function Sidebar({ className }: SidebarProps) {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className={classNames("sidebar", className)}>
      <div className="sidebar-header">
        <h3>Sonamu Admin</h3>
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
            {item.icon && <Icon name={item.icon as any} />}
            {item.title}
          </Menu.Item>
        ))}
      </Menu>
    </div>
  );
}
