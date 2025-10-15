import React, {
  useEffect,
  useState,
  Dispatch,
  SetStateAction,
  forwardRef,
  Ref,
  useImperativeHandle,
  useCallback,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  Checkbox,
  Form,
  Header,
  Input,
  Segment,
  TextArea,
  Label,
} from "semantic-ui-react";
import { DateTime } from "luxon";

import {
  BackLink,
  LinkInput,
  NumberInput,
  BooleanToggle,
  SQLDateTimeInput,
  SQLDateInput,
  useTypeForm,
  useGoBack,
  formatDateTime,
} from "@sonamu-kit/react-sui";
import { defaultCatch } from "src/services/sonamu.shared";
// import { ImageUploader } from 'src/admin-common/ImageUploader';
// import { useCommonModal } from "src/admin-common/CommonModal";

import { ProjectSaveParams } from "src/services/project/project.types";
import { ProjectService } from "src/services/project/project.service";
import { ProjectSubsetA } from "src/services/sonamu.generated";
import { ProjectStatusSelect } from "src/components/project/ProjectStatusSelect";
import { EmployeeIdAsyncSelect } from "../../../components/employee/EmployeeIdAsyncSelect";

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
  const [row, setRow] = useState<ProjectSubsetA | undefined>();

  // ProjectSaveParams 폼
  const { form, setForm, register } = useTypeForm(ProjectSaveParams, {
    name: "",
    status: "planning",
    description: null,
    employee_ids: [],
  });

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      ProjectService.getProject("A", id).then((row) => {
        setRow(row);
        setForm({
          ...row,
          employee_ids: row.employee ? row.employee.map((e) => e.id) : [],
        });
      });
    }
  }, [id]);

  // CommonModal
  // const { doneModal, closeModal } = useCommonModal();

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    ProjectService.save([form])
      .then(([id]) => {
        if (mode === "modal") {
          // doneModal();
        } else {
          goBack("/admin/projects");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, id]);

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
                <BackLink
                  primary
                  size="tiny"
                  to="/admin/projects"
                  content="목록"
                  icon="list"
                />
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
                <TextArea
                  rows={8}
                  placeholder="설명"
                  {...register(`description`)}
                />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>EmployeeIds</label>
                <EmployeeIdAsyncSelect
                  {...register("employee_ids")}
                  multiple
                  subset="A"
                />
              </Form.Field>
            </Form.Group>
            <Segment basic textAlign="center">
              <Button
                type="submit"
                primary
                onClick={handleSubmit}
                content="저장"
                icon="save"
              />
            </Segment>
          </Form>
        </Segment>
      </Segment>
    </div>
  );
}
