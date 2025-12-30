import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { TagService } from "@/services/services.generated";
import type { TagSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";
import { TagSaveParams } from "@/services/tag/tag.types";
import ArrowLeftIcon from "~icons/lucide/arrow-left";
import SaveIcon from "~icons/lucide/save";
import FormIcon from "~icons/mdi/form-select";

const formSearchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/admin/tags/form")({
  validateSearch: formSearchSchema,
  component: TagsFormPage,
});

function TagsFormPage() {
  const { id } = Route.useSearch();
  return <TagsForm id={id} />;
}

type TagsFormProps = {
  id?: number;
  mode?: "page" | "modal";
};

export function TagsForm({ id, mode }: TagsFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [_row, setRow] = useState<TagSubsetA | undefined>();

  const { form, setForm, register } = useTypeForm(TagSaveParams, { name: "" });

  useEffect(() => {
    if (id) {
      TagService.getTag("A", id).then((row) => {
        setRow(row);
        setForm((prevForm) => ({
          ...prevForm,
          ...row,
        }));
      });
    }
  }, [id, setForm]);

  const saveMutation = TagService.useSaveMutation();
  const handleSubmit = () => {
    saveMutation.mutate(
      { spa: [form] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["Tag"],
          });

          if (mode === "modal") {
            // modal mode
          } else {
            router.navigate({ to: "/admin/tags" });
          }
        },
        onError: defaultCatch,
      },
    );
  };

  const PAGE = {
    title: `TAG${id ? ` #${id} Edit` : " Create"}`,
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
                onClick={() => router.navigate({ to: "/admin/tags" })}
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
                {/* 태그명 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">태그명</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="태그명"
                    {...register("name")}
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
