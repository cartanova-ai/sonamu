import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  IdAsyncSelect,
  Input,
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { SD } from "@/i18n/sd.generated";
import { DepartmentSaveParams } from "@/services/department/department.types";
import {
  CompanyAsyncIdConfig,
  DepartmentAsyncIdConfig,
  DepartmentService,
} from "@/services/services.generated";
import { defaultCatch } from "@/services/sonamu.shared";

import ArrowLeftIcon from "~icons/lucide/arrow-left";
import SaveIcon from "~icons/lucide/save";
import FormIcon from "~icons/mdi/form-select";

const formSearchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/admin/departments/form")({
  validateSearch: formSearchSchema,
  component: DepartmentsFormPage,
});

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
  const queryClient = useQueryClient();

  const { form, setForm, register } = useTypeForm(DepartmentSaveParams, {
    name: "",
    company_id: 0,
    parent_id: null,
  });

  useEffect(() => {
    if (id) {
      DepartmentService.getDepartment("A", id).then((row) => {
        setForm((prevForm) => ({
          ...prevForm,
          ...row,
          company_id: row.company?.id,
          parent_id: row.parent?.id ?? null,
        }));
      });
    }
  }, [id, setForm]);

  const saveMutation = DepartmentService.useSaveMutation();
  const handleSubmit = () => {
    saveMutation.mutate(
      { spa: [form] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["Department"],
          });

          if (mode === "modal") {
            // modal mode
          } else {
            router.navigate({ to: "/admin/departments" });
          }
        },
        onError: defaultCatch,
      },
    );
  };

  const PAGE = {
    title: id
      ? SD("entity.edit")(SD("entity.Department"), id)
      : SD("entity.create")(SD("entity.Department")),
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
                onClick={() => router.navigate({ to: "/admin/departments" })}
                icon={<ArrowLeftIcon />}
              >
                {SD("common.backToList")}
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
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Department.name")}
                  </label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder={SD("entity.Department.name")}
                    {...register("name")}
                  />
                </div>

                {/* COMPANY */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Department.company")}
                  </label>
                  <IdAsyncSelect
                    config={CompanyAsyncIdConfig}
                    subset="A"
                    {...register("company_id")}
                  />
                </div>

                {/* ParentId */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Department.parent")}
                  </label>
                  <IdAsyncSelect
                    config={DepartmentAsyncIdConfig}
                    subset="A"
                    {...register("parent_id")}
                  />
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-between pt-4">
                  {form.id && form.created_at && (
                    <div className="flex items-center">
                      <label className="mr-2 text-xs text-gray-600">{SD("form.createdAt")}:</label>
                      <span className="text-xs text-gray-600">{String(form.created_at)}</span>
                    </div>
                  )}
                  <Button onClick={handleSubmit} icon={<SaveIcon />}>
                    {SD("common.save")}
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
