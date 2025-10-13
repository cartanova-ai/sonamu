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

import { DepartmentSaveParams } from "src/services/department/department.types";
import { DepartmentService } from "src/services/department/department.service";
import { DepartmentSubsetA } from "src/services/sonamu.generated";
import { CompanyIdAsyncSelect } from "src/components/company/CompanyIdAsyncSelect";
import { DepartmentIdAsyncSelect } from "src/components/department/DepartmentIdAsyncSelect";

export default function DepartmentsFormPage() {
  // 라우팅 searchParams
  const [searchParams] = useSearchParams();
  const query = {
    id: searchParams.get("id") ?? undefined,
  };

  return <DepartmentsForm id={query?.id ? Number(query.id) : undefined} />;
}
type DepartmentsFormProps = {
  id?: number;
  mode?: "page" | "modal";
};
export function DepartmentsForm({ id, mode }: DepartmentsFormProps) {
  // 편집시 기존 row
  const [row, setRow] = useState<DepartmentSubsetA | undefined>();

  // DepartmentSaveParams 폼
  const { form, setForm, register } = useTypeForm(DepartmentSaveParams, {
    name: "",
    company_id: 0,
    parent_id: null,
  });

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      DepartmentService.getDepartment("A", id).then((row) => {
        setRow(row);
        setForm({
          ...row,
          company_id: row.company.id,
          parent_id: row.parent?.id ?? null,
        });
      });
    }
  }, [id]);

  // CommonModal
  // const { doneModal, closeModal } = useCommonModal();

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    DepartmentService.save([form])
      .then(([id]) => {
        if (mode === "modal") {
          // doneModal();
        } else {
          goBack("/admin/departments");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, id]);

  // 페이지
  const PAGE = {
    title: `부서${id ? `#${id} 수정` : " 등록"}`,
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
                  to="/admin/departments"
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
                <label>부서명</label>
                <Input placeholder="부서명" {...register(`name`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>COMPANY</label>
                <CompanyIdAsyncSelect {...register("company_id")} subset="A" />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>ParentId</label>
                <DepartmentIdAsyncSelect
                  {...register("parent_id")}
                  clearable
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
