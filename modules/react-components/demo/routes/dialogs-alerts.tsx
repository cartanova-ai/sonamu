import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
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
import { Toaster } from "@/components/ui/toaster";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import AlertTriangleIcon from "~icons/lucide/alert-triangle";
import InfoIcon from "~icons/lucide/info";

export const Route = createFileRoute("/dialogs-alerts")({
  component: DialogsAlertsPage,
});

function DialogsAlertsPage() {
  const { toast: showToast } = useToast();

  return (
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

      {/* Dialog */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Dialog</h2>
        <div className="border rounded-lg p-6 bg-card">
          <Dialog>
            <DialogTrigger asChild>
              <Button>다이얼로그 열기</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>다이얼로그 제목</DialogTitle>
                <DialogDescription>
                  여기에 다이얼로그 내용이 들어갑니다. 사용자에게 중요한 정보를 표시할 수 있습니다.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm text-muted-foreground">추가 컨텐츠 영역</p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      {/* Drawer */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Drawer</h2>
        <div className="border rounded-lg p-6 bg-card">
          <Drawer>
            <DrawerTrigger asChild>
              <Button>드로어 열기</Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>드로어 제목</DrawerTitle>
                <DrawerDescription>여기에 드로어 설명이 들어갑니다.</DrawerDescription>
              </DrawerHeader>
              <div className="p-4">
                <p className="text-sm text-muted-foreground">드로어 내용</p>
              </div>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="outline">닫기</Button>
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

      {/* Sheet */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Sheet</h2>
        <div className="border rounded-lg p-6 bg-card">
          <Sheet>
            <SheetTrigger asChild>
              <Button>시트 열기</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>시트 제목</SheetTitle>
                <SheetDescription>측면에서 슬라이드되는 시트 컴포넌트입니다.</SheetDescription>
              </SheetHeader>
              <div className="py-4">
                <p className="text-sm text-muted-foreground">시트 내용이 여기에 들어갑니다.</p>
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
  );
}
