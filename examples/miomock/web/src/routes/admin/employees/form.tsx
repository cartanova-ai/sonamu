import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@sonamu-kit/react-components/components";
import { type Override, useTypeForm } from "@sonamu-kit/react-components/lib";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DepartmentIdAsyncSelect } from "@/components/department/DepartmentIdAsyncSelect";
import { UserIdAsyncSelect } from "@/components/user/UserIdAsyncSelect";
import { EmployeeSaveParams } from "@/services/employee/employee.types";
import { EmployeeService } from "@/services/services.generated";
import type { EmployeeSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";
import ArrowLeftIcon from "~icons/lucide/arrow-left";
import SaveIcon from "~icons/lucide/save";
import FormIcon from "~icons/mdi/form-select";

const formSearchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/admin/employees/form")({
  validateSearch: formSearchSchema,
  component: EmployeesFormPage,
});

function EmployeesFormPage() {
  const { id } = Route.useSearch();
  return <EmployeesForm id={id} />;
}

type EmployeesFormProps = {
  id?: number;
  mode?: "page" | "modal";
};

export function EmployeesForm({ id, mode }: EmployeesFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [_row, setRow] = useState<EmployeeSubsetA | undefined>();

  const { form, setForm, register } = useTypeForm(EmployeeSaveParams, {
    user_id: 0,
    department_id: null,
    employee_number: "",
    salary: null,
    hire_date: null,
    notes: null,
  });

  useEffect(() => {
    console.log("form.hire_date", form.hire_date);
  }, [form]);

  useEffect(() => {
    if (id) {
      EmployeeService.getEmployee("A", id).then((row) => {
        setRow(row);
        setForm((prevForm) => ({
          ...prevForm,
          ...row,
          user_id: row.user.id,
          department_id: row.department?.id ?? null,
        }));
      });
    }
  }, [id, setForm]);

  const saveMutation = EmployeeService.useSaveMutation();
  const handleSubmit = () => {
    console.log("handleSubmit", form);
    saveMutation.mutate(
      { spa: [form] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["Employee"],
          });

          if (mode === "modal") {
            // modal mode
          } else {
            router.navigate({ to: "/admin/employees" });
          }
        },
        onError: defaultCatch,
      },
    );
  };

  const PAGE = {
    title: `직원${id ? ` #${id} Edit` : " Create"}`,
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1800px] mx-auto p-8">
        <div className="space-y-6 mb-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FormIcon className="h-5 w-5" />
              <span className="text-lg font-semibold h-5">{PAGE.title}</span>
            </div>
            {mode !== "modal" && (
              <Button
                variant="outline"
                onClick={() => router.navigate({ to: "/admin/employees" })}
                icon={<ArrowLeftIcon />}
              >
                Back To List
              </Button>
            )}
          </div>

          {/* Form Card */}
          <Card className="border-border/40 bg-gray-50 shadow-sm">
            <CardHeader className="px-4 border-b border-gray-200 flex items-center">
              <CardTitle className="text-sm font-medium leading-none m-0">{PAGE.title}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
                {/* USER */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">USER</label>
                  <UserIdAsyncSelect subset="A" {...register("user_id")} className="h-8 text-xs" />
                </div>

                {/* 부서 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">부서</label>
                  <DepartmentIdAsyncSelect
                    subset="A"
                    {...register("department_id")}
                    clearable
                    className="h-8 text-xs"
                  />
                </div>

                {/* 사번 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">사번</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="사번"
                    {...register("employee_number")}
                  />
                </div>

                {/* SALARY */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">SALARY</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="SALARY"
                    {...register("salary")}
                  />
                </div>

                {/* 입사일 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">입사일</label>
                  <DateTimeLocalInput className="h-8 text-xs bg-white" {...register("hire_date")} />
                </div>

                {/* 비고 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">비고</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="비고"
                    {...register("notes")}
                  />
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-between pt-4">
                  {form.id && form.created_at && (
                    <div className="flex items-center">
                      <label className="mr-2 text-xs text-gray-600">Created At:</label>
                      <span className="text-xs text-gray-600">{String(form.created_at)}</span>
                    </div>
                  )}
                  <Button onClick={handleSubmit} icon={<SaveIcon />}>
                    Save
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export type DateTimeLocalInputProps = Override<
  React.ComponentProps<"input">,
  {
    value: Date | null;
    onValueChange: (value: Date | null) => void;
  }
>;
export function DateTimeLocalInput({ value, onValueChange, ...props }: DateTimeLocalInputProps) {
  // value가 문자열이거나 빈 문자열인 경우 처리
  const dateValue = !value
    ? ""
    : value instanceof Date
      ? value.toISOString().slice(0, 16)
      : new Date(value).toISOString().slice(0, 16);

  return (
    <Input
      type="datetime-local"
      value={dateValue}
      onChange={(e) => onValueChange(e.target.value ? new Date(e.target.value) : null)}
      {...props}
    />
  );
}
