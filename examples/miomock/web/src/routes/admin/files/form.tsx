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
import ArrowLeftIcon from "~icons/lucide/arrow-left";
import SaveIcon from "~icons/lucide/save";
import FormIcon from "~icons/mdi/form-select";

import { SD } from "@/i18n/sd.generated";
import { FileSaveParams } from "@/services/file/file.types";
import { FileService } from "@/services/services.generated";
import { type FileSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";

const formSearchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/admin/files/form")({
  validateSearch: formSearchSchema,
  component: FilesFormPage,
});

function FilesFormPage() {
  const { id } = Route.useSearch();
  return <FilesForm id={id} />;
}

type FilesFormProps = {
  id?: number;
  mode?: "page" | "modal";
};

export function FilesForm({ id, mode }: FilesFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [_row, setRow] = useState<FileSubsetA | undefined>();

  const { form, setForm, register } = useTypeForm(FileSaveParams, {
    mime_type: "",
    name: "",
    url: "",
  });

  useEffect(() => {
    if (id) {
      FileService.getFile("A", id).then((row) => {
        setRow(row);
        const { created_at: _created_at, ...rowData } = row;
        setForm((prevForm) => ({
          ...prevForm,
          ...rowData,
        }));
      });
    }
  }, [id, setForm]);

  const saveMutation = FileService.useSaveMutation();
  const handleSubmit = () => {
    saveMutation.mutate(
      { spa: [form] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["File"],
          });

          if (mode === "modal") {
            // modal mode
          } else {
            router.navigate({ to: "/admin/files" });
          }
        },
        onError: defaultCatch,
      },
    );
  };

  const PAGE = {
    title: id ? SD("entity.edit")(SD("entity.File"), id) : SD("entity.create")(SD("entity.File")),
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
                onClick={() => router.navigate({ to: "/admin/files" })}
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
                {/* MIME타입 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.File.mime_type")}
                  </label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder={SD("entity.File.mime_type")}
                    {...register("mime_type")}
                  />
                </div>

                {/* FILE명 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.File.name")}
                  </label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder={SD("entity.File.name")}
                    {...register("name")}
                  />
                </div>

                {/* URL */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.File.url")}
                  </label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder={SD("entity.File.url")}
                    {...register("url")}
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
