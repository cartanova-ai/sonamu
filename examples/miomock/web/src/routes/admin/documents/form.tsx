import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EnumSelect,
  Input,
  Textarea,
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import ArrowLeftIcon from "~icons/lucide/arrow-left";
import SaveIcon from "~icons/lucide/save";
import FormIcon from "~icons/mdi/form-select";

import { SD } from "@/i18n/sd.generated";
import { DocumentSaveParams } from "@/services/document/document.types";
import { DocumentService } from "@/services/services.generated";
import { DocumentStatus, DocumentStatusLabel } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";

const formSearchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/admin/documents/form")({
  validateSearch: formSearchSchema,
  component: DocumentsFormPage,
});

function DocumentsFormPage() {
  const { id } = Route.useSearch();
  return <DocumentsForm id={id} />;
}

type DocumentsFormProps = {
  id?: number;
  mode?: "page" | "modal";
};

export function DocumentsForm({ id, mode }: DocumentsFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { form, setForm, register } = useTypeForm(DocumentSaveParams, {
    title: "",
    content: "",
    status: "draft",
  });

  useEffect(() => {
    if (id) {
      DocumentService.getDocument("A", id).then((row) => {
        setForm((prevForm) => ({
          ...prevForm,
          ...row,
        }));
      });
    }
  }, [id, setForm]);

  const saveMutation = DocumentService.useSaveMutation();
  const handleSubmit = () => {
    saveMutation.mutate(
      { spa: [form] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["Document"],
          });

          if (mode === "modal") {
            // modal mode
          } else {
            router.navigate({ to: "/admin/documents" });
          }
        },
        onError: defaultCatch,
      },
    );
  };

  const PAGE = {
    title: id
      ? SD("entity.edit")(SD("entity.Document"), id)
      : SD("entity.create")(SD("entity.Document")),
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1800px] mx-auto p-8">
        <div className="space-y-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FormIcon className="h-5 w-5" />
              <span className="text-lg font-semibold h-5">{PAGE.title}</span>
            </div>
            {mode !== "modal" && (
              <Button
                variant="outline"
                onClick={() => router.navigate({ to: "/admin/documents" })}
                icon={<ArrowLeftIcon />}
              >
                {SD("common.backToList")}
              </Button>
            )}
          </div>

          <Card className="border-border/40 bg-gray-50 shadow-sm">
            <CardHeader className="px-4 border-b border-gray-200 flex items-center">
              <CardTitle className="text-sm font-medium leading-none m-0">{PAGE.title}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Document.title")}
                  </label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder={SD("entity.Document.title")}
                    {...register("title")}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Document.content")}
                  </label>
                  <Textarea
                    className="text-xs bg-white min-h-[200px]"
                    placeholder={SD("entity.Document.content")}
                    {...register("content")}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">
                    {SD("entity.Document.status")}
                  </label>
                  <EnumSelect
                    enum={DocumentStatus}
                    labels={DocumentStatusLabel}
                    {...register("status")}
                    className="w-50 h-8 bg-white border-gray-300 text-xs"
                  />
                </div>

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
