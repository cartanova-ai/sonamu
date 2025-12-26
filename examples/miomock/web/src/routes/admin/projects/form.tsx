import { Icon, type IconProps } from "@iconify/react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ImageUploader,
  Input,
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { EmployeeIdAsyncSelect } from "@/components/employee/EmployeeIdAsyncSelect";
import { ProjectStatusSelect } from "@/components/project/ProjectStatusSelect";
import { TagIdAsyncSelect } from "@/components/tag/TagIdAsyncSelect";
import { ProjectSaveParams } from "@/services/project/project.types";
import { ProjectService } from "@/services/services.generated";
import type { ProjectSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";

const formSearchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/admin/projects/form")({
  validateSearch: formSearchSchema,
  component: ProjectsFormPage,
});

// Icons
const FormIcon = (props: Omit<IconProps, "icon">) => <Icon icon="mdi:form-select" {...props} />;
const ArrowLeftIcon = (props: Omit<IconProps, "icon">) => (
  <Icon icon="lucide:arrow-left" {...props} />
);
const SaveIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:save" {...props} />;

function ProjectsFormPage() {
  const { id } = Route.useSearch();
  return <ProjectsForm id={id} />;
}

type ProjectsFormProps = {
  id?: number;
  mode?: "page" | "modal";
};

export function ProjectsForm({ id, mode }: ProjectsFormProps) {
  const router = useRouter();
  const [_row, setRow] = useState<ProjectSubsetA | undefined>();

  const { form, setForm, register } = useTypeForm(ProjectSaveParams, {
    name: "",
    status: "planning",
    description: null,
    budget: null,
    deadline: null,
    image_urls: null,
    employee_ids: [],
    tag_ids: [],
  });

  useEffect(() => {
    if (id) {
      ProjectService.getProject("A", id).then((row) => {
        setRow(row);
        setForm((prevForm) => ({
          ...prevForm,
          ...row,
        }));
      });
    }
  }, [id, setForm]);

  const goBack = (to: string) => {
    router.navigate({ to });
  };

  const handleSubmit = useCallback(() => {
    ProjectService.save([form])
      .then(() => {
        if (mode === "modal") {
          // modal mode
        } else {
          goBack("/admin/projects");
        }
      })
      .catch(defaultCatch);
  }, [form, mode]);

  const PAGE = {
    title: `PROJECT${id ? ` #${id} Edit` : " Create"}`,
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
              <Button variant="outline" onClick={() => goBack("/admin/projects")} className="gap-2">
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
                {/* PROJECT명 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">PROJECT명</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="PROJECT명"
                    {...register("name")}
                  />
                </div>

                {/* 상태 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">상태</label>
                  <ProjectStatusSelect {...register("status")} />
                </div>

                {/* 설명 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">설명</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="설명"
                    {...register("description")}
                  />
                </div>

                {/* 예산 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">예산</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="예산"
                    {...register("budget")}
                  />
                </div>

                {/* 마감일시 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">마감일시</label>
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs bg-white"
                    {...register("deadline")}
                  />
                </div>

                {/* 이미지URLS */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">이미지URLS</label>
                  <ImageUploader multiple={false} mode="lazy" {...register("image_urls")} />
                </div>

                {/* EmployeeIds */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">EmployeeIds</label>
                  <EmployeeIdAsyncSelect {...register("employee_ids")} multiple subset="A" />
                </div>

                {/* TagIds */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">TagIds</label>
                  <TagIdAsyncSelect {...register("tag_ids")} multiple subset="A" />
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
