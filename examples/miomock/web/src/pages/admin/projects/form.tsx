import { Icon, type IconProps } from "@iconify/react";
import { Button } from "@sonamu-kit/react-components/components";
import { BackLink, formatDateTime, upload, useGoBack, useTypeForm } from "@sonamu-kit/react-sui";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Form, Header, Input, Segment, TextArea } from "semantic-ui-react";
import { useCommonModal } from "@/admin-common/CommonModal";

// Icons
const SaveIcon = (props: Omit<IconProps, "icon">) => (
  <Icon icon="lucide:save" {...props} />
);
import { ImageUploader } from "@/admin-common/ImageUploader";
import { EmployeeIdAsyncSelect } from "@/components/employee/EmployeeIdAsyncSelect";
import { ProjectStatusSelect } from "@/components/project/ProjectStatusSelect";
import { TagIdAsyncSelect } from "@/components/tag/TagIdAsyncSelect";
import { ProjectSaveParams } from "@/services/project/project.types";
import { ProjectService } from "@/services/services.generated";
import type { ProjectSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";

export default function ProjectsFormPage() {
  // 라우팅 searchParams
  const [searchParams] = useSearchParams();
  const query = {
    id: searchParams.get("id") ?? undefined,
  };

  return <ProjectsForm id={query?.id ? Number(query.id) : undefined} />;
}
type ProjectsFormProps = {
  id?: number;
  mode?: "page" | "modal";
};
export function ProjectsForm({ id, mode }: ProjectsFormProps) {
  // 편집시 기존 row
  const [_row, setRow] = useState<ProjectSubsetA | undefined>();

  // ProjectSaveParams 폼
  const { form, setForm, register } = useTypeForm(ProjectSaveParams, {
    name: "",
    status: "planning",
    description: null,
    employee_ids: [],
    tag_ids: [],
    image_urls: [],
    budget: null,
    deadline: null,
  });

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      ProjectService.getProject("A", id).then((row) => {
        setRow(row);
        setForm({
          ...row,
          employee_ids: row.employee ? row.employee.map((e) => e.id) : [],
          tag_ids: row.tags ? row.tags.map((t) => t.id) : [],
          image_urls: row.image_urls ?? [],
        });
      });
    }
  }, [id, setForm]);

  // CommonModal
  const { doneModal } = useCommonModal();

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = useCallback(
    (urls: string[]) => {
      ProjectService.save([{ ...form, image_urls: urls }])
        .then(([_id]) => {
          if (mode === "modal") {
            doneModal();
          } else {
            goBack("/admin/projects");
          }
        })
        .catch(defaultCatch);
    },
    [form, mode, goBack, doneModal],
  );

  // 페이지
  const PAGE = {
    title: `PROJECT${id ? `#${id} 수정` : " 등록"}`,
  };

  return (
    <div className="form">
      <Segment padded basic>
        <Segment padded color="grey">
          <div className="header-row">
            <Header>{PAGE.title}</Header>
            {mode !== "modal" && (
              <div className="buttons">
                <BackLink primary size="tiny" to="/admin/projects" content="목록" icon="list" />
              </div>
            )}
          </div>
          <Form>
            {form.id && (
              <Form.Group widths="equal">
                <Form.Field>
                  <label>등록일시</label>
                  <div className="p-8px">{formatDateTime(form.created_at)}</div>
                </Form.Field>
              </Form.Group>
            )}
            <Form.Group widths="equal">
              <Form.Field>
                <label>PROJECT명</label>
                <Input placeholder="PROJECT명" {...register(`name`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>상태</label>
                <ProjectStatusSelect {...register(`status`)} textPrefix="" />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>설명</label>
                <TextArea rows={8} placeholder="설명" {...register(`description`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>EmployeeIds</label>
                <EmployeeIdAsyncSelect {...register("employee_ids")} multiple subset="A" />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>Tags</label>
                <TagIdAsyncSelect {...register("tag_ids")} multiple subset="A" />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>ImageUrls</label>
                <ImageUploader multiple={false} mode="lazy" {...register("image_urls")} />
              </Form.Field>
            </Form.Group>
            <Segment basic textAlign="center">
              <Button
                type="submit"
                onClick={async () => {
                  const urls = await upload();
                  handleSubmit(urls);
                }}
              >
                <SaveIcon />
                저장
              </Button>
            </Segment>
          </Form>
        </Segment>
      </Segment>
    </div>
  );
}
