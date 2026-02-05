import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Select } from "@/components";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/toaster";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useTypeForm } from "@/lib/form-helpers";
import AlertTriangleIcon from "~icons/lucide/alert-triangle";
import InfoIcon from "~icons/lucide/info";
import { FormDebugPanel } from "../components/FormDebugPanel";
import {
  DialogFormSchema,
  DrawerFormSchema,
  SheetFormSchema,
} from "../schemas/dialogs-alerts-demo.schema";

export const Route = createFileRoute("/dialogs-alerts")({
  component: DialogsAlertsPage,
});

function DialogsAlertsPage() {
  const { toast: showToast } = useToast();

  // Dialog 폼 상태
  const [dialogOpen, setDialogOpen] = useState(false);
  const {
    form: dialogForm,
    register: registerDialog,
    reset: resetDialog,
    submit: submitDialog,
  } = useTypeForm(DialogFormSchema, {
    name: "",
    email: "",
    message: "",
  });

  // Drawer 폼 상태
  const [drawerOpen, setDrawerOpen] = useState(false);
  const {
    form: drawerForm,
    register: registerDrawer,
    reset: resetDrawer,
    submit: submitDrawer,
  } = useTypeForm(DrawerFormSchema, {
    title: "",
    description: "",
    priority: "medium",
  });

  // Sheet 폼 상태
  const [sheetOpen, setSheetOpen] = useState(false);
  const {
    form: sheetForm,
    register: registerSheet,
    reset: resetSheet,
    submit: submitSheet,
  } = useTypeForm(SheetFormSchema, {
    username: "",
    bio: "",
    notifications: true,
  });

  // Dialog 제출 핸들러
  const handleDialogSubmit = submitDialog(async (data) => {
    console.log("Dialog submitted:", data);
    toast.success("폼이 성공적으로 제출되었습니다!");
    setDialogOpen(false);
    resetDialog();
  });

  // Drawer 제출 핸들러
  const handleDrawerSubmit = submitDrawer(async (data) => {
    console.log("Drawer submitted:", data);
    toast.success("작업이 성공적으로 생성되었습니다!");
    setDrawerOpen(false);
    resetDrawer();
  });

  // Sheet 제출 핸들러
  const handleSheetSubmit = submitSheet(async (data) => {
    console.log("Sheet submitted:", data);
    toast.success("프로필이 업데이트되었습니다!");
    setSheetOpen(false);
    resetSheet();
  });

  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">🔔 Dialogs & Alerts Components</h1>
          <p className="mt-2 text-muted-foreground">13개의 모달, 다이얼로그, 알림 컴포넌트</p>
        </div>

        {/* Alert */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Alert</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="space-y-4 max-w-2xl">
              <Alert>
                <InfoIcon className="h-4 w-4" />
                <AlertTitle>정보</AlertTitle>
                <AlertDescription>이것은 정보 알림 메시지입니다.</AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertTriangleIcon className="h-4 w-4" />
                <AlertTitle>경고</AlertTitle>
                <AlertDescription>이것은 경고 알림 메시지입니다.</AlertDescription>
              </Alert>
            </div>
          </div>
        </section>

        {/* Alert Dialog */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Alert Dialog</h2>
          <div className="border rounded-lg p-6 bg-card">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">삭제하기</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
                  <AlertDialogDescription>
                    이 작업은 되돌릴 수 없습니다. 정말로 삭제하시겠습니까?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction>삭제</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>

        {/* Command */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Command</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="max-w-md">
              <Command className="border rounded-lg">
                <CommandInput placeholder="검색..." />
                <CommandList>
                  <CommandEmpty>결과가 없습니다.</CommandEmpty>
                  <CommandGroup heading="제안">
                    <CommandItem>캘린더</CommandItem>
                    <CommandItem>이모지</CommandItem>
                    <CommandItem>계산기</CommandItem>
                  </CommandGroup>
                  <CommandGroup heading="설정">
                    <CommandItem>프로필</CommandItem>
                    <CommandItem>청구</CommandItem>
                    <CommandItem>설정</CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          </div>
        </section>

        {/* Dialog with Form */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Dialog (with Form)</h2>
          <div className="border rounded-lg p-6 bg-card">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>문의하기</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>문의 사항</DialogTitle>
                  <DialogDescription>문의 내용을 입력해주세요.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="dialog-name">이름</Label>
                    <Input id="dialog-name" {...registerDialog("name")} placeholder="홍길동" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-email">이메일</Label>
                    <Input
                      id="dialog-email"
                      type="email"
                      {...registerDialog("email")}
                      placeholder="hong@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-message">메시지</Label>
                    <Textarea
                      id="dialog-message"
                      {...registerDialog("message")}
                      placeholder="문의 내용을 입력해주세요"
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleDialogSubmit}>제출</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        {/* Drawer with Form */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Drawer (with Form)</h2>
          <div className="border rounded-lg p-6 bg-card">
            <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
              <DrawerTrigger asChild>
                <Button>작업 생성</Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>새 작업 생성</DrawerTitle>
                  <DrawerDescription>작업 정보를 입력해주세요.</DrawerDescription>
                </DrawerHeader>
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="drawer-title">제목</Label>
                    <Input id="drawer-title" {...registerDrawer("title")} placeholder="작업 제목" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="drawer-description">설명</Label>
                    <Textarea
                      id="drawer-description"
                      {...registerDrawer("description")}
                      placeholder="작업 설명 (선택사항)"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="drawer-priority">우선순위</Label>
                    <Select
                      {...registerDrawer("priority")}
                      items={[
                        { value: "low", label: "낮음" },
                        { value: "medium", label: "중간" },
                        { value: "high", label: "높음" },
                      ]}
                    />
                  </div>
                </div>
                <DrawerFooter>
                  <Button onClick={handleDrawerSubmit}>생성</Button>
                  <DrawerClose asChild>
                    <Button variant="outline">취소</Button>
                  </DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </div>
        </section>

        {/* Hover Card */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Hover Card</h2>
          <div className="border rounded-lg p-6 bg-card">
            <HoverCard>
              <HoverCardTrigger asChild>
                <Button variant="link">마우스를 올려보세요</Button>
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">호버 카드</h4>
                  <p className="text-sm text-muted-foreground">
                    마우스를 올렸을 때 나타나는 추가 정보 카드입니다.
                  </p>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
        </section>

        {/* Popover */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Popover</h2>
          <div className="border rounded-lg p-6 bg-card">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">팝오버 열기</Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-medium">팝오버 제목</h4>
                  <p className="text-sm text-muted-foreground">
                    클릭했을 때 나타나는 팝업 컨텐츠입니다.
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </section>

        {/* Sheet with Form */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Sheet (with Form)</h2>
          <div className="border rounded-lg p-6 bg-card">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button>프로필 편집</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>프로필 편집</SheetTitle>
                  <SheetDescription>프로필 정보를 수정할 수 있습니다.</SheetDescription>
                </SheetHeader>
                <div className="py-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sheet-username">사용자명</Label>
                    <Input
                      id="sheet-username"
                      {...registerSheet("username")}
                      placeholder="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sheet-bio">자기소개</Label>
                    <Textarea
                      id="sheet-bio"
                      {...registerSheet("bio")}
                      placeholder="자기소개를 입력해주세요 (최대 200자)"
                      rows={4}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="sheet-notifications" {...registerSheet("notifications")} />
                    <Label htmlFor="sheet-notifications">알림 받기</Label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSheetSubmit} className="flex-1">
                    저장
                  </Button>
                  <Button variant="outline" onClick={() => setSheetOpen(false)} className="flex-1">
                    취소
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </section>

        {/* Toast (shadcn) */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Toast</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="space-x-2">
              <Button
                onClick={() => {
                  showToast({
                    title: "알림",
                    description: "토스트 메시지입니다.",
                  });
                }}
              >
                토스트 표시
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  showToast({
                    title: "에러",
                    description: "에러 토스트 메시지입니다.",
                    variant: "destructive",
                  });
                }}
              >
                에러 토스트
              </Button>
            </div>
          </div>
        </section>

        {/* Sonner */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Sonner</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="space-x-2">
              <Button onClick={() => toast("기본 토스트입니다.")}>기본</Button>
              <Button onClick={() => toast.success("성공 토스트입니다.")}>성공</Button>
              <Button onClick={() => toast.error("에러 토스트입니다.")}>에러</Button>
              <Button
                onClick={() =>
                  toast("제목이 있는 토스트", {
                    description: "설명도 추가할 수 있습니다.",
                  })
                }
              >
                설명 포함
              </Button>
            </div>
          </div>
        </section>

        {/* Tooltip */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Tooltip</h2>
          <div className="border rounded-lg p-6 bg-card">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">마우스를 올려보세요</Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>툴팁 메시지입니다.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </section>

        {/* 나머지 컴포넌트 목록 */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Other Components</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="grid gap-3 text-sm text-muted-foreground">
              <div>• common-modal - 공통 모달 (커스텀 컴포넌트)</div>
            </div>
          </div>
        </section>

        <Toaster />
        <Sonner />
      </div>

      {/* 디버그 패널 - 우측 하단에 고정 */}
      <FormDebugPanel
        formData={{
          dialog: dialogForm,
          drawer: drawerForm,
          sheet: sheetForm,
        }}
        title="Dialog Forms State"
        sections={[
          {
            title: "Dialog Form",
            fields: ["dialog"],
          },
          {
            title: "Drawer Form",
            fields: ["drawer"],
          },
          {
            title: "Sheet Form",
            fields: ["sheet"],
          },
        ]}
      />
    </>
  );
}
