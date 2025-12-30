import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Switch,
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { UserRoleSelect } from "@/components/user/UserRoleSelect";
import { UserService } from "@/services/services.generated";
import type { UserSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";
import { UserSaveParams } from "@/services/user/user.types";
import ArrowLeftIcon from "~icons/lucide/arrow-left";
import SaveIcon from "~icons/lucide/save";
import FormIcon from "~icons/mdi/form-select";

const formSearchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/admin/users/form")({
  validateSearch: formSearchSchema,
  component: UsersFormPage,
});

function UsersFormPage() {
  const { id } = Route.useSearch();
  return <UsersForm id={id} />;
}

type UsersFormProps = {
  id?: number;
  mode?: "page" | "modal";
};

export function UsersForm({ id, mode }: UsersFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [_row, setRow] = useState<UserSubsetA | undefined>();

  const { form, setForm, register } = useTypeForm(UserSaveParams, {
    email: "",
    username: "",
    role: "normal",
  });

  useEffect(() => {
    if (id) {
      UserService.getUser("A", id).then((row) => {
        setRow(row);
        const { created_at: _created_at, ...rowData } = row;
        setForm((prevForm) => ({
          ...prevForm,
          ...rowData,
        }));
      });
    }
  }, [id, setForm]);

  const goBack = (to: string) => {
    router.navigate({ to });
  };

  const saveMutation = UserService.useSaveMutation();
  const handleSubmit = () => {
    saveMutation.mutate(
      { spa: [form] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["User"],
          });

          if (mode === "modal") {
            // modal mode
          } else {
            goBack("/admin/users");
          }
        },
        onError: defaultCatch,
      },
    );
  };

  const PAGE = {
    title: `USER${id ? ` #${id} Edit` : " Create"}`,
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
                onClick={() => goBack("/admin/users")}
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
                {/* 이메일 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">이메일</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="이메일"
                    {...register("email")}
                  />
                </div>

                {/* 이름 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">이름</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="이름"
                    {...register("username")}
                  />
                </div>

                {/* 비밀번호 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">비밀번호</label>
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder="비밀번호"
                    {...register("password")}
                  />
                </div>

                {/* 생일 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">생일</label>
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs bg-white"
                    {...register("birth_date")}
                  />
                </div>

                {/* ROLE */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">ROLE</label>
                  <UserRoleSelect {...register("role")} />
                </div>

                {/* LASTLOGIN일시 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">LASTLOGIN일시</label>
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs bg-white"
                    {...register("last_login_at")}
                  />
                </div>

                {/* BIO */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">BIO</label>
                  <Input className="h-8 text-xs bg-white" placeholder="BIO" {...register("bio")} />
                </div>

                {/* ISVERIFIED */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">ISVERIFIED</label>
                  <Switch {...register("is_verified")} />
                </div>

                {/* 삭제일시 */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">삭제일시</label>
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs bg-white"
                    {...register("deleted_at")}
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
