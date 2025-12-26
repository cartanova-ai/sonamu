import { Icon, type IconProps } from "@iconify/react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@sonamu-kit/react-components/components";
import { useGoBack, useTypeForm } from "@sonamu-kit/react-components/lib";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DepartmentIdAsyncSelect } from "@/components/department/DepartmentIdAsyncSelect";
import { UserIdAsyncSelect } from "@/components/user/UserIdAsyncSelect";
import { EmployeeSaveParams } from "@/services/employee/employee.types";
import { EmployeeService } from "@/services/services.generated";
import type { EmployeeSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";

// Icons
const FormIcon = (props: Omit<IconProps, "icon">) => <Icon icon="mdi:form-select" {...props} />;
const ArrowLeftIcon = (props: Omit<IconProps, "icon">) => (
  <Icon icon="lucide:arrow-left" {...props} />
);
const SaveIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:save" {...props} />;

export default function EmployeesFormPage() {
  const [searchParams] = useSearchParams();
  const query = {
    id: searchParams.get("id") ?? undefined,
  };

  return <EmployeesForm id={query?.id ? Number(query.id) : undefined} />;
}

type EmployeesFormProps = {
  id?: number;
  mode?: "page" | "modal";
};

export function EmployeesForm({ id, mode }: EmployeesFormProps) {
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

  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    EmployeeService.save([form])
      .then(() => {
        if (mode === "modal") {
          // modal mode
        } else {
          goBack("/admin/employees");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, goBack]);

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
                onClick={() => goBack("/admin/employees")}
                className="gap-2"
              >
                <ArrowLeftIcon className="h-4 w-4" />
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
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs bg-white"
                    {...register("hire_date")}
                  />
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
                  <Button onClick={handleSubmit} className="gap-2 bg-primary hover:bg-primary/90">
                    <SaveIcon className="h-4 w-4" />
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
