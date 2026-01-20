import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DateSelectorMultiple,
  type DateSelectorValue,
} from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import CalendarIcon from "~icons/lucide/calendar";
import ChevronDownIcon from "~icons/lucide/chevron-down";

export const Route = createFileRoute("/admin/components/")({
  component: ComponentsTestPage,
});

function ComponentsTestPage() {
  // DateSelectorMultiple 테스트용 상태
  const [singleDateValue, setSingleDateValue] = useState<DateSelectorValue | undefined>({
    type: "single",
    date: new Date(),
  });
  const [rangeDateValue, setRangeDateValue] = useState<DateSelectorValue | undefined>({
    type: "range",
    from: new Date(2024, 0, 1),
    to: new Date(2024, 0, 31),
  });
  const [emptyDateValue, setEmptyDateValue] = useState<DateSelectorValue | undefined>();

  return (
    <div className="container py-8 space-y-8 max-w-4xl">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Component Test</h1>
      </div>

      {/* DateSelectorMultiple 테스트 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            DateSelectorMultiple
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 설명 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
            <div className="font-semibold text-yellow-900 mb-1">💡 시간대(Timezone) 참고</div>
            <div className="text-yellow-800 space-y-1">
              <p>
                Date 객체는 내부적으로 <strong>UTC(협정 세계시)</strong>로 저장됩니다.
              </p>
              <p>
                한국은 <strong>UTC+9</strong>이므로, 화면에 표시되는 날짜와 JSON 값이 다를 수
                있습니다.
              </p>
              <p className="pt-1 font-mono text-xs bg-yellow-100 p-2 rounded">
                예: 2026-01-13 00:00 (KST) = 2026-01-12T15:00:00.000Z (UTC)
              </p>
            </div>
          </div>

          {/* 단일 날짜 모드 */}
          <div className="space-y-3">
            <div>
              <h3 className="font-medium mb-1">Single Date Mode</h3>
              <p className="text-sm text-muted-foreground">초기값이 있는 단일 날짜 선택</p>
            </div>
            <DateSelectorMultiple
              CalendarIcon={CalendarIcon}
              ChevronDownIcon={ChevronDownIcon}
              value={singleDateValue}
              onValueChange={setSingleDateValue}
              placeholder="날짜를 선택하세요"
            />
            <div className="text-xs font-mono bg-muted p-2 rounded">
              {singleDateValue ? JSON.stringify(singleDateValue, null, 2) : "None"}
            </div>
          </div>

          <div className="border-t" />

          {/* 날짜 범위 모드 */}
          <div className="space-y-3">
            <div>
              <h3 className="font-medium mb-1">Date Range Mode</h3>
              <p className="text-sm text-muted-foreground">범위 모드 기본값, 2개월 표시 ⭐</p>
            </div>
            <DateSelectorMultiple
              CalendarIcon={CalendarIcon}
              ChevronDownIcon={ChevronDownIcon}
              value={rangeDateValue}
              onValueChange={setRangeDateValue}
              placeholder="날짜 범위를 선택하세요"
              defaultRangeMode={true}
              numberOfMonths={2}
            />
            <div className="text-xs font-mono bg-muted p-2 rounded">
              {rangeDateValue ? JSON.stringify(rangeDateValue, null, 2) : "None"}
            </div>
          </div>

          <div className="border-t" />

          {/* 빈 상태 */}
          <div className="space-y-3">
            <div>
              <h3 className="font-medium mb-1">Empty State</h3>
              <p className="text-sm text-muted-foreground">초기값 없는 상태</p>
            </div>
            <div className="flex gap-2">
              <DateSelectorMultiple
                CalendarIcon={CalendarIcon}
                ChevronDownIcon={ChevronDownIcon}
                value={emptyDateValue}
                onValueChange={setEmptyDateValue}
                placeholder="날짜를 선택하세요"
              />
            </div>
            <div className="text-xs font-mono bg-muted p-2 rounded">
              {emptyDateValue ? JSON.stringify(emptyDateValue, null, 2) : "None"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
