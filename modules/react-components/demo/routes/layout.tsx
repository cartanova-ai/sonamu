import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChevronDownIcon from "~icons/lucide/chevron-down";

export const Route = createFileRoute("/layout")({
  component: LayoutPage,
});

function LayoutPage() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">🎨 Layout Components</h1>
        <p className="mt-2 text-muted-foreground">10개의 레이아웃 구조 및 컨테이너 컴포넌트</p>
      </div>

      {/* Accordion */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Accordion</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger>섹션 1</AccordionTrigger>
                <AccordionContent>첫 번째 아코디언 내용입니다.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>섹션 2</AccordionTrigger>
                <AccordionContent>두 번째 아코디언 내용입니다.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>섹션 3</AccordionTrigger>
                <AccordionContent>세 번째 아코디언 내용입니다.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* Aspect Ratio */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Aspect Ratio</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <AspectRatio ratio={16 / 9} className="bg-muted">
              <div className="flex items-center justify-center h-full">16:9 비율</div>
            </AspectRatio>
          </div>
        </div>
      </section>

      {/* Card */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Card</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <Card>
              <CardHeader>
                <CardTitle>카드 제목</CardTitle>
                <CardDescription>카드 설명입니다.</CardDescription>
              </CardHeader>
              <CardContent>
                <p>카드 내용이 여기에 들어갑니다.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Carousel */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Carousel</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md mx-auto">
            <Carousel>
              <CarouselContent>
                {[1, 2, 3, 4, 5].map((num) => (
                  <CarouselItem key={num}>
                    <div className="p-1">
                      <Card>
                        <CardContent className="flex aspect-square items-center justify-center p-6">
                          <span className="text-4xl font-semibold">{num}</span>
                        </CardContent>
                      </Card>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
        </div>
      </section>

      {/* Collapsible */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Collapsible</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-4 border rounded">
                <span>접기/펼치기 가능한 섹션</span>
                <ChevronDownIcon className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 p-4 border rounded">
                접혀진 내용입니다. 토글 버튼을 클릭하면 보이거나 숨겨집니다.
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </section>

      {/* Resizable */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Resizable</h2>
        <div className="border rounded-lg p-6 bg-card">
          <ResizablePanelGroup direction="horizontal" className="max-w-md border rounded">
            <ResizablePanel defaultSize={50}>
              <div className="flex h-[200px] items-center justify-center p-6">
                <span className="font-semibold">패널 1</span>
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={50}>
              <div className="flex h-[200px] items-center justify-center p-6">
                <span className="font-semibold">패널 2</span>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </section>

      {/* Scroll Area */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Scroll Area</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <ScrollArea className="h-[200px] border rounded p-4">
              <div className="space-y-4">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i}>아이템 {i + 1}</div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </section>

      {/* Separator */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Separator</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md space-y-4">
            <div>섹션 1</div>
            <Separator />
            <div>섹션 2</div>
            <Separator />
            <div>섹션 3</div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Tabs</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <Tabs defaultValue="tab1">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="tab1">탭 1</TabsTrigger>
                <TabsTrigger value="tab2">탭 2</TabsTrigger>
                <TabsTrigger value="tab3">탭 3</TabsTrigger>
              </TabsList>
              <TabsContent value="tab1" className="mt-4">
                첫 번째 탭의 내용입니다.
              </TabsContent>
              <TabsContent value="tab2" className="mt-4">
                두 번째 탭의 내용입니다.
              </TabsContent>
              <TabsContent value="tab3" className="mt-4">
                세 번째 탭의 내용입니다.
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>

      {/* 나머지 컴포넌트들 목록 */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Other Components</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div>• sidebar - 사이드바 (고급 컴포넌트)</div>
          </div>
        </div>
      </section>
    </div>
  );
}
