import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DateInput,
  Input,
  LazyMultiImageUploader,
  type LazyMultiImageUploaderRef,
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { ProjectStatusSelect } from "@/components/project/ProjectStatusSelect";
import { SD } from "@/i18n/sd.generated";
import { ProjectSaveParams } from "@/services/project/project.types";
import { FileService, ProjectService } from "@/services/services.generated";
import { defaultCatch } from "@/services/sonamu.shared";

import ArrowLeftIcon from "~icons/lucide/arrow-left";
import SaveIcon from "~icons/lucide/save";
import FormIcon from "~icons/mdi/form-select";

const formSearchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/admin/projects/form")({
  validateSearch: formSearchSchema,
  component: ProjectsFormPage,
});

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
  const queryClient = useQueryClient();
  const lazyMultiImageRef = useRef<LazyMultiImageUploaderRef>(null);

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
        setForm((prevForm) => ({
          ...prevForm,
          ...row,
        }));
      });
    }
  }, [id, setForm]);

  const saveMutation = ProjectService.useSaveMutation();
  const uploadMultipleMutation = FileService.useUploadMultipleMutation();

  const handleSubmit = async () => {
    try {
      // 대기 중인 이미지 업로드
      let updatedImageUrls = form.image_urls;
      if (lazyMultiImageRef.current) {
        updatedImageUrls = await lazyMultiImageRef.current.commit();
      }

      // 프로젝트 저장 (업데이트된 image_urls 사용)
      saveMutation.mutate(
        { spa: [{ ...form, image_urls: updatedImageUrls }] },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: ["Project"],
            });

            if (mode === "modal") {
              // modal mode
            } else {
              router.navigate({ to: "/admin/projects" });
            }
          },
          onError: defaultCatch,
        },
      );
    } catch (error) {
      console.error("이미지 업로드 실패:", error);
      defaultCatch(error);
    }
  };

  const PAGE = {
    title: id ? SD("entity.Project.edit")(id) : SD("entity.Project.create"),
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
                onClick={() => router.navigate({ to: "/admin/projects" })}
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
                {/* PROJECT명 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Project.name")}
                  </label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder={SD("entity.Project.name")}
                    {...register("name")}
                  />
                </div>

                {/* 상태 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Project.status")}
                  </label>
                  <ProjectStatusSelect {...register("status")} />
                </div>

                {/* 설명 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Project.description")}
                  </label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder={SD("entity.Project.description")}
                    {...register("description")}
                  />
                </div>

                {/* 예산 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Project.budget")}
                  </label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder={SD("entity.Project.budget")}
                    {...register("budget")}
                  />
                </div>

                {/* 마감일시 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Project.deadline")}
                  </label>
                  <DateInput className="h-8 text-xs bg-white" {...register("deadline")} />
                </div>

                {/* 이미지URLS */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">이미지URLS</label>
                  <LazyMultiImageUploader
                    ref={lazyMultiImageRef}
                    value={Array.isArray(form.image_urls) ? form.image_urls : []}
                    onValueChange={(urls: string[]) => setForm({ ...form, image_urls: urls })}
                    uploader={async (files: File[]) => {
                      const response = await uploadMultipleMutation.mutateAsync({ files });
                      return response.files.map((f) => ({ url: f.url, name: f.name }));
                    }}
                    previewSize="md"
                    placeholder="이미지URLS"
                  />
                </div>

                {/* EmployeeIds */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">EmployeeIds</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="employee_ids"
                    {...register("employee_ids")}
                  />
                </div>

                {/* TagIds */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">TagIds</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="tag_ids"
                    {...register("tag_ids")}
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
