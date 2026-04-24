import { type Meta, type StoryObj } from "@storybook/react-vite";
import HomeIcon from "~icons/lucide/home";
import InboxIcon from "~icons/lucide/inbox";
import SettingsIcon from "~icons/lucide/settings";
import UsersIcon from "~icons/lucide/users";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./sidebar";

const meta = {
  component: Sidebar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

const menuItems = [
  { title: "홈", icon: HomeIcon },
  { title: "받은 편지함", icon: InboxIcon },
  { title: "팀원", icon: UsersIcon },
  { title: "설정", icon: SettingsIcon },
];

export const Default: Story = {
  render: function Render() {
    return (
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="px-2 py-1 text-sm font-semibold">Sonamu</div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>메뉴</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <span className="text-sm font-medium">대시보드</span>
          </header>
          <div className="p-6 text-sm">안녕하세요</div>
        </SidebarInset>
      </SidebarProvider>
    );
  },
};
