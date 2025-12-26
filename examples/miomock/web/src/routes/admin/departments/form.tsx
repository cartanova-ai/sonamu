import { Icon, type IconProps } from "@iconify/react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { CompanyIdAsyncSelect } from "@/components/company/CompanyIdAsyncSelect";
import { DepartmentIdAsyncSelect } from "@/components/department/DepartmentIdAsyncSelect";
import { DepartmentSaveParams } from "@/services/department/department.types";
import { DepartmentService } from "@/services/services.generated";
import type { DepartmentSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";

const formSearchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/admin/departments/form")({
  validateSearch: formSearchSchema,
  component: DepartmentsFormPage,
});

// Icons
const FormIcon = (props: Omit<IconProps, "icon">) => <Icon icon="mdi:form-select" {...props} />;
const ArrowLeftIcon = (props: Omit<IconProps, "icon">) => (
  <Icon icon="lucide:arrow-left" {...props} />
);
const SaveIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:save" {...props} />;

function DepartmentsFormPage() {
  const { id } = Route.useSearch();
  return <DepartmentsForm id={id} />;
}

type DepartmentsFormProps = {
  id?: number;
  mode?: "page" | "modal";
};

export function DepartmentsForm({ id, mode }: DepartmentsFormProps) {
  const router = useRouter();
  const [_row, setRow] = useState<DepartmentSubsetA | undefined>();

  const { form, setForm, register } = useTypeForm(DepartmentSaveParams, {
    name: "",
    company_id: 0,
    parent_id: null,
  });

  useEffect(() => {
    if (id) {
      DepartmentService.getDepartment("A", id).then((row) => {
        setRow(row);
        setForm((prevForm) => ({
          ...prevForm,
          ...row,
          company_id: row.company.id,
          parent_id: row.parent?.id ?? null,
        }));
      });
    }
  }, [id, setForm]);

  const goBack = (to: string) => {
    router.navigate({ to });
  };

  const handleSubmit = useCallback(() => {
    DepartmentService.save([form])
      .then(() => {
        if (mode === "modal") {
          // modal mode
        } else {
          goBack("/admin/departments");
        }
      })
      .catch(defaultCatch);
  }, [form, mode]);

  const PAGE = {
    title: `부서${id ? ` #${id} Edit` : " Create"}`,
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
                onClick={() => goBack("/admin/departments")}
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
                {/* 부서명 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">부서명</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="부서명"
                    {...register("name")}
                  />
                </div>

                {/* COMPANY */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">COMPANY</label>
                  <CompanyIdAsyncSelect
                    subset="A"
                    {...register("company_id")}
                    className="h-8 text-xs"
                  />
                </div>

                {/* ParentId */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">ParentId</label>
                  <DepartmentIdAsyncSelect
                    subset="A"
                    {...register("parent_id")}
                    clearable
                    className="h-8 text-xs"
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
