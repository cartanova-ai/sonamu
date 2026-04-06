import { createFileRoute } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

export const Route = createFileRoute("/navigation")({
  component: NavigationPage,
});

function NavigationPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">🧭 Navigation Components</h1>
        <p className="mt-2 text-muted-foreground">6개의 네비게이션 및 메뉴 컴포넌트</p>
      </div>

      {/* Breadcrumb */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Breadcrumb</h2>
        <div className="border rounded-lg p-6 bg-card">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">홈</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/components">컴포넌트</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </section>

      {/* Context Menu */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Context Menu</h2>
        <div className="border rounded-lg p-6 bg-card">
          <ContextMenu>
            <ContextMenuTrigger className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
              우클릭해보세요
            </ContextMenuTrigger>
            <ContextMenuContent className="w-64">
              <ContextMenuItem>뒤로가기</ContextMenuItem>
              <ContextMenuItem>앞으로가기</ContextMenuItem>
              <ContextMenuItem>새로고침</ContextMenuItem>
              <ContextMenuItem disabled>다른 이름으로 저장...</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </section>

      {/* Navigation Menu */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Navigation Menu</h2>
        <div className="border rounded-lg p-6 bg-card">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>시작하기</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px]">
                    <li className="row-span-3">
                      <NavigationMenuLink asChild>
                        <a
                          className="flex h-full w-full select-none flex-col justify-end rounded-md bg-linear-to-b from-muted/50 to-muted p-6 no-underline outline-none focus:shadow-md"
                          href="/"
                        >
                          <div className="mb-2 mt-4 text-lg font-medium">shadcn/ui</div>
                          <p className="text-sm leading-tight text-muted-foreground">
                            아름답게 디자인된 컴포넌트를 앱에 복사하여 붙여넣을 수 있습니다.
                          </p>
                        </a>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuTrigger>컴포넌트</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2">
                    <li>
                      <NavigationMenuLink asChild>
                        <a
                          href="/dialogs-alerts"
                          className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          <div className="text-sm font-medium leading-none">Alert Dialog</div>
                          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                            사용자의 주의가 필요한 모달 다이얼로그
                          </p>
                        </a>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <a
                          href="/hover-card"
                          className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          <div className="text-sm font-medium leading-none">Hover Card</div>
                          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                            링크 위에 마우스를 올렸을 때 표시되는 카드
                          </p>
                        </a>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </section>

      {/* Dropdown Menu */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Dropdown Menu</h2>
        <div className="border rounded-lg p-6 bg-card">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">메뉴 열기</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>내 계정</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>프로필</DropdownMenuItem>
              <DropdownMenuItem>청구</DropdownMenuItem>
              <DropdownMenuItem>팀</DropdownMenuItem>
              <DropdownMenuItem>구독</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>로그아웃</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      {/* Menubar */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Menubar</h2>
        <div className="border rounded-lg p-6 bg-card">
          <Menubar>
            <MenubarMenu>
              <MenubarTrigger>파일</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>새 파일</MenubarItem>
                <MenubarItem>열기</MenubarItem>
                <MenubarSeparator />
                <MenubarItem>저장</MenubarItem>
                <MenubarItem>다른 이름으로 저장</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>편집</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>실행 취소</MenubarItem>
                <MenubarItem>다시 실행</MenubarItem>
                <MenubarSeparator />
                <MenubarItem>잘라내기</MenubarItem>
                <MenubarItem>복사</MenubarItem>
                <MenubarItem>붙여넣기</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>보기</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>전체 화면</MenubarItem>
                <MenubarItem>확대</MenubarItem>
                <MenubarItem>축소</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>
      </section>
    </div>
  );
}
