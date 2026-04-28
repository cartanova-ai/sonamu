import { createFileRoute } from "@tanstack/react-router";
import CalendarIcon from "~icons/lucide/calendar";
import ChevronDownIcon from "~icons/lucide/chevron-down";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { MonthPickerMultiple } from "@/components/ui/month-picker-multiple";
import { Pagination } from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTypeForm } from "@/lib/form-helpers";

import { FormDebugPanel } from "../components/FormDebugPanel";
import { DataDisplayDemoSchema } from "../schemas/data-display-demo.schema";

export const Route = createFileRoute("/data-display")({
  component: DataDisplayPage,
});

function DataDisplayPage() {
  // useTypeForm으로 상태 관리
  const { form, register } = useTypeForm(DataDisplayDemoSchema, {
    currentPage: 1,
    selectedValues: ["option1"],
    monthValue: undefined,
    selectValue: undefined,
    dateInputValue: null,
  });

  const multiSelectOptions = [
    { value: "option1", label: "옵션 1" },
    { value: "option2", label: "옵션 2" },
    { value: "option3", label: "옵션 3" },
    { value: "option4", label: "옵션 4" },
    { value: "option5", label: "옵션 5" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">📊 Data Display Components</h1>
        <p className="mt-2 text-muted-foreground">12개의 데이터 표시 및 선택 컴포넌트</p>
      </div>

      {/* Avatar */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Avatar</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="flex gap-4">
            <Avatar>
              <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </section>

      {/* Badge */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Badge</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </div>
      </section>

      {/* Date Input */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Date Input</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <DateInput {...register("dateInputValue")} />
          </div>
        </div>
      </section>

      {/* Month Picker Multiple */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Month Picker Multiple</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <MonthPickerMultiple
              CalendarIcon={CalendarIcon}
              ChevronDownIcon={ChevronDownIcon}
              {...register("monthValue")}
            />
          </div>
        </div>
      </section>

      {/* Progress */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Progress</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="space-y-4 max-w-md">
            <Progress value={33} />
            <Progress value={66} />
            <Progress value={100} />
          </div>
        </div>
      </section>

      {/* Select */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Select</h2>
        <div className="border rounded-lg p-6 bg-card">
          <Select
            {...register("selectValue")}
            items={[
              { value: "option1", label: "옵션 1" },
              { value: "option2", label: "옵션 2" },
              { value: "option3", label: "옵션 3" },
            ]}
            placeholder="선택하세요"
            className="w-[200px]"
          />
        </div>
      </section>

      {/* Multi Select */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Multi Select</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <Select
              {...register("selectedValues")}
              items={multiSelectOptions}
              multiple
              placeholder="옵션 선택"
              className="bg-gray-100"
            />
          </div>
        </div>
      </section>

      {/* Pagination */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Pagination</h2>
        <div className="border rounded-lg p-6 bg-card">
          <Pagination {...register("currentPage")} total={100} itemsPerPage={10} />
        </div>
      </section>

      {/* Skeleton */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Skeleton</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="space-y-3 max-w-md">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Table</h2>
        <div className="border rounded-lg p-6 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>역할</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>홍길동</TableCell>
                <TableCell>hong@example.com</TableCell>
                <TableCell>개발자</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>김철수</TableCell>
                <TableCell>kim@example.com</TableCell>
                <TableCell>디자이너</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      {/* 나머지 컴포넌트들 목록 */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Other Components</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div>• async-select - 비동기 데이터 선택</div>
          </div>
        </div>
      </section>

      {/* 디버그 패널 - 우측 하단에 고정 */}
      <FormDebugPanel
        formData={form}
        title="Data Display State"
        sections={[
          { title: "Date Input", fields: ["dateInputValue"] },
          { title: "Month Picker", fields: ["monthValue"] },
          { title: "Select", fields: ["selectValue"] },
          { title: "Multi Select", fields: ["selectedValues"] },
          { title: "Pagination", fields: ["currentPage"] },
        ]}
      />
    </div>
  );
}
